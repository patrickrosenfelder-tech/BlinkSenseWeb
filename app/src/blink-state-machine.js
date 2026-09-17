// Pure, time-based blink state machine. It deliberately stores only scalar EAR
// values and timestamped decisions; no frames or landmark coordinates persist.
const DEFAULT_OPEN_EAR = 0.28; // conservative safe default pending per-session calibration
const CLOSE_RATIO = 0.72;
const REOPEN_RATIO = 0.82;
const MIN_CLOSURE_MS = 80;
// Adaptive stale-closure expiry: base threshold for >=30 FPS; scales proportionally
// for low-FPS sensors (e.g. 3.67 FPS Android) where a sampled blink can legitimately
// span 635–1270ms because the open event is detected 2–4 frame-intervals later.
const BASE_MAX_CLOSURE_MS = 600;
const STALE_FRAMES_THRESHOLD = 8; // Number of frame-intervals that constitute a stale closure
const REFRACTORY_MS = 180;
const MAX_EVENTS = 200;
const STABILITY_THRESHOLD_MOTION = 0.00005; // Motion above this indicates instability (for baseline adapt)
const STABILITY_THRESHOLD_YAW = 0.05; // Yaw above this indicates instability (for baseline adapt)
const STABILITY_WINDOW_MS = 150; // Window for measuring stability
// PAT-925 Fix 2: Closure ENTRY gate. Higher than STABILITY_THRESHOLD_* so that slow deliberate
// head movement still allows blinks; only fast shaking (>0.001 velocity) blocks new closures.
const CLOSURE_ENTRY_MOTION_THRESHOLD = 0.001; // strict > : motion=0.001 is allowed, 0.005 is not
const CLOSURE_ENTRY_YAW_THRESHOLD = 0.20;     // strict > : yaw=0.20 is allowed, 0.25 is not
// PAT-925 Fix 3: Reopen must reach >= 75% of warmup baseline; EWMA adapts only from
// frames >= 80% of initial baseline so squinting-while-stable cannot erode thresholds.
const MIN_REOPEN_RATIO = 0.75;   // belt-and-suspenders floor on the acceptance path
const MIN_ADAPT_EAR_RATIO = 0.80; // EWMA baseline only updates from 'open' frames above this

export class BlinkStateMachine {
  constructor({ defaultOpenEar = DEFAULT_OPEN_EAR } = {}) {
    this.defaultOpenEar = defaultOpenEar;
    this.openBaseline = 0.0;
    this.initialBaseline = 0.0;  // PAT-925: set once at warmup; never reset; used as reopen floor
    this.state = 'open';
    this.closedAt = null;
    this.lastClosureStartedAt = -Infinity; // PAT-925 Fix 1: refractory compares close-to-close
    this.lastAcceptedAt = -Infinity;       // kept for diagnostics/observability
    this.blinkCount = 0;
    this.acceptedEvents = [];
    this.rejectedEvents = [];
    this.warmupUntil = null;
    this.stabilityFrames = []; // Track recent motion/yaw for stability gating
    this.lastProcessedTimestampMs = null; // For adaptive expiry based on observed FPS
    this.lastFrameIntervalMs = 0;         // Most recent inter-frame gap (ms)
  }

  resetTracking() {
    this.openBaseline = 0.0;
    this.state = 'open';
    this.closedAt = null;
    this.warmupUntil = null;
    this.stabilityFrames = [];
    this.lastProcessedTimestampMs = null;
    this.lastClosureStartedAt = -Infinity; // reset so next blink can start immediately
    // lastFrameIntervalMs preserved: device FPS does not change on tracking reset.
    // initialBaseline NOT reset: it captures session-level warmup calibration.
  }

