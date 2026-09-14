import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { BlinkStateMachine } from './blink-state-machine.js';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm';

// Six-point eye contours (dlib-style EAR) mapped onto MediaPipe's 468-point face mesh.
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
const LEFT_EYE = [362, 385, 387, 263, 373, 380];

function dist3D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function eyeAspectRatio3D(landmarks, indices, width, height) {
  const p = indices.map((i) => ({
    x: landmarks[i].x * width,
    y: landmarks[i].y * height,
    z: landmarks[i].z * width,
  }));
  const vertical = dist3D(p[1], p[5]) + dist3D(p[2], p[4]);
  const horizontal = dist3D(p[0], p[3]) * 2;
  return horizontal === 0 ? 0 : vertical / horizontal;
}

function eyeAspectRatio(landmarks, indices, width, height) {
  return eyeAspectRatio3D(landmarks, indices, width, height);
}

export class BlinkDetector {
  constructor({ onBlink } = {}) {
    this.onBlink = onBlink;
    this.landmarker = null;
    this.machine = new BlinkStateMachine();
    this.lastVideoTime = -1;
    this.processedFrames = 0;
    this.decodedFrames = 0;
    this.startedAt = null;
    this.longestFrameGapMs = 0;
    this.freezeCount = 0;
    this.isRecovering = false;
    this.timeline = [];
    this.callbackCount = 0;
    this.lastMachineState = 'open';
    this.lastLandmarkTimestampMs = null;
    this.detectorClosedAt = null;
  }

