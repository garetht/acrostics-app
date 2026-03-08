import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseAcrosticArchiveManifest,
  readDateSearchParam,
  readSessionSearchParam,
  resolveSelectedAcrosticDate,
} from "../lib/acrostics-archive.ts";
import {
  decodeBundledAcrosticByDate,
  getBundledAcrosticSelection,
} from "../lib/acrostics-archive-bundle.ts";
import {
  ACROSTIC_PROGRESS_STORAGE_KEY,
  countFilledEntries,
  countStoredProgressEntries,
  deriveAcrosticProgressStatus,
  getStoredEntriesForDate,
  loadStoredAcrosticProgress,
  parseStoredAcrosticProgress,
  saveStoredEntriesForDate,
} from "../lib/acrostics-progress.ts";
import {
  createAcrosticCacheRecord,
  parseSavedAcrosticPuzzle,
} from "../lib/xwordinfo/acrostics.mts";
import {
  buildBundledAcrosticsArchive,
  buildAcrosticArchiveStaticManifest,
  renderAcrosticArchiveStaticManifestJson,
  renderBundledAcrosticsArchiveModule,
  writeBundledAcrosticStaticAssets,
} from "../scripts/generate-acrostics-bundle.mts";

const fixtureDir = new URL("./fixtures/", import.meta.url);

test("buildBundledAcrosticsArchive derives dates, payload lookup, and cell counts", async () => {
  const puzzle = JSON.parse(await loadFixture("xwordinfo-puzzle.decoded.json"));
  const records = [
    createAcrosticCacheRecord("2026-03-01", { ...puzzle, date: "3/1/2026" }),
    createAcrosticCacheRecord("2026-03-08", { ...puzzle, date: "3/8/2026" }),
  ];

  const archive = buildBundledAcrosticsArchive(records);
  const moduleText = renderBundledAcrosticsArchiveModule(archive);

  assert.deepEqual(archive.availableDates, ["2026-03-01", "2026-03-08"]);
  assert.equal(archive.latestDate, "2026-03-08");
  assert.equal(archive.payloadByDate["2026-03-01"], records[0].acrostic);
  assert.equal(
    archive.cellCountByDate["2026-03-08"],
    puzzle.gridNumbers.filter((value: number) => value > 0).length,
  );
  assert.match(moduleText, /export const bundledAcrosticDates/);
  assert.match(moduleText, /export const bundledAcrosticArchive/);
});

test("static archive assets emit a manifest and per-date puzzle files", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "acrostics-static-assets-"));
  const puzzle = JSON.parse(await loadFixture("xwordinfo-puzzle.decoded.json"));
  const records = [
    createAcrosticCacheRecord("2026-03-01", { ...puzzle, date: "3/1/2026" }),
    createAcrosticCacheRecord("2026-03-08", { ...puzzle, date: "3/8/2026" }),
  ];

  await writeBundledAcrosticStaticAssets(records, outputDir);

  const manifestJson = await readFile(path.join(outputDir, "manifest.json"), "utf8");
  const savedPuzzleJson = await readFile(
    path.join(outputDir, "puzzles", "2026-03-08.json"),
    "utf8",
  );
  const manifest = parseAcrosticArchiveManifest(manifestJson);

  assert.equal(manifest.latestDate, "2026-03-08");
  assert.deepEqual(manifest.availableDates, ["2026-03-01", "2026-03-08"]);
  assert.equal(parseSavedAcrosticPuzzle(savedPuzzleJson).date, "3/8/2026");
  assert.equal("copyright" in JSON.parse(savedPuzzleJson), false);
});

