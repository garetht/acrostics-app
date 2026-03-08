import { gunzipSync, gzipSync } from "node:zlib";

import {
  normalizeInputDate,
  parseSavedAcrosticPuzzle,
  type SavedAcrosticPuzzle,
  type XWordInfoPuzzle,
} from "../acrostics-data.ts";

export { normalizeInputDate, parseSavedAcrosticPuzzle };
export type { SavedAcrosticPuzzle, XWordInfoPuzzle };

export const XWORDINFO_ACROSTIC_ARCHIVE_URL =
  "https://www.xwordinfo.com/SelectAcrostic";
export const XWORDINFO_ACROSTIC_DATA_URL =
  "https://www.xwordinfo.com/JSON/AcrosticData.ashx";
export const XWORDINFO_ACROSTIC_REFERRER =
  "https://www.xwordinfo.com/Acrostic";
export const XWORDINFO_TIME_ZONE = "America/New_York";

export type XWordInfoPuzzleWrapper = {
  data: string;
};

export type AcrosticCacheRecord = {
  date: string;
  acrostic: string;
};

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ARCHIVE_DATE_PATTERN = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;

export function parseXWordInfoPuzzleWrapper(
  jsonText: string,
): XWordInfoPuzzleWrapper {
  const record = parseJsonRecord(jsonText, "XWordInfo puzzle wrapper");
  const data = readNonEmptyString(record, "data", "XWordInfo puzzle wrapper");

  return { data };
}

export function decodeWrappedPuzzleData(
  wrapper: XWordInfoPuzzleWrapper,
): string {
  return decodeGzippedBase64(
    wrapper.data,
    "XWordInfo puzzle wrapper",
    "Unable to decode XWordInfo puzzle payload",
  );
}

export function parseXWordInfoPuzzle(jsonText: string): XWordInfoPuzzle {
  const record = parseJsonRecord(jsonText, "decoded XWordInfo puzzle");

  return {
    ...readSavedPuzzleFields(record, "decoded XWordInfo puzzle"),
    copyright: readString(record, "copyright"),
  };
}

export function parseWrappedPuzzleResponse(jsonText: string): {
  wrapper: XWordInfoPuzzleWrapper;
  decodedJson: string;
  puzzle: XWordInfoPuzzle;
} {
  const wrapper = parseXWordInfoPuzzleWrapper(jsonText);
  const decodedJson = decodeWrappedPuzzleData(wrapper);
  const puzzle = parseXWordInfoPuzzle(decodedJson);

  return { wrapper, decodedJson, puzzle };
}

export function toSavedAcrosticPuzzle(
  puzzle: XWordInfoPuzzle,
): SavedAcrosticPuzzle {
  const { copyright, ...savedPuzzle } = puzzle;
  void copyright;
  return savedPuzzle;
}

export function createAcrosticCacheRecord(
  date: string,
  puzzle: XWordInfoPuzzle,
): AcrosticCacheRecord {
  return {
    date: normalizeInputDate(date),
    acrostic: encodeGzippedBase64(JSON.stringify(toSavedAcrosticPuzzle(puzzle))),
  };
}

export function parseAcrosticCacheRecord(jsonText: string): AcrosticCacheRecord {
  const record = parseJsonRecord(jsonText, "acrostic cache record");
  return readAcrosticCacheRecord(record, "acrostic cache record");
}

export function parseAcrosticCache(jsonText: string): AcrosticCacheRecord[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Invalid acrostic cache: ${getErrorMessage(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid acrostic cache: expected a JSON array.");
  }

  const records = parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `Invalid acrostic cache entry ${index + 1}: expected a JSON object.`,
      );
    }

    return readAcrosticCacheRecord(
      entry as Record<string, unknown>,
      `acrostic cache entry ${index + 1}`,
    );
  });

  validateAcrosticCacheRecords(records);
  return records;
}

export function encodeAcrosticCache(records: readonly AcrosticCacheRecord[]): Buffer {
  validateAcrosticCacheRecords(records);
  return gzipSync(Buffer.from(JSON.stringify(records), "utf8"));
}

export function decodeAcrosticCache(
  compressedData: Uint8Array,
): AcrosticCacheRecord[] {
  if (compressedData.byteLength === 0) {
    return [];
  }

  let decodedJson: string;

  try {
    decodedJson = gunzipSync(compressedData).toString("utf8");
  } catch (error) {
    throw new Error(
      `Unable to decode acrostic cache file: ${getErrorMessage(error)}`,
    );
  }

  return parseAcrosticCache(decodedJson);
}

export function decodeAcrosticCacheRecord(record: AcrosticCacheRecord): {
  decodedJson: string;
  puzzle: SavedAcrosticPuzzle;
} {
  const decodedJson = decodeGzippedBase64(
    record.acrostic,
    "acrostic cache record",
    "Unable to decode cached acrostic payload",
  );
  const puzzle = parseSavedAcrosticPuzzle(decodedJson);

  return { decodedJson, puzzle };
}

export function formatEndpointDate(input: string): string {
  const [year, month, day] = normalizeInputDate(input).split("-");
  return `${Number.parseInt(month, 10)}/${Number.parseInt(day, 10)}/${Number.parseInt(year, 10)}`;
}

