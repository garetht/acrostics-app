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

### Fetch the Full Archive to Per-Date JSON Files

```bash
npm run fetch:acrostics
```

With no arguments, the CLI fetches every published acrostic date in the archive through today in `America/New_York` and writes one decoded file per date to `data/xwordinfo/acrostics`.

### Fetch Into the Repository Cache File

```bash
npm run fetch:acrostics:cache
```

This writes a gzipped JSON cache to `data/xwordinfo/acrostics.json.gz` in the repository. The uncompressed JSON is an array of records shaped like:

```json
[
  {"date":"2026-03-08","acrostic":"<base64 gzipped decoded puzzle json>"}
]
```

When the cache file already contains data, the fetcher gunzips it, parses the JSON array, reads the last cached date, and only requests dates after that point before rewriting the gzipped file.

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

### Select Output Targets Explicitly

Write only the committed cache file:

```bash
npm run fetch:acrostics -- --cache-file data/xwordinfo/acrostics.json.gz
```

Write only per-date JSON files to a custom directory:

```bash
npm run fetch:acrostics -- --out-dir tmp/acrostics
```

Write both outputs in the same run:

```bash
npm run fetch:acrostics -- --since 2026-01-01 --out-dir tmp/acrostics --cache-file data/xwordinfo/acrostics.json.gz
```

If `--cache-file` is supplied for `--date`, the CLI first checks the committed cache file for that date. A cache hit can materialize the per-date JSON file without making a network request.

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
5. Validates the required fields before writing the file or gzipped cache.

The typed models and parsing helpers live in [`lib/xwordinfo/acrostics.mts`](./lib/xwordinfo/acrostics.mts).

## CLI Behavior

- With no arguments, the CLI fetches the full published archive into per-date JSON files.
- `--out-dir` and `--cache-file` can be used independently or together.
- `--date` and `--since` are mutually exclusive.
- Invalid dates fail fast with a clear error.
- Range mode fetches dates sequentially.
- If one date fails in range mode, later dates still run.
- Range mode exits non-zero if any dates fail and prints a failure summary.
- Cache-file mode assumes the decoded cache array is sorted by ascending date.

## Testing

Run the targeted fetcher test suite with:

```bash
npm run test:acrostics
```

The tests cover wrapper parsing, base64 and gzip decoding, typed puzzle validation, archive date extraction, CLI argument validation, per-file output, cache-file output, cache hits, and partial-failure handling.

## Notes

- Live fetches require network access to `www.xwordinfo.com`.
- The CLI is dependency-free beyond the repo's existing Node/TypeScript toolchain.
