import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBpmSeries } from '../src/blink/bpm-series.js';

// buildBpmSeries turns accepted-blink timestamps (active-elapsed ms, scalar
// only — never frames/landmarks) into a rolling-rate sample series for the
// results chart. Deterministic and pure: no DOM, no clock reads.

test('buildBpmSeries: no active duration means no chart, not a fabricated empty line', () => {
  assert.deepEqual(buildBpmSeries([], 0), []);
  assert.deepEqual(buildBpmSeries([1, 2, 3], 0), []);
});

test('buildBpmSeries: a session shorter than one sample interval still yields exactly one honest sample at the session end', () => {
  const series = buildBpmSeries([500], 800, { sampleIntervalMs: 5000, windowCapMs: 60000 });
  assert.equal(series.length, 1);
  assert.equal(series[0].tMs, 800);
  // effectiveWindowMs(800, 60000) floors to 1000ms; 1 blink in that window -> 60 bpm.
  assert.equal(series[0].bpm, 60);
});

test('buildBpmSeries: zero blinks over a longer session is a flat, honest zero series, not an empty one', () => {
  const series = buildBpmSeries([], 12000, { sampleIntervalMs: 5000, windowCapMs: 60000 });
  assert.deepEqual(series.map((s) => s.tMs), [5000, 10000, 12000]);
  assert.ok(series.every((s) => s.bpm === 0));
});

test('buildBpmSeries: the final sample always lands exactly on activeDurationMs, even off-interval', () => {
  const series = buildBpmSeries([], 12345, { sampleIntervalMs: 5000, windowCapMs: 60000 });
  assert.equal(series[series.length - 1].tMs, 12345);
});

test('buildBpmSeries: counts only blinks within the trailing rolling window at each sample, rolling old ones off', () => {
  const series = buildBpmSeries([1000, 9000], 20000, { sampleIntervalMs: 5000, windowCapMs: 10000 });
  assert.deepEqual(series.map((s) => s.tMs), [5000, 10000, 15000, 20000]);
  assert.deepEqual(series.map((s) => s.bpm), [12, 12, 6, 0]);
});

test('buildBpmSeries: blink timestamps need not be pre-sorted', () => {
  const series = buildBpmSeries([9000, 1000], 20000, { sampleIntervalMs: 5000, windowCapMs: 10000 });
  assert.deepEqual(series.map((s) => s.bpm), [12, 12, 6, 0]);
});

test('buildBpmSeries: a blink exactly on a sample boundary counts for that sample, not the next one', () => {
  const series = buildBpmSeries([5000], 10000, { sampleIntervalMs: 5000, windowCapMs: 60000 });
  assert.equal(series[0].bpm > 0, true, 'the blink at t=5000 must count in the t=5000 sample');
});
