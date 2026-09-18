# PAT-944: Eliminate Head-Shake False Blinks

## Overview

This document tracks the work to eliminate false positive blink detections caused by head movement (particularly fast head shaking), while preserving genuine blink detection.

**Status:** Ready for diagnostic collection  
**Test Baseline:** 35/35 tests passing (all PAT-894, PAT-925, PAT-935 coverage verified)  
**Deployment:** https://app-zeta-six-65.vercel.app (instrumented, ready for data collection)

---

## Current Implementation: Head-Shake Defense (PAT-925)

The blink-state-machine.js already has three defensive gates:

### Gate 1: Closure Entry Stability (Primary)

**Location:** `app/src/blink-state-machine.js`, line 77–89  
**Function:** `isClosureEntryStable()`

```javascript
const CLOSURE_ENTRY_MOTION_THRESHOLD = 0.001;   // strict >
const CLOSURE_ENTRY_YAW_THRESHOLD = 0.20;       // strict >
const STABILITY_WINDOW_MS = 150;                // lookback window

isClosureEntryStable() {
  // Returns false if recent frames show motion > 0.001 OR yaw > 0.20
  // Called ONLY when entering a closure from open state (line 194)
  // Does NOT gate the reopen path — closure always completes
}
```

**How it works:**
- When EAR drops below `closeThreshold` (80% of baseline), checks recent motion/yaw
- If ANY recent frame (last 150ms) has motion > 0.001 OR yaw > 0.20 → **REJECT** closure entry
- Only applies to NEW closure starts; doesn't block completion of in-progress closures

**Why this matters:**
- Fast head shaking produces motion ~0.005–0.015
- Slow head movement produces motion ~0.0002–0.0003
- Threshold 0.001 is deliberately tight to catch rapid motion early

**Test coverage:**
- ✅ "PAT-925: fast head shake (motion > gate) blocks closure entry" (line 324–337)
- ✅ "PAT-925: genuine blink during slow head movement counts" (line 340–352)
- ✅ "PAT-925: closure started before motion spike reopens" (line 355–370)

---

### Gate 2: Refractory Debounce

**Location:** `app/src/blink-state-machine.js`, line 202–206  
**Thresholds:** `REFRACTORY_MS = 180` (close-to-close gap)

**How it works:**
- Compares timestamp of CURRENT closure start to PREVIOUS closure start
- Requires 180ms between close events
- Rejects anything closer (echo/jitter) but allows genuine rapid double-blinks (200ms apart)

**Why this matters:**
- Blink echo at ~100ms apart is not genuine
- Deliberate double-blink has ~200ms between closes
- Prevents false positives from motion-induced EAR jitter

**Test coverage:**
- ✅ "PAT-925: rapid double blink (200ms close-to-close) counts as 2" (line 282–302)
- ✅ "PAT-925: reopen jitter (80ms gap) rejected by refractory" (line 305–320)

---

### Gate 3: Partial Reopen Floor

**Location:** `app/src/blink-state-machine.js`, line 226–230  
**Threshold:** `MIN_REOPEN_RATIO = 0.75` (75% of warmup baseline)

**How it works:**
- Reopen must reach >= 75% of the initial warmup baseline EAR
- Prevents partial squeezes (brief eye closure without full open) from counting as blinks

**Why this matters:**
- Squinting during head movement might produce EAR dips
- But true squints don't reopen to full eye-open
- Baseline safety floor prevents EWMA drift from eroding thresholds

**Test coverage:**
- ✅ "PAT-925: partial squeeze after drift rejected" (line 373–391)
- ✅ "PAT-925: genuine full blink above floor counts" (line 394–409)

---

## Diagnostic Event Structure (PAT-935)

Every blink candidate (accepted or rejected) generates a diagnostic event:

```javascript
{
  // Raw measurements
  timestampMs,          // event timestamp (ms)
  ear,                  // Eye Aspect Ratio [0–1], ~0.3 open, ~0.1 closed
  motion,               // head motion magnitude [0–1], ~0.0002–0.0003 normal, ~0.005+ shake
  yawProxy,             // head yaw/rotation [0–1], ~0.05 normal, >0.2 turning

  // Thresholds at this instant
  closeThreshold,       // CLOSE_RATIO * openBaseline (0.72x)
  reopenThreshold,      // REOPEN_RATIO * openBaseline (0.82x)

  // State
  state,                // 'open' | 'closed'
  stable,               // isLandmarkStable() — tight thresholds (baseline adapt)
  entryStable,          // isClosureEntryStable() — loose thresholds (closure entry gate)

  // Calibration context
  initialBaseline,      // peak EAR observed during warmup
  openBaseline,         // current EWMA-adapted baseline
  closureDepthRatio,    // ear / openBaseline

  // Decision
  reason,               // 'accepted_blink' | 'rejected_unstable' | 'rejected_refractory' | ...
  durationMs,           // (if closure) how long the eye was closed
}
```

