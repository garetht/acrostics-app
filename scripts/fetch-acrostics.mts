import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildAcrosticDataUrl,
  createAcrosticCacheRecord,
  decodeAcrosticCacheRecord,
  extractAvailableAcrosticDates,
  filterInclusiveDateRange,
  getTodayInTimeZone,
  normalizeInputDate,
  parseAcrosticCacheFile,
  parseWrappedPuzzleResponse,
  toSavedAcrosticPuzzle,
  type AcrosticCacheRecord,
  type SavedAcrosticPuzzle,
  type XWordInfoPuzzle,
  XWORDINFO_ACROSTIC_ARCHIVE_URL,
  XWORDINFO_ACROSTIC_REFERRER,
  XWORDINFO_TIME_ZONE,
} from "../lib/xwordinfo/acrostics.mts";

const DEFAULT_OUTPUT_DIR = "data/xwordinfo/acrostics";
const DEFAULT_CACHE_FILE = "data/xwordinfo/acrostics.ndjson";

type CliOutputOptions = {
  outDir?: string;
  cacheFile?: string;
};

type CliOptions = CliOutputOptions &
  (
    | {
        mode: "single";
        date: string;
      }
    | {
        mode: "all";
      }
    | {
        mode: "range";
        since: string;
      }
  );

type ResolvedOutputTargets = {
  outDir?: string;
  cacheFile?: string;
};

type CacheState = {
  records: AcrosticCacheRecord[];
  recordsByDate: Map<string, AcrosticCacheRecord>;
  lastDate?: string;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
};

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<FetchResponseLike>;

type Logger = Pick<Console, "log" | "error">;

export type RunFetchAcrosticsDependencies = {
  fetchImpl?: FetchLike;
  logger?: Logger;
  today?: string;
};

export function parseCliArgs(argv: readonly string[]): CliOptions {
  let date: string | undefined;
  let since: string | undefined;
  let outDir: string | undefined;
  let cacheFile: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--date") {
      date = readArgValue(argv, ++index, "--date");
      continue;
    }

    if (arg === "--since") {
      since = readArgValue(argv, ++index, "--since");
      continue;
    }

    if (arg === "--out-dir") {
      outDir = readArgValue(argv, ++index, "--out-dir");
      continue;
    }

    if (arg === "--cache-file") {
      cacheFile = readArgValue(argv, ++index, "--cache-file");
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (date && since) {
    throw new Error("Provide at most one of --date or --since.");
  }

  const outputOptions = normalizeCliOutputOptions(outDir, cacheFile);

  if (date) {
    return {
      mode: "single",
      date: normalizeCliDateArg(date, "--date"),
      ...outputOptions,
    };
  }

  if (!since) {
    return {
      mode: "all",
      ...outputOptions,
    };
  }

  return {
    mode: "range",
    since: normalizeCliDateArg(since, "--since"),
    ...outputOptions,
  };
}

export async function runFetchAcrostics(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: RunFetchAcrosticsDependencies = {},
): Promise<number> {
  const options = parseCliArgs(argv);
  const fetchImpl = dependencies.fetchImpl ?? defaultFetch;
  const logger = dependencies.logger ?? console;
  const outputs = resolveOutputTargets(options);
  const cacheState = outputs.cacheFile
    ? await loadCacheState(outputs.cacheFile)
    : createEmptyCacheState();

  if (options.mode === "single") {
    return runSingleDateMode(options, outputs, cacheState, fetchImpl, logger);
  }

  const today = dependencies.today
    ? normalizeInputDate(dependencies.today)
    : getTodayInTimeZone(XWORDINFO_TIME_ZONE);
  const archiveHtml = await fetchText(XWORDINFO_ACROSTIC_ARCHIVE_URL, fetchImpl);
  const archiveDates = extractAvailableAcrosticDates(archiveHtml);
  const availableDates =
    options.mode === "range"
      ? filterInclusiveDateRange(archiveDates, options.since, today)
      : archiveDates.filter((date) => date <= today);
  const uncachedDates = filterDatesAfterCache(availableDates, cacheState.lastDate);

  if (uncachedDates.length === 0) {
    logger.log(getNoWorkMessage(options, today, cacheState.lastDate));
    return 0;
  }

  const failures: Array<{ date: string; message: string }> = [];

  for (const date of uncachedDates) {
    try {
      const puzzle = await fetchPuzzle(date, fetchImpl);
      await writeFetchedOutputs(date, puzzle, outputs);
      logger.log(describeFetchedWrite(date, outputs));
    } catch (error) {
      const message = getErrorMessage(error);
      failures.push({ date, message });
      logger.error(`Failed ${date}: ${message}`);
    }
  }

  if (failures.length > 0) {
    logger.error(
      `Fetch completed with ${failures.length} failure(s) out of ${uncachedDates.length} date(s).`,
    );

    for (const failure of failures) {
      logger.error(`${failure.date}: ${failure.message}`);
    }

    return 1;
  }

  return 0;
}

async function runSingleDateMode(
  options: Extract<CliOptions, { mode: "single" }>,
  outputs: ResolvedOutputTargets,
  cacheState: CacheState,
  fetchImpl: FetchLike,
  logger: Logger,
): Promise<number> {
  const cachedRecord = cacheState.recordsByDate.get(options.date);

  if (cachedRecord) {
    const { puzzle } = decodeAcrosticCacheRecord(cachedRecord);

    if (outputs.outDir) {
      await writePuzzleFile(options.date, puzzle, outputs.outDir);
      logger.log(describeCacheRead(options.date, outputs.outDir));
    } else if (outputs.cacheFile) {
      logger.log(`Cache already contains ${options.date} in ${outputs.cacheFile}.`);
    }

    return 0;
  }

  if (
    outputs.cacheFile &&
    cacheState.lastDate &&
    options.date <= cacheState.lastDate
  ) {
    throw new Error(
      `Cannot append ${options.date} to ${outputs.cacheFile}: cache already ends at ${cacheState.lastDate}.`,
    );
  }

  const puzzle = await fetchPuzzle(options.date, fetchImpl);
  await writeFetchedOutputs(options.date, puzzle, outputs);
  logger.log(describeFetchedWrite(options.date, outputs));

  return 0;
}

