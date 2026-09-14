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
const STABILITY_THRESHOLD_MOTION = 0.00005; // Motion above this indicates instability
const STABILITY_THRESHOLD_YAW = 0.05; // Yaw above this indicates instability
const STABILITY_WINDOW_MS = 150; // Window for measuring stability

export class BlinkStateMachine {
  constructor({ defaultOpenEar = DEFAULT_OPEN_EAR } = {}) {
    this.defaultOpenEar = defaultOpenEar;
    this.openBaseline = 0.0;
    this.state = 'open';
    this.closedAt = null;
    this.lastAcceptedAt = -Infinity;
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
    // lastFrameIntervalMs is intentionally preserved: device FPS does not change on tracking reset.
  }

  isLandmarkStable() {
    // Landmarks are stable if recent frames show consistently low motion and low yaw
    if (this.stabilityFrames.length === 0) return true; // Assume stable if no data yet

    const now = this.stabilityFrames[this.stabilityFrames.length - 1].timestampMs;
    const recentWindow = this.stabilityFrames.filter(f => (now - f.timestampMs) < STABILITY_WINDOW_MS);

    // If we don't have enough recent frames, check just the last few frames
    const framesToCheck = recentWindow.length >= 2 ? recentWindow : this.stabilityFrames.slice(-3);
    if (framesToCheck.length === 0) return true;

    // Check if any recent frame shows instability
    for (const frame of framesToCheck) {
      if (Math.abs(frame.yawProxy) > STABILITY_THRESHOLD_YAW || frame.motion > STABILITY_THRESHOLD_MOTION) {
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
      this.warmupUntil = timestampMs + 500;
    }

    if (this.warmupUntil !== null) {
      if (timestampMs < this.warmupUntil) {
        if (ear > this.openBaseline) {
          this.openBaseline = ear;
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

    // Adapt only from confidently open frames. Slow EWMA prevents a blink or
    // startup closed eye from poisoning the per-session baseline.
    if (isOpen && stable) this.openBaseline = this.openBaseline * 0.95 + ear * 0.05;

    if (this.state === 'open' && isClosed) {
      if (timestampMs - this.lastAcceptedAt < REFRACTORY_MS) {
        this.record(this.rejectedEvents, { timestampMs, reason: 'refractory_closure' });
        return { blinked: false, decision: 'rejected_refractory' };
      }
      this.state = 'closed';
      this.closedAt = timestampMs;
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
      closeThreshold: this.closeThreshold,
      reopenThreshold: this.reopenThreshold,
      acceptedEvents: [...this.acceptedEvents],
      rejectedEvents: [...this.rejectedEvents],
      landmarkStable: this.isLandmarkStable(),
      stabilityFrameCount: this.stabilityFrames.length,
    };
  }
}
