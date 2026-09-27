import { computeSessionAverageBpm } from './blink/bpm-math.js';
import { scoreAcuity, scoreContrast, scoreColorPlates } from './content/vision.js';

export const BLINK_UNAVAILABLE_REASONS = Object.freeze({
  CAMERA_DENIED: 'camera-denied',
  NO_USABLE_FRAMES: 'no-usable-frames',
  NO_FACE_DETECTED: 'no-face-detected',
});

/**
 * Whether a session's blink tracking is usable, based on real tracking
 * health evidence rather than elapsed time alone: a session can run for
 * minutes with the camera denied, no frames ever decoded, or a face that
 * was never found, none of which should be reported as an average blink rate.
 *
 * @param {{ cameraDenied?: boolean, processedFrameCount?: number, faceDetectedFrameCount?: number }} health
 */
export function computeBlinkAvailability({
  cameraDenied = false,
  processedFrameCount = 0,
  faceDetectedFrameCount = 0,
} = {}) {
  if (cameraDenied) return { available: false, reason: BLINK_UNAVAILABLE_REASONS.CAMERA_DENIED };
  if (processedFrameCount <= 0) return { available: false, reason: BLINK_UNAVAILABLE_REASONS.NO_USABLE_FRAMES };
  if (faceDetectedFrameCount <= 0) return { available: false, reason: BLINK_UNAVAILABLE_REASONS.NO_FACE_DETECTED };
  return { available: true, reason: null };
}

/**
 * Canonical blink-rate summary for a session's combined results view.
 * `available` reflects real usable tracking (see computeBlinkAvailability),
 * not just that time elapsed; when unavailable, `reason` explains why and
 * the counts are reported as zero rather than a misleading average.
 *
 * @param {object} trackingHealth - see computeBlinkAvailability
 */
export function computeBlinkSummary(blinkCount, activeDurationMs, trackingHealth = {}) {
  const { available, reason } = computeBlinkAvailability(trackingHealth);
  return {
    available,
    reason,
    blinkCount: available ? blinkCount : 0,
    activeDurationMs: available ? activeDurationMs : 0,
    avgBpm: available ? computeSessionAverageBpm(blinkCount, activeDurationMs) : 0,
  };
}

/**
 * @param {{ acuityFlags: boolean[], contrastFlags: boolean[], colorAnswers: number[] }} input
 */
export function buildVisionResults({ acuityFlags, contrastFlags, colorAnswers }) {
  return {
    acuity: scoreAcuity(acuityFlags),
    contrast: scoreContrast(contrastFlags),
    color: scoreColorPlates(colorAnswers),
  };
}
