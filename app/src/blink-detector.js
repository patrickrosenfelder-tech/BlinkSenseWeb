import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm';

// Six-point eye contours (dlib-style EAR) mapped onto MediaPipe's 468-point face mesh.
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
const LEFT_EYE = [362, 385, 387, 263, 373, 380];

const EAR_THRESHOLD = 0.21;
const CONSEC_FRAMES = 2;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAspectRatio(landmarks, indices, width, height) {
  const p = indices.map((i) => ({ x: landmarks[i].x * width, y: landmarks[i].y * height }));
  const vertical = dist(p[1], p[5]) + dist(p[2], p[4]);
  const horizontal = dist(p[0], p[3]) * 2;
  return horizontal === 0 ? 0 : vertical / horizontal;
}

export class BlinkDetector {
  constructor({ onBlink } = {}) {
    this.onBlink = onBlink;
    this.landmarker = null;
    this.consecLow = 0;
    this.lastVideoTime = -1;
  }

  async load() {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    } catch (err) {
      // GPU delegate isn't available on every browser/GPU combo — fall back to CPU.
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
      });
    }
  }

  dispose() {
    this.landmarker?.close();
    this.landmarker = null;
    this.consecLow = 0;
    this.lastVideoTime = -1;
  }

  /** Runs face-landmark + EAR blink detection on the current video frame. Returns null if no new frame or no face. */
  detectFrame(video, timestampMs) {
    if (!this.landmarker || video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;

    const result = this.landmarker.detectForVideo(video, timestampMs);
    const landmarks = result.faceLandmarks?.[0];
    if (!landmarks) return { faceFound: false };

    const width = video.videoWidth;
    const height = video.videoHeight;
    const ear = (eyeAspectRatio(landmarks, RIGHT_EYE, width, height) + eyeAspectRatio(landmarks, LEFT_EYE, width, height)) / 2;

    let blinked = false;
    if (ear < EAR_THRESHOLD) {
      this.consecLow++;
    } else {
      if (this.consecLow >= CONSEC_FRAMES) {
        blinked = true;
        this.onBlink?.();
      }
      this.consecLow = 0;
    }

    return { faceFound: true, ear, blinked };
  }
}
