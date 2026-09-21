// PAT-1032 — deterministic RED fixtures derived from the Mac Brave live-build
// 100-blink trial (export blinksense-diagnostics-2026-09-20T00-19-26.491Z.json,
// 15/100 accepted). Analysis only: production code (blink-state-machine.js) is
// NOT modified here. These fixtures prove, with numbers lifted directly from
// the real scalar trace, that the machine's own adaptive reopen threshold and
// its static MIN_REOPEN_RATIO/initialBaseline floor structurally disagree once
// openBaseline has legitimately drifted down over a multi-minute session — no
// aggregate-count tuning, this is a single deterministic mechanism.
// No commit/push/deploy: analysis fixtures pending review.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BlinkStateMachine } from '../src/blink-state-machine.js';

function frame(machine, timestampMs, ear, yawProxy = 0, motion = 0) {
  return machine.process({ timestampMs, ear, yawProxy, motion });
}

function warmup(machine, openEar, startMs = 0) {
  frame(machine, startMs, openEar);
  for (let t = startMs + 100; t <= startMs + 500; t += 100) frame(machine, t, openEar);
  frame(machine, startMs + 600, openEar);
  return startMs + 600;
}

// ─── Root cause: frozen initialBaseline floor vs. adaptive reopenThreshold ──
//
// Trace facts (session-level, from the export):
//   initialBaseline = 0.33091452809792055 (frozen at warmup, PAT-925 Fix 3)
//   openBaseline drifted  0.3269 -> 0.2760 over the session (legitimate EWMA
//     decay, gated by MIN_ADAPT_EAR_RATIO=0.80 so it never adapts below 80%
//     of initialBaseline: 0.276 / 0.331 = 0.834, i.e. the adaptation gate is
//     behaving exactly as designed).
//   MIN_REOPEN_RATIO = 0.72 (PAT-925 Fix 3 floor, checked against
//     initialBaseline, never against the adapted openBaseline).
//   REOPEN_RATIO = 0.82 (adaptive per-frame reopen threshold, checked against
//     the current openBaseline).
//
// The two gates are mathematically guaranteed to invert once openBaseline
// drifts below (MIN_REOPEN_RATIO / REOPEN_RATIO) = 0.72/0.82 = 87.8% of
// initialBaseline: below that point, a reopen EAR that clears the machine's
// OWN adaptive reopenThreshold (openBaseline * 0.82) can still sit below the
// frozen floor (initialBaseline * 0.72) and gets rejected as partial_reopen
// even though the state machine's adaptive logic already decided the eye is
// open. openBaseline reaching 83.4% of initialBaseline (as observed) is well
// past that 87.8% inversion point, and MIN_ADAPT_EAR_RATIO's own floor (80%)
// permits drifting even further past it — so this is not an edge case, it is
// the guaranteed steady state of any sufficiently long session.
//
// In the real trace this produced a ~58s total blackout (39.2s-97.2s) with
// zero accepted blinks: 53 of 75 partial_reopen rejections fall inside it.

describe('PAT-1032: Mac Brave live trial — frozen-floor vs adaptive-threshold inversion', () => {
  test('reopen that clears the adaptive reopenThreshold is still rejected once openBaseline drifts past the 87.8% inversion point (trace-derived numbers)', () => {
    const INITIAL = 0.33091452809792055; // trace initialBaseline (frozen at warmup)
    const machine = new BlinkStateMachine();
    warmup(machine, INITIAL);

    // Force the machine into the exact drifted state the trace recorded
    // (final openBaseline=0.2760 after ~100s of legitimate EWMA decay, per
    // the export's top-level `openBaseline` field). Setting the field
    // directly is the same pattern already used by the existing PAT-952
    // "Codex P2" depth-gate boundary tests in controlled-traces.test.js to
    // pin a precise pre-closure baseline without needing hundreds of frames
    // to converge it via the EWMA.
    machine.openBaseline = 0.2760;
    const diagBeforeBlink = machine.getDiagnostics();
    assert.ok(diagBeforeBlink.openBaseline < 0.72 / 0.82 * INITIAL,
      `Precondition: openBaseline (${diagBeforeBlink.openBaseline}) must have drifted past the ` +
      `87.8% inversion point (${0.72 / 0.82 * INITIAL}) for this fixture to be meaningful`);

    // A genuine blink: close, then reopen at EAR=0.227 — a real rejected-event
    // value from the trace (t=43063.0). This clears the machine's OWN
    // adaptive reopenThreshold (openBaseline*0.82) ...
    const closeAt = 700;
    frame(machine, closeAt, 0.12);
    const reopenEar = 0.227;
    const adaptiveReopenThreshold = diagBeforeBlink.openBaseline * 0.82;
    assert.ok(reopenEar >= adaptiveReopenThreshold,
      'Fixture setup: reopen EAR must clear the adaptive reopenThreshold');

    const r = frame(machine, closeAt + 200, reopenEar);

    // DESIRED (post-fix) contract: a reopen that clears the machine's own
    // adaptive threshold, after openBaseline has legitimately drifted (not a
    // sudden squint — 400 stable open frames precede it), must be accepted.
    // CURRENT CODE: rejected as partial_reopen. This assertion is RED against
    // production code today — that is the point of this fixture.
    assert.equal(r.decision, 'accepted_blink',
      `Reopen at EAR=${reopenEar} clears the adaptive reopenThreshold ` +
      `(${adaptiveReopenThreshold}) after legitimate multi-second drift and must count; ` +
      `current code rejects it as '${r.decision}' via the frozen-initialBaseline floor`);
  });

  test('sustained legitimate drift produces a multi-second blackout where every otherwise-valid reopen is rejected (trace-shaped, not a single frame)', () => {
    const INITIAL = 0.33091452809792055;
    const machine = new BlinkStateMachine();
    warmup(machine, INITIAL);
    machine.openBaseline = 0.2760; // trace-final drifted baseline, see test above

    let t = 700;

    // Five consecutive genuine blink cycles at trace-realistic reopen EARs,
    // all of which clear their own adaptive reopenThreshold at the time.
    const reopenEars = [0.224, 0.227, 0.2295, 0.226, 0.2251];
    let accepted = 0;
    for (const reopenEar of reopenEars) {
      const closeAt = t + 300;
      frame(machine, closeAt, 0.12);
      const r = frame(machine, closeAt + 200, reopenEar);
      if (r.decision === 'accepted_blink') accepted++;
      t = closeAt + 200;
    }

    // DESIRED: all 5 genuine blinks count. CURRENT CODE: 0/5 count (all
    // rejected_partial_reopen) — this is the mechanism behind the trace's
    // 58-second, 53-rejection blackout. RED against production code today.
    assert.equal(accepted, 5,
      `All 5 post-drift genuine blinks must count; production code currently accepts ${accepted}/5`);
  });
});
