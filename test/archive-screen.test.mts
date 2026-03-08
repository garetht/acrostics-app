import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decodeBundledAcrosticByDate,
  getBundledAcrosticSelection,
  readDateSearchParam,
  resolveSelectedAcrosticDate,
} from "../lib/acrostics-archive.ts";
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
import { createAcrosticCacheRecord } from "../lib/xwordinfo/acrostics.mts";
import {
  buildBundledAcrosticsArchive,
  renderBundledAcrosticsArchiveModule,
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

test("date selection helpers normalize query values and fall back to the latest date", async () => {
  const puzzle = JSON.parse(await loadFixture("xwordinfo-puzzle.decoded.json"));
  const archive = buildBundledAcrosticsArchive([
    createAcrosticCacheRecord("2026-03-01", { ...puzzle, date: "3/1/2026" }),
    createAcrosticCacheRecord("2026-03-08", { ...puzzle, date: "3/8/2026" }),
  ]);

  assert.equal(readDateSearchParam("3/8/2026"), "2026-03-08");
  assert.equal(readDateSearchParam(["2026-03-01", "2026-03-08"]), "2026-03-01");
  assert.equal(readDateSearchParam("not-a-date"), null);
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
