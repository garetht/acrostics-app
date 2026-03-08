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

## GitHub Pages Deployment

This repository is already configured to deploy to GitHub Pages as a static export. The key pieces are:

- `next.config.ts`: enables `output: "export"` and `trailingSlash: true`
- `package.json`: runs `next build --webpack`
- `.github/workflows/pages.yml`: builds and deploys `out/`

### One-Time GitHub Setup

1. Push the deployment-ready code to your default branch.
   The Pages workflow currently runs on pushes to `main` and `master`.
2. Enable GitHub Pages to deploy from Actions.
   In GitHub, open `Settings` > `Pages` > `Build and deployment` and set `Source` to `GitHub Actions`.
3. Confirm the site path.
   The current workflow assumes a project site at `https://<user>.github.io/acrostics-app/`.
   If your repository name or Pages path is different, update `NEXT_PUBLIC_BASE_PATH` in `.github/workflows/pages.yml`.
   Example: if the repo is `crosswords`, set `NEXT_PUBLIC_BASE_PATH: /crosswords`.
   If you deploy at the domain root, set `NEXT_PUBLIC_BASE_PATH: /` or remove the override.

### Local Verification

Before pushing, verify the static export locally:

```bash
npm install
NEXT_PUBLIC_BASE_PATH=/acrostics-app npm run build
```

The production build writes the exported site to `out/`.

Confirm that the export contains:

- `out/index.html`
- `out/multiplayer/index.html`
- `out/acrostics/manifest.json`

The build also generates browser-fetchable archive assets in `public/acrostics` before export. Those files are derived from the committed cache and are not meant to be edited by hand.

### Automatic Deployment

After GitHub Pages is configured, deploy by either:

- pushing to `main` or `master`
- running the `Deploy GitHub Pages` workflow manually from the Actions tab

The workflow will:

- use Node 24
- run `npm ci`
- run `npm run build`
- upload `out/`
- deploy with `actions/deploy-pages`

### Post-Deploy Smoke Test

After the workflow finishes, open the Pages URL from the workflow run or Pages settings and verify:

- `/acrostics-app/`
- `/acrostics-app/multiplayer/`
- archive URLs with `?date=...`
- copied multiplayer invite links

For manual local builds outside the workflow, set `NEXT_PUBLIC_BASE_PATH` at build time for project-site deployments under a repository subpath. Example:

```bash
NEXT_PUBLIC_BASE_PATH=/acrostics-app npm run build
```

Multiplayer still depends on external PeerJS/WebRTC signaling; GitHub Pages only hosts the static frontend.

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