**Available via:**
```javascript
const diag = machine.getDiagnostics();
diag.acceptedEvents   // [{ ...event }, ...]  — successfully counted blinks
diag.rejectedEvents   // [{ ...event }, ...]  — filtered candidates
```

---

## Diagnostic Collection Checklist

### Access
- **URL:** https://app-zeta-six-65.vercel.app
- **Browsers:** Chrome, Firefox, Safari (all 3 platforms)
- **Expected:** Full camera access, blink detection running in real-time

### Collection Sessions
Run on **each platform** (Mac, iPhone, Android). Each session ~15 min total.

#### Session 1: Baseline (5 min)
- **Purpose:** Confirm no degradation of normal blink detection
- **Task:** Sit still, blink naturally at normal cadence
- **Target:** 15–20 natural blinks detected
- **Export:** `baseline-[platform].json`

#### Session 2: Slow Head Shake (2 min)
- **Purpose:** Verify slow head movement doesn't trigger false positives
- **Task:** Slowly shake head side-to-side, ~1 Hz frequency (2 seconds per side)
- **Target:** 0 blinks detected (head movement alone, no eye closure)
- **Expected motion:** ~0.0002–0.0003
- **Export:** `slow-shake-[platform].json`

#### Session 3: Rapid Head Shake (2 min)
- **Purpose:** Verify fast head shaking is blocked
- **Task:** Rapidly shake head side-to-side, ~3 Hz frequency
- **Target:** 0 blinks detected (critical test for gate tuning)
- **Expected motion:** ~0.005–0.015 (where false positives occur)
- **Export:** `rapid-shake-[platform].json`

#### Session 4: Yaw Rotation (2 min)
- **Purpose:** Verify yaw gates work across head turns
- **Task:** Slowly turn head left/right (yaw 0.05→0.15), then rapidly turn (yaw > 0.25)
- **Target:** 0 blinks (yaw alone, no closure)
- **Expected yaw:** ~0.05 slow, >0.2 rapid
- **Export:** `yaw-[platform].json`

#### Session 5: Genuine Blinks During Movement (4 min)
- **Purpose:** Verify genuine blinks still count during head movement
- **Task:**
  - Blink while slowly moving head (1 blink, then 1 head movement cycle)
  - Blink while rapidly shaking (deliberate closure during shake)
  - Double-blink (rapid consecutive blinks)
  - Slow deliberate blink (exaggerated closure)
- **Target:** All 4+ blinks detected (verify no false negatives)
- **Export:** `genuine-during-movement-[platform].json`

### Export Process

1. Open browser DevTools → Console
2. Copy the diagnostic events:
   ```javascript
   // Run in console:
   const diag = window.blinkMachine.getDiagnostics?.();
   console.log(JSON.stringify({
     platform: 'iPhone',
     timestamp: new Date().toISOString(),
     acceptedEvents: diag.acceptedEvents,
     rejectedEvents: diag.rejectedEvents
   }, null, 2));
   ```
3. Save to file: `[session-name]-[platform]-[time].json`

---

## Analysis Phase: RED Trace Template

For each false positive found in diagnostic data:

```markdown
## FALSE POSITIVE #1

**Platform:** iPhone 15 Pro  
**Session:** rapid-shake-ios.json  
**Timestamp Range:** 12340–12450ms

### Symptom
- **Decision:** accepted_blink (WRONG — should have been rejected)
- **Expected:** Head shake alone should count 0 blinks
- **Actual:** Counted as 1 blink

### Measurements
- **Motion:** min=0.004, max=0.012, mean=0.007 ← **EXCEEDS threshold 0.001**
- **Yaw:** min=0.02, max=0.18, mean=0.09 ← below threshold 0.20
- **EAR:** 0.28 (open) → 0.19 (closed) → 0.27 (reopen)
- **Duration:** 110ms closure

### Gate Analysis
From diagnostic event at closure entry (t=12345ms):
- `entryStable: true` ← **GATE FAILED** (should be false given motion=0.007)
- `stable: true`
- `closureDepthRatio: 0.67` (deep enough to trigger close)

### Root Cause
**Motion gate threshold too high.** Threshold=0.001 allows motion up to 0.001 (strict >).  
Actual motion was 0.007, which is 7x the threshold.

### Proposed Fix
Raise `CLOSURE_ENTRY_MOTION_THRESHOLD` from 0.001 to 0.002 (or 0.0015).  
**Test:** Verify new threshold blocks motion=0.007 but allows motion=0.0003 (genuine slow blink).
```

