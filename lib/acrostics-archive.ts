import {
  decodeAcrosticCacheRecord,
  normalizeInputDate,
  type SavedAcrosticPuzzle,
} from "./xwordinfo/acrostics.mts";
import {
  bundledAcrosticArchive,
  type BundledAcrosticArchive,
} from "./generated/acrostics-archive.ts";

export type AcrosticDateSearchParam = string | string[] | undefined;

export type ResolvedBundledAcrosticSelection = {
  availableDates: readonly string[];
  cellCountByDate: Readonly<Record<string, number>>;
  latestDate: string;
  puzzle: SavedAcrosticPuzzle;
  selectedDate: string;
};

export function readDateSearchParam(
  value: AcrosticDateSearchParam,
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return null;
  }

  try {
    return normalizeInputDate(candidate.trim());
  } catch {
    return null;
  }
}

export function resolveSelectedAcrosticDate(
  requestedDate: string | null,
  availableDates: readonly string[],
  latestDate: string,
): string {
  if (requestedDate && availableDates.includes(requestedDate)) {
    return requestedDate;
  }

  return latestDate;
}

export function decodeBundledAcrosticByDate(
  date: string,
  archive: Pick<BundledAcrosticArchive, "payloadByDate"> = bundledAcrosticArchive,
): SavedAcrosticPuzzle {
  const payload = archive.payloadByDate[date];

  if (!payload) {
    throw new Error(`No bundled acrostic exists for ${date}.`);
  }

  return decodeAcrosticCacheRecord({ acrostic: payload, date }).puzzle;
}

export function getBundledAcrosticSelection(
  requestedDate: string | null,
  archive: BundledAcrosticArchive = bundledAcrosticArchive,
): ResolvedBundledAcrosticSelection {
  const selectedDate = resolveSelectedAcrosticDate(
    requestedDate,
    archive.availableDates,
    archive.latestDate,
  );

  return {
    availableDates: archive.availableDates,
    cellCountByDate: archive.cellCountByDate,
    latestDate: archive.latestDate,
    puzzle: decodeBundledAcrosticByDate(selectedDate, archive),
    selectedDate,
  };
}
