// Pure, time-based blink state machine. It deliberately stores only scalar EAR
// values and timestamped decisions; no frames or landmark coordinates persist.
const DEFAULT_OPEN_EAR = 0.28; // conservative safe default pending per-session calibration
const CLOSE_RATIO = 0.72;
const REOPEN_RATIO = 0.82;
const MIN_CLOSURE_MS = 80;
const REFRACTORY_MS = 180;
const MAX_EVENTS = 200;

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

  process({ timestampMs, ear }) {
    if (!Number.isFinite(timestampMs) || !Number.isFinite(ear)) return { blinked: false, decision: 'rejected_invalid_measurement' };

    if (this.openBaseline === 0.0) {
      this.openBaseline = ear;
    }

    const isClosed = ear <= this.closeThreshold;
    const isOpen = ear >= this.reopenThreshold;

    // Adapt only from confidently open frames. Slow EWMA prevents a blink or
    // startup closed eye from poisoning the per-session baseline.
    if (isOpen) this.openBaseline = this.openBaseline * 0.95 + ear * 0.05;

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
    };
  }
}
