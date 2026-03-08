import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import {
  buildAcrosticDataUrl,
  decodeWrappedPuzzleData,
  extractAvailableAcrosticDates,
  filterInclusiveDateRange,
  normalizeInputDate,
  parseWrappedPuzzleResponse,
  parseXWordInfoPuzzle,
  parseXWordInfoPuzzleWrapper,
  XWORDINFO_ACROSTIC_ARCHIVE_URL,
  XWORDINFO_ACROSTIC_REFERRER,
} from "../lib/xwordinfo/acrostics.mts";
import { parseCliArgs, runFetchAcrostics } from "../scripts/fetch-acrostics.mts";

const fixtureDir = new URL("./fixtures/", import.meta.url);

test("parseXWordInfoPuzzleWrapper validates the wrapped response", async () => {
  const wrappedJson = await loadFixture("xwordinfo-puzzle.wrapped.json");
  const wrapper = parseXWordInfoPuzzleWrapper(wrappedJson);

  assert.equal(typeof wrapper.data, "string");
  assert.throws(
    () => parseXWordInfoPuzzleWrapper(JSON.stringify({ data: 123 })),
    /expected a non-empty string/i,
  );
});

test("decodeWrappedPuzzleData decodes the gzipped base64 payload", async () => {
  const wrappedJson = await loadFixture("xwordinfo-puzzle.wrapped.json");
  const decodedJson = await loadFixture("xwordinfo-puzzle.decoded.json");
  const wrapper = parseXWordInfoPuzzleWrapper(wrappedJson);

  assert.equal(decodeWrappedPuzzleData(wrapper), decodedJson.trimEnd());

  assert.throws(
    () => decodeWrappedPuzzleData({ data: "%%%invalid%%%" }),
    /valid base64/i,
  );
  assert.throws(
    () =>
      decodeWrappedPuzzleData({
        data: Buffer.from("plain text payload", "utf8").toString("base64"),
      }),
    /Unable to decode XWordInfo puzzle payload/i,
  );
});

test("parseXWordInfoPuzzle validates the decoded puzzle schema", async () => {
  const decodedJson = await loadFixture("xwordinfo-puzzle.decoded.json");
  const puzzle = parseXWordInfoPuzzle(decodedJson);

  assert.deepEqual(puzzle, JSON.parse(decodedJson));

  const nullableFullQuotePuzzle = {
    ...JSON.parse(decodedJson),
    fullQuote: null,
  };
  assert.equal(
    parseXWordInfoPuzzle(JSON.stringify(nullableFullQuotePuzzle)).fullQuote,
    null,
  );

  const omittedFullQuotePuzzle = {
    ...JSON.parse(decodedJson),
  };
  delete omittedFullQuotePuzzle.fullQuote;
  assert.equal(
    parseXWordInfoPuzzle(JSON.stringify(omittedFullQuotePuzzle)).fullQuote,
    undefined,
  );

  const invalidPuzzle = {
    ...JSON.parse(decodedJson),
    gridNumbers: [1, 2, "3"],
  };

  assert.throws(
    () => parseXWordInfoPuzzle(JSON.stringify(invalidPuzzle)),
    /array of integers/i,
  );
});

test("parseWrappedPuzzleResponse returns the typed puzzle and decoded json", async () => {
  const wrappedJson = await loadFixture("xwordinfo-puzzle.wrapped.json");
  const decodedJson = await loadFixture("xwordinfo-puzzle.decoded.json");

  const parsed = parseWrappedPuzzleResponse(wrappedJson);

  assert.equal(parsed.decodedJson, decodedJson.trimEnd());
  assert.equal(parsed.puzzle.date, "3/8/2026");
});

test("extractAvailableAcrosticDates deduplicates, sorts, and filters invalid dates", async () => {
  const archiveHtml = await loadFixture("acrostic-archive.html");
  const dates = extractAvailableAcrosticDates(archiveHtml);

  assert.deepEqual(dates, ["2026-02-28", "2026-03-01", "2026-03-08"]);
  assert.deepEqual(
    filterInclusiveDateRange(dates, "2026-03-01", "2026-03-08"),
    ["2026-03-01", "2026-03-08"],
  );
});