---

## Implementation Phase: Gate Tuning Options

### If rapid motion (0.005–0.015) leaks through:

**Current:** `CLOSURE_ENTRY_MOTION_THRESHOLD = 0.001`

**Option A:** Raise threshold  
```javascript
CLOSURE_ENTRY_MOTION_THRESHOLD = 0.0015  // or 0.002
```
- **Pro:** Simple one-line change, affects one gate
- **Con:** Still allows motion=0.002, may need to go higher
- **Risk:** None if baseline genuine blinks have motion < new threshold

**Option B:** Adaptive threshold  
```javascript
// Use percentile of recent motion instead of fixed value
const recentMotion = this.stabilityFrames.slice(-10).map(f => f.motion);
const threshold = percentile(recentMotion, 0.8) * 1.5;
```
- **Pro:** Adapts to device characteristics
- **Con:** More complex, harder to test
- **Risk:** Feedback loop if motion measurements are noisy

**Recommended:** Start with Option A (0.0015), test with PAT-936. Escalate to Option B only if needed.

### If yaw rotation (>0.2) leaks through:

**Current:** `CLOSURE_ENTRY_YAW_THRESHOLD = 0.20`

**Option A:** Lower threshold  
```javascript
CLOSURE_ENTRY_YAW_THRESHOLD = 0.15  // or 0.10
```
- **Pro:** Simple, direct
- **Con:** Might block slow head turns (yaw ≈ 0.05–0.10)

**Recommended:** Set to 0.15 first, test with PAT-936.

### If squints (partial reopen) leak through:

**Current:** `MIN_REOPEN_RATIO = 0.75` (75%)

**Option A:** Raise floor  
```javascript
MIN_REOPEN_RATIO = 0.80  // or 0.85
```
- **Pro:** More stringent, catches partial closures
- **Con:** Might reject genuinely small-eyed users

**Risk:** Low-EAR population (low eye-opening baseline) — test on iPhone with low baseline.

---

## PAT-936 Test Template

