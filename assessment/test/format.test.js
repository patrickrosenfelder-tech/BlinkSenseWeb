import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDurationLabel } from '../src/blink/format.js';

test('formatDurationLabel: sub-minute durations report seconds', () => {
  assert.equal(formatDurationLabel(800), '1 second');
  assert.equal(formatDurationLabel(45000), '45 seconds');
});

test('formatDurationLabel: minute-scale durations report minutes and leftover seconds', () => {
  assert.equal(formatDurationLabel(60000), '1 minute');
  assert.equal(formatDurationLabel(125000), '2 minutes 5 seconds');
});

test('formatDurationLabel: zero is reported honestly, not omitted or hidden', () => {
  assert.equal(formatDurationLabel(0), '0 seconds');
});
