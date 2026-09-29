import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLineChartGeometry, describeBlinkChart } from '../src/blink/chart-geometry.js';

// Pure coordinate-mapping + accessible-description logic for the results
// chart, split out from DOM/SVG construction so the actual rendering
// semantics are testable without a browser.

test('buildLineChartGeometry: null for an empty or missing series — no invented chart', () => {
  assert.equal(buildLineChartGeometry([]), null);
  assert.equal(buildLineChartGeometry(null), null);
  assert.equal(buildLineChartGeometry(undefined), null);
});

test('buildLineChartGeometry: a single sample renders as one point, not a line', () => {
  const geo = buildLineChartGeometry([{ tMs: 800, bpm: 60 }], { width: 100, height: 50, paddingX: 0, paddingY: 0 });
  assert.equal(geo.isSinglePoint, true);
  assert.equal(geo.points.length, 1);
  assert.equal(geo.points[0].x, 100);
  assert.equal(geo.points[0].y, 0);
});

test('buildLineChartGeometry: scales bpm to the 0..max range, higher bpm nearer the top (smaller y)', () => {
  const geo = buildLineChartGeometry(
    [{ tMs: 0, bpm: 0 }, { tMs: 10, bpm: 10 }, { tMs: 20, bpm: 20 }],
    { width: 100, height: 50, paddingX: 0, paddingY: 0 },
  );
  assert.equal(geo.points[0].y, 50);
  assert.equal(geo.points[2].y, 0);
  assert.ok(geo.points[1].y < geo.points[0].y && geo.points[1].y > geo.points[2].y);
});

test('buildLineChartGeometry: an all-zero series draws a flat baseline line, not a divide-by-zero crash', () => {
  const geo = buildLineChartGeometry(
    [{ tMs: 0, bpm: 0 }, { tMs: 10, bpm: 0 }],
    { width: 100, height: 50, paddingX: 0, paddingY: 0 },
  );
  assert.ok(geo.points.every((p) => p.y === 50));
  assert.ok(Number.isFinite(geo.points[0].y) && Number.isFinite(geo.points[1].y));
});

test('buildLineChartGeometry: x-coordinates place samples proportionally to elapsed time, spanning the full width', () => {
  const geo = buildLineChartGeometry(
    [{ tMs: 0, bpm: 1 }, { tMs: 25, bpm: 1 }, { tMs: 100, bpm: 1 }],
    { width: 100, height: 50, paddingX: 0, paddingY: 0 },
  );
  assert.deepEqual(geo.points.map((p) => p.x), [0, 25, 100]);
});

test('buildLineChartGeometry: pointsAttr is a space-separated "x,y" list matching the point count', () => {
  const geo = buildLineChartGeometry([{ tMs: 0, bpm: 5 }, { tMs: 10, bpm: 5 }]);
  assert.equal(geo.pointsAttr.split(' ').length, 2);
  assert.match(geo.pointsAttr, /^[\d.]+,[\d.]+ [\d.]+,[\d.]+$/);
});

test('buildLineChartGeometry: respects custom width/height in the returned geometry', () => {
  const geo = buildLineChartGeometry([{ tMs: 0, bpm: 5 }, { tMs: 10, bpm: 5 }], { width: 640, height: 200 });
  assert.equal(geo.width, 640);
  assert.equal(geo.height, 200);
});

test('describeBlinkChart: empty series describes the lack of data honestly, without inventing numbers', () => {
  const text = describeBlinkChart({ series: [], sessionAverageBpm: 0, peakBpm: 0, activeDurationMs: 800 });
  assert.match(text, /not enough/i);
  assert.doesNotMatch(text, /\d/);
});

test('describeBlinkChart: summarizes average and peak for a real series', () => {
  const text = describeBlinkChart({
    series: [{ tMs: 5000, bpm: 10 }, { tMs: 60000, bpm: 14 }],
    sessionAverageBpm: 11.6,
    peakBpm: 14,
    activeDurationMs: 60000,
  });
  assert.match(text, /12/);
  assert.match(text, /14/);
  assert.match(text, /minute/i);
});

test('describeBlinkChart: a sub-minute session reports seconds, not a rounded-up minute (honest short-session wording)', () => {
  const text = describeBlinkChart({
    series: [{ tMs: 800, bpm: 60 }],
    sessionAverageBpm: 60,
    peakBpm: 60,
    activeDurationMs: 800,
  });
  assert.match(text, /over 1 second of tracking/);
  assert.doesNotMatch(text, /over 1 minute/i);
});