  async load() {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
    } catch (err) {
      // GPU delegate isn't available on every browser/GPU combo — fall back to CPU.
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
    }
  }

  dispose() {
    this.landmarker?.close();
    this.landmarker = null;
    this.machine = new BlinkStateMachine();
    this.lastVideoTime = -1;
    this.processedFrames = 0;
    this.decodedFrames = 0;
    this.startedAt = null;
    this.longestFrameGapMs = 0;
    this.freezeCount = 0;
    this.isRecovering = false;
    this.timeline = [];
    this.callbackCount = 0;
    this.lastMachineState = 'open';
    this.lastLandmarkTimestampMs = null;
    this.detectorClosedAt = null;
  }

  resetSession() {
    this.machine = new BlinkStateMachine();
    this.lastVideoTime = -1;
    this.processedFrames = 0;
    this.decodedFrames = 0;
    this.startedAt = null;
    this.longestFrameGapMs = 0;
    this.freezeCount = 0;
    this.isRecovering = false;
    this.timeline = [];
    this.callbackCount = 0;
    this.lastMachineState = 'open';
    this.lastLandmarkTimestampMs = null;
    this.detectorClosedAt = null;
  }

  addTimelineEvent(event) {
    this.timeline.push(event);
    if (this.timeline.length > 5000) {
      this.timeline.shift();
    }
  }

  logCadence(timestampMs, invokeDuration = 0, ear = null) {
    const elapsedSeconds = this.startedAt === null ? 0 : Math.max(0.001, (timestampMs - this.startedAt) / 1000);
    const processedFps = elapsedSeconds > 0 ? this.processedFrames / elapsedSeconds : 0;

    this.addTimelineEvent({
      type: 'cadence',
      timestampMs,
      callbackCount: this.callbackCount,
      decodedFrames: this.decodedFrames,
      processedFrames: this.processedFrames,
      processedFps,
      invokeDuration,
      ear,
      stateMachineState: this.machine.state,
      warmupUntil: this.machine.warmupUntil
    });
  }

  /** Runs face-landmark + EAR blink detection on the current video frame. Returns null if no new frame or no face. */
  detectFrame(video, timestampMs) {
    if (!this.landmarker) return null;

    this.callbackCount++;

    if (this.lastTimestampMs) {
      const gap = timestampMs - this.lastTimestampMs;
      if (gap > this.longestFrameGapMs) {
        this.longestFrameGapMs = gap;
      }

      if (gap > 2000 && !this.isRecovering) {
        this.freezeCount++;
        this.isRecovering = true;
        this.addTimelineEvent({ type: 'stall_start', timestampMs: this.lastTimestampMs, gap });
        console.warn(`Watchdog: Media pipeline freeze detected (${Math.round(gap)}ms gap). Attempting recovery.`);
        if (video && video.paused) {
           video.play().catch(() => {});
        }
        this.machine.resetTracking();
      } else if (gap <= 2000 && this.isRecovering) {
        this.addTimelineEvent({ type: 'stall_end', timestampMs });
        this.isRecovering = false;
      }
    }

    if (video.currentTime === this.lastVideoTime) {
      if (this.callbackCount % 60 === 0) this.logCadence(timestampMs);
      return null;
    }
    this.lastVideoTime = video.currentTime;
    this.startedAt ??= timestampMs;
    this.decodedFrames++;

    let result;
    const invokeStart = performance.now();
    try {
      result = this.landmarker.detectForVideo(video, timestampMs);
    } catch (err) {
      this.addTimelineEvent({ type: 'mediapipe_exception', timestampMs, error: String(err) });
      console.warn("Watchdog: MediaPipe detectForVideo error", err);
      if (this.callbackCount % 60 === 0) this.logCadence(timestampMs);
      return null;
    }
    const invokeDuration = performance.now() - invokeStart;

    const landmarks = result.faceLandmarks?.[0];
    if (!landmarks) {
      this.machine.resetTracking();
      this.lastTimestampMs = timestampMs;
      if (this.callbackCount % 60 === 0) this.logCadence(timestampMs, invokeDuration);
      return { faceFound: false };
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    const ear = (eyeAspectRatio(landmarks, RIGHT_EYE, width, height) + eyeAspectRatio(landmarks, LEFT_EYE, width, height)) / 2;

    this.lastLandmarkTimestampMs = timestampMs;

    const matrix = result.facialTransformationMatrixes?.[0];
    let yawProxy = 0;
    if (matrix) {
      yawProxy = Math.max(0, 1.0 - matrix[10]);
    } else {
      const zDiff = Math.abs(landmarks[263].z - landmarks[33].z);
      const xDiff = Math.abs(landmarks[263].x - landmarks[33].x);
      yawProxy = xDiff > 0 ? (zDiff / xDiff) * 0.5 : 0;
    }

    const nose = landmarks[1];
    let motion = 0;
    if (this.lastNose && this.lastTimestampMs && timestampMs > this.lastTimestampMs) {
      const dx = nose.x - this.lastNose.x;
      const dy = nose.y - this.lastNose.y;
      const dt = timestampMs - this.lastTimestampMs;
      motion = Math.hypot(dx, dy) / dt;
    }
    this.lastNose = nose;
    this.lastTimestampMs = timestampMs;

    this.processedFrames++;
    const decision = this.machine.process({ timestampMs, ear, yawProxy, motion });

    if (this.machine.state !== this.lastMachineState) {
      if (this.machine.state === 'closed') {
        this.addTimelineEvent({ type: 'state_closed', timestampMs, ear });
        this.detectorClosedAt = timestampMs;
      } else if (this.machine.state === 'open') {
        const closedDuration = this.detectorClosedAt ? timestampMs - this.detectorClosedAt : 0;
        this.addTimelineEvent({ type: 'state_open', timestampMs, ear, closedDuration });
        this.detectorClosedAt = null;
      }
      this.lastMachineState = this.machine.state;
    }

    if (decision.blinked) this.onBlink?.();

    if (this.callbackCount % 60 === 0) {
      this.logCadence(timestampMs, invokeDuration, ear);
    }

    return { faceFound: true, ear, blinked: decision.blinked, decision: decision.decision };
  }

  persistDiagnosticsLocally() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const diagnostics = this.getDiagnostics();
        window.localStorage.setItem('blinkDetectorDiagnostics', JSON.stringify({
          timestamp: Date.now(),
          diagnostics
        }));
      }
    } catch (err) {
      // Silently fail if localStorage is unavailable or quota exceeded
      console.warn('Failed to persist diagnostics:', err);
    }
  }

  static loadPersistedDiagnostics() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem('blinkDetectorDiagnostics');
        if (stored) {
          return JSON.parse(stored);
        }
      }
    } catch (err) {
      console.warn('Failed to load persisted diagnostics:', err);
    }
    return null;
  }

  getDiagnostics(video) {
    const elapsedSeconds = this.startedAt === null ? 0 : Math.max(0.001, (performance.now() - this.startedAt) / 1000);
    const track = video?.srcObject?.getVideoTracks?.()[0];
    const settings = track?.getSettings?.() || {};
    const diag = {
      privacy: 'Scalar diagnostics only; no video frames or landmarks are stored.',
      camera: { width: settings.width ?? video?.videoWidth ?? null, height: settings.height ?? video?.videoHeight ?? null, frameRate: settings.frameRate ?? null, facingMode: settings.facingMode ?? null },
      decodedFps: elapsedSeconds === 0 ? 0.0 : this.decodedFrames / elapsedSeconds,
      processedFps: elapsedSeconds === 0 ? 0.0 : this.processedFrames / elapsedSeconds,
      longestFrameGapMs: this.longestFrameGapMs,
      freezeCount: this.freezeCount,
      lastLandmarkTimestampMs: this.lastLandmarkTimestampMs,
      timeline: [...this.timeline],
      ...this.machine.getDiagnostics(),
    };
    return diag;
  }
}