async function fetchPuzzle(
  date: string,
  fetchImpl: FetchLike,
): Promise<XWordInfoPuzzle> {
  const responseText = await fetchText(buildAcrosticDataUrl(date), fetchImpl);
  const { puzzle } = parseWrappedPuzzleResponse(responseText);
  return puzzle;
}

async function writeFetchedOutputs(
  date: string,
  puzzle: XWordInfoPuzzle,
  outputs: ResolvedOutputTargets,
): Promise<void> {
  const savedPuzzle = toSavedAcrosticPuzzle(puzzle);

  if (outputs.outDir) {
    await writePuzzleFile(date, savedPuzzle, outputs.outDir);
  }

  if (outputs.cacheFile) {
    await appendCacheRecord(outputs.cacheFile, createAcrosticCacheRecord(date, puzzle));
  }
}

async function writePuzzleFile(
  date: string,
  puzzle: SavedAcrosticPuzzle,
  outDir: string,
): Promise<void> {
  const filePath = path.join(outDir, `${date}.json`);
  await mkdir(outDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(puzzle, null, 2)}\n`, "utf8");
}

async function appendCacheRecord(
  cacheFile: string,
  record: AcrosticCacheRecord,
): Promise<void> {
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await appendFile(cacheFile, `${JSON.stringify(record)}\n`, "utf8");
}

async function loadCacheState(cacheFile: string): Promise<CacheState> {
  let text: string;

  try {
    text = await readFile(cacheFile, "utf8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return createEmptyCacheState();
    }

    throw error;
  }

  const records = parseAcrosticCacheFile(text);
  const recordsByDate = new Map(records.map((record) => [record.date, record]));

  return {
    records,
    recordsByDate,
    lastDate: records.at(-1)?.date,
  };
}

function createEmptyCacheState(): CacheState {
  return {
    records: [],
    recordsByDate: new Map(),
  };
}

async function fetchText(url: string, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(url, {
    headers: {
      Referer: XWORDINFO_ACROSTIC_REFERRER,
    },
    referrer: XWORDINFO_ACROSTIC_REFERRER,
  });

  if (!response.ok) {
    const statusDetail = [response.status, response.statusText]
      .filter(Boolean)
      .join(" ");
    throw new Error(`Request failed for ${url}: ${statusDetail}`);
  }

  return response.text();
}

function normalizeCliOutputOptions(
  outDir: string | undefined,
  cacheFile: string | undefined,
): CliOutputOptions {
  if (!outDir && !cacheFile) {
    return { outDir: DEFAULT_OUTPUT_DIR };
  }

  const options: CliOutputOptions = {};

  if (outDir) {
    options.outDir = outDir;
  }

  if (cacheFile) {
    options.cacheFile = cacheFile;
  }

  return options;
}

function resolveOutputTargets(options: CliOutputOptions): ResolvedOutputTargets {
  return {
    outDir: options.outDir ? path.resolve(options.outDir) : undefined,
    cacheFile: options.cacheFile
      ? path.resolve(options.cacheFile)
      : undefined,
  };
}

function filterDatesAfterCache(
  dates: readonly string[],
  lastCachedDate: string | undefined,
): string[] {
  if (!lastCachedDate) {
    return [...dates];
  }

  return dates.filter((date) => date > lastCachedDate);
}

function describeFetchedWrite(
  date: string,
  outputs: ResolvedOutputTargets,
): string {
  if (outputs.outDir && outputs.cacheFile) {
    return `Saved ${date} to ${path.join(outputs.outDir, `${date}.json`)} and cached it in ${outputs.cacheFile}`;
  }

  if (outputs.outDir) {
    return `Saved ${date} to ${path.join(outputs.outDir, `${date}.json`)}`;
  }

  return `Cached ${date} in ${outputs.cacheFile}`;
}

function describeCacheRead(date: string, outDir: string): string {
  return `Saved ${date} to ${path.join(outDir, `${date}.json`)} from cache`;
}

function getNoWorkMessage(
  options: Extract<CliOptions, { mode: "all" | "range" }>,
  today: string,
  lastCachedDate: string | undefined,
): string {
  if (lastCachedDate) {
    if (options.mode === "range") {
      return `No uncached acrostics available between ${options.since} and ${today}; cache already covers through ${lastCachedDate}.`;
    }

    return `No uncached acrostics available through ${today}; cache already covers through ${lastCachedDate}.`;
  }

  if (options.mode === "range") {
    return `No acrostics available between ${options.since} and ${today}.`;
  }

  return `No acrostics available in the archive through ${today}.`;
}

function readArgValue(
  argv: readonly string[],
  index: number,
  flag: string,
): string {
  const value = argv[index];

  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeCliDateArg(value: string, flag: string): string {
  try {
    return normalizeInputDate(value);
  } catch (error) {
    throw new Error(`Invalid value for ${flag}: ${getErrorMessage(error)}`);
  }
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

const defaultFetch: FetchLike = async (input, init) => fetch(input, init);

async function main(): Promise<void> {
  try {
    process.exitCode = await runFetchAcrostics();
  } catch (error) {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
