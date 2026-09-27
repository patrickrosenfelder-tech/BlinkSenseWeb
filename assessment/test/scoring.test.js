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

test('buildVisionResults: composes acuity, contrast, and color results deterministically', () => {
  const acuityFlags = ACUITY_LEVELS.map(() => true);
  const contrastFlags = CONTRAST_LEVELS.map(() => true);
  const colorAnswers = COLOR_PLATES.map((p) => p.correctIndex);

  const results = buildVisionResults({ acuityFlags, contrastFlags, colorAnswers });

  assert.deepEqual(results.acuity, scoreAcuity(acuityFlags));
  assert.deepEqual(results.contrast, scoreContrast(contrastFlags));
  assert.deepEqual(results.color, scoreColorPlates(colorAnswers));
});
