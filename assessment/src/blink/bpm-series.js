// Builds the rolling-rate sample series used to draw the results chart, from
// nothing but accepted-blink timestamps (active-elapsed ms — scalar timing
// data, never frames/landmarks) and the session's active duration. Pure and
// deterministic so the chart's underlying data can be unit tested without a
// browser.

import { computeLiveBpm, effectiveWindowMs } from './bpm-math.js';

const DEFAULT_SAMPLE_INTERVAL_MS = 5000;
const DEFAULT_WINDOW_CAP_MS = 60000;

/**
 * @param {number[]} blinkTimestampsMs - active-elapsed ms of each accepted blink.
 * @param {number} activeDurationMs - active (hidden-tab-excluded) session duration.
 * @param {{ sampleIntervalMs?: number, windowCapMs?: number }} [options]
 * @returns {{ tMs: number, bpm: number }[]} chart samples, empty when there is no
 *   active tracking time at all (no invented chart for an unusable session).
 */
export function buildBpmSeries(
  blinkTimestampsMs,
  activeDurationMs,
  { sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS, windowCapMs = DEFAULT_WINDOW_CAP_MS } = {},
) {
  if (activeDurationMs <= 0) return [];

  const sorted = [...blinkTimestampsMs].sort((a, b) => a - b);

  const sampleTimes = [];
  for (let t = sampleIntervalMs; t < activeDurationMs; t += sampleIntervalMs) sampleTimes.push(t);
  sampleTimes.push(activeDurationMs);

  return sampleTimes.map((tMs) => {
    const windowMs = effectiveWindowMs(tMs, windowCapMs);
    const windowStart = tMs - windowMs;
    const count = sorted.filter((ts) => ts > windowStart && ts <= tMs).length;
    return { tMs, bpm: computeLiveBpm(count, tMs, windowCapMs) };
  });
}
