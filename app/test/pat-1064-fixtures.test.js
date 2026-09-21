// PAT-1064 — fixture-first scalar traces from the observed 100-blink runs.
// These tests intentionally use only the exported scalar diagnostics: no
// camera frames, landmarks, or aggregate-count tuning.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BlinkStateMachine } from '../src/blink-state-machine.js';

const frame = (machine, timestampMs, ear, motion = 0, yawProxy = 0) =>
  machine.process({ timestampMs, ear, motion, yawProxy });

function warmup(machine, ear) {
  frame(machine, 0, ear);
  for (let timestampMs = 100; timestampMs <= 600; timestampMs += 100) {
    frame(machine, timestampMs, ear);
  }
}

function closeThenReopen(machine, closeAt, closedEar, reopenAt, reopenEar) {
  frame(machine, closeAt, closedEar);
  return frame(machine, reopenAt, reopenEar);
}

describe('PAT-1064 observed scalar reopen boundaries', () => {
  test('Mac 75/100: post-drift reopen at 0.227 clears adaptive threshold and counts', () => {
    const machine = new BlinkStateMachine();
    warmup(machine, 0.33091452809792055);
    machine.openBaseline = 0.2760;

    const adaptiveReopenThreshold = machine.openBaseline * 0.82;
    assert.equal(adaptiveReopenThreshold, 0.22632);
    const result = closeThenReopen(machine, 700, 0.12, 900, 0.227);

    assert.equal(result.decision, 'accepted_blink');
    assert.equal(machine.blinkCount, 1);
  });

  test('iPhone 32/100: reopen exactly above the closure exit boundary counts', () => {
    const machine = new BlinkStateMachine();
    warmup(machine, 0.30);

    // closeThreshold = 0.216; 0.216 is the diagnostic boundary and remains
    // closed (strict exit), while the observed 0.217 sample is genuine reopen.
    frame(machine, 700, 0.12);
    assert.equal(frame(machine, 800, 0.216).decision, 'closure_in_progress');
    const result = frame(machine, 900, 0.217);

    assert.equal(result.decision, 'accepted_blink');
    assert.equal(machine.blinkCount, 1);
  });

  test('Android 49/100: cadence-delayed reopen at expiry boundary counts', () => {
    const machine = new BlinkStateMachine();
    warmup(machine, 0.33);

    // 3 FPS cadence: 333ms samples, adaptive expiry is 2664ms. The first
    // reopen arrives just beyond it, at 2675ms, but is above closeThreshold.
    frame(machine, 700, 0.12);
    for (const timestampMs of [1033, 1366, 1699, 2032, 2365, 2698, 3031, 3364]) {
      frame(machine, timestampMs, 0.12);
    }
    const result = frame(machine, 3697, 0.245);

    assert.equal(result.decision, 'accepted_blink');
    assert.equal(machine.blinkCount, 1);
    assert.equal(machine.state, 'open');
  });

  test('expiry still rejects a sample below the close boundary', () => {
    const machine = new BlinkStateMachine();
    warmup(machine, 0.33);
    frame(machine, 700, 0.12);
    for (const timestampMs of [1033, 1366, 1699, 2032, 2365, 2698, 3031, 3364]) {
      frame(machine, timestampMs, 0.12);
    }

    const result = frame(machine, 3697, 0.23);
    assert.equal(result.decision, 'rejected_closure_expired');
    assert.equal(machine.blinkCount, 0);
  });
});
