import './style.css';
import { BlinkDetector } from './blink-detector.js';
import { saveSession, getAllSessions, clearSessions } from './db.js';

const els = {
  video: document.getElementById('preview'),
  cameraStatus: document.getElementById('camera-status'),
  cameraOverlayMsg: document.getElementById('camera-overlay-msg'),
  startBtn: document.getElementById('start-btn'),
  stopBtn: document.getElementById('stop-btn'),
  retryBtn: document.getElementById('retry-btn'),
  modelLoadMsg: document.getElementById('model-load-msg'),
  gaugeFill: document.getElementById('gauge-fill'),
  bpmValue: document.getElementById('bpm-value'),
  zoneBadge: document.getElementById('zone-badge'),
  statTimer: document.getElementById('stat-timer'),
  statBlinks: document.getElementById('stat-blinks'),
  statAlerts: document.getElementById('stat-alerts'),
  chips: Array.from(document.querySelectorAll('.chip')),
  wakeToggle: document.getElementById('wake-toggle'),
  historyChart: document.getElementById('history-chart'),
  historyList: document.getElementById('history-list'),
  historyEmpty: document.getElementById('history-empty'),
  clearHistoryBtn: document.getElementById('clear-history-btn'),
  toast: document.getElementById('toast'),
  toastTitle: document.getElementById('toast-title'),
  toastBody: document.getElementById('toast-body'),
};

const GAUGE_RADIUS = 60;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
const BPM_GAUGE_MAX = 30;
const BLINK_WINDOW_MS = 20000;
const ZONE = { CRITICAL: 'critical', LOW: 'low', HEALTHY: 'healthy' };
const CAMERA_RETRY_MS = 3000;

const detector = new BlinkDetector({ onBlink: handleBlink });

let stream = null;
let rafId = null;
let running = false;
let modelReady = false;
let category = 'Work';
let wakeLock = null;
let wakeLockWanted = false;
let reacquireTimer = null;
let cameraLost = false;

let sessionStart = null;
let blinkTimestamps = [];
let blinkCount = 0;
let alertCount = 0;
let currentZone = null;
let zoneTimeMs = { healthy: 0, low: 0, critical: 0 };
let lastZoneTickAt = null;
let timerInterval = null;

// ---------- UI helpers ----------

function showToast(title, body) {
  els.toastTitle.textContent = title;
  els.toastBody.textContent = body;
  els.toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('is-visible'), 4200);
}

function setCameraStatus(text, kind) {
  els.cameraStatus.textContent = text;
  els.cameraStatus.className = 'status-pill' + (kind ? ` is-${kind}` : '');
}

function setOverlayMessage(text) {
  els.cameraOverlayMsg.hidden = !text;
  els.cameraOverlayMsg.textContent = text || '';
}

// ---------- Model loading ----------

async function ensureModel() {
  if (modelReady) return true;
  els.modelLoadMsg.textContent = 'Loading blink-detection model…';
  els.retryBtn.hidden = true;
  try {
    await detector.load();
    modelReady = true;
    els.modelLoadMsg.textContent = 'Model ready.';
    return true;
  } catch (err) {
    console.error('Model load failed', err);
    modelReady = false;
    els.modelLoadMsg.textContent = 'Could not load the blink-detection model. Check your connection and try again.';
    els.retryBtn.hidden = false;
    return false;
  }
}

els.retryBtn.addEventListener('click', async () => {
  const ok = await ensureModel();
  if (ok) startMonitoring();
});

// ---------- Camera ----------

async function acquireCamera() {
  const constraints = { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  els.video.srcObject = stream;
  await els.video.play();
  stream.getVideoTracks()[0].addEventListener('ended', handleCameraLoss);
}

function releaseCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => {
      t.removeEventListener('ended', handleCameraLoss);
      t.stop();
    });
    stream = null;
  }
  els.video.srcObject = null;
}

function handleCameraLoss() {
  if (cameraLost || !running) return;
  cameraLost = true;
  stopLoop();
  setCameraStatus('Camera lost', 'error');
  setOverlayMessage('Camera in use by another app — waiting…');
  scheduleReacquire();
}

function scheduleReacquire() {
  clearTimeout(reacquireTimer);
  reacquireTimer = setTimeout(async () => {
    try {
      releaseCamera();
      await acquireCamera();
      cameraLost = false;
      setCameraStatus('Live', 'live');
      if (!document.hidden) {
        setOverlayMessage('');
        startLoop();
      } else {
        setOverlayMessage('Paused — window not visible');
      }
    } catch {
      scheduleReacquire();
    }
  }, CAMERA_RETRY_MS);
}

