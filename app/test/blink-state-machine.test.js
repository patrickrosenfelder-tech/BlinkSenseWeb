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

  // First valid blink: closes at t=1100, reopens at t=1250.
  // lastClosureStartedAt = 1100 (new semantic: compare next CLOSE start to prior CLOSE start).
  for (let time = 1100; time <= 1200; time += 20) frame(machine, time, CLOSED_EAR);
  frame(machine, 1250, OPEN_EAR);
  assert.equal(machine.blinkCount, 1);

  // Second closure at t=1200+1100=1200: close-to-close gap = 1200-1100 = 100ms < REFRACTORY_MS=180ms.
  // This represents reopen-jitter / same-blink echo and must still be rejected.
  const res = frame(machine, 1200, CLOSED_EAR);
  assert.equal(res.decision, 'rejected_refractory',
    'Close-to-close gap of 100ms must be rejected as refractory jitter');
  assert.equal(machine.getDiagnostics().state, 'open');

  // A third closure with close-to-close gap > 180ms (1100+200=1300) must succeed.
  frame(machine, 1300, CLOSED_EAR);
  frame(machine, 1450, OPEN_EAR);
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



// Verify: instability while closed must not prevent expiry evaluation,
// and a closure that started stable must complete (count) even if the
// head moves before the reopen — the state machine must never be
// paralyzed by instability.
test('blink started stable completes even when instability follows (no paralysis)', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 1050, OPEN_EAR); // past warmup

  // Stable close
  frame(machine, 1100, CLOSED_EAR);
  assert.equal(machine.state, 'closed');

  // Now shake the head (instability) — reopen must STILL be evaluated.
  // Closure is 200ms (1100->1300), above MIN_CLOSURE_MS and well before
  // the 600ms expiry, so this genuine blink must count.
  for (let t = 1133; t <= 1267; t += 33) {
    machine.process({ timestampMs: t, ear: CLOSED_EAR, yawProxy: 0.2, motion: 0.01 });
  }
  assert.equal(machine.state, 'closed', 'Eye still closed, must remain closed');

  // Reopen while still unstable — must be accepted, not blocked.
  const r = machine.process({ timestampMs: 1300, ear: OPEN_EAR, yawProxy: 0.2, motion: 0.01 });
  assert.equal(r.decision, 'accepted_blink', 'Reopen must be evaluated even while unstable');
  assert.equal(machine.state, 'open');
  assert.equal(machine.blinkCount, 1, 'Genuine blink during head movement must count');
});

// Verify: head movement alone (no EAR drop) never produces a blink, and a
// genuine blink that STARTS while unstable is still detected (the machine
// evaluates the EAR signal unconditionally).
test('stability gate does not block blink evaluation; motion alone never counts', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 1050, OPEN_EAR); // Past warmup

  // High yaw/motion frames (unstable) with OPEN EAR — head movement alone.
  let res = machine.process({ timestampMs: 1100, ear: OPEN_EAR, yawProxy: 0.1, motion: 0.001 });
  assert.equal(res.decision, 'open', 'Motion alone with open eye must stay open');
  res = machine.process({ timestampMs: 1150, ear: OPEN_EAR, yawProxy: 0.1, motion: 0.001 });
  assert.equal(res.decision, 'open', 'Motion alone with open eye must stay open');
  assert.equal(machine.state, 'open', 'State must remain open');
  assert.equal(machine.blinkCount, 0, 'Head movement alone must never count');

  // Genuine blink while STILL unstable: closure starts immediately.
  res = machine.process({ timestampMs: 1200, ear: CLOSED_EAR, yawProxy: 0.1, motion: 0.001 });
  assert.equal(res.decision, 'closure_started', 'Closure must start regardless of instability');
  assert.equal(machine.state, 'closed');

  machine.process({ timestampMs: 1300, ear: CLOSED_EAR, yawProxy: 0.1, motion: 0.001 });

  // Stabilize, then reopen — normal accepted blink.
  machine.process({ timestampMs: 1400, ear: OPEN_EAR, yawProxy: 0, motion: 0 });
  machine.process({ timestampMs: 1450, ear: OPEN_EAR, yawProxy: 0, motion: 0 });
  // Second genuine blink, past the 180ms refractory after the accepted blink at 1400.
  machine.process({ timestampMs: 1650, ear: CLOSED_EAR, yawProxy: 0, motion: 0 });
  machine.process({ timestampMs: 1700, ear: CLOSED_EAR, yawProxy: 0, motion: 0 });
  res = machine.process({ timestampMs: 1800, ear: OPEN_EAR, yawProxy: 0, motion: 0 });
  assert.equal(res.decision, 'accepted_blink', 'Stable blink should be accepted');
  assert.equal(machine.blinkCount, 2, 'Both genuine blinks must count; motion alone must not');
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

