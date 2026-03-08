import {
  decodeAcrosticCacheRecord,
  type SavedAcrosticPuzzle,
} from "./xwordinfo/acrostics.mts";
import {
  bundledAcrosticArchive,
  type BundledAcrosticArchive,
} from "./generated/acrostics-archive.ts";
import {
  resolveAcrosticArchiveSelection,
  type AcrosticArchiveManifest,
} from "./acrostics-archive.ts";

export type ResolvedBundledAcrosticSelection = AcrosticArchiveManifest & {
  puzzle: SavedAcrosticPuzzle;
  selectedDate: string;
};

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
  const selection = resolveAcrosticArchiveSelection(requestedDate, archive);

  return {
    ...selection,
    puzzle: decodeBundledAcrosticByDate(selection.selectedDate, archive),
  };
}