  isLandmarkStable() {
    // Landmarks are stable if recent frames show consistently low motion and low yaw.
    // Used for: baseline EWMA adaptation guard. Uses tight thresholds.
    if (this.stabilityFrames.length === 0) return true;

    const now = this.stabilityFrames[this.stabilityFrames.length - 1].timestampMs;
    const recentWindow = this.stabilityFrames.filter(f => (now - f.timestampMs) < STABILITY_WINDOW_MS);
    const framesToCheck = recentWindow.length >= 2 ? recentWindow : this.stabilityFrames.slice(-3);
    if (framesToCheck.length === 0) return true;

    for (const frame of framesToCheck) {
      if (Math.abs(frame.yawProxy) > STABILITY_THRESHOLD_YAW || frame.motion > STABILITY_THRESHOLD_MOTION) {
        return false;
      }
    }
    return true;
  }

  // PAT-925 Fix 2: Closure ENTRY stability gate. Uses higher thresholds than isLandmarkStable()
  // so slow deliberate head movement allows blinks but fast shaking blocks new closure entry.
  // Critically: this is NEVER called on the reopen path — started closures always complete.
  isClosureEntryStable() {
    if (this.stabilityFrames.length === 0) return true;
    const now = this.stabilityFrames[this.stabilityFrames.length - 1].timestampMs;
    const recentWindow = this.stabilityFrames.filter(f => (now - f.timestampMs) < STABILITY_WINDOW_MS);
    const framesToCheck = recentWindow.length >= 2 ? recentWindow : this.stabilityFrames.slice(-3);
    if (framesToCheck.length === 0) return true;
    for (const frame of framesToCheck) {
      if (frame.motion > CLOSURE_ENTRY_MOTION_THRESHOLD || Math.abs(frame.yawProxy) > CLOSURE_ENTRY_YAW_THRESHOLD) {
        return false;
      }
    }
    return true;
  }

  static eyeAspectRatio(points) {
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const vertical = distance(points[1], points[5]) + distance(points[2], points[4]);
    const horizontal = distance(points[0], points[3]) * 2;
    return horizontal === 0 ? 0 : vertical / horizontal;
  }

  get closeThreshold() { return this.openBaseline * CLOSE_RATIO; }
  get reopenThreshold() { return this.openBaseline * REOPEN_RATIO; }

  record(list, event) {
    list.push(event);
    if (list.length > MAX_EVENTS) list.shift();
  }