// ---------- Detection loop ----------

function handleBlink() {
  const now = performance.now();
  blinkTimestamps.push(now);
  blinkCount++;
  els.statBlinks.textContent = String(blinkCount);
}

function computeBpm() {
  const now = performance.now();
  blinkTimestamps = blinkTimestamps.filter((t) => now - t <= BLINK_WINDOW_MS);
  const elapsedSinceStart = sessionStart ? now - sessionStart : 0;
  const windowMs = Math.min(BLINK_WINDOW_MS, Math.max(elapsedSinceStart, 1000));
  return (blinkTimestamps.length / windowMs) * 60000;
}

function zoneForBpm(bpm) {
  if (bpm < 5) return ZONE.CRITICAL;
  if (bpm < 12) return ZONE.LOW;
  return ZONE.HEALTHY;
}

function updateGauge(bpm) {
  const clamped = Math.max(0, Math.min(bpm, BPM_GAUGE_MAX));
  els.gaugeFill.style.strokeDashoffset = String(GAUGE_CIRCUMFERENCE * (1 - clamped / BPM_GAUGE_MAX));
  els.bpmValue.textContent = sessionStart ? String(Math.round(bpm)) : '--';
}

function updateZone(bpm) {
  const zone = zoneForBpm(bpm);
  const now = performance.now();
  if (currentZone && lastZoneTickAt) {
    zoneTimeMs[currentZone] += now - lastZoneTickAt;
  }
  lastZoneTickAt = now;

  if (zone !== currentZone) {
    if (currentZone === ZONE.HEALTHY && (zone === ZONE.LOW || zone === ZONE.CRITICAL)) {
      alertCount++;
      els.statAlerts.textContent = String(alertCount);
    }
    currentZone = zone;
  }

  els.zoneBadge.className = `zone-badge zone-${zone}`;
  els.zoneBadge.textContent = zone === ZONE.HEALTHY ? 'Healthy' : zone === ZONE.LOW ? 'Low' : 'Critical';
  els.gaugeFill.style.stroke =
    zone === ZONE.HEALTHY ? 'var(--healthy)' : zone === ZONE.LOW ? 'var(--low)' : 'var(--critical)';
}

function tick(timestampMs) {
  rafId = requestAnimationFrame(tick);
  if (!els.video.videoWidth) return;
  detector.detectFrame(els.video, timestampMs);
  const bpm = computeBpm();
  updateGauge(bpm);
  updateZone(bpm);
}

function startLoop() {
  if (rafId) return;
  rafId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!sessionStart) return;
    const elapsed = Math.floor((performance.now() - sessionStart) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    els.statTimer.textContent = `${mm}:${ss}`;
  }, 500);
}

// ---------- Session lifecycle ----------

async function startMonitoring() {
  if (running) return;
  setCameraStatus('Starting…', 'warn');

  const modelOk = await ensureModel();
  if (!modelOk) {
    setCameraStatus('Model unavailable', 'error');
    return;
  }

  try {
    await acquireCamera();
  } catch (err) {
    console.error('Camera access failed', err);
    setCameraStatus('Camera denied', 'error');
    setOverlayMessage('Camera access was blocked. Allow camera permission in your browser and try again.');
    return;
  }

  running = true;
  cameraLost = false;
  sessionStart = performance.now();
  blinkTimestamps = [];
  blinkCount = 0;
  alertCount = 0;
  currentZone = null;
  zoneTimeMs = { healthy: 0, low: 0, critical: 0 };
  lastZoneTickAt = null;
  els.statBlinks.textContent = '0';
  els.statAlerts.textContent = '0';
  els.statTimer.textContent = '00:00';

  els.startBtn.hidden = true;
  els.stopBtn.hidden = false;
  setCameraStatus('Live', 'live');
  startTimer();

  if (document.hidden) {
    setOverlayMessage('Paused — window not visible');
  } else {
    setOverlayMessage('');
    startLoop();
    if (wakeLockWanted) requestWakeLock();
  }
}

