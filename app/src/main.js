import './style.css';
import { BlinkDetector } from './blink-detector.js';
import { saveSession, getAllSessions, clearSessions } from './db.js';
import { computeActiveDurationMs, computeSessionAverageBpm, computeLiveBpm } from './bpm-math.js';

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
  diagnosticsValues: document.getElementById('diagnostics-values'),
  exportDiagnosticsBtn: document.getElementById('export-diagnostics-btn'),
};

const GAUGE_RADIUS = 60;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
const BPM_GAUGE_MAX = 30;
const BLINK_WINDOW_MS = 60000;
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
let bpmSamples = [];
let lastBpmSampleAt = -Infinity;
// Hidden-tab (backgrounded window) accounting, so wall-clock time the tab
// spent hidden — during which no blinks can be detected — is excluded from
// both the live and session-average BPM denominators.
let accumulatedPauseMs = 0;
// A single suspension span represents the union of verified interruptions:
// hidden/backgrounded time and camera-loss time can overlap, but must only be
// subtracted once.  The legacy name is retained because bpm-math.js exposes it
// as a pure-test seam.
let hiddenSinceMs = null;

function beginTrackingSuspension() {
  if (running && hiddenSinceMs === null) hiddenSinceMs = performance.now();
}

function endTrackingSuspension() {
  if (hiddenSinceMs === null) return;
  const durationMs = Math.max(0, performance.now() - hiddenSinceMs);
  accumulatedPauseMs += durationMs;
  // Native trackers shift timestamps forward after a pause/interruption so
  // "last 60s" means 60 seconds of active tracking, never dead wall-clock.
  blinkTimestamps = blinkTimestamps.map((timestamp) => timestamp + durationMs);
  lastBpmSampleAt += durationMs;
  lastZoneTickAt = performance.now();
  hiddenSinceMs = null;
}

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
  beginTrackingSuspension();
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
        endTrackingSuspension();
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
  const activeElapsedMs = sessionStart
    ? computeActiveDurationMs(sessionStart, now, accumulatedPauseMs, hiddenSinceMs)
    : 0;
  return computeLiveBpm(blinkTimestamps.length, activeElapsedMs, BLINK_WINDOW_MS);
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

function updateDiagnostics() {
  const data = detector.getDiagnostics(els.video);
  const camera = data.camera.width ? `${data.camera.width}×${data.camera.height} @ ${data.camera.frameRate ?? '?'} FPS` : 'Not started';
  const values = [
    camera,
    `${data.decodedFps.toFixed(1)} / ${data.processedFps.toFixed(1)}`,
    data.openBaseline.toFixed(3),
    `${data.closeThreshold.toFixed(3)} / ${data.reopenThreshold.toFixed(3)}`,
    `${data.acceptedEvents.length} / ${data.rejectedEvents.length}`,
  ];
  Array.from(els.diagnosticsValues.querySelectorAll('dd')).forEach((element, index) => { element.textContent = values[index]; });
}

