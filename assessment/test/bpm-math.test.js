import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activePausedMs,
  computeActiveDurationMs,
  computeSessionAverageBpm,
  computeLiveBpm,
  effectiveWindowMs,
} from '../src/blink/bpm-math.js';

// Fixed synthetic timestamps (ms), as if from performance.now().
const SESSION_START = 100_000;

test('activePausedMs: no hidden time at all', () => {
  assert.equal(activePausedMs(0, null, SESSION_START + 60_000), 0);
});

test('activePausedMs: sums a completed hidden span', () => {
  assert.equal(activePausedMs(20_000, null, SESSION_START + 60_000), 20_000);
});

test('activePausedMs: adds an in-progress hidden span still ongoing at `now`', () => {
  const hiddenSinceMs = SESSION_START + 40_000;
  const now = SESSION_START + 55_000;
  assert.equal(activePausedMs(10_000, hiddenSinceMs, now), 10_000 + 15_000);
});

test('computeActiveDurationMs: no pauses == wall-clock duration', () => {
  const now = SESSION_START + 90_000;
  assert.equal(computeActiveDurationMs(SESSION_START, now, 0, null), 90_000);
});

test('computeActiveDurationMs: excludes a completed hidden span', () => {
  const now = SESSION_START + 120_000;
  assert.equal(computeActiveDurationMs(SESSION_START, now, 30_000, null), 90_000);
});

test('computeActiveDurationMs: never goes negative', () => {
  const now = SESSION_START + 5_000;
  assert.equal(computeActiveDurationMs(SESSION_START, now, 999_999, null), 0);
});

test('computeSessionAverageBpm: canonical formula', () => {
  assert.equal(computeSessionAverageBpm(30, 300_000), 6);
});

test('computeSessionAverageBpm: zero blinks -> 0', () => {
  assert.equal(computeSessionAverageBpm(0, 60_000), 0);
});

test('computeSessionAverageBpm: zero active duration -> 0 (avoids Infinity/NaN)', () => {
  assert.equal(computeSessionAverageBpm(5, 0), 0);
});

test('computeLiveBpm: ramp-up window uses active elapsed time', () => {
  const bpm = computeLiveBpm(4, 10_000, 60_000);
  assert.equal(Math.round(bpm), 24);
});

test('computeLiveBpm: caps the window at windowCapMs', () => {
  const bpm = computeLiveBpm(6, 5 * 60_000, 60_000);
  assert.equal(bpm, 6);
});

test('effectiveWindowMs: ramps up to a 1s floor before the floor is reached', () => {
  assert.equal(effectiveWindowMs(500, 60_000), 1000);
});

test('effectiveWindowMs: tracks elapsed time between the floor and the cap', () => {
  assert.equal(effectiveWindowMs(30_000, 60_000), 30_000);
});

test('effectiveWindowMs: caps at windowCapMs once elapsed time exceeds it', () => {
  assert.equal(effectiveWindowMs(90_000, 60_000), 60_000);
});