test("date selection helpers normalize query values and fall back to the latest date", async () => {
  const puzzle = JSON.parse(await loadFixture("xwordinfo-puzzle.decoded.json"));
  const archive = buildBundledAcrosticsArchive([
    createAcrosticCacheRecord("2026-03-01", { ...puzzle, date: "3/1/2026" }),
    createAcrosticCacheRecord("2026-03-08", { ...puzzle, date: "3/8/2026" }),
  ]);

  assert.equal(readDateSearchParam("3/8/2026"), "2026-03-08");
  assert.equal(readDateSearchParam(["2026-03-01", "2026-03-08"]), "2026-03-01");
  assert.equal(readDateSearchParam("not-a-date"), null);
  assert.equal(readSessionSearchParam("  room-1 "), "room-1");
  assert.equal(readSessionSearchParam(["", "room-2"]), null);
  assert.equal(
    resolveSelectedAcrosticDate("2026-03-01", archive.availableDates, archive.latestDate),
    "2026-03-01",
  );
  assert.equal(
    resolveSelectedAcrosticDate("2026-03-22", archive.availableDates, archive.latestDate),
    "2026-03-08",
  );

  const selected = getBundledAcrosticSelection("2026-03-22", archive);
  const decoded = decodeBundledAcrosticByDate("2026-03-01", archive);

  assert.equal(selected.selectedDate, "2026-03-08");
  assert.equal(selected.puzzle.date, "3/8/2026");
  assert.equal(decoded.date, "3/1/2026");
});

test("static manifest helpers strip payload data for browser fetches", async () => {
  const puzzle = JSON.parse(await loadFixture("xwordinfo-puzzle.decoded.json"));
  const archive = buildBundledAcrosticsArchive([
    createAcrosticCacheRecord("2026-03-08", { ...puzzle, date: "3/8/2026" }),
  ]);

  const manifest = buildAcrosticArchiveStaticManifest(archive);
  const manifestJson = renderAcrosticArchiveStaticManifestJson(manifest);

  assert.equal("payloadByDate" in manifest, false);
  assert.deepEqual(parseAcrosticArchiveManifest(manifestJson), manifest);
});

test("progress storage sanitizes persisted entries and recovers from malformed local storage", () => {
  const storage = createStorage();
  saveStoredEntriesForDate(
    storage,
    "2026-03-08",
    {
      0: "Q",
      1: "a",
      2: "B",
      3: "!",
    } as Record<number, string>,
    "2026-03-08T12:00:00.000Z",
  );

  const persisted = parseStoredAcrosticProgress(storage.getItem(ACROSTIC_PROGRESS_STORAGE_KEY));

  assert.deepEqual(persisted, {
    "2026-03-08": {
      entriesByNumber: {
        "1": "A",
        "2": "B",
      },
      updatedAt: "2026-03-08T12:00:00.000Z",
    },
  });
  assert.deepEqual(getStoredEntriesForDate(persisted, "2026-03-08", [1, 2, 4]), {
    1: "A",
    2: "B",
  });
  assert.equal(countStoredProgressEntries(persisted["2026-03-08"]), 2);
  assert.equal(countFilledEntries({ 1: "A", 2: "B", 4: "Z" }, [1, 2]), 2);

  storage.setItem(ACROSTIC_PROGRESS_STORAGE_KEY, "{broken json");
  assert.deepEqual(loadStoredAcrosticProgress(storage), {});
  assert.deepEqual(parseStoredAcrosticProgress('{"bad":{"entriesByNumber":[]}}'), {});
});

test("deriveAcrosticProgressStatus returns not started, in progress, and completed badges", () => {
  assert.deepEqual(deriveAcrosticProgressStatus(0, 12), {
    detail: null,
    filledCount: 0,
    kind: "not_started",
    label: "Not started",
    totalCount: 12,
  });
  assert.deepEqual(deriveAcrosticProgressStatus(4, 12), {
    detail: "4/12",
    filledCount: 4,
    kind: "in_progress",
    label: "In progress",
    totalCount: 12,
  });
  assert.deepEqual(deriveAcrosticProgressStatus(20, 12), {
    detail: "12/12",
    filledCount: 12,
    kind: "completed",
    label: "Completed",
    totalCount: 12,
  });
});

async function loadFixture(name: string): Promise<string> {
  return readFile(new URL(name, fixtureDir), "utf8");
}

function createStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues));

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}