test("parseCliArgs validates mode flags and normalizes dates", () => {
  assert.deepEqual(parseCliArgs([]), {
    mode: "all",
    outDir: "data/xwordinfo/acrostics",
  });
  assert.deepEqual(parseCliArgs(["--date", "3/8/2026"]), {
    mode: "single",
    date: "2026-03-08",
    outDir: "data/xwordinfo/acrostics",
  });
  assert.deepEqual(parseCliArgs(["--since", "2026-03-01", "--out-dir", "tmp"]), {
    mode: "range",
    since: "2026-03-01",
    outDir: "tmp",
  });
  assert.deepEqual(parseCliArgs(["--out-dir", "tmp"]), {
    mode: "all",
    outDir: "tmp",
  });
  assert.throws(
    () => parseCliArgs(["--date", "2026-03-08", "--since", "2026-03-01"]),
    /at most one of --date or --since/i,
  );
  assert.throws(() => parseCliArgs(["--out-dir", "--date"]), /missing value for --out-dir/i);
  assert.throws(
    () => parseCliArgs(["--date", "03-08-2026"]),
    /Invalid value for --date: Invalid date "03-08-2026"\. Expected YYYY-MM-DD or M\/D\/YYYY format\./i,
  );
  assert.throws(
    () => parseCliArgs(["--since", "2026-02-30"]),
    /Invalid value for --since: Invalid date "2026-02-30": invalid day\./i,
  );
});

test("runFetchAcrostics writes one file in single-date mode", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "acrostics-single-"));
  const puzzleJson = await loadFixture("xwordinfo-puzzle.decoded.json");
  const wrappedJson = wrapPuzzle(JSON.parse(puzzleJson));
  const fetchCalls: string[] = [];
  let requestInit: RequestInit | undefined;

  const exitCode = await runFetchAcrostics(
    ["--date", "2026-03-08", "--out-dir", outDir],
    {
      fetchImpl: async (input, init) => {
        const url = String(input);
        fetchCalls.push(url);
        requestInit = init;
        return response(200, wrappedJson);
      },
      logger: createLogger(),
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(fetchCalls, [buildAcrosticDataUrl("2026-03-08")]);
  assert.deepEqual(requestInit, {
    headers: {
      Referer: XWORDINFO_ACROSTIC_REFERRER,
    },
    referrer: XWORDINFO_ACROSTIC_REFERRER,
  });

  const written = await readFile(path.join(outDir, "2026-03-08.json"), "utf8");
  assert.equal(written, `${JSON.stringify(JSON.parse(puzzleJson), null, 2)}\n`);
});

test("runFetchAcrostics range mode fetches publish dates only", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "acrostics-range-"));
  const archiveHtml = await loadFixture("acrostic-archive.html");
  const fixturePuzzle = JSON.parse(await loadFixture("xwordinfo-puzzle.decoded.json"));
  const fetchCalls: string[] = [];

  const exitCode = await runFetchAcrostics(
    ["--since", "2026-03-01", "--out-dir", outDir],
    {
      today: "2026-03-08",
      fetchImpl: async (input) => {
        const url = String(input);
        fetchCalls.push(url);

        if (url === XWORDINFO_ACROSTIC_ARCHIVE_URL) {
          return response(200, archiveHtml);
        }

        if (url === buildAcrosticDataUrl("2026-03-01")) {
          return response(200, wrapPuzzle({ ...fixturePuzzle, date: "3/1/2026" }));
        }

        if (url === buildAcrosticDataUrl("2026-03-08")) {
          return response(200, wrapPuzzle({ ...fixturePuzzle, date: "3/8/2026" }));
        }

        throw new Error(`Unexpected URL ${url}`);
      },
      logger: createLogger(),
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(fetchCalls, [
    XWORDINFO_ACROSTIC_ARCHIVE_URL,
    buildAcrosticDataUrl("2026-03-01"),
    buildAcrosticDataUrl("2026-03-08"),
  ]);
  assert.equal(
    normalizeInputDate("3/1/2026"),
    "2026-03-01",
  );
  assert.equal(
    JSON.parse(await readFile(path.join(outDir, "2026-03-01.json"), "utf8")).date,
    "3/1/2026",
  );
  assert.equal(
    JSON.parse(await readFile(path.join(outDir, "2026-03-08.json"), "utf8")).date,
    "3/8/2026",
  );
});

