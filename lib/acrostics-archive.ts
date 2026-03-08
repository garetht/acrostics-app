import {
  normalizeInputDate,
  parseSavedAcrosticPuzzle,
  type SavedAcrosticPuzzle,
} from "./acrostics-data.ts";
import { buildPathWithBasePath } from "./site-paths.ts";

export type AcrosticDateSearchParam = string | string[] | undefined;

export type AcrosticArchiveManifest = {
  availableDates: readonly string[];
  cellCountByDate: Readonly<Record<string, number>>;
  latestDate: string;
};

export type ResolvedAcrosticArchiveSelection = AcrosticArchiveManifest & {
  selectedDate: string;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readTrimmedSearchParam(
  value: string | string[] | undefined,
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (typeof candidate !== "string" || candidate.trim().length === 0) {
    return null;
  }

  return candidate.trim();
}

export function readDateSearchParam(
  value: AcrosticDateSearchParam,
): string | null {
  const candidate = readTrimmedSearchParam(value);

  if (!candidate) {
    return null;
  }

  try {
    return normalizeInputDate(candidate);
  } catch {
    return null;
  }
}

export function readSessionSearchParam(
  value: string | string[] | undefined,
): string | null {
  return readTrimmedSearchParam(value);
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

export function resolveAcrosticArchiveSelection(
  requestedDate: string | null,
  manifest: AcrosticArchiveManifest,
): ResolvedAcrosticArchiveSelection {
  const selectedDate = resolveSelectedAcrosticDate(
    requestedDate,
    manifest.availableDates,
    manifest.latestDate,
  );

  return {
    availableDates: manifest.availableDates,
    cellCountByDate: manifest.cellCountByDate,
    latestDate: manifest.latestDate,
    selectedDate,
  };
}

export function parseAcrosticArchiveManifest(
  jsonText: string,
): AcrosticArchiveManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Invalid acrostic archive manifest: ${getErrorMessage(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid acrostic archive manifest: expected a JSON object.");
  }

  const record = parsed as Record<string, unknown>;
  const availableDates = record.availableDates;
  const cellCountByDate = record.cellCountByDate;
  const latestDate = record.latestDate;

  if (!Array.isArray(availableDates) || availableDates.length === 0) {
    throw new Error(
      "Invalid acrostic archive manifest: expected availableDates to be a non-empty array.",
    );
  }

  const normalizedDates = availableDates.map((value, index) => {
    if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
      throw new Error(
        `Invalid acrostic archive manifest: availableDates[${index}] must be an ISO date string.`,
      );
    }

    return value;
  });

  if (
    !cellCountByDate ||
    typeof cellCountByDate !== "object" ||
    Array.isArray(cellCountByDate)
  ) {
    throw new Error(
      "Invalid acrostic archive manifest: expected cellCountByDate to be an object.",
    );
  }

  const normalizedCellCountByDate: Record<string, number> = {};

  for (const [date, value] of Object.entries(cellCountByDate)) {
    if (!ISO_DATE_PATTERN.test(date)) {
      throw new Error(
        `Invalid acrostic archive manifest: invalid date key "${date}" in cellCountByDate.`,
      );
    }

    if (!Number.isInteger(value) || value < 0) {
      throw new Error(
        `Invalid acrostic archive manifest: cell count for ${date} must be a non-negative integer.`,
      );
    }

    normalizedCellCountByDate[date] = value;
  }

  if (typeof latestDate !== "string" || !normalizedDates.includes(latestDate)) {
    throw new Error(
      "Invalid acrostic archive manifest: latestDate must match one of availableDates.",
    );
  }

  return {
    availableDates: normalizedDates,
    cellCountByDate: normalizedCellCountByDate,
    latestDate,
  };
}

export async function fetchAcrosticArchiveManifest(
  init?: RequestInit,
): Promise<AcrosticArchiveManifest> {
  const response = await fetch(buildPathWithBasePath("/acrostics/manifest.json"), init);

  if (!response.ok) {
    throw new Error(
      `Unable to load acrostic archive manifest: ${response.status} ${response.statusText}`.trim(),
    );
  }

  return parseAcrosticArchiveManifest(await response.text());
}

export async function fetchAcrosticPuzzleByDate(
  date: string,
  init?: RequestInit,
): Promise<SavedAcrosticPuzzle> {
  const normalizedDate = normalizeInputDate(date);
  const response = await fetch(
    buildPathWithBasePath(`/acrostics/puzzles/${normalizedDate}.json`),
    init,
  );

  if (!response.ok) {
    throw new Error(
      `Unable to load acrostic puzzle for ${normalizedDate}: ${response.status} ${response.statusText}`.trim(),
    );
  }

  return parseSavedAcrosticPuzzle(await response.text());
}

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "Unknown error";
}
