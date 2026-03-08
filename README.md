# Acrostics App

This repository contains a Next.js app plus a typed Node/TypeScript CLI for fetching and decoding XWord Info acrostic data.

## Requirements

- Node.js 24+
- npm

## App Development

Install dependencies and start the app:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Acrostic Fetch CLI

The fetcher lives in [`scripts/fetch-acrostics.mts`](./scripts/fetch-acrostics.mts) and runs with Node's type-stripping support.

### Fetch a Single Date

```bash
npm run fetch:acrostics -- --date 2026-03-08
```

Accepted date formats:

- `YYYY-MM-DD`
- `M/D/YYYY`

### Fetch All Published Dates Since a Start Date

```bash
npm run fetch:acrostics -- --since 2026-01-01
```

Range mode does not walk every calendar day. It first loads the XWord Info acrostic archive page, extracts the actual publication dates, filters them to the requested window, and then fetches each available puzzle date through today in `America/New_York`.

### Write to a Custom Directory

```bash
npm run fetch:acrostics -- --since 2026-01-01 --out-dir tmp/acrostics
```

Default output directory:

```text
data/xwordinfo/acrostics
```

Each successful fetch writes one decoded JSON file named `YYYY-MM-DD.json`.

## Response Decoding and Typing

The XWord Info endpoint returns JSON shaped like:

```json
{
  "data": "<base64 gzipped json>"
}
```

The fetcher:

1. Parses the wrapper object.
2. Base64-decodes `data`.
3. Gunzips the payload.
4. Parses the decoded JSON into typed models.
5. Validates the required fields before writing the file.

The typed models and parsing helpers live in [`lib/xwordinfo/acrostics.mts`](./lib/xwordinfo/acrostics.mts).

### Typed Models

```ts
type XWordInfoPuzzleWrapper = {
  data: string;
};

type XWordInfoPuzzle = {
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
```

Unknown extra fields in the decoded payload are ignored. Required known fields are validated strictly.

## CLI Behavior

- Exactly one of `--date` or `--since` is required.
- Invalid dates fail fast with a clear error.
- Range mode fetches dates sequentially.
- If one date fails in range mode, later dates still run.
- Range mode exits non-zero if any dates fail and prints a failure summary.

## Testing

Run the targeted fetcher test suite with:

```bash
npm run test:acrostics
```

The tests cover:

- wrapper parsing
- base64 + gzip decoding
- typed puzzle validation
- archive date extraction and filtering
- CLI argument validation
- single-date and range fetch orchestration
- partial-failure handling in range mode

## Notes

- Live fetches require network access to `www.xwordinfo.com`.
- The CLI is dependency-free beyond the repo's existing Node/TypeScript toolchain.
