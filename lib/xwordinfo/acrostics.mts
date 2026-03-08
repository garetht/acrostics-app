import { gunzipSync } from "node:zlib";

export const XWORDINFO_ACROSTIC_ARCHIVE_URL =
  "https://www.xwordinfo.com/Acrostic/SelectAcrostic.asp";
export const XWORDINFO_ACROSTIC_DATA_URL =
  "https://www.xwordinfo.com/JSON/AcrosticData.ashx";
export const XWORDINFO_TIME_ZONE = "America/New_York";

export type XWordInfoPuzzleWrapper = {
  data: string;
};

export type XWordInfoPuzzle = {
  answerKey: string;
  clueData: string[];
  clues: string[];
  cols: number;
  copyright: string;
  date: string;
  fullQuote: string;
  gridLetters: string;
  gridNumbers: number[];
  mapTitle: number[];
  quote: string;
  rows: number;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ARCHIVE_DATE_PATTERN = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;

export function parseXWordInfoPuzzleWrapper(
  jsonText: string,
): XWordInfoPuzzleWrapper {
  const record = parseJsonRecord(jsonText, "XWordInfo puzzle wrapper");
  const data = record.data;

  if (typeof data !== "string" || data.trim() === "") {
    throw new Error(
      "Invalid XWordInfo puzzle wrapper: expected a non-empty string in `data`.",
    );
  }

  return { data };
}

export function decodeWrappedPuzzleData(
  wrapper: XWordInfoPuzzleWrapper,
): string {
  const data = wrapper.data.trim();

  if (!BASE64_PATTERN.test(data)) {
    throw new Error(
      "Invalid XWordInfo puzzle wrapper: `data` is not valid base64.",
    );
  }

  try {
    const compressed = Buffer.from(data, "base64");
    return gunzipSync(compressed).toString("utf8");
  } catch (error) {
    throw new Error(
      `Unable to decode XWordInfo puzzle payload: ${getErrorMessage(error)}`,
    );
  }
}

export function parseXWordInfoPuzzle(jsonText: string): XWordInfoPuzzle {
  const record = parseJsonRecord(jsonText, "decoded XWordInfo puzzle");

  return {
    answerKey: readString(record, "answerKey"),
    clueData: readStringArray(record, "clueData"),
    clues: readStringArray(record, "clues"),
    cols: readInteger(record, "cols"),
    copyright: readString(record, "copyright"),
    date: readString(record, "date"),
    fullQuote: readString(record, "fullQuote"),
    gridLetters: readString(record, "gridLetters"),
    gridNumbers: readIntegerArray(record, "gridNumbers"),
    mapTitle: readIntegerArray(record, "mapTitle"),
    quote: readString(record, "quote"),
    rows: readInteger(record, "rows"),
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

export function normalizeInputDate(input: string): string {
  const { year, month, day } = parseDateParts(input);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatEndpointDate(input: string): string {
  const { year, month, day } = parseDateParts(input);
  return `${month}/${day}/${year}`;
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

function readString(
  record: Record<string, unknown>,
  field: keyof XWordInfoPuzzle,
): string {
  const value = record[field];

  if (typeof value !== "string") {
    throw new Error(
      `Invalid decoded XWordInfo puzzle: expected \`${field}\` to be a string.`,
    );
  }

  return value;
}

function readInteger(
  record: Record<string, unknown>,
  field: keyof XWordInfoPuzzle,
): number {
  const value = record[field];

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(
      `Invalid decoded XWordInfo puzzle: expected \`${field}\` to be an integer.`,
    );
  }

  return value;
}

function readStringArray(
  record: Record<string, unknown>,
  field: keyof XWordInfoPuzzle,
): string[] {
  const value = record[field];

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `Invalid decoded XWordInfo puzzle: expected \`${field}\` to be an array of strings.`,
    );
  }

  return [...value];
}

function readIntegerArray(
  record: Record<string, unknown>,
  field: keyof XWordInfoPuzzle,
): number[] {
  const value = record[field];

  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "number" || !Number.isInteger(item))
  ) {
    throw new Error(
      `Invalid decoded XWordInfo puzzle: expected \`${field}\` to be an array of integers.`,
    );
  }

  return [...value];
}

function parseDateParts(input: string): DateParts {
  const value = input.trim();
  const isoMatch = ISO_DATE_PATTERN.exec(value);

  if (isoMatch) {
    const [, yearText, monthText, dayText] = isoMatch;
    return validateDateParts(
      Number.parseInt(yearText, 10),
      Number.parseInt(monthText, 10),
      Number.parseInt(dayText, 10),
      input,
    );
  }

  const slashMatch = SLASH_DATE_PATTERN.exec(value);

  if (slashMatch) {
    const [, monthText, dayText, yearText] = slashMatch;
    return validateDateParts(
      Number.parseInt(yearText, 10),
      Number.parseInt(monthText, 10),
      Number.parseInt(dayText, 10),
      input,
    );
  }

  throw new Error(
    `Invalid date "${input}". Expected YYYY-MM-DD or M/D/YYYY format.`,
  );
}

function validateDateParts(
  year: number,
  month: number,
  day: number,
  originalInput: string,
): DateParts {
  if (!Number.isInteger(year) || year < 1) {
    throw new Error(`Invalid date "${originalInput}": invalid year.`);
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid date "${originalInput}": invalid month.`);
  }

  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Invalid date "${originalInput}": invalid day.`);
  }

  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  const thirtyDayMonths = new Set([4, 6, 9, 11]);

  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return thirtyDayMonths.has(month) ? 30 : 31;
}

function isLeapYear(year: number): boolean {
  if (year % 400 === 0) {
    return true;
  }

  if (year % 100 === 0) {
    return false;
  }

  return year % 4 === 0;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