Create `app/test/blink-state-machine.PAT-936-head-shake.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlinkStateMachine } from '../src/blink-state-machine.js';

const OPEN_EAR = 0.30;
const CLOSED_EAR = 0.12;

function frame(machine, opts) {
  return machine.process(opts);
}

// ─── PAT-936 RED TESTS: Real-world head-shake patterns from diagnostic collection ───

test('PAT-936: rapid head shake (motion=0.008) rejects all closure attempts', () => {
  const machine = new BlinkStateMachine();
  frame(machine, { timestampMs: 0, ear: OPEN_EAR });
  frame(machine, { timestampMs: 600, ear: OPEN_EAR });

  // Rapid shake (motion > threshold) with EAR dips: all should be rejected
  for (let t = 700; t <= 2000; t += 30) {
    const r = frame(machine, {
      timestampMs: t,
      ear: CLOSED_EAR,  // dips below close threshold
      motion: 0.008,    // rapid head shake
      yawProxy: 0.10    // some yaw but not primary
    });
    assert.notEqual(r.decision, 'closure_started',
      `Closure must not start during rapid shake at t=${t}`);
    assert.notEqual(r.decision, 'accepted_blink');
  }
  assert.equal(machine.blinkCount, 0, 'Rapid shake must count 0 blinks');
});

test('PAT-936: rapid yaw rotation (yaw=0.25) rejects closure entry', () => {
  const machine = new BlinkStateMachine();
  frame(machine, { timestampMs: 0, ear: OPEN_EAR });
  frame(machine, { timestampMs: 600, ear: OPEN_EAR });

  // High yaw (yaw > threshold) with EAR dips: should be rejected
  for (let t = 700; t <= 1500; t += 30) {
    const r = frame(machine, {
      timestampMs: t,
      ear: CLOSED_EAR,
      motion: 0.001,    // low motion
      yawProxy: 0.25    // high yaw rotation
    });
    assert.notEqual(r.decision, 'closure_started', 'Yaw gate must block entry');
  }
  assert.equal(machine.blinkCount, 0);
});

test('PAT-936: combined rapid motion+yaw blocks closure', () => {
  const machine = new BlinkStateMachine();
  frame(machine, { timestampMs: 0, ear: OPEN_EAR });
  frame(machine, { timestampMs: 600, ear: OPEN_EAR });

  // Both motion and yaw high
  for (let t = 700; t <= 1500; t += 25) {
    const r = frame(machine, {
      timestampMs: t,
      ear: CLOSED_EAR,
      motion: 0.006,    // high motion
      yawProxy: 0.22    // high yaw
    });
    assert.notEqual(r.decision, 'closure_started');
  }
  assert.equal(machine.blinkCount, 0);
});

test('PAT-936: slow motion (0.0003) allows genuine blinks', () => {
  const machine = new BlinkStateMachine();
  frame(machine, { timestampMs: 0, ear: OPEN_EAR });
  frame(machine, { timestampMs: 600, ear: OPEN_EAR });

  // Slow head movement (motion < threshold) with genuine closure
  let r = frame(machine, {
    timestampMs: 700,
    ear: CLOSED_EAR,
    motion: 0.0003,    // slow movement
    yawProxy: 0.08
  });
  assert.equal(r.decision, 'closure_started', 'Slow movement must allow closure');

  // Reopen while still moving
  r = frame(machine, {
    timestampMs: 850,
    ear: OPEN_EAR,
    motion: 0.0003,
    yawProxy: 0.08
  });
  assert.equal(r.decision, 'accepted_blink', 'Genuine blink with slow movement must count');
  assert.equal(machine.blinkCount, 1);
});

test('PAT-936: genuine blink during rapid shake (closure before motion spike)', () => {
  const machine = new BlinkStateMachine();
  frame(machine, { timestampMs: 0, ear: OPEN_EAR });
  frame(machine, { timestampMs: 600, ear: OPEN_EAR });

  // Closure starts stable
  let r = frame(machine, { timestampMs: 700, ear: CLOSED_EAR, motion: 0.0001, yawProxy: 0.02 });
  assert.equal(r.decision, 'closure_started');

  // Motion spikes mid-closure, but reopen still works
  frame(machine, { timestampMs: 750, ear: CLOSED_EAR, motion: 0.010, yawProxy: 0.30 });

  r = frame(machine, { timestampMs: 850, ear: OPEN_EAR, motion: 0.010, yawProxy: 0.30 });
  assert.equal(r.decision, 'accepted_blink',
    'Genuine blink started stable must complete even if motion spikes');
  assert.equal(machine.blinkCount, 1);
});
```

---

## Success Criteria Checklist

- [ ] Real-world diagnostic data collected on all 3 platforms (Mac, iPhone, Android)
- [ ] Root cause identified from RED traces (which gate, which threshold)
- [ ] Threshold adjustment implemented (1–2 line code change)
- [ ] PAT-936 tests pass (new test fixtures for found patterns)
- [ ] All 35 existing tests still pass
- [ ] Physical validation re-run on all platforms:
  - [ ] Zero false blinks during head shakes
  - [ ] Genuine blinks still detected reliably
  - [ ] No degradation compared to baseline
- [ ] Deployed to Vercel production alias

---

## Timeline

**Phase 1 (Manual Testing):** TBD (requires device access)  
**Phase 2 (Local Analysis):** Same-day once data is collected  
**Phase 3 (Implementation & Deploy):** 1–2 hours after Phase 2  
**Phase 4 (Verification):** TBD (requires re-testing on devices)

---

## References

- **PAT-925:** https://[internal-link] (head-shake gate implementation)
- **PAT-935:** https://[internal-link] (diagnostic instrumentation)
- **Blink State Machine:** `app/src/blink-state-machine.js`
- **Test Suite:** `app/test/blink-state-machine.test.js` (35 tests, all passing)
- **Vercel Deployment:** https://app-zeta-six-65.vercel.app

---

**Owner:** Claude Haiku 4.5  
**Last Updated:** 2026-09-17  
**Status:** Awaiting diagnostic data collection
