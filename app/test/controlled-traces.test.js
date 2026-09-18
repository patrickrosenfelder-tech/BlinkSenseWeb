// PAT-925 controlled-traces regression tests — 2026-09-17 3-device ground truth.
// These encode OBSERVED failures from Mac, iPhone, and Android controlled runs.
// Strict TDD: all tests must be RED against the current production code.
// No production code is modified. No commits, pushes, or deploys.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BlinkStateMachine } from '../src/blink-state-machine.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function frame(machine, timestampMs, ear, yawProxy = 0, motion = 0) {
  return machine.process({ timestampMs, ear, yawProxy, motion });
}

/** Warmup a machine at a specific open-eye baseline. */
function warmup(machine, openEar, startMs = 0) {
  frame(machine, startMs, openEar);  // initializes baseline + warmupUntil
  // Feed a few frames to complete the 500ms warmup window.
  for (let t = startMs + 100; t <= startMs + 500; t += 100) {
    frame(machine, t, openEar);
  }
  // One frame past warmup to exit the warmup window.
  frame(machine, startMs + 600, openEar);
  return startMs + 600;
}

/**
 * Execute a close/reopen blink cycle at the given FPS cadence.
 * Returns the result of the reopen frame.
 */
function blinkCycle(machine, closeAtMs, closedEar, reopenEar, closureDurationMs, fps) {
  const interval = Math.round(1000 / fps);
  // Close
  let r = frame(machine, closeAtMs, closedEar);
  // Feed closed-eye frames for the closure duration
  for (let t = closeAtMs + interval; t < closeAtMs + closureDurationMs; t += interval) {
    frame(machine, t, closedEar);
  }
  // Reopen
  r = frame(machine, closeAtMs + closureDurationMs, reopenEar);
  return r;
}

// ─── 1. RAPID DOUBLE BLINKS MUST COUNT AS 2 ──────────────────────────────────
// Ground truth: Mac 16/20, iPhone 13/20, Android 5/20.
// Android trace: partial_reopen rejections at EAR 0.240-0.250 vs reopenThreshold
// ~0.238-0.248. The second reopen EAR falls in the hysteresis dead zone
// [closeThreshold, reopenThreshold) so the machine stays closed → expires.