test("runFetchAcrostics with no args fetches the full published archive", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "acrostics-all-"));
  const archiveHtml = await loadFixture("acrostic-archive.html");
  const fixturePuzzle = JSON.parse(await loadFixture("xwordinfo-puzzle.decoded.json"));
  const fetchCalls: string[] = [];

  const exitCode = await runFetchAcrostics(["--out-dir", outDir], {
    today: "2026-03-08",
    fetchImpl: async (input) => {
      const url = String(input);
      fetchCalls.push(url);

      if (url === XWORDINFO_ACROSTIC_ARCHIVE_URL) {
        return response(200, archiveHtml);
      }

      if (url === buildAcrosticDataUrl("2026-02-28")) {
        return response(200, wrapPuzzle({ ...fixturePuzzle, date: "2/28/2026" }));
      }

      if (url === buildAcrosticDataUrl("2026-03-01")) {
        return response(200, wrapPuzzle({ ...fixturePuzzle, date: "3/1/2026" }));
      }

      if (url === buildAcrosticDataUrl("2026-03-08")) {
        return response(200, wrapPuzzle({ ...fixturePuzzle, date: "3/8/2026" }));
      }

      throw new Error(`Unexpected URL ${url}`);
    },
    logger: createLogger(),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(fetchCalls, [
    XWORDINFO_ACROSTIC_ARCHIVE_URL,
    buildAcrosticDataUrl("2026-02-28"),
    buildAcrosticDataUrl("2026-03-01"),
    buildAcrosticDataUrl("2026-03-08"),
  ]);
  assert.equal(
    JSON.parse(await readFile(path.join(outDir, "2026-02-28.json"), "utf8")).date,
    "2/28/2026",
  );
  assert.equal(
    JSON.parse(await readFile(path.join(outDir, "2026-03-08.json"), "utf8")).date,
    "3/8/2026",
  );
});

test("runFetchAcrostics range mode continues after failures and exits non-zero", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "acrostics-failures-"));
  const archiveHtml = await loadFixture("acrostic-archive.html");
  const fixturePuzzle = JSON.parse(await loadFixture("xwordinfo-puzzle.decoded.json"));
  const logger = createLogger();
  const fetchCalls: string[] = [];

  const exitCode = await runFetchAcrostics(
    ["--since", "2026-02-28", "--out-dir", outDir],
    {
      today: "2026-03-08",
      fetchImpl: async (input) => {
        const url = String(input);
        fetchCalls.push(url);

        if (url === XWORDINFO_ACROSTIC_ARCHIVE_URL) {
          return response(200, archiveHtml);
        }

        if (url === buildAcrosticDataUrl("2026-03-01")) {
          return response(500, "server error", "Internal Server Error");
        }

        const date = url.endsWith("2%2F28%2F2026") ? "2/28/2026" : "3/8/2026";
        return response(200, wrapPuzzle({ ...fixturePuzzle, date }));
      },
      logger,
    },
  );

  assert.equal(exitCode, 1);
  assert.deepEqual(fetchCalls, [
    XWORDINFO_ACROSTIC_ARCHIVE_URL,
    buildAcrosticDataUrl("2026-02-28"),
    buildAcrosticDataUrl("2026-03-01"),
    buildAcrosticDataUrl("2026-03-08"),
  ]);
  assert.equal(
    JSON.parse(await readFile(path.join(outDir, "2026-02-28.json"), "utf8")).date,
    "2/28/2026",
  );
  assert.equal(
    JSON.parse(await readFile(path.join(outDir, "2026-03-08.json"), "utf8")).date,
    "3/8/2026",
  );
  await assert.rejects(
    readFile(path.join(outDir, "2026-03-01.json"), "utf8"),
    /ENOENT/i,
  );
  assert.match(
    logger.errors.join("\n"),
    /Fetch completed with 1 failure\(s\) out of 3 date\(s\)\./,
  );
});

async function loadFixture(name: string): Promise<string> {
  return readFile(new URL(name, fixtureDir), "utf8");
}

function wrapPuzzle(puzzle: Record<string, unknown>): string {
  const json = JSON.stringify(puzzle);
  return JSON.stringify(
    {
      data: gzipSync(Buffer.from(json, "utf8")).toString("base64"),
    },
    null,
    2,
  );
}

function response(
  status: number,
  body: string,
  statusText = "OK",
): {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
} {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async text() {
      return body;
    },
  };
}

function createLogger(): {
  logs: string[];
  errors: string[];
  log(message: string): void;
  error(message: string): void;
} {
  return {
    logs: [],
    errors: [],
    log(message: string) {
      this.logs.push(message);
    },
    error(message: string) {
      this.errors.push(message);
    },
  };
}
