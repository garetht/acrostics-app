export type XWordInfoPuzzle = {
  answerKey: string;
  clueData: string[];
  clues: string[];
  cols: number;
  copyright: string;
  date: string;
  fullQuote?: string | null;
  gridLetters: string;
  gridNumbers: number[];
  mapTitle: number[];
  quote: string;
  rows: number;
};

export type SavedAcrosticPuzzle = Omit<XWordInfoPuzzle, "copyright">;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseSavedAcrosticPuzzle(jsonText: string): SavedAcrosticPuzzle {
  const record = parseJsonRecord(jsonText, "saved acrostic puzzle");
  return readSavedPuzzleFields(record, "saved acrostic puzzle");
}

export function normalizeInputDate(input: string): string {
  const { year, month, day } = parseDateParts(input);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
