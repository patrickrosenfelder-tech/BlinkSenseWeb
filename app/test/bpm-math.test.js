import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activePausedMs,
  computeActiveDurationMs,
  computeSessionAverageBpm,
  computeLiveBpm,
} from '../src/bpm-math.js';

// Fixed synthetic timestamps (ms), as if from performance.now().
const SESSION_START = 100_000;

test('activePausedMs: no hidden time at all', () => {
  assert.equal(activePausedMs(0, null, SESSION_START + 60_000), 0);
});

test('activePausedMs: sums a completed hidden span', () => {
  // Tab was hidden for 20s at some point, is visible now.
  assert.equal(activePausedMs(20_000, null, SESSION_START + 60_000), 20_000);
});

test('activePausedMs: adds an in-progress hidden span still ongoing at `now`', () => {
  const hiddenSinceMs = SESSION_START + 40_000;
  const now = SESSION_START + 55_000; // still hidden, 15s into this span
  assert.equal(activePausedMs(10_000, hiddenSinceMs, now), 10_000 + 15_000);
});

test('computeActiveDurationMs: no pauses == wall-clock duration', () => {
  const now = SESSION_START + 90_000;
  assert.equal(computeActiveDurationMs(SESSION_START, now, 0, null), 90_000);
});

test('computeActiveDurationMs: excludes a completed hidden span', () => {
  // Session ran 120s wall-clock, tab was hidden for a 30s stretch in the middle.
  const now = SESSION_START + 120_000;
  assert.equal(computeActiveDurationMs(SESSION_START, now, 30_000, null), 90_000);
});

test('computeActiveDurationMs: excludes an in-progress hidden span', () => {
  // Tab has been hidden since t=80s and is still hidden at t=100s (now).
  const now = SESSION_START + 100_000;
  const hiddenSinceMs = SESSION_START + 80_000;
  // Active time = 100s wall clock - 20s ongoing hidden = 80s.
  assert.equal(computeActiveDurationMs(SESSION_START, now, 0, hiddenSinceMs), 80_000);
});

test('computeActiveDurationMs: never goes negative', () => {
  const now = SESSION_START + 5_000;
  assert.equal(computeActiveDurationMs(SESSION_START, now, 999_999, null), 0);
});

test('computeSessionAverageBpm: canonical formula, no pauses', () => {
  // 30 blinks over a 5 minute (300,000ms) active session -> 6 bpm.
  assert.equal(computeSessionAverageBpm(30, 300_000), 6);
});

test('computeSessionAverageBpm: hidden-tab exclusion raises the reported average', () => {
  // 5 minute wall-clock session, but 2 of those minutes the tab was hidden
  // (no blinks possible). Active duration is 3 minutes.
  const wallDurationMs = 5 * 60_000;
  const hiddenMs = 2 * 60_000;
  const activeDurationMs = wallDurationMs - hiddenMs;
  const blinkCount = 18;

  const naiveAvg = computeSessionAverageBpm(blinkCount, wallDurationMs); // old, buggy denominator
  const correctedAvg = computeSessionAverageBpm(blinkCount, activeDurationMs); // canonical

  assert.equal(naiveAvg, 3.6);
  assert.equal(correctedAvg, 6);
  assert.ok(correctedAvg > naiveAvg, 'excluding hidden time must not deflate the average');
});

test('computeSessionAverageBpm: zero blinks -> 0', () => {
  assert.equal(computeSessionAverageBpm(0, 60_000), 0);
});

test('computeSessionAverageBpm: zero active duration -> 0 (avoids Infinity/NaN)', () => {
  assert.equal(computeSessionAverageBpm(5, 0), 0);
});

test('computeLiveBpm: ramp-up window uses active elapsed time, not raw wall clock', () => {
  // 10s into the session, 4 blinks in the trailing window, 60s window cap.
  // Ramp-up denominator should be the 10s elapsed, not the full 60s.
  const bpm = computeLiveBpm(4, 10_000, 60_000);
  assert.equal(bpm, (4 / 10_000) * 60_000);
  assert.equal(Math.round(bpm), 24);
});

test('computeLiveBpm: caps the window at windowCapMs once session is older than that', () => {
  // 5 minutes of active elapsed time, but window caps at 60s.
  const bpm = computeLiveBpm(6, 5 * 60_000, 60_000);
  assert.equal(bpm, (6 / 60_000) * 60_000);
  assert.equal(bpm, 6);
});

test('computeLiveBpm: hidden time excluded from ramp-up keeps rate from collapsing to 0', () => {
  // Session has been open 30s wall-clock, but 20s of that was a hidden tab.
  // Active elapsed is only 10s. With 2 blinks in that active window, the
  // ramp-up denominator must be the 10s active time, not 30s wall-clock.
  const activeElapsedMs = 10_000;
  const bpm = computeLiveBpm(2, activeElapsedMs, 60_000);
  assert.equal(Math.round(bpm), 12);
});

test('computeLiveBpm: floors the ramp-up window at 1000ms to avoid a huge early spike', () => {
  const bpm = computeLiveBpm(1, 50, 60_000);
  assert.equal(bpm, (1 / 1000) * 60000);
});
