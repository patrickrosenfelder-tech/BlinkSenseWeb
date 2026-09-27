# BlinkSense Assessment

A standalone, privacy-first browser assessment: a short reading task, three
lightweight vision checks, and on-device blink-rate tracking — for adults and
for kids (ages 6–9 and 10–13). It lives entirely under `assessment/` and is
independent of the BlinkSense landing site and the live blink-monitor app
elsewhere in this repository.

**Screening only — not medical advice.** This tool does not diagnose or treat
any condition. If you have concerns about your eyes or vision, see an
eye-care professional.

**Processed on-device.** Camera video, landmarks, answers, and results are
processed on this device and are never uploaded, stored remotely, or shared.
There is no account and no cloud. The app's code and its on-device
face-tracking model (the same MediaPipe approach used by the BlinkSense
monitor app) are downloaded from hosting CDNs when the page loads or the
camera is enabled. The optional camera step is used only to estimate blink
rate locally; you can decline it entirely and still complete every task.

## What it covers

- **Consent-first flow** — a clear explanation of what the camera is (and
  isn't) used for, with an explicit opt-out that skips blink tracking.
- **Adult flow** — a local, privacy-first "new appointment" intake form
  (identity, address, gender/contact, appointment, and insurance fields —
  Social Security Numbers are deliberately never collected), a timed
  reading-comprehension passage, and three self-report vision checks (letter
  size / acuity, contrast, and a simplified, non-diagnostic color-response
  check). Entered intake values never leave this browser tab and are not
  included in the results screen or downloaded report — only a redacted
  completion summary (fields completed / required-fields-complete) is.
- **Kids flow** — an age choice (6–9 or 10–13) followed by a single
  age-adjusted story-and-picture task combining a short reading passage with
  vision-friendly letter-matching and color rounds.
- **Combined results** — task score(s), vision categories (adult), and the
  session's total blink count / average blink rate, with a one-click local
  JSON report download. Nothing is sent anywhere as part of that download.

## Requirements

- Node.js 18+ (uses Vite 5 and Node's built-in test runner).

## Install

```sh
cd assessment
npm install
```

## Run locally

```sh
npm run dev
```

Then open the printed local URL. Camera access requires a secure context
(`localhost` is fine; other hosts need HTTPS).

## Test

Strict TDD was used for every scoring, report, and content module — all pure
functions, no DOM or camera required:

```sh
npm test
```

This runs `node --test` against `test/*.test.js`, covering:

- `bpm-math.js` — active-duration and blink-rate math (shared approach with
  the monitor app).
- `content/*.js` — reading passage scoring, vision-check classification, and
  age-specific kids content/scoring.
- `scoring.js` — combined blink summary and vision-results composition.
- `report.js` — the exact JSON report payload and filename produced for
  download, including deterministic field-for-field checks.

The UI/camera layer (`src/main.js`, `src/screens/*`, `src/blink/tracker.js`)
is intentionally not unit-tested, since it requires a real DOM and camera;
verify it with `npm run dev` and a manual pass through both flows.

## Build

```sh
npm run build
```

Outputs a static, production build to `dist/`. Preview it with:

```sh
npm run preview
```

## Project layout

```
assessment/
  src/
    blink/            on-device blink detector, state machine, BPM math, camera wrapper
    content/          reading passage, vision-check data, kids age-band content, intake form field schema
    screens/          one render function per screen (welcome, consent, intake, reading, vision, kids, results)
    scoring.js        combines blink stats + vision results
    report.js         builds/serializes the downloadable JSON report
    state.js          initial session state shape
    main.js           screen-to-screen flow control
  test/               node:test unit tests for every pure module above
```