// ─── PAT-925 RED TESTS ──────────────────────────────────────────────────────
// These must FAIL before the production fix is applied (strict TDD).

// Fix 1: Refractory gate must compare close-to-close, not reopen-to-close.
// At 60 FPS a deliberate double-blink has ~200ms between CLOSES but only ~50ms
// between blink-1 REOPEN and blink-2 CLOSE — the current code blocks it wrongly.
test('PAT-925: rapid double blink (200ms close-to-close, >REFRACTORY_MS) counts as 2', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);    // warmup; initialBaseline = OPEN_EAR = 0.30
  frame(machine, 600, OPEN_EAR);  // first post-warmup frame

  // Blink 1: closes at t=700, reopens at t=800. lastClosureStartedAt=700.
  let r = frame(machine, 700, CLOSED_EAR);
  assert.equal(r.decision, 'closure_started');
  r = frame(machine, 800, OPEN_EAR); // 100ms closure — accepted
  assert.equal(r.decision, 'accepted_blink', 'Blink 1 must be accepted');
  assert.equal(machine.blinkCount, 1);

  // Blink 2: closes at t=900 (close-to-close gap = 900-700 = 200ms > REFRACTORY_MS=180ms).
  // Reopen-to-close gap = 900-800 = 100ms (old code would reject this as 100 < 180).
  r = frame(machine, 900, CLOSED_EAR);
  assert.equal(r.decision, 'closure_started',
    'Second blink closing 200ms after first close must not be rejected as refractory');
  r = frame(machine, 1000, OPEN_EAR);
  assert.equal(r.decision, 'accepted_blink', 'Blink 2 must be accepted');
  assert.equal(machine.blinkCount, 2, 'Both rapid deliberate blinks must count as 2');
});

// Fix 1 companion: truly rapid jitter (close-to-close gap 80ms < REFRACTORY_MS) is still blocked.
test('PAT-925: reopen jitter (80ms close-to-close gap) is still blocked by refractory', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 600, OPEN_EAR);

  // Blink 1: closes at t=700, reopens at t=800.
  frame(machine, 700, CLOSED_EAR);
  frame(machine, 800, OPEN_EAR);
  assert.equal(machine.blinkCount, 1);

  // Jitter closure at t=780 (close-to-close = 780-700 = 80ms < 180ms) must be blocked.
  const r = frame(machine, 780, CLOSED_EAR);
  assert.equal(r.decision, 'rejected_refractory',
    'Close-to-close gap of 80ms must be blocked as refractory jitter');
  assert.equal(machine.blinkCount, 1);
});

// Fix 2: Fast head shake (high-velocity motion) must block new closure entry;
// an already-started closure must still be able to reopen through motion.
test('PAT-925: fast head shake (motion > gate threshold) blocks new closure entry, counts 0', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 600, OPEN_EAR);

  // Feed frames with EAR drop + high motion — closure entry must be blocked.
  for (let t = 650; t <= 1200; t += 16) {
    const r = machine.process({ timestampMs: t, ear: CLOSED_EAR, yawProxy: 0.1, motion: 0.005 });
    assert.notEqual(r.decision, 'closure_started',
      `High-motion closure entry must be blocked at t=${t}`);
    assert.notEqual(r.decision, 'accepted_blink');
  }
  assert.equal(machine.blinkCount, 0, 'Fast head shake must count 0 blinks');
});

// Fix 2: Slow head movement (motion below gate) must allow genuine blinks.
test('PAT-925: genuine blink during slow head movement (low motion) counts as 1', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 600, OPEN_EAR);

  let r = machine.process({ timestampMs: 700, ear: CLOSED_EAR, yawProxy: 0.05, motion: 0.0002 });
  assert.equal(r.decision, 'closure_started',
    'Closure must be allowed when motion is below the gate threshold');
  r = machine.process({ timestampMs: 850, ear: OPEN_EAR, yawProxy: 0.05, motion: 0.0002 });
  assert.equal(r.decision, 'accepted_blink',
    'Genuine blink during slow head movement must count');
  assert.equal(machine.blinkCount, 1);
});

