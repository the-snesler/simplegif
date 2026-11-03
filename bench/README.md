# Tests & benchmarks

## Fixtures

```sh
./e2e/fixtures/generate.sh   # needs system ffmpeg; writes e2e/fixtures/out/ (gitignored)
```

## Unit tests (codec)

```sh
npx vitest run --project server
```

## End-to-end tests

Drives the real UI in Chromium and checks downloads with an independent GIF
decoder (pixel-exact where the edit is lossless).

```sh
pnpm build && pnpm preview --port 4173 &   # or let Playwright start it (omit BASE_URL)
BASE_URL=http://localhost:4173 npx playwright test
```

Set `PW_CHROMIUM_PATH` to use a specific Chromium/headless-shell binary.

## Benchmark

Interleaved A/B runs of the import → edit → download cycle (medians):

```sh
node bench/run.mjs --url main=http://localhost:5197 --url branch=http://localhost:5198 \
  --runs 3 --fixtures medium.gif,large.gif,clip720.mp4 --out bench/results/run.local.json
```

Metrics: time to first preview frame, time until fully decoded, each edit,
downloads (unedited / after edits / after undo), total cycle time, total
main-thread long-task time and the longest main-thread frame gap.