export function buildAcrosticDataUrl(input: string): string {
  const url = new URL(XWORDINFO_ACROSTIC_DATA_URL);
  url.searchParams.set("date", formatEndpointDate(input));
  return url.toString();
}

export function extractAvailableAcrosticDates(html: string): string[] {
  const dates = new Set<string>();

  for (const match of html.matchAll(ARCHIVE_DATE_PATTERN)) {
    const [, monthText, dayText, yearText] = match;

    try {
      dates.add(normalizeInputDate(`${monthText}/${dayText}/${yearText}`));
    } catch {
      continue;
    }
  }

  return [...dates].sort();
}

export function filterInclusiveDateRange(
  dates: readonly string[],
  startDate: string,
  endDate: string,
): string[] {
  const normalizedStart = normalizeInputDate(startDate);
  const normalizedEnd = normalizeInputDate(endDate);

  return dates.filter(
    (date) => date >= normalizedStart && date <= normalizedEnd,
  );
}

export function getTodayInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to derive today's date for time zone ${timeZone}.`);
  }

  return `${year}-${month}-${day}`;
}

function encodeGzippedBase64(value: string): string {
  return gzipSync(Buffer.from(value, "utf8")).toString("base64");
}

function decodeGzippedBase64(
  value: string,
  label: string,
  failurePrefix: string,
): string {
  const normalizedValue = value.trim();

  if (!BASE64_PATTERN.test(normalizedValue)) {
    throw new Error(`Invalid ${label}: expected a valid base64 payload.`);
  }

  try {
    const compressed = Buffer.from(normalizedValue, "base64");
    return gunzipSync(compressed).toString("utf8");
  } catch (error) {
    throw new Error(`${failurePrefix}: ${getErrorMessage(error)}`);
  }
}

function parseJsonRecord(
  jsonText: string,
  label: string,
): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Invalid ${label}: ${getErrorMessage(error)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid ${label}: expected a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function readSavedPuzzleFields(
  record: Record<string, unknown>,
  label: string,
): SavedAcrosticPuzzle {
  return {
    answerKey: readStringField(record, "answerKey", label),
    clueData: readStringArrayField(record, "clueData", label),
    clues: readStringArrayField(record, "clues", label),
    cols: readIntegerField(record, "cols", label),
    date: readStringField(record, "date", label),
    fullQuote: readOptionalNullableStringField(record, "fullQuote", label),
    gridLetters: readStringField(record, "gridLetters", label),
    gridNumbers: readIntegerArrayField(record, "gridNumbers", label),
    mapTitle: readIntegerArrayField(record, "mapTitle", label),
    quote: readStringField(record, "quote", label),
    rows: readIntegerField(record, "rows", label),
  };
}

function readAcrosticCacheRecord(
  record: Record<string, unknown>,
  label: string,
): AcrosticCacheRecord {
  const date = normalizeCacheRecordDate(record, label);
  const acrostic = readNonEmptyString(record, "acrostic", label).trim();

  if (!BASE64_PATTERN.test(acrostic)) {
    throw new Error(`Invalid ${label}: expected \`acrostic\` to be valid base64.`);
  }

  return { date, acrostic };
}

function validateAcrosticCacheRecords(
  records: readonly AcrosticCacheRecord[],
): void {
  let previousDate: string | undefined;

  for (const [index, record] of records.entries()) {
    if (previousDate && record.date <= previousDate) {
      throw new Error(
        `Invalid acrostic cache entry ${index + 1}: dates must be strictly increasing.`,
      );
    }

    previousDate = record.date;
  }
}

function normalizeCacheRecordDate(
  record: Record<string, unknown>,
  label: string,
): string {
  const value = record.date;

  if (typeof value !== "string") {
    throw new Error(`Invalid ${label}: expected \`date\` to be a string.`);
  }

  try {
    return normalizeInputDate(value);
  } catch (error) {
    throw new Error(`Invalid ${label}: ${getErrorMessage(error)}`);
  }
}

function readNonEmptyString(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string {
  const value = record[field];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `Invalid ${label}: expected a non-empty string in \`${field}\`.`,
    );
  }

  return value;
}

function readString(
  record: Record<string, unknown>,
  field: keyof XWordInfoPuzzle,
): string {
  return readStringField(record, field, "decoded XWordInfo puzzle");
}

function readStringField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string {
  const value = record[field];

  if (typeof value !== "string") {
    throw new Error(`Invalid ${label}: expected \`${field}\` to be a string.`);
  }

  return value;
}

function readIntegerField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): number {
  const value = record[field];

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid ${label}: expected \`${field}\` to be an integer.`);
  }

  return value;
}

function readStringArrayField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string[] {
  const value = record[field];

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Invalid ${label}: expected \`${field}\` to be an array of strings.`,
    );
  }

  return [...value];
}

function readIntegerArrayField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): number[] {
  const value = record[field];

  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "number" || !Number.isInteger(item))
  ) {
    throw new Error(
      `Invalid ${label}: expected \`${field}\` to be an array of integers.`,
    );
  }

  return [...value];
}

function readOptionalNullableStringField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string | null | undefined {
  const value = record[field];

  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== "string") {
    throw new Error(
      `Invalid ${label}: expected \`${field}\` to be a string, null, or omitted.`,
    );
  }

  return value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