// Fix 2: A closure started before a motion spike must still be allowed to complete.
test('PAT-925: closure started before motion spike reopens through high motion and counts', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 600, OPEN_EAR);

  let r = frame(machine, 700, CLOSED_EAR);
  assert.equal(r.decision, 'closure_started');

  machine.process({ timestampMs: 730, ear: CLOSED_EAR, yawProxy: 0.3, motion: 0.01 });
  machine.process({ timestampMs: 760, ear: CLOSED_EAR, yawProxy: 0.3, motion: 0.01 });

  r = machine.process({ timestampMs: 850, ear: OPEN_EAR, yawProxy: 0.3, motion: 0.01 });
  assert.equal(r.decision, 'accepted_blink',
    'Reopen of a pre-motion closure must be accepted regardless of current motion');
  assert.equal(machine.blinkCount, 1);
});

// Fix 3: Partial squeeze (reopen EAR below initialBaseline floor) must count 0.
test('PAT-925: partial squeeze after baseline drift counts 0 (rejected_partial_reopen)', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR); // initialBaseline = 0.30

  // Drift baseline: 200 frames at EAR=0.25. isOpen(0.25>=0.246), baseline → 0.25.
  for (let i = 0; i < 200; i++) {
    machine.process({ timestampMs: 600 + i * 16, ear: 0.25, yawProxy: 0, motion: 0 });
  }

  const t0 = 600 + 200 * 16; // 3800ms
  machine.process({ timestampMs: t0 + 100, ear: CLOSED_EAR, yawProxy: 0, motion: 0 });
  // EAR=0.21 >= drifted reopenThreshold(≈0.205) but below floor(0.75*0.30=0.225).
  const r = machine.process({ timestampMs: t0 + 300, ear: 0.21, yawProxy: 0, motion: 0 });

  // Without fix: accepted_blink (blinkCount=1). With fix: rejected_partial_reopen.
  assert.equal(r.decision, 'rejected_partial_reopen',
    'Reopen well below initial open baseline must be rejected as partial squeeze');
  assert.equal(machine.blinkCount, 0, 'Partial squeeze must count 0 blinks');
});

// Fix 3 companion: genuine full-depth blink above the floor counts even after drift.
test('PAT-925: genuine full blink above initialBaseline floor counts even after drift', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR); // initialBaseline = 0.30

  for (let i = 0; i < 200; i++) {
    machine.process({ timestampMs: 600 + i * 16, ear: 0.25, yawProxy: 0, motion: 0 });
  }

  const t0 = 600 + 200 * 16;
  machine.process({ timestampMs: t0 + 100, ear: CLOSED_EAR, yawProxy: 0, motion: 0 });
  // Full reopen at OPEN_EAR=0.30 >= 0.75*0.30=0.225 — must count.
  const r = machine.process({ timestampMs: t0 + 300, ear: OPEN_EAR, yawProxy: 0, motion: 0 });
  assert.equal(r.decision, 'accepted_blink',
    'Genuine full-depth blink above floor must count even after baseline drift');
  assert.equal(machine.blinkCount, 1);
});

// ─── PAT-935: candidate decision event scalar diagnostics ─────────────────
// Every accepted/rejected candidate event must carry privacy-safe scalar
// context: timestamp, EAR, motion, yawProxy, close/reopen thresholds,
// state/stability/entry-gate decision, closure-depth/initial-baseline
// context, and the accepted/rejected reason. No frames, images, or landmark
// coordinates are ever persisted — only numbers.
const PAT_935_REQUIRED_FIELDS = [
  'timestampMs', 'ear', 'motion', 'yawProxy',
  'closeThreshold', 'reopenThreshold',
  'state', 'stable', 'entryStable',
  'initialBaseline', 'openBaseline', 'closureDepthRatio',
  'reason',
];

function assertCandidateEventDiagnostics(event, label) {
  for (const field of PAT_935_REQUIRED_FIELDS) {
    assert.ok(field in event, `${label} candidate event missing scalar diagnostic field "${field}"`);
  }
}

test('PAT-935 RED: accepted candidate event carries full scalar diagnostic context', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 600, OPEN_EAR);
  machine.process({ timestampMs: 700, ear: CLOSED_EAR, yawProxy: 0.02, motion: 0.0001 });
  const r = machine.process({ timestampMs: 850, ear: OPEN_EAR, yawProxy: 0.02, motion: 0.0001 });
  assert.equal(r.decision, 'accepted_blink');

  const accepted = machine.getDiagnostics().acceptedEvents;
  assert.equal(accepted.length, 1);
  assertCandidateEventDiagnostics(accepted[0], 'accepted');
  assert.equal(accepted[0].reason, 'accepted_blink');
});

