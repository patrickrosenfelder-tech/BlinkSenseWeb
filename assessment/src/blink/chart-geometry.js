// Pure coordinate-mapping + accessible-description logic for the blink-rate
// chart, kept separate from DOM/SVG construction so the actual rendering
// semantics (scaling, single-point handling, zero-division safety) are
// testable without a browser.

import { formatDurationLabel } from './format.js';

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 140;
const DEFAULT_PADDING_X = 8;
const DEFAULT_PADDING_Y = 12;

/**
 * @param {{ tMs: number, bpm: number }[]} series
 * @param {{ width?: number, height?: number, paddingX?: number, paddingY?: number }} [options]
 * @returns {null | { width: number, height: number, paddingX: number, paddingY: number, points: {x:number,y:number,tMs:number,bpm:number}[], isSinglePoint: boolean, maxBpm: number, maxT: number, pointsAttr: string }}
 */
export function buildLineChartGeometry(
  series,
  { width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, paddingX = DEFAULT_PADDING_X, paddingY = DEFAULT_PADDING_Y } = {},
) {
  if (!series || series.length === 0) return null;

  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const maxT = Math.max(...series.map((p) => p.tMs)) || 1;
  const maxBpmRaw = Math.max(...series.map((p) => p.bpm));
  const maxBpm = maxBpmRaw > 0 ? maxBpmRaw : 1; // avoid divide-by-zero for an all-zero (real, not invented) series

  const points = series.map((p) => ({
    x: paddingX + (p.tMs / maxT) * innerWidth,
    y: paddingY + innerHeight - (p.bpm / maxBpm) * innerHeight,
    tMs: p.tMs,
    bpm: p.bpm,
  }));

  return {
    width,
    height,
    paddingX,
    paddingY,
    points,
    isSinglePoint: points.length === 1,
    maxBpm: maxBpmRaw,
    maxT,
    pointsAttr: points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(' '),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Accessible text summary of the chart, used for both the SVG's aria-label
 * and its <desc>. Never invents numbers for a session with no usable data.
 *
 * @param {{ series: {tMs:number,bpm:number}[], sessionAverageBpm: number, peakBpm: number, activeDurationMs: number }} stats
 * @returns {string}
 */
export function describeBlinkChart({ series, sessionAverageBpm, peakBpm, activeDurationMs }) {
  if (!series || series.length === 0) {
    return 'Not enough tracking time to draw a blink-rate chart.';
  }
  const durationLabel = formatDurationLabel(activeDurationMs);
  return `Blink rate over ${durationLabel} of tracking. Session average ${Math.round(sessionAverageBpm)} blinks per minute, peaking at ${Math.round(peakBpm)} blinks per minute.`;
}