describe('1. Rapid double blinks must count as 2', () => {
  // Standard double: both reopens reach full open EAR (baseline case).
  for (const fps of [15, 20, 30, 60]) {
    test(`double blink with full reopens at ${fps} FPS counts 2`, () => {
      const OPEN = 0.30;
      const CLOSED = 0.12;
      const machine = new BlinkStateMachine();
      const t0 = warmup(machine, OPEN);

      // Blink 1: 120ms closure, reopen to full OPEN.
      const close1 = t0 + 200;
      blinkCycle(machine, close1, CLOSED, OPEN, 120, fps);
      assert.equal(machine.blinkCount, 1, 'Blink 1 must count');

      // Blink 2: starts 200ms after blink 1 close (close-to-close = 200ms > REFRACTORY_MS=180ms).
      // Inter-blink gap between reopen and next close = 200 - 120 = 80ms (very tight).
      const close2 = close1 + 200;
      blinkCycle(machine, close2, CLOSED, OPEN, 120, fps);
      assert.equal(machine.blinkCount, 2,
        `Both rapid double blinks must count as 2 at ${fps} FPS`);
    });
  }

  // Android-style fixture: initialBaseline=0.33, second reopen EAR=0.245.
  // EAR=0.245 is ABOVE closeThreshold (0.72*0.33=0.2376) but BELOW reopenThreshold
  // (0.82*0.33=0.2706). The machine stays closed → expires. This is the hysteresis
  // dead-zone problem observed on Android.
  for (const fps of [15, 30]) {
    test(`Android dead-zone double: second reopen EAR=0.245 at baseline 0.33, ${fps} FPS, must still count 2`, () => {
      const OPEN = 0.33;
      const CLOSED = 0.12;
      const machine = new BlinkStateMachine();
      const t0 = warmup(machine, OPEN);

      // Blink 1: normal full reopen.
      const close1 = t0 + 200;
      blinkCycle(machine, close1, CLOSED, OPEN, 120, fps);
      assert.equal(machine.blinkCount, 1, 'Blink 1 must count');

      // Blink 2: close again, but reopen only to 0.245 (in the dead zone).
      // closeThreshold=0.2376, reopenThreshold=0.2706.
      // 0.245 is NOT >= reopenThreshold, so isOpen=false. Machine stays closed.
      const close2 = close1 + 300;
      const interval = Math.round(1000 / fps);

      frame(machine, close2, CLOSED); // closure_started
      for (let t = close2 + interval; t < close2 + 120; t += interval) {
        frame(machine, t, CLOSED);
      }
      // Attempt reopen at 0.245 — current code stays closed (dead zone).
      const r1 = frame(machine, close2 + 120, 0.245);
      // Feed more frames at 0.245 to simulate the eye partially open.
      for (let t = close2 + 120 + interval; t < close2 + 400; t += interval) {
        frame(machine, t, 0.245);
      }
      // Eventually the eye fully opens.
      const rFull = frame(machine, close2 + 400, OPEN);

      // The second blink MUST count. Current code: the machine stays closed at 0.245
      // because it's below reopenThreshold. When it finally sees OPEN at +400ms,
      // the closure duration is 400ms which exceeds MIN_CLOSURE_MS=80ms, so it should
      // count... unless the adaptive expiry fires first (effectiveMax at 30fps = 600ms,
      // 400ms < 600ms so expiry doesn't fire). The full reopen at OPEN=0.33 passes
      // both reopenThreshold and MIN_REOPEN_RATIO floor.
      // BUT: the user's intent is that the SECOND BLINK counted with the partial reopen
      // and the full reopen is a separate third event. The blink detector should have
      // recognized a reopen at 0.245 and counted blink 2, then the full open at 0.33
      // is just "still open."
      //
      // With current code: blinkCount will be 2 (one long 400ms closure counts), but
      // the user experienced it as a rapid double where the second was delayed/merged
      // into one long closure. The semantic failure is: the machine should have accepted
      // the partial reopen at 0.245 as a valid reopen (it IS above closeThreshold),
      // counted blink 2, and immediately been ready for a third blink.
      //
      // Assert: machine must have counted exactly 2 AND the second blink's reopen
      // must have been detected when EAR first hit 0.245, not delayed until 0.33.
      assert.equal(machine.blinkCount, 2,
        `Android dead-zone double at ${fps} FPS must count 2 blinks`);

      // The critical assertion: the second blink's accepted event must have a reopen
      // EAR near 0.245 (the partial reopen), NOT 0.33 (the delayed full open).
      // If the machine waited until 0.33, the closure duration would be ~400ms instead
      // of ~120ms — proving the dead zone delayed detection.
      const diag = machine.getDiagnostics();
      const accepted = diag.acceptedEvents;
      assert.equal(accepted.length, 2, 'Must have exactly 2 accepted events');
      assert.ok(accepted[1].ear <= 0.26,
        `Second blink reopen EAR must be near 0.245 (actual: ${accepted[1].ear}), not delayed to 0.33`);
    });
  }

  // Rapid double where second reopen lands BETWEEN closeThreshold and reopenThreshold
  // for >250ms, then full reopen follows. Assert the machine recovers and second blink counts.
  test('double blink with 250ms dead-zone hover then full reopen still counts 2', () => {
    const OPEN = 0.30;
    const CLOSED = 0.12;
    const machine = new BlinkStateMachine();
    const t0 = warmup(machine, OPEN);

    // Blink 1
    blinkCycle(machine, t0 + 200, CLOSED, OPEN, 120, 30);
    assert.equal(machine.blinkCount, 1);

    // Blink 2: close, then reopen to dead zone (0.22), hover 250ms, then full open.
    // closeThreshold = 0.72*0.30 = 0.216
    // reopenThreshold = 0.82*0.30 = 0.246
    // 0.22 is above closeThreshold(0.216) but below reopenThreshold(0.246) = dead zone.
    const close2 = t0 + 200 + 300;
    frame(machine, close2, CLOSED);
    frame(machine, close2 + 100, CLOSED); // 100ms closed
    // Partial reopen: 0.22 — in dead zone.
    for (let t = close2 + 120; t < close2 + 370; t += 33) {
      frame(machine, t, 0.22);
    }
    // Full reopen
    frame(machine, close2 + 370, OPEN);

    // Current code: machine stays closed during 0.22 hover (dead zone), then opens at 0.30.
    // Closure duration = 370ms. This counts as 1 blink, but with wrong timing.
    // The test asserts that the machine counted 2 total (both blinks).
    assert.equal(machine.blinkCount, 2,
      'Second blink with dead-zone hover must count; total must be 2');
  });
});

