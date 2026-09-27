import { BlinkDetector } from './blink-detector.js';
import { computeActiveDurationMs } from './bpm-math.js';

/**
 * Wraps camera acquisition + the on-device blink detector behind a small
 * start/stop lifecycle for the assessment flow. Nothing here ever leaves the
 * device: only a running blink count and elapsed active-tracking time are
 * read back out via stop().
 */
export class BlinkTracker {
  constructor() {
    this.detector = new BlinkDetector({ onBlink: () => { this.blinkCount += 1; } });
    this.blinkCount = 0;
    this.stream = null;
    this.video = null;
    this.modelReady = false;
    this.running = false;
    this.rafId = null;
    this.startedAtMs = null;
    this.accumulatedPauseMs = 0;
    this.hiddenSinceMs = null;
    this.onVisibilityChange = () => {
      if (!this.running) return;
      if (document.hidden) {
        this.hiddenSinceMs = performance.now();
      } else if (this.hiddenSinceMs !== null) {
        this.accumulatedPauseMs += performance.now() - this.hiddenSinceMs;
        this.hiddenSinceMs = null;
      }
    };
  }

  async enableCamera(videoEl) {
    this.video = videoEl;
    if (!this.modelReady) {
      await this.detector.load();
      this.modelReady = true;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
    videoEl.srcObject = this.stream;
    await videoEl.play();
  }

  start() {
    if (this.running || !this.stream) return;
    this.running = true;
    this.detector.resetSession();
    this.blinkCount = 0;
    this.startedAtMs = performance.now();
    this.accumulatedPauseMs = 0;
    this.hiddenSinceMs = document.hidden ? this.startedAtMs : null;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    const tick = (timestampMs) => {
      this.rafId = requestAnimationFrame(tick);
      if (!this.video || !this.video.videoWidth || document.hidden) return;
      this.detector.detectFrame(this.video, timestampMs);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * Real tracking-health scalars, independent of elapsed time: how many
   * frames the detector actually ran face-landmark detection on, and how many
   * of those found a face. Used to decide whether blink results are usable
   * (see computeBlinkAvailability) rather than trusting elapsed time alone.
   */
  frameHealth() {
    return {
      processedFrameCount: this.detector.decodedFrames,
      faceDetectedFrameCount: this.detector.processedFrames,
    };
  }

  /** Stops the detection loop and returns the session's blink stats so far. */
  stop() {
    if (!this.running) {
      return { blinkCount: this.blinkCount, activeDurationMs: 0, ...this.frameHealth() };
    }
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = null;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    const now = performance.now();
    const activeDurationMs = this.startedAtMs
      ? computeActiveDurationMs(this.startedAtMs, now, this.accumulatedPauseMs, this.hiddenSinceMs)
      : 0;
    return { blinkCount: this.blinkCount, activeDurationMs, ...this.frameHealth() };
  }

  disableCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
  }

  dispose() {
    this.stop();
    this.disableCamera();
    this.detector.dispose();
  }
}