test('PAT-935 RED: rejected_refractory candidate event carries full scalar diagnostic context', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 600, OPEN_EAR);
  frame(machine, 700, CLOSED_EAR);
  frame(machine, 800, OPEN_EAR);
  const r = frame(machine, 780, CLOSED_EAR); // close-to-close gap 80ms < REFRACTORY_MS
  assert.equal(r.decision, 'rejected_refractory');

  const rejected = machine.getDiagnostics().rejectedEvents;
  const event = rejected.find((e) => e.reason === 'refractory_closure');
  assert.ok(event, 'refractory rejection must be recorded');
  assertCandidateEventDiagnostics(event, 'rejected_refractory');
});

test('PAT-935 RED: rejected_short_closure candidate event carries full scalar diagnostic context', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 1050, CLOSED_EAR);
  const r = frame(machine, 1100, OPEN_EAR); // 50ms micro-closure
  assert.equal(r.decision, 'rejected_short_closure');

  const rejected = machine.getDiagnostics().rejectedEvents;
  const event = rejected.find((e) => e.reason === 'closure_too_short');
  assert.ok(event, 'short-closure rejection must be recorded');
  assertCandidateEventDiagnostics(event, 'rejected_short_closure');
});

test('PAT-935 RED: rejected_partial_reopen candidate event carries full scalar diagnostic context', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR); // initialBaseline = 0.30
  for (let i = 0; i < 200; i++) {
    machine.process({ timestampMs: 600 + i * 16, ear: 0.25, yawProxy: 0, motion: 0 });
  }
  const t0 = 600 + 200 * 16;
  machine.process({ timestampMs: t0 + 100, ear: CLOSED_EAR, yawProxy: 0, motion: 0 });
  const r = machine.process({ timestampMs: t0 + 300, ear: 0.21, yawProxy: 0, motion: 0 });
  assert.equal(r.decision, 'rejected_partial_reopen');

  const rejected = machine.getDiagnostics().rejectedEvents;
  const event = rejected.find((e) => e.reason === 'partial_reopen');
  assert.ok(event, 'partial-reopen rejection must be recorded');
  assertCandidateEventDiagnostics(event, 'rejected_partial_reopen');
});

test('PAT-935 RED: rejected_closure_expired candidate event carries full scalar diagnostic context', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 1050, OPEN_EAR); // past warmup
  frame(machine, 1100, CLOSED_EAR);

  let expiryEvent = null;
  for (let t = 1150; t <= 1900; t += 50) {
    const r = frame(machine, t, CLOSED_EAR);
    if (r.decision === 'rejected_closure_expired') {
      expiryEvent = r;
      break;
    }
  }
  assert.ok(expiryEvent, 'closure expiry must fire');

  const rejected = machine.getDiagnostics().rejectedEvents;
  const event = rejected.find((e) => e.reason === 'closure_expired');
  assert.ok(event, 'closure-expired rejection must be recorded');
  assertCandidateEventDiagnostics(event, 'rejected_closure_expired');
});

// This rejection reason is currently dropped entirely — the entry-gate check
// returns `rejected_unstable` without ever calling record(), so today there
// is zero diagnostic trail (not even a bare timestamp) for this candidate.
test('PAT-935 RED: closure entry-gate instability rejection is recorded with full scalar diagnostic context', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 600, OPEN_EAR);

  const r = machine.process({ timestampMs: 700, ear: CLOSED_EAR, yawProxy: 0.1, motion: 0.005 });
  assert.equal(r.decision, 'rejected_unstable');

  const rejected = machine.getDiagnostics().rejectedEvents;
  assert.equal(rejected.length, 1, 'unstable entry-gate rejection must be recorded, not silently dropped');
  assertCandidateEventDiagnostics(rejected[0], 'rejected_unstable');
});

// Enrichment must not break the existing bounded-size guarantee on the
// accepted/rejected diagnostic lists (MAX_EVENTS = 200).
test('PAT-935: rejectedEvents/acceptedEvents remain bounded in size after enrichment', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 600, OPEN_EAR);

  // Drive 250 refractory rejections (well above MAX_EVENTS=200): each cycle
  // completes one accepted blink, then immediately attempts a second closure
  // within the refractory window (close-to-close gap 120ms < REFRACTORY_MS=180ms).
  for (let i = 0; i < 250; i++) {
    const t = 700 + i * 1000;
    frame(machine, t, CLOSED_EAR); // closure_started
    frame(machine, t + 100, OPEN_EAR); // accepted_blink
    frame(machine, t + 120, CLOSED_EAR); // rejected_refractory
  }

  const diag = machine.getDiagnostics();
  assert.ok(diag.rejectedEvents.length <= 200, 'rejectedEvents must stay bounded at MAX_EVENTS');
});