// ─── 2. OPEN-EYE HEAD SHAKE MUST COUNT 0 ─────────────────────────────────────
// Ground truth: Mac 2 false, iPhone 1 false, Android 1 false per 20s shake.
// High motion with open-eye EAR must never produce a blink.

describe('2. Open-eye head shake must count 0', () => {
  test('20s high-velocity shake trace with EAR pinned open counts 0', () => {
    const OPEN = 0.30;
    const machine = new BlinkStateMachine();
    warmup(machine, OPEN);

    // Simulate 20 seconds of head shaking at 30 FPS.
    // Motion oscillates between 0.001-0.005, yawProxy oscillates 0.1-0.3.
    // EAR stays pinned above closeThreshold (0.216).
    for (let t = 700; t <= 20700; t += 33) {
      const phase = (t / 200) % (2 * Math.PI);
      const yaw = 0.15 + 0.15 * Math.sin(phase);
      const motion = 0.002 + 0.002 * Math.sin(phase * 3);
      // EAR fluctuates slightly around OPEN but never drops to closeThreshold.
      const ear = OPEN - 0.02 * Math.abs(Math.sin(phase * 2));
      frame(machine, t, ear, yaw, motion);
    }
    assert.equal(machine.blinkCount, 0,
      'High-velocity head shake with open eyes must count 0 blinks');
  });

  test('EAR that briefly dips near closeThreshold during high motion does NOT trigger closure', () => {
    const OPEN = 0.30;
    const machine = new BlinkStateMachine();
    warmup(machine, OPEN);

    // EAR dips to 0.22 (just above closeThreshold=0.216) during high motion.
    // The closure entry gate must block this.
    for (let t = 700; t <= 3000; t += 33) {
      const phase = (t / 150) % (2 * Math.PI);
      const yaw = 0.20 + 0.10 * Math.sin(phase);
      const motion = 0.003;
      // EAR dips to 0.22 at troughs — NOT below closeThreshold but very close.
      const ear = 0.26 - 0.04 * Math.abs(Math.sin(phase));
      frame(machine, t, ear, yaw, motion);
    }
    assert.equal(machine.blinkCount, 0,
      'EAR dips near threshold during motion must not count');
  });

  // PAT-925 contract: closure started while stable must complete even if motion follows.
  test('genuine blink started stable completes through subsequent motion spike', () => {
    const OPEN = 0.30;
    const CLOSED = 0.12;
    const machine = new BlinkStateMachine();
    warmup(machine, OPEN);

    // Close while stable.
    frame(machine, 700, CLOSED, 0, 0);
    // Motion spike during closure body.
    frame(machine, 730, CLOSED, 0.3, 0.01);
    frame(machine, 760, CLOSED, 0.3, 0.01);
    // Reopen while still in motion — must count.
    const r = frame(machine, 850, OPEN, 0.3, 0.01);
    assert.equal(r.decision, 'accepted_blink',
      'Closure started stable must complete through motion spike');
    assert.equal(machine.blinkCount, 1);
  });
});

// ─── 3. GENUINE BLINK DURING SLOW HEAD MOVEMENT = 1 ──────────────────────────

describe('3. Genuine blink during slow head movement counts 1', () => {
  test('normal close/reopen with low motion counts exactly 1', () => {
    const OPEN = 0.30;
    const CLOSED = 0.12;
    const machine = new BlinkStateMachine();
    warmup(machine, OPEN);

    // Slow head movement: motion < 0.0001, yaw < 0.05.
    let r = machine.process({ timestampMs: 700, ear: CLOSED, yawProxy: 0.03, motion: 0.00005 });
    assert.equal(r.decision, 'closure_started');
    r = machine.process({ timestampMs: 850, ear: OPEN, yawProxy: 0.03, motion: 0.00005 });
    assert.equal(r.decision, 'accepted_blink');
    assert.equal(machine.blinkCount, 1);
  });

  test('blink with moderate yaw=0.08 and low motion counts 1', () => {
    const OPEN = 0.30;
    const CLOSED = 0.12;
    const machine = new BlinkStateMachine();
    warmup(machine, OPEN);

    let r = machine.process({ timestampMs: 700, ear: CLOSED, yawProxy: 0.08, motion: 0.0003 });
    assert.equal(r.decision, 'closure_started',
      'Moderate yaw below closure-entry gate must allow closure');
    r = machine.process({ timestampMs: 850, ear: OPEN, yawProxy: 0.08, motion: 0.0003 });
    assert.equal(r.decision, 'accepted_blink');
    assert.equal(machine.blinkCount, 1);
  });
});

