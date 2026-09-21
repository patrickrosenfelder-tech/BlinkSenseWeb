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
// PAT-925 Fix 3: Reopen must reach >= 72% of warmup baseline; EWMA adapts only from
// frames >= 80% of initial baseline so squinting-while-stable cannot erode thresholds.
const MIN_REOPEN_RATIO = 0.72;   // belt-and-suspenders floor on the acceptance path (aligned with CLOSE_RATIO)
// Once adaptation has inverted the warmup floor, retain a scalar lower bound
// that rejects the existing partial-squeeze trace (EAR=0.21) while allowing
// the trace-derived post-drift reopens (EAR=0.224+).
const POST_DRIFT_MIN_REOPEN_EAR = 0.22;
const MIN_ADAPT_EAR_RATIO = 0.80; // EWMA baseline only updates from 'open' frames above this
// A genuine closure must achieve sufficient depth (min EAR <= 65% of open baseline),
// rejecting shallow threshold oscillations/flutter (e.g. EAR 0.215/0.217 at baseline 0.30).
const MAX_CLOSURE_DEPTH_RATIO = 0.65;

export class BlinkStateMachine {
  constructor({ defaultOpenEar = DEFAULT_OPEN_EAR } = {}) {
    this.defaultOpenEar = defaultOpenEar;
    this.openBaseline = 0.0;
    this.initialBaseline = 0.0;  // PAT-925: set once at warmup; never reset; used as reopen floor
    this.state = 'open';
    this.closedAt = null;
    this.minClosedEar = Infinity; // Track closure trough depth
    this.closureEntryBaseline = null; // Baseline captured at closure entry
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
    this.minClosedEar = Infinity;
    this.closureEntryBaseline = null;
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

  // PAT-935: every accepted/rejected candidate event carries this privacy-safe
  // scalar diagnostic context (timestamps/EAR/motion/yaw/thresholds/state) —
  // never frames or landmark coordinates.
  buildDiagnosticEvent(reason, state, { timestampMs, ear, motion, yawProxy, extra = {} }) {
    const closureDepthRatio = this.openBaseline > 0 ? ear / this.openBaseline : 0;
    return {
      timestampMs,
      ear,
      motion,
      yawProxy,
      closeThreshold: this.closeThreshold,
      reopenThreshold: this.reopenThreshold,
      state,
      stable: this.isLandmarkStable(),
      entryStable: this.isClosureEntryStable(),
      initialBaseline: this.initialBaseline,
      openBaseline: this.openBaseline,
      closureDepthRatio,
      reason,
      ...extra,
    };
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
      const durationMs = timestampMs - this.closedAt;
      const event = this.buildDiagnosticEvent('closure_expired', this.state, { timestampMs, ear, motion, yawProxy, extra: { durationMs } });
      this.record(this.rejectedEvents, event);
      this.state = 'open';
      this.closedAt = null;
      this.minClosedEar = Infinity;
      this.closureEntryBaseline = null;
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
        const event = this.buildDiagnosticEvent('closure_entry_unstable', this.state, { timestampMs, ear, motion, yawProxy });
        this.record(this.rejectedEvents, event);
        return { blinked: false, decision: 'rejected_unstable' };
      }
      // PAT-925 Fix 1: Compare close-to-close (lastClosureStartedAt) instead of
      // reopen-to-close (lastAcceptedAt). A deliberate double blink has ~200ms between
      // closes but only ~50ms from first reopen to second close — the old gate blocked it.
      if (timestampMs - this.lastClosureStartedAt < REFRACTORY_MS) {
        const event = this.buildDiagnosticEvent('refractory_closure', this.state, { timestampMs, ear, motion, yawProxy });
        this.record(this.rejectedEvents, event);
        return { blinked: false, decision: 'rejected_refractory' };
      }
      this.state = 'closed';
      this.closedAt = timestampMs;
      this.lastClosureStartedAt = timestampMs; // PAT-925: anchor for next refractory check
      this.minClosedEar = ear;
      this.closureEntryBaseline = this.openBaseline;
      return { blinked: false, decision: 'closure_started' };
    }

    if (this.state === 'closed') {
      if (ear < this.minClosedEar) this.minClosedEar = ear;
    }

    if (this.state === 'closed' && ear > currentCloseThreshold) {
      const durationMs = timestampMs - this.closedAt;
      const minClosedEar = this.minClosedEar;
      const closureEntryBaseline = this.closureEntryBaseline ?? this.openBaseline;
      this.state = 'open';
      this.closedAt = null;
      this.minClosedEar = Infinity;
      this.closureEntryBaseline = null;
      if (durationMs < MIN_CLOSURE_MS) {
        const event = this.buildDiagnosticEvent('closure_too_short', this.state, { timestampMs, ear, motion, yawProxy, extra: { durationMs } });
        this.record(this.rejectedEvents, event);
        return { blinked: false, decision: 'rejected_short_closure' };
      }
      // Closure depth gate: rejects shallow threshold oscillations/flutter that never reached true closure depth.
      // Evaluated against closureEntryBaseline captured at closure start, so reopen adaptation cannot shift the verdict.
      if (minClosedEar > MAX_CLOSURE_DEPTH_RATIO * closureEntryBaseline) {
        const event = this.buildDiagnosticEvent('shallow_closure', this.state, { timestampMs, ear, motion, yawProxy, extra: { durationMs, minClosedEar, closureEntryBaseline } });
        this.record(this.rejectedEvents, event);
        return { blinked: false, decision: 'rejected_shallow_closure' };
      }
      // PAT-1032: after legitimate adaptation, the adaptive threshold is the
      // authoritative floor, but the absolute partial-squeeze floor remains
      // active. This handles the threshold inversion without turning the
      // existing shallow reopen (0.21) into a blink.
      const adaptiveFloorHasInverted = currentReopenThreshold < MIN_REOPEN_RATIO * this.initialBaseline;
      const belowReopenFloor = adaptiveFloorHasInverted &&
        ear < POST_DRIFT_MIN_REOPEN_EAR;
      if (belowReopenFloor) {
        const event = this.buildDiagnosticEvent('partial_reopen', this.state, { timestampMs, ear, motion, yawProxy, extra: { durationMs } });
        this.record(this.rejectedEvents, event);
        return { blinked: false, decision: 'rejected_partial_reopen' };
      }
      this.blinkCount++;
      this.lastAcceptedAt = timestampMs;
      const event = this.buildDiagnosticEvent('accepted_blink', this.state, { timestampMs, ear, motion, yawProxy, extra: { durationMs } });
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
