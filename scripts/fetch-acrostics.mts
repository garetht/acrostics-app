import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildAcrosticDataUrl,
  extractAvailableAcrosticDates,
  filterInclusiveDateRange,
  getTodayInTimeZone,
  parseWrappedPuzzleResponse,
  normalizeInputDate,
  XWORDINFO_ACROSTIC_ARCHIVE_URL,
  XWORDINFO_ACROSTIC_REFERRER,
  XWORDINFO_TIME_ZONE,
} from "../lib/xwordinfo/acrostics.mts";

const DEFAULT_OUTPUT_DIR = "data/xwordinfo/acrostics";

type CliOptions =
  | {
      mode: "single";
      date: string;
      outDir: string;
    }
  | {
      mode: "all";
      outDir: string;
    }
  | {
      mode: "range";
      since: string;
      outDir: string;
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
  let outDir = DEFAULT_OUTPUT_DIR;

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

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (date && since) {
    throw new Error("Provide at most one of --date or --since.");
  }

  if (date) {
    return {
      mode: "single",
      date: normalizeCliDateArg(date, "--date"),
      outDir,
    };
  }

  if (!since) {
    return {
      mode: "all",
      outDir,
    };
  }

  return {
    mode: "range",
    since: normalizeCliDateArg(since, "--since"),
    outDir,
  };
}

export async function runFetchAcrostics(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: RunFetchAcrosticsDependencies = {},
): Promise<number> {
  const options = parseCliArgs(argv);
  const fetchImpl = dependencies.fetchImpl ?? defaultFetch;
  const logger = dependencies.logger ?? console;
  const outDir = path.resolve(options.outDir);

  if (options.mode === "single") {
    await fetchAndWritePuzzle(options.date, outDir, fetchImpl);
    logger.log(`Saved ${options.date} to ${path.join(outDir, `${options.date}.json`)}`);
    return 0;
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

  if (availableDates.length === 0) {
    if (options.mode === "range") {
      logger.log(`No acrostics available between ${options.since} and ${today}.`);
    } else {
      logger.log(`No acrostics available in the archive through ${today}.`);
    }
    return 0;
  }

  const failures: Array<{ date: string; message: string }> = [];

  for (const date of availableDates) {
    try {
      await fetchAndWritePuzzle(date, outDir, fetchImpl);
      logger.log(`Saved ${date} to ${path.join(outDir, `${date}.json`)}`);
    } catch (error) {
      const message = getErrorMessage(error);
      failures.push({ date, message });
      logger.error(`Failed ${date}: ${message}`);
    }
  }

  if (failures.length > 0) {
    logger.error(
      `Fetch completed with ${failures.length} failure(s) out of ${availableDates.length} date(s).`,
    );

    for (const failure of failures) {
      logger.error(`${failure.date}: ${failure.message}`);
    }

    return 1;
  }

  return 0;
}

async function fetchAndWritePuzzle(
  date: string,
  outDir: string,
  fetchImpl: FetchLike,
): Promise<void> {
  const responseText = await fetchText(buildAcrosticDataUrl(date), fetchImpl);
  const { puzzle } = parseWrappedPuzzleResponse(responseText);
  const filePath = path.join(outDir, `${date}.json`);

  await mkdir(outDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(puzzle, null, 2)}\n`, "utf8");
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
