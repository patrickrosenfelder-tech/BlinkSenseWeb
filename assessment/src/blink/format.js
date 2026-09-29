/**
 * Human-readable duration for session/chart stats. Reports seconds honestly
 * for short sessions instead of rounding up to "1 minute".
 *
 * @param {number} ms
 * @returns {string} e.g. "45 seconds", "1 minute", "2 minutes 5 seconds".
 */
export function formatDurationLabel(ms) {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return pluralize(totalSeconds, 'second');

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minutePart = pluralize(minutes, 'minute');
  return seconds > 0 ? `${minutePart} ${pluralize(seconds, 'second')}` : minutePart;
}

function pluralize(count, unit) {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
