import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBlinkAvailability, computeBlinkSummary, buildVisionResults } from '../src/scoring.js';
import { scoreAcuity, scoreContrast, scoreColorPlates, ACUITY_LEVELS, CONTRAST_LEVELS, COLOR_PLATES } from '../src/content/vision.js';

test('computeBlinkAvailability: available when frames were processed and a face was detected', () => {
  const result = computeBlinkAvailability({ cameraDenied: false, processedFrameCount: 900, faceDetectedFrameCount: 850 });
  assert.equal(result.available, true);
  assert.equal(result.reason, null);
});

test('computeBlinkAvailability: unavailable with reason "camera-denied" when the camera was never enabled', () => {
  const result = computeBlinkAvailability({ cameraDenied: true, processedFrameCount: 0, faceDetectedFrameCount: 0 });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'camera-denied');
});

test('computeBlinkAvailability: unavailable with reason "no-usable-frames" when no frames were ever processed', () => {
  const result = computeBlinkAvailability({ cameraDenied: false, processedFrameCount: 0, faceDetectedFrameCount: 0 });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'no-usable-frames');
});

test('computeBlinkAvailability: unavailable with reason "no-face-detected" when frames ran but no face was ever found', () => {
  const result = computeBlinkAvailability({ cameraDenied: false, processedFrameCount: 500, faceDetectedFrameCount: 0 });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'no-face-detected');
});

test('computeBlinkAvailability: elapsed time alone does not imply availability', () => {
  // A long session with frames decoded but the face never actually found
  // (e.g. camera pointed away) must not read as available just because time passed.
  const result = computeBlinkAvailability({ cameraDenied: false, processedFrameCount: 5000, faceDetectedFrameCount: 0 });
  assert.equal(result.available, false);
});

test('computeBlinkSummary: computes canonical average bpm from count + active duration when tracking was healthy', () => {
  // 12 blinks over 2 active minutes -> 6 bpm
  const summary = computeBlinkSummary(12, 120_000, { cameraDenied: false, processedFrameCount: 3600, faceDetectedFrameCount: 3500 });
  assert.equal(summary.available, true);
  assert.equal(summary.reason, null);
  assert.equal(summary.blinkCount, 12);
  assert.equal(summary.activeDurationMs, 120_000);
  assert.equal(summary.avgBpm, 6);
});

test('computeBlinkSummary: unavailable (camera denied) reports zeroed, flagged summary with reason', () => {
  const summary = computeBlinkSummary(0, 0, { cameraDenied: true, processedFrameCount: 0, faceDetectedFrameCount: 0 });
  assert.equal(summary.available, false);
  assert.equal(summary.reason, 'camera-denied');
  assert.equal(summary.blinkCount, 0);
  assert.equal(summary.avgBpm, 0);
});

test('computeBlinkSummary: unavailable (no usable frames) even with nonzero elapsed time', () => {
  const summary = computeBlinkSummary(0, 45_000, { cameraDenied: false, processedFrameCount: 0, faceDetectedFrameCount: 0 });
  assert.equal(summary.available, false);
  assert.equal(summary.reason, 'no-usable-frames');
  assert.equal(summary.activeDurationMs, 0);
});

test('computeBlinkSummary: unavailable (no face detected) even with processed frames and elapsed time', () => {
  const summary = computeBlinkSummary(0, 30_000, { cameraDenied: false, processedFrameCount: 900, faceDetectedFrameCount: 0 });
  assert.equal(summary.available, false);
  assert.equal(summary.reason, 'no-face-detected');
});

test('computeBlinkSummary: a healthy session includes a chart series, peak rate, and a final rolling rate distinct from the session average', () => {
  const blinkTimestampsMs = [10_000, 20_000, 70_000];
  const summary = computeBlinkSummary(
    3,
    120_000,
    { cameraDenied: false, processedFrameCount: 3600, faceDetectedFrameCount: 3500 },
    blinkTimestampsMs,
  );
  assert.equal(summary.available, true);
  assert.ok(Array.isArray(summary.series));
  assert.ok(summary.series.length > 0);
  assert.equal(summary.series[summary.series.length - 1].tMs, 120_000);
  assert.ok(summary.peakBpm >= 0);
  assert.equal(summary.finalRollingBpm, summary.series[summary.series.length - 1].bpm);
});

test('computeBlinkSummary: unavailable sessions report an empty series and zeroed peak/final rate, never an invented chart', () => {
  const summary = computeBlinkSummary(
    0,
    45_000,
    { cameraDenied: false, processedFrameCount: 0, faceDetectedFrameCount: 0 },
    [1000, 2000],
  );
  assert.equal(summary.available, false);
  assert.deepEqual(summary.series, []);
  assert.equal(summary.peakBpm, 0);
  assert.equal(summary.finalRollingBpm, 0);
});

test('computeBlinkSummary: a zero-blink but healthy short session yields a flat, honest series rather than an empty one', () => {
  const summary = computeBlinkSummary(0, 3000, { cameraDenied: false, processedFrameCount: 90, faceDetectedFrameCount: 90 }, []);
  assert.equal(summary.available, true);
  assert.equal(summary.series.length, 1);
  assert.equal(summary.series[0].bpm, 0);
  assert.equal(summary.peakBpm, 0);
  assert.equal(summary.avgBpm, 0);
});

test('computeBlinkSummary: blinkTimestampsMs defaults to empty so existing 3-arg callers keep working', () => {
  const summary = computeBlinkSummary(0, 3000, { cameraDenied: false, processedFrameCount: 100, faceDetectedFrameCount: 100 });
  assert.deepEqual(summary.series, [{ tMs: 3000, bpm: 0 }]);
});

test('buildVisionResults: composes acuity, contrast, and color results deterministically', () => {
  const acuityFlags = ACUITY_LEVELS.map(() => true);
  const contrastFlags = CONTRAST_LEVELS.map(() => true);
  const colorAnswers = COLOR_PLATES.map((p) => p.correctIndex);

  const results = buildVisionResults({ acuityFlags, contrastFlags, colorAnswers });

  assert.deepEqual(results.acuity, scoreAcuity(acuityFlags));
  assert.deepEqual(results.contrast, scoreContrast(contrastFlags));
  assert.deepEqual(results.color, scoreColorPlates(colorAnswers));
});
