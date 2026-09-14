import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlinkStateMachine } from '../src/blink-state-machine.js';

const OPEN_EAR = 0.30;
const CLOSED_EAR = 0.12;

function frame(machine, timestampMs, ear) {
  return machine.process({ timestampMs, ear });
}

function intentionalBlink(machine, startMs, fps, openEar = OPEN_EAR, closedEar = CLOSED_EAR) {
  const interval = 1000 / fps;
  // A 150ms closure is long enough to be intentional at every required FPS.
  for (let time = startMs; time < startMs + 160; time += interval) frame(machine, time, closedEar);
  for (let time = startMs + 160; time < startMs + 340; time += interval) frame(machine, time, openEar);
}

test('diagnostics returns 0.0 before first decoded frame', () => {
  const machine = new BlinkStateMachine();
  const diag = machine.getDiagnostics();
  assert.equal(diag.openBaseline, 0.0);
  assert.equal(diag.closeThreshold, 0.0);
  assert.equal(diag.reopenThreshold, 0.0);
});

for (const fps of [10, 15, 24, 30, 60]) {
  test(`counts exactly 100 close/reopen cycles at ${fps} processed FPS`, () => {
    const machine = new BlinkStateMachine();
    frame(machine, 0, OPEN_EAR);
    for (let cycle = 0; cycle < 100; cycle++) intentionalBlink(machine, 500 + cycle * 700, fps);
    assert.equal(machine.blinkCount, 100);
  });

  test(`counts exactly 100 close/reopen cycles at ${fps} processed FPS (low EAR fixture)`, () => {
    const machine = new BlinkStateMachine();
    frame(machine, 0, 0.20);
    for (let cycle = 0; cycle < 100; cycle++) intentionalBlink(machine, 500 + cycle * 700, fps, 0.20, 0.08);
    assert.equal(machine.blinkCount, 100);
  });
}

test('rejects micro-closures and noisy threshold crossings', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 1050, CLOSED_EAR);
  frame(machine, 1100, OPEN_EAR); // 50ms micro-closure
  for (let time = 1200; time <= 1600; time += 50) frame(machine, time, time % 100 ? 0.24 : 0.23);
  assert.equal(machine.blinkCount, 0);
  assert.ok(machine.getDiagnostics().rejectedEvents.some((event) => event.reason === 'closure_too_short'));
});

test('sustained closure counts once and reopen jitter cannot over-count', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  for (let time = 1050; time <= 2000; time += 50) frame(machine, time, CLOSED_EAR);
  for (const [time, ear] of [[2050, OPEN_EAR], [2100, 0.20], [2150, OPEN_EAR], [2200, 0.20], [2250, OPEN_EAR], [2300, OPEN_EAR]]) {
    frame(machine, time, ear);
  }
  assert.equal(machine.blinkCount, 1);
});

test('EAR is scale invariant for equivalent landmark coordinates', () => {
  const machine = new BlinkStateMachine();
  const eye = [
    { x: 0, y: 0 }, { x: 2, y: 4 }, { x: 8, y: 4 },
    { x: 10, y: 0 }, { x: 8, y: -4 }, { x: 2, y: -4 },
  ];
  const scaled = eye.map(({ x, y }) => ({ x: x * 7.25, y: y * 7.25 }));
  assert.equal(BlinkStateMachine.eyeAspectRatio(eye), BlinkStateMachine.eyeAspectRatio(scaled));
});

test('enforces refractory period (debounce) for rapid successive closures', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);

  // First valid blink (lasts 100ms)
  for (let time = 1100; time <= 1200; time += 20) frame(machine, time, CLOSED_EAR);
  frame(machine, 1250, OPEN_EAR);
  assert.equal(machine.blinkCount, 1);

  // Second closure within refractory period (refractory is 180ms, lastAcceptedAt = 1250)
  const res = frame(machine, 1350, CLOSED_EAR);
  assert.equal(res.decision, 'rejected_refractory');
  assert.equal(machine.getDiagnostics().state, 'open');

  // Close after refractory period
  frame(machine, 1450, CLOSED_EAR);
  frame(machine, 1600, OPEN_EAR);
  assert.equal(machine.blinkCount, 2);
});

