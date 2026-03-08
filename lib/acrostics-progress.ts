export const ACROSTIC_PROGRESS_STORAGE_KEY = "acrostics.progress.v1";

export type StoredAcrosticProgressRecord = {
  entriesByNumber: Record<string, string>;
  updatedAt: string;
};

export type StoredAcrosticProgressMap = Record<string, StoredAcrosticProgressRecord>;

export type AcrosticProgressStatus = {
  kind: "not_started" | "in_progress" | "completed";
  label: string;
  detail: string | null;
  filledCount: number;
  totalCount: number;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LETTER_PATTERN = /^[A-Z]$/;

function sanitizeStoredEntries(
  record: Record<string, unknown>,
): Record<string, string> {
  const entriesByNumber: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    if (!/^[1-9]\d*$/.test(key)) {
      continue;
    }

    if (typeof value !== "string") {
      continue;
    }

    const nextValue = value.trim().toUpperCase();

    if (!LETTER_PATTERN.test(nextValue)) {
      continue;
    }

    entriesByNumber[key] = nextValue;
  }

  return entriesByNumber;
}

export function parseStoredAcrosticProgress(
  jsonText: string | null,
): StoredAcrosticProgressMap {
  if (!jsonText) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {};
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const progressMap: StoredAcrosticProgressMap = {};

  for (const [date, rawRecord] of Object.entries(parsed)) {
    if (!ISO_DATE_PATTERN.test(date)) {
      continue;
    }

    if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
      continue;
    }

    const { entriesByNumber, updatedAt } = rawRecord as Record<string, unknown>;

    if (
      !entriesByNumber ||
      typeof entriesByNumber !== "object" ||
      Array.isArray(entriesByNumber) ||
      typeof updatedAt !== "string" ||
      updatedAt.trim().length === 0
    ) {
      continue;
    }

    progressMap[date] = {
      entriesByNumber: sanitizeStoredEntries(
        entriesByNumber as Record<string, unknown>,
      ),
      updatedAt,
    };
  }

  return progressMap;
}

export function serializeStoredAcrosticProgress(
  progressMap: StoredAcrosticProgressMap,
): string {
  return JSON.stringify(progressMap);
}

export function countFilledEntries(
  entriesByNumber: Record<number, string>,
  validNumbers?: readonly number[],
): number {
  const validNumberSet =
    validNumbers && validNumbers.length > 0 ? new Set(validNumbers) : null;

  return Object.entries(entriesByNumber).reduce((count, [key, value]) => {
    const number = Number.parseInt(key, 10);
    const nextValue = value.trim().toUpperCase();

    if (!Number.isInteger(number) || number <= 0 || !LETTER_PATTERN.test(nextValue)) {
      return count;
    }

    if (validNumberSet && !validNumberSet.has(number)) {
      return count;
    }

    return count + 1;
  }, 0);
}

export function countStoredProgressEntries(
  record: StoredAcrosticProgressRecord | null | undefined,
): number {
  if (!record) {
    return 0;
  }

  return Object.values(record.entriesByNumber).reduce((count, value) => {
    return LETTER_PATTERN.test(value) ? count + 1 : count;
  }, 0);
}

export function deriveAcrosticProgressStatus(
  filledCount: number,
  totalCount: number,
): AcrosticProgressStatus {
  const safeTotalCount = Math.max(0, totalCount);
  const safeFilledCount = Math.max(0, Math.min(filledCount, safeTotalCount));

  if (safeFilledCount === 0 || safeTotalCount === 0) {
    return {
      detail: null,
      filledCount: safeFilledCount,
      kind: "not_started",
      label: "Not started",
      totalCount: safeTotalCount,
    };
  }

  if (safeFilledCount >= safeTotalCount) {
    return {
      detail: `${safeFilledCount}/${safeTotalCount}`,
      filledCount: safeFilledCount,
      kind: "completed",
      label: "Completed",
      totalCount: safeTotalCount,
    };
  }

  return {
    detail: `${safeFilledCount}/${safeTotalCount}`,
    filledCount: safeFilledCount,
    kind: "in_progress",
    label: "In progress",
    totalCount: safeTotalCount,
  };
}

export function loadStoredAcrosticProgress(
  storage: Pick<Storage, "getItem">,
): StoredAcrosticProgressMap {
  return parseStoredAcrosticProgress(storage.getItem(ACROSTIC_PROGRESS_STORAGE_KEY));
}

export function getStoredEntriesForDate(
  progressMap: StoredAcrosticProgressMap,
  date: string,
  validNumbers: readonly number[],
): Record<number, string> {
  const storedRecord = progressMap[date];

  if (!storedRecord) {
    return {};
  }

  const validNumberSet = new Set(validNumbers);
  const entriesByNumber: Record<number, string> = {};

  for (const [key, value] of Object.entries(storedRecord.entriesByNumber)) {
    const number = Number.parseInt(key, 10);

    if (!Number.isInteger(number) || !validNumberSet.has(number)) {
      continue;
    }

    if (!LETTER_PATTERN.test(value)) {
      continue;
    }

    entriesByNumber[number] = value;
  }

  return entriesByNumber;
}

export function saveStoredEntriesForDate(
  storage: StorageLike,
  date: string,
  entriesByNumber: Record<number, string>,
  updatedAt = new Date().toISOString(),
): StoredAcrosticProgressMap {
  const progressMap = loadStoredAcrosticProgress(storage);
  const sanitizedEntries = sanitizeStoredEntries(
    Object.fromEntries(
      Object.entries(entriesByNumber).map(([key, value]) => [
        key,
        value.trim().toUpperCase(),
      ]),
    ),
  );

  if (Object.keys(sanitizedEntries).length === 0) {
    delete progressMap[date];
  } else {
    progressMap[date] = {
      entriesByNumber: sanitizedEntries,
      updatedAt,
    };
  }

  storage.setItem(
    ACROSTIC_PROGRESS_STORAGE_KEY,
    serializeStoredAcrosticProgress(progressMap),
  );

  return progressMap;
}
