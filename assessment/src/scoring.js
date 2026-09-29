import { computeSessionAverageBpm } from './blink/bpm-math.js';
import { buildBpmSeries } from './blink/bpm-series.js';
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
 * the counts — including the chart `series` — are reported as zero/empty
 * rather than a misleading average or an invented chart.
 *
 * `series` is a rolling-rate sample series (see buildBpmSeries) for the
 * results chart; `peakBpm` and `finalRollingBpm` are safe aggregate scalars
 * derived from it — the highest rolling rate reached, and the rolling rate
 * at the end of the session (labelled separately from the session average).
 *
 * @param {object} trackingHealth - see computeBlinkAvailability
 * @param {number[]} [blinkTimestampsMs] - active-elapsed ms of each accepted blink.
 */
export function computeBlinkSummary(blinkCount, activeDurationMs, trackingHealth = {}, blinkTimestampsMs = []) {
  const { available, reason } = computeBlinkAvailability(trackingHealth);
  const series = available ? buildBpmSeries(blinkTimestampsMs, activeDurationMs) : [];
  const peakBpm = series.length > 0 ? Math.max(...series.map((s) => s.bpm)) : 0;
  const finalRollingBpm = series.length > 0 ? series[series.length - 1].bpm : 0;

  return {
    available,
    reason,
    blinkCount: available ? blinkCount : 0,
    activeDurationMs: available ? activeDurationMs : 0,
    avgBpm: available ? computeSessionAverageBpm(blinkCount, activeDurationMs) : 0,
    peakBpm,
    finalRollingBpm,
    series,
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