test('maximum closure duration: stale closed state is rejected and resets to open', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 1050, OPEN_EAR); // past warmup

  // Valid stable close at t=1100
  let r = frame(machine, 1100, CLOSED_EAR);
  assert.equal(r.decision, 'closure_started');
  assert.equal(machine.state, 'closed');

  // Feed closed-eye frames; break immediately when expiry fires so no spurious
  // second closure can start and collide with the refractory check below.
  let expiryDecision = null;
  let expiryTs = null;
  for (let t = 1150; t <= 1900; t += 50) {
    r = frame(machine, t, CLOSED_EAR);
    if (r.decision === 'rejected_closure_expired') {
      expiryDecision = r.decision;
      expiryTs = t;
      break; // stop immediately — do not feed more CLOSED_EAR after expiry
    }
  }

  // Expiry must have fired
  assert.ok(expiryDecision !== null, 'Expiry must fire while held closed beyond MAX_CLOSURE_MS');
  assert.equal(expiryDecision, 'rejected_closure_expired');
  assert.equal(machine.state, 'open', 'State must be open immediately after expiry');
  assert.equal(machine.blinkCount, 0, 'Expired closure must not be counted as a blink');

  // After expiry, a normal short blink must still be accepted
  frame(machine, expiryTs + 50, OPEN_EAR);  // explicit open frame to settle state
  r = frame(machine, expiryTs + 200, CLOSED_EAR);
  assert.equal(r.decision, 'closure_started');
  r = frame(machine, expiryTs + 350, OPEN_EAR);
  assert.equal(r.decision, 'accepted_blink');
  assert.equal(machine.blinkCount, 1, 'Normal blink after expiry reset must still be counted');
});



// Verify: instability while closed must not prevent expiry evaluation
test('maximum closure duration: expiry fires even when stability gate is active', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 1050, OPEN_EAR); // past warmup

  // Stable close
  frame(machine, 1100, CLOSED_EAR);
  assert.equal(machine.state, 'closed');

  // Now shake the head (instability) — gate will reject_unstable for all subsequent frames
  // BUT expiry must still be evaluated regardless
  for (let t = 1150; t <= 1900; t += 33) {
    machine.process({ timestampMs: t, ear: CLOSED_EAR, yawProxy: 0.2, motion: 0.01 });
  }

  // At t=1950, still unstable — machine should have self-expired the closed state
  const r = machine.process({ timestampMs: 1950, ear: CLOSED_EAR, yawProxy: 0.2, motion: 0.01 });
  assert.equal(machine.state, 'open', 'Expiry must fire even while unstable');
  assert.equal(machine.blinkCount, 0, 'Expired closure during instability must not count');
});


test('explicit stability gate: unstable head motion cannot enter/complete a blink', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 1050, OPEN_EAR); // Past warmup

  // High yaw/motion frames (unstable)
  machine.process({ timestampMs: 1100, ear: OPEN_EAR, yawProxy: 0.1, motion: 0.001 });
  machine.process({ timestampMs: 1150, ear: OPEN_EAR, yawProxy: 0.1, motion: 0.001 });

  // Try to blink while unstable
  let res = machine.process({ timestampMs: 1200, ear: CLOSED_EAR, yawProxy: 0.1, motion: 0.001 });
  assert.equal(res.decision, 'rejected_unstable', 'Should explicitly reject closure due to instability');
  assert.equal(machine.state, 'open', 'State should remain open');

  machine.process({ timestampMs: 1300, ear: OPEN_EAR, yawProxy: 0.1, motion: 0.001 });

  // Stabilize
  machine.process({ timestampMs: 1400, ear: OPEN_EAR, yawProxy: 0, motion: 0 });
  machine.process({ timestampMs: 1450, ear: OPEN_EAR, yawProxy: 0, motion: 0 });

  // Now stable real blink
  machine.process({ timestampMs: 1500, ear: CLOSED_EAR, yawProxy: 0, motion: 0 });
  machine.process({ timestampMs: 1550, ear: CLOSED_EAR, yawProxy: 0, motion: 0 });
  res = machine.process({ timestampMs: 1650, ear: OPEN_EAR, yawProxy: 0, motion: 0 });
  assert.equal(res.decision, 'accepted_blink', 'Stable blink should be accepted');
  assert.equal(machine.blinkCount, 1);
});