// ─── 4. PARTIAL-REOPEN RECOVERY ──────────────────────────────────────────────
// After a closure whose reopen EAR stays below reopenThreshold for >250ms,
// the machine must not permanently stick closed; assert it returns to open
// and accepts the next full closure.

describe('4. Partial-reopen recovery', () => {
  test('closure with EAR hovering in dead zone for 300ms recovers to open and next blink counts', () => {
    const OPEN = 0.30;
    const CLOSED = 0.12;
    const machine = new BlinkStateMachine();
    warmup(machine, OPEN);

    // Close
    frame(machine, 700, CLOSED);
    // EAR hovers at 0.23 — above closeThreshold(0.216) but below reopenThreshold(0.246).
    // Machine stays closed. This simulates a partial reopen that never clears the hysteresis.
    for (let t = 800; t <= 1100; t += 33) {
      frame(machine, t, 0.23);
    }
    // Either the machine expires or sees the full open. Feed full open to recover.
    frame(machine, 1200, OPEN);

    // Machine must be in 'open' state now.
    assert.equal(machine.state, 'open',
      'Machine must recover to open after dead-zone hover');

    // A fresh blink must be accepted.
    frame(machine, 1500, CLOSED);
    const r = frame(machine, 1650, OPEN);
    assert.equal(r.decision, 'accepted_blink',
      'Next blink after dead-zone recovery must count');
  });

  test('machine does NOT permanently stick closed when EAR is between thresholds', () => {
    const OPEN = 0.33;
    const CLOSED = 0.12;
    const machine = new BlinkStateMachine();
    warmup(machine, OPEN);

    // Close at t=700.
    frame(machine, 700, CLOSED);
    // EAR hovers at 0.26 for 2 seconds — in dead zone (close=0.2376, reopen=0.2706).
    for (let t = 800; t <= 2800; t += 33) {
      const r = frame(machine, t, 0.26);
      if (r.decision === 'accepted_blink' || r.decision === 'rejected_closure_expired') break;
    }

    // Machine MUST be open — via direct reopen above closeThreshold.
    assert.equal(machine.state, 'open',
      'Machine must not permanently stick closed');
    assert.equal(machine.blinkCount, 1,
      'Closure with reopen in dead zone must count as a blink');
  });
});

// ─── 5. STALE-CLOSURE EXPIRY THEN DOUBLE ─────────────────────────────────────
// Mac 38.6s trace: closure_expired during the double-blink phase.
// Assert: closure that exceeds adaptive expiry while EAR hovers near threshold
// expires cleanly WITHOUT counting, then a following full double counts 2.

describe('5. Stale-closure expiry then full double counts 2', () => {
  test('closure expired at threshold hover, then clean double counts 2', () => {
    const OPEN = 0.30;
    const CLOSED = 0.12;
    const machine = new BlinkStateMachine();
    warmup(machine, OPEN);

    // Close and stay closed until expiry.
    frame(machine, 700, CLOSED);
    let expired = false;
    let expiryTs = null;
    for (let t = 733; t <= 2000; t += 33) {
      const r = frame(machine, t, CLOSED);
      if (r.decision === 'rejected_closure_expired') {
        expired = true;
        expiryTs = t;
        break;
      }
    }
    assert.ok(expired, 'Stale closure must expire');
    assert.equal(machine.state, 'open', 'State must be open after expiry');
    assert.equal(machine.blinkCount, 0, 'Expired closure must not count');

    // Feed a few open frames to settle.
    frame(machine, expiryTs + 50, OPEN);
    frame(machine, expiryTs + 100, OPEN);

    // Now a proper rapid double blink.
    const double1 = expiryTs + 300;
    blinkCycle(machine, double1, CLOSED, OPEN, 120, 30);
    assert.equal(machine.blinkCount, 1, 'First blink of double after expiry must count');

    const double2 = double1 + 250;
    blinkCycle(machine, double2, CLOSED, OPEN, 120, 30);
    assert.equal(machine.blinkCount, 2,
      'Both blinks of double after expiry must count (total 2)');
  });

  test('closure with EAR hovering at 0.20 (just below closeThreshold) expires without counting', () => {
    const OPEN = 0.30;
    const machine = new BlinkStateMachine();
    warmup(machine, OPEN);

    // Close
    frame(machine, 700, 0.15); // below closeThreshold(0.216)
    // Hover at 0.20 — still below closeThreshold, so state stays closed.
    let expired = false;
    for (let t = 733; t <= 2000; t += 33) {
      const r = frame(machine, t, 0.20);
      if (r.decision === 'rejected_closure_expired') {
        expired = true;
        break;
      }
    }
    assert.ok(expired, 'Hover at 0.20 (below closeThreshold) must eventually expire');
    assert.equal(machine.blinkCount, 0, 'Expired hover must not count');
  });
});