  process({ timestampMs, ear, yawProxy = 0, motion = 0 }) {
    if (!Number.isFinite(timestampMs) || !Number.isFinite(ear)) return { blinked: false, decision: 'rejected_invalid_measurement' };

    // Track stability frames for explicit landmark-stability gating
    this.stabilityFrames.push({ timestampMs, yawProxy, motion });
    if (this.stabilityFrames.length > 100) this.stabilityFrames.shift();

    if (this.openBaseline === 0.0) {
      this.openBaseline = ear;
      this.initialBaseline = ear; // PAT-925: capture warmup-level baseline; never reset
      this.warmupUntil = timestampMs + 500;
    }

    if (this.warmupUntil !== null) {
      if (timestampMs < this.warmupUntil) {
        if (ear > this.openBaseline) {
          this.openBaseline = ear;
          this.initialBaseline = ear; // track peak EAR seen during warmup
        }
        return { blinked: false, decision: 'warmup' };
      } else {
        this.warmupUntil = null;
      }
    }

    // Track inter-frame interval for adaptive stale-closure expiry.
    // Freeze gaps (>2000ms) are excluded so watchdog resets don't inflate the estimate.
    if (this.lastProcessedTimestampMs !== null) {
      const interval = timestampMs - this.lastProcessedTimestampMs;
      if (interval > 0 && interval < 2000) this.lastFrameIntervalMs = interval;
    }
    this.lastProcessedTimestampMs = timestampMs;

    // Expiry is evaluated BEFORE the stability gate so that sustained instability
    // (e.g. head-shaking while eye appears closed) cannot permanently defer the reset.
    // The threshold scales with observed FPS: at 3 FPS (333ms interval) effectiveMax=2664ms;
    // at 30 FPS (33ms interval) effectiveMax=600ms — preserving prior behaviour.
    const effectiveMaxClosureMs = Math.max(BASE_MAX_CLOSURE_MS, this.lastFrameIntervalMs * STALE_FRAMES_THRESHOLD);
    if (this.state === 'closed' && (timestampMs - this.closedAt) > effectiveMaxClosureMs) {
      this.record(this.rejectedEvents, { timestampMs, reason: 'closure_expired', durationMs: timestampMs - this.closedAt });
      this.state = 'open';
      this.closedAt = null;
      return { blinked: false, decision: 'rejected_closure_expired' };
    }

    const stable = this.isLandmarkStable();

    const currentCloseThreshold = this.openBaseline * CLOSE_RATIO;
    const currentReopenThreshold = this.openBaseline * REOPEN_RATIO;

    const isClosed = ear <= currentCloseThreshold;
    const isOpen = ear >= currentReopenThreshold;

    // PAT-925 Fix 3: Adapt only from confidently open frames that are also above the
    // MIN_ADAPT_EAR_RATIO floor relative to warmup baseline. This prevents stable
    // squinting frames from eroding openBaseline and collapsing close/reopen thresholds.
    if (isOpen && stable && (this.initialBaseline === 0 || ear >= MIN_ADAPT_EAR_RATIO * this.initialBaseline)) {
      this.openBaseline = this.openBaseline * 0.95 + ear * 0.05;
    }

    if (this.state === 'open' && isClosed) {
      // PAT-925 Fix 2: Gate new closure entry on high-velocity motion. The reopen path
      // is NEVER gated — a closure already in progress always completes.
      if (!this.isClosureEntryStable()) {
        return { blinked: false, decision: 'rejected_unstable' };
      }
      // PAT-925 Fix 1: Compare close-to-close (lastClosureStartedAt) instead of
      // reopen-to-close (lastAcceptedAt). A deliberate double blink has ~200ms between
      // closes but only ~50ms from first reopen to second close — the old gate blocked it.
      if (timestampMs - this.lastClosureStartedAt < REFRACTORY_MS) {
        this.record(this.rejectedEvents, { timestampMs, reason: 'refractory_closure' });
        return { blinked: false, decision: 'rejected_refractory' };
      }
      this.state = 'closed';
      this.closedAt = timestampMs;
      this.lastClosureStartedAt = timestampMs; // PAT-925: anchor for next refractory check
      return { blinked: false, decision: 'closure_started' };
    }

    if (this.state === 'closed' && isOpen) {
      const durationMs = timestampMs - this.closedAt;
      this.state = 'open';
      this.closedAt = null;
      if (durationMs < MIN_CLOSURE_MS) {
        this.record(this.rejectedEvents, { timestampMs, reason: 'closure_too_short', durationMs });
        return { blinked: false, decision: 'rejected_short_closure' };
      }
      // PAT-925 Fix 3: belt-and-suspenders reopen floor. Requires EAR at reopen to be
      // at least MIN_REOPEN_RATIO of the session's warmup baseline. Partial squeezes where
      // the eye never returns to a genuinely open position are rejected regardless of
      // how far the adapted openBaseline has drifted.
      if (this.initialBaseline > 0 && ear < MIN_REOPEN_RATIO * this.initialBaseline) {
        this.record(this.rejectedEvents, { timestampMs, reason: 'partial_reopen', durationMs, ear });
        return { blinked: false, decision: 'rejected_partial_reopen' };
      }
      this.blinkCount++;
      this.lastAcceptedAt = timestampMs;
      const event = { timestampMs, durationMs, ear: Number(ear.toFixed(4)) };
      this.record(this.acceptedEvents, event);
      return { blinked: true, decision: 'accepted_blink', event };
    }

    return { blinked: false, decision: this.state === 'closed' ? 'closure_in_progress' : 'open' };
  }

  getDiagnostics() {
    return {
      blinkCount: this.blinkCount,
      state: this.state,
      openBaseline: this.openBaseline,
      initialBaseline: this.initialBaseline,
      closeThreshold: this.closeThreshold,
      reopenThreshold: this.reopenThreshold,
      acceptedEvents: [...this.acceptedEvents],
      rejectedEvents: [...this.rejectedEvents],
      landmarkStable: this.isLandmarkStable(),
      stabilityFrameCount: this.stabilityFrames.length,
    };
  }
}