// PAT-894: at 3.67 FPS (production Android), sampled closure durations are always 635–1270ms
// because 2–4 consecutive low-FPS frames are needed to observe the reopen. The fixed
// MAX_CLOSURE_MS=600 rejects ALL real blinks at this FPS. Tests below prove the fix.

test('PAT-894: counts blink at 3 FPS when sampled closure duration is 666ms (> original 600ms)', () => {
  const machine = new BlinkStateMachine();
  // Warmup
  frame(machine, 0, OPEN_EAR);
  // Establish 3 FPS cadence (333ms intervals) so the state machine knows the frame rate
  frame(machine, 600, OPEN_EAR);  // interval=600ms (warmup gap, primes tracker)
  frame(machine, 933, OPEN_EAR);  // interval=333ms ← 3 FPS cadence established
  frame(machine, 1266, OPEN_EAR); // interval=333ms

  // Close: closedAt=1599
  let r = frame(machine, 1599, CLOSED_EAR);
  assert.equal(r.decision, 'closure_started');
  // Still closed one frame later (333ms): sampled duration = 333ms so far
  r = frame(machine, 1932, CLOSED_EAR);
  // Reopen at t=2265: sampled durationMs = 2265-1599 = 666ms > original MAX_CLOSURE_MS=600ms
  r = frame(machine, 2265, OPEN_EAR);
  assert.equal(r.decision, 'accepted_blink',
    '666ms sampled closure at 3 FPS must be accepted (physiologically valid blink, artifact of low FPS sampling)');
  assert.equal(machine.blinkCount, 1);
});

test('PAT-894: counts blink at 5 FPS when sampled closure duration is 1000ms (> original 600ms)', () => {
  const machine = new BlinkStateMachine();
  // Warmup
  frame(machine, 0, OPEN_EAR);
  // Establish 5 FPS cadence (200ms intervals)
  frame(machine, 600, OPEN_EAR);  // warmup gap
  frame(machine, 800, OPEN_EAR);  // interval=200ms ← 5 FPS cadence
  frame(machine, 1000, OPEN_EAR); // interval=200ms

  // Close: closedAt=1200
  let r = frame(machine, 1200, CLOSED_EAR);
  assert.equal(r.decision, 'closure_started');
  frame(machine, 1400, CLOSED_EAR); // 200ms
  frame(machine, 1600, CLOSED_EAR); // 400ms
  frame(machine, 1800, CLOSED_EAR); // 600ms (boundary — no expiry yet at strict >)
  frame(machine, 2000, CLOSED_EAR); // 800ms — current code: EXPIRES here → RED
  // Reopen at t=2200: sampled durationMs = 2200-1200 = 1000ms > original MAX_CLOSURE_MS=600ms
  r = frame(machine, 2200, OPEN_EAR);
  assert.equal(r.decision, 'accepted_blink',
    '1000ms sampled closure at 5 FPS must be accepted (physiologically valid blink, artifact of low FPS sampling)');
  assert.equal(machine.blinkCount, 1);
});

test('PAT-894: stale multi-second closure at 3 FPS is still rejected and resets to open', () => {
  const machine = new BlinkStateMachine();
  // Warmup
  frame(machine, 0, OPEN_EAR);
  // Establish 3 FPS cadence
  frame(machine, 600, OPEN_EAR);
  frame(machine, 933, OPEN_EAR);
  frame(machine, 1266, OPEN_EAR);

  // Close: eye never reopens — should expire well before 7000ms
  frame(machine, 1599, CLOSED_EAR);

  let expiryDecision = null;
  let expiryTs = null;
  for (let t = 1932; t <= 7000; t += 333) {
    const r = frame(machine, t, CLOSED_EAR);
    if (r.decision === 'rejected_closure_expired') {
      expiryDecision = r.decision;
      expiryTs = t;
      break;
    }
  }

  assert.ok(expiryDecision !== null, 'Multi-second stale closure at 3 FPS must still expire');
  assert.equal(machine.state, 'open', 'State must reset to open after stale expiry');
  assert.equal(machine.blinkCount, 0, 'Stale closure must not count as a blink');
  // Expiry must occur after many seconds (not prematurely at 600ms), i.e., after a genuine stale period
  assert.ok(expiryTs > 3000, `Expiry at ${expiryTs}ms must be well past 3 seconds to allow real low-FPS blinks`);
});