// ─── 6. ANDROID DEAD-ZONE STUCK-CLOSED REGRESSION ────────────────────────────
// The key RED test: with Android-style high baseline (0.33), the hysteresis band
// [closeThreshold=0.2376, reopenThreshold=0.2706] is 33ms wide. A rapid double
// blink where the second reopen reaches only 0.245 (above close, below reopen)
// leaves the machine stuck closed. The machine MUST detect the partial reopen
// and count the second blink.
//
// Current code: 0.245 < reopenThreshold(0.2706) → isOpen=false → stays closed
// → eventually expires as closure_expired. Second blink is LOST.
//
// This test MUST be RED.

describe('6. Android dead-zone stuck-closed regression (RED)', () => {
  test('rapid double with second reopen at 0.245 (baseline 0.33): machine must detect partial reopen', () => {
    const OPEN = 0.33;
    const CLOSED = 0.12;
    const machine = new BlinkStateMachine();
    const t0 = warmup(machine, OPEN);

    // Blink 1: normal.
    blinkCycle(machine, t0 + 200, CLOSED, OPEN, 120, 30);
    assert.equal(machine.blinkCount, 1, 'First blink must count');

    // Blink 2: close, then reopen to 0.245 only.
    const c2 = t0 + 200 + 300; // 300ms after blink 1 close start
    frame(machine, c2, CLOSED);
    frame(machine, c2 + 33, CLOSED);
    frame(machine, c2 + 66, CLOSED);
    frame(machine, c2 + 100, CLOSED);
    // "Reopen" to 0.245 — in dead zone.
    const r = frame(machine, c2 + 133, 0.245);

    // CURRENT CODE: isOpen = (0.245 >= 0.82*0.33=0.2706) = false → stays closed.
    // DESIRED: The machine must recognize 0.245 as a valid reopen (eye IS open,
    // just not at peak), transition to 'open', and count blink 2.
    assert.equal(machine.state, 'open',
      'Machine must transition to open when EAR is above closeThreshold (0.245 > 0.2376)');
    assert.equal(machine.blinkCount, 2,
      'Second blink with dead-zone reopen must count; total must be 2');
  });

  test('50-frame dead-zone hover at 0.25 (baseline 0.33): machine must not stay closed for >300ms', () => {
    const OPEN = 0.33;
    const CLOSED = 0.12;
    const machine = new BlinkStateMachine();
    const t0 = warmup(machine, OPEN);

    // Close.
    frame(machine, t0 + 200, CLOSED);

    // Hover at 0.25 (above close=0.2376 but below reopen=0.2706) for 50 frames at 30fps.
    let stuckClosedMs = 0;
    for (let t = t0 + 300; t <= t0 + 2000; t += 33) {
      frame(machine, t, 0.25);
      if (machine.state === 'closed') {
        stuckClosedMs = t - (t0 + 200);
      } else {
        break;
      }
    }

    // The machine must NOT remain closed for more than 300ms when EAR is clearly
    // above closeThreshold. Being stuck closed for 1700ms (until expiry) is a bug.
    assert.ok(stuckClosedMs <= 300,
      `Machine was stuck closed for ${stuckClosedMs}ms while EAR=0.25 > closeThreshold=0.2376; ` +
      `must recover within 300ms, not wait for expiry`);
  });
});
