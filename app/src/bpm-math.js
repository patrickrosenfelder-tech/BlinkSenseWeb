// Pure BPM math helpers, split out of main.js so the canonical average
// formula and hidden-tab exclusion accounting can be unit tested without a
// DOM/browser environment.
//
// "Active tracking time" = wall-clock elapsed time since the session started,
// minus any time the tab spent hidden (backgrounded). A hidden tab cannot
// register blinks, so counting that dead time as trackable time would
// deflate both the live and the session-average BPM.

/**
 * Total hidden-tab time to exclude, as of `now`.
 *
 * @param {number} accumulatedPauseMs - Sum of all *completed* hidden spans so far.
 * @param {number|null} hiddenSinceMs - performance.now() timestamp the tab went
 *   hidden at, if it is currently hidden; null if currently visible.
 * @param {number} now - current performance.now() timestamp.
 * @returns {number}
 */
export function activePausedMs(accumulatedPauseMs, hiddenSinceMs, now) {
  const ongoing = hiddenSinceMs !== null ? Math.max(now - hiddenSinceMs, 0) : 0;
  return accumulatedPauseMs + ongoing;
}

/**
 * Active (hidden-tab-excluded) duration since session start, as of `now`.
 *
 * @param {number} sessionStart - performance.now() timestamp the session started at.
 * @param {number} now - current performance.now() timestamp.
 * @param {number} accumulatedPauseMs - Sum of completed hidden spans.
 * @param {number|null} hiddenSinceMs - Start of an in-progress hidden span, or null.
 * @returns {number} Active milliseconds elapsed, never negative.
 */
export function computeActiveDurationMs(sessionStart, now, accumulatedPauseMs, hiddenSinceMs) {
  const wallElapsed = Math.max(now - sessionStart, 0);
  const paused = activePausedMs(accumulatedPauseMs, hiddenSinceMs, now);
  return Math.max(wallElapsed - paused, 0);
}

/**
 * Canonical session average: totalBlinks / activeTrackingSeconds * 60.
 *
 * @param {number} blinkCount - total blinks recorded during the session.
 * @param {number} activeDurationMs - active (hidden-tab-excluded) session duration.
 * @returns {number} average blinks per minute; 0 if there is no active time or no blinks.
 */
export function computeSessionAverageBpm(blinkCount, activeDurationMs) {
  if (blinkCount <= 0 || activeDurationMs <= 0) return 0;
  return blinkCount / (activeDurationMs / 60000);
}

/**
 * Live BPM: rate over the rolling last-`windowCapMs` window (default 60s),
 * ramping up using active elapsed time (not raw wall-clock time) for the
 * first window so an early hidden span doesn't deflate the reading.
 *
 * @param {number} blinksInWindow - count of blink timestamps within the trailing window.
 * @param {number} activeElapsedMs - active (hidden-tab-excluded) time elapsed since session start.
 * @param {number} windowCapMs - the rolling window size, e.g. 60000 for "last 60s".
 * @returns {number} live blinks-per-minute rate.
 */
export function computeLiveBpm(blinksInWindow, activeElapsedMs, windowCapMs) {
  const windowMs = Math.min(windowCapMs, Math.max(activeElapsedMs, 1000));
  return (blinksInWindow / windowMs) * 60000;
}