async function stopMonitoring() {
  if (!running) return;
  running = false;
  stopLoop();
  clearInterval(timerInterval);
  clearTimeout(reacquireTimer);
  cameraLost = false;
  releaseCamera();
  releaseWakeLock();
  setCameraStatus('Not started');
  setOverlayMessage('');
  els.startBtn.hidden = false;
  els.stopBtn.hidden = true;

  if (sessionStart) {
    const durationMs = performance.now() - sessionStart;
    if (durationMs > 5000) {
      const totalZoneMs = zoneTimeMs.healthy + zoneTimeMs.low + zoneTimeMs.critical || 1;
      const avgBpm = blinkCount > 0 ? blinkCount / (durationMs / 60000) : 0;
      await saveSession({
        startedAt: Date.now() - durationMs,
        durationMs,
        category,
        avgBpm,
        blinkCount,
        alertCount,
        zoneStats: {
          healthy: zoneTimeMs.healthy / totalZoneMs,
          low: zoneTimeMs.low / totalZoneMs,
          critical: zoneTimeMs.critical / totalZoneMs,
        },
      });
      await renderHistory();
    }
    sessionStart = null;
  }
}

els.startBtn.addEventListener('click', startMonitoring);
els.stopBtn.addEventListener('click', stopMonitoring);

// ---------- Session chips ----------

els.chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    category = chip.dataset.category;
    els.chips.forEach((c) => {
      const active = c === chip;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-pressed', String(active));
    });
  });
});

// ---------- Docked Mode (Screen Wake Lock) ----------

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    showToast('Docked Mode unavailable', 'Screen Wake Lock is not supported in this browser.');
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch (err) {
    console.error('Wake lock request failed', err);
  }
}

function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

els.wakeToggle.addEventListener('click', async () => {
  wakeLockWanted = !wakeLockWanted;
  els.wakeToggle.setAttribute('aria-checked', String(wakeLockWanted));
  if (wakeLockWanted) {
    if (!document.hidden) await requestWakeLock();
  } else {
    releaseWakeLock();
  }
});

// ---------- Visibility handling ----------

document.addEventListener('visibilitychange', async () => {
  if (document.hidden) {
    stopLoop();
    if (running) setOverlayMessage('Paused — window not visible');
  } else {
    if (running && !cameraLost) {
      setOverlayMessage('');
      startLoop();
    }
    if (wakeLockWanted && !wakeLock) await requestWakeLock();
  }
});

// ---------- History ----------

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return mm > 0 ? `${mm}m ${ss}s` : `${ss}s`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function renderHistory() {
  const sessions = await getAllSessions();
  els.historyList.innerHTML = '';
  els.historyChart.innerHTML = '';

  if (sessions.length === 0) {
    els.historyEmpty.hidden = false;
    els.historyChart.innerHTML = '<span class="history-chart-empty">No sessions yet</span>';
    return;
  }
  els.historyEmpty.hidden = true;

  const recent = sessions.slice(0, 20).reverse();
  const maxBpm = Math.max(...recent.map((s) => s.avgBpm), BPM_GAUGE_MAX / 2);
  recent.forEach((s) => {
    const bar = document.createElement('div');
    bar.className = 'history-bar';
    bar.style.height = `${Math.max(4, Math.min(100, (s.avgBpm / maxBpm) * 100))}%`;
    bar.style.background = s.avgBpm < 5 ? 'var(--critical)' : s.avgBpm < 12 ? 'var(--low)' : 'var(--healthy)';
    bar.title = `${formatDate(s.startedAt)} — ${Math.round(s.avgBpm)} bpm`;
    els.historyChart.appendChild(bar);
  });

  sessions.slice(0, 30).forEach((s) => {
    const li = document.createElement('li');
    li.className = 'history-item';

    const main = document.createElement('div');
    main.className = 'history-item-main';
    const strong = document.createElement('strong');
    strong.textContent = `${s.category} · ${formatDuration(s.durationMs)}`;
    const span = document.createElement('span');
    span.textContent = `${formatDate(s.startedAt)} · ${s.blinkCount} blinks · ${s.alertCount} alerts`;
    main.append(strong, span);

    const statsEl = document.createElement('div');
    statsEl.className = 'history-item-stats';
    const bpmEl = document.createElement('span');
    bpmEl.className = 'history-bpm';
    bpmEl.textContent = `${Math.round(s.avgBpm)} bpm`;
    statsEl.appendChild(bpmEl);

    li.append(main, statsEl);
    els.historyList.appendChild(li);
  });
}

els.clearHistoryBtn.addEventListener('click', async () => {
  await clearSessions();
  await renderHistory();
  showToast('History cleared', 'All local session history has been removed.');
});

// ---------- Init ----------

renderHistory();
ensureModel();