els.exportDiagnosticsBtn.addEventListener('click', () => {
  let diagJson;
  if (running || !localStorage.getItem('blinksense-diagnostics')) {
    diagJson = JSON.stringify(detector.getDiagnostics(els.video), null, 2);
  } else {
    diagJson = localStorage.getItem('blinksense-diagnostics');
  }
  const blob = new Blob([diagJson], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `blinksense-diagnostics-${new Date().toISOString().replaceAll(':', '-')}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

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
  lastBpmSampleAt = -Infinity;
  bpmSamples.length = 0;
  timerInterval = setInterval(() => {
    if (!sessionStart) return;
    const now = performance.now();
    const elapsed = Math.floor(computeActiveDurationMs(sessionStart, now, accumulatedPauseMs, hiddenSinceMs) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    els.statTimer.textContent = `${mm}:${ss}`;

    // Sample BPM every 5s like the native apps (BPM history graph).
    if (now - lastBpmSampleAt >= 5000) {
      lastBpmSampleAt = now;
      bpmSamples.push({ offsetSeconds: elapsed, bpm: computeBpm() });
    }
    updateDiagnostics();
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
  detector.resetSession();
  cameraLost = false;
  sessionStart = performance.now();
  accumulatedPauseMs = 0;
  hiddenSinceMs = document.hidden ? sessionStart : null;
  blinkTimestamps = [];
  blinkCount = 0;
  alertCount = 0;
  currentZone = null;
  zoneTimeMs = { healthy: 0, low: 0, critical: 0 };
  lastZoneTickAt = null;
  els.statBlinks.textContent = '0';
  els.statAlerts.textContent = '0';
  els.statTimer.textContent = '00:00';
  updateDiagnostics();

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
    const now = performance.now();
    const durationMs = now - sessionStart;
    if (durationMs > 5000) {
      // activeDurationMs excludes any hidden-tab time — that's the denominator
      // the canonical session-average formula uses, not raw wall-clock duration.
      const activeDurationMs = computeActiveDurationMs(sessionStart, now, accumulatedPauseMs, hiddenSinceMs);
      const totalZoneMs = zoneTimeMs.healthy + zoneTimeMs.low + zoneTimeMs.critical || 1;
      const avgBpm = computeSessionAverageBpm(blinkCount, activeDurationMs);
      await saveSession({
        startedAt: Date.now() - durationMs,
        durationMs,
        activeDurationMs,
        category,
        avgBpm,
        blinkCount,
        alertCount,
        bpmSamples: bpmSamples.length > 0 ? bpmSamples : null,
        zoneStats: {
          healthy: zoneTimeMs.healthy / totalZoneMs,
          low: zoneTimeMs.low / totalZoneMs,
          critical: zoneTimeMs.critical / totalZoneMs,
        },
      });
      await renderHistory();
    }
    localStorage.setItem('blinksense-diagnostics', JSON.stringify(detector.getDiagnostics(els.video), null, 2));
    sessionStart = null;
    hiddenSinceMs = null;
    accumulatedPauseMs = 0;
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
    if (running) {
      // Mark the start of a hidden span; no blinks can be detected while
      // backgrounded, so this time must be excluded from BPM denominators.
      beginTrackingSuspension();
      setOverlayMessage('Paused — window not visible');
    }
  } else {
    if (running && !cameraLost) {
      endTrackingSuspension();
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

/** Renders an SVG BPM-over-time line chart (mirrors native history graphs). */
function renderBpmLine(samples) {
  const W = 320, H = 96, PAD = 4;
  const maxBpm = Math.max(...samples.map((s) => s.bpm), 12);
  const minBpm = Math.min(...samples.map((s) => s.bpm), 0);
  const span = Math.max(1, maxBpm - minBpm);
  const duration = Math.max(1, samples[samples.length - 1].offsetSeconds);
  const pts = samples.map((s, i) => {
    const x = PAD + (i / (samples.length - 1)) * (W - 2 * PAD);
    const y = H - PAD - ((s.bpm - minBpm) / span) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `M ${pts[0].split(',')[0]},${H - PAD} L ${pts.join(' L ')} L ${pts[pts.length - 1].split(',')[0]},${H - PAD} Z`;
  const zoneColors = { critical: 'var(--critical)', low: 'var(--low)', healthy: 'var(--healthy)' };
  els.historyChart.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="BPM over time">
      <defs>
        <linearGradient id="bpm-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--healthy)" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="var(--healthy)" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#bpm-fill)"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="var(--healthy)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}" stroke="var(--border)" stroke-width="1"/>
    </svg>
    <span class="history-chart-caption">BPM over ${formatDuration(duration * 1000)} — ${Math.round(maxBpm)} max / ${Math.round(minBpm)} min</span>`;
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

  // Latest session gets a BPM line graph (same as native apps) when samples exist.
  const latest = recent[recent.length - 1];
  if (latest && latest.bpmSamples && latest.bpmSamples.length >= 2) {
    els.historyChart.className = 'history-chart history-chart-line';
    renderBpmLine(latest.bpmSamples);
  } else {
    els.historyChart.className = 'history-chart';
    recent.forEach((s) => {
      const bar = document.createElement('div');
      bar.className = 'history-bar';
      bar.style.height = `${Math.max(4, Math.min(100, (s.avgBpm / maxBpm) * 100))}%`;
      bar.style.background = s.avgBpm < 5 ? 'var(--critical)' : s.avgBpm < 12 ? 'var(--low)' : 'var(--healthy)';
      bar.title = `${formatDate(s.startedAt)} — ${Math.round(s.avgBpm)} bpm`;
      els.historyChart.appendChild(bar);
    });
  }

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
    const bpmLabel = document.createElement('span');
    bpmLabel.className = 'history-bpm-label';
    bpmLabel.textContent = 'Session Avg';
    const bpmEl = document.createElement('span');
    bpmEl.className = 'history-bpm';
    bpmEl.textContent = `${Math.round(s.avgBpm)} bpm`;
    statsEl.append(bpmLabel, bpmEl);

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
