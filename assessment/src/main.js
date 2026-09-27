import './style.css';
import { mount } from './ui/dom.js';
import { createInitialState } from './state.js';
import { BlinkTracker } from './blink/tracker.js';
import { disposeCameraTracker } from './blink/lifecycle.js';
import { renderWelcome } from './screens/welcome.js';
import { renderConsent } from './screens/consent.js';
import { renderAcknowledgements } from './screens/acknowledgements.js';
import { renderIntake } from './screens/intake.js';
import { renderReading } from './screens/reading.js';
import { renderAcuityStep, renderContrastStep, renderColorStep } from './screens/vision.js';
import { renderAgeChoice, renderKidsTask } from './screens/kids.js';
import { renderResults } from './screens/results.js';
import { scoreReading } from './content/reading.js';
import { scoreKidsTask } from './content/kids.js';
import { summarizeIntake } from './content/intake-fields.js';
import { summarizeAcknowledgements } from './content/acknowledgements.js';
import { computeBlinkSummary, buildVisionResults } from './scoring.js';
import { buildReportPayload } from './report.js';

const root = document.getElementById('app-root');
const trackingWidget = document.getElementById('tracking-widget');
const trackingVideo = document.getElementById('tracking-video');
const trackingStatus = document.getElementById('tracking-status');

let state = createInitialState();
let tracker = null;

function showTrackingWidget(text, kind) {
  trackingWidget.hidden = false;
  trackingStatus.textContent = text;
  trackingStatus.className = 'status-pill' + (kind ? ` is-${kind}` : '');
}

function hideTrackingWidget() {
  trackingWidget.hidden = true;
}

async function handleConsent(cameraWanted) {
  if (!cameraWanted) {
    state.cameraEnabled = false;
    hideTrackingWidget();
    proceedPastConsent();
    return;
  }
  showTrackingWidget('Requesting camera…', 'warn');
  tracker = new BlinkTracker();
  try {
    await tracker.enableCamera(trackingVideo);
    state.cameraEnabled = true;
    showTrackingWidget('Blink tracking active locally', 'live');
    tracker.start();
    proceedPastConsent();
  } catch (err) {
    console.error('Camera setup failed', err);
    hideTrackingWidget();
    tracker = disposeCameraTracker(tracker);
    mount(root, renderConsent(root, {
      onContinue: handleConsent,
      cameraError: 'Camera access was blocked or unavailable. You can still continue without it.',
    }));
  }
}

function proceedPastConsent() {
  showAcknowledgements();
}

function showAcknowledgements() {
  mount(root, renderAcknowledgements(root, {
    onSubmit: (values) => {
      state.acknowledgements = values;
      if (state.mode === 'adult') {
        showIntake();
      } else {
        showAgeChoice();
      }
    },
  }));
}

function showWelcome() {
  mount(root, renderWelcome(root, {
    onChooseAdult: () => { state.mode = 'adult'; showConsent(); },
    onChooseKids: () => { state.mode = 'kids'; showConsent(); },
  }));
}

function showConsent() {
  mount(root, renderConsent(root, { onContinue: handleConsent }));
}

function showIntake() {
  mount(root, renderIntake(root, {
    onSubmit: (values) => { state.intake = values; showReading(); },
  }));
}

function showReading() {
  mount(root, renderReading(root, {
    onSubmit: (answers) => { state.readingAnswers = answers; showAcuity(); },
  }));
}

function showAcuity() {
  mount(root, renderAcuityStep(root, {
    onComplete: (flags) => { state.acuityFlags = flags; showContrast(); },
  }));
}

function showContrast() {
  mount(root, renderContrastStep(root, {
    onComplete: (flags) => { state.contrastFlags = flags; showColor(); },
  }));
}

function showColor() {
  mount(root, renderColorStep(root, {
    onComplete: (answers) => { state.colorAnswers = answers; finish(); },
  }));
}

function showAgeChoice() {
  mount(root, renderAgeChoice(root, {
    onChoose: (band) => { state.ageBand = band; showKidsTask(); },
  }));
}

function showKidsTask() {
  mount(root, renderKidsTask(root, {
    band: state.ageBand,
    onSubmit: (responses) => { state.kidsResponses = responses; finish(); },
  }));
}

function finish() {
  const blinkStats = tracker ? tracker.stop() : null;
  hideTrackingWidget();
  const blinkSummary = computeBlinkSummary(
    blinkStats?.blinkCount ?? 0,
    blinkStats?.activeDurationMs ?? 0,
    {
      cameraDenied: !blinkStats,
      processedFrameCount: blinkStats?.processedFrameCount ?? 0,
      faceDetectedFrameCount: blinkStats?.faceDetectedFrameCount ?? 0,
    },
  );

  const mode = state.mode === 'adult' ? 'adult' : `kids-${state.ageBand}`;
  const generatedAt = new Date().toISOString();

  const report = buildReportPayload({
    mode,
    generatedAt,
    intakeSummary: state.mode === 'adult' ? summarizeIntake(state.intake) : null,
    readingResult: state.mode === 'adult' ? scoreReading(state.readingAnswers) : null,
    kidsResult: state.mode === 'kids' ? scoreKidsTask(state.ageBand, state.kidsResponses) : null,
    visionResults: state.mode === 'adult'
      ? buildVisionResults({ acuityFlags: state.acuityFlags, contrastFlags: state.contrastFlags, colorAnswers: state.colorAnswers })
      : null,
    blinkSummary,
    acknowledgementsSummary: summarizeAcknowledgements(state.acknowledgements),
  });

  mount(root, renderResults(root, { report, acknowledgements: state.acknowledgements, onRestart }));
}

function onRestart() {
  tracker = disposeCameraTracker(tracker);
  hideTrackingWidget();
  state = createInitialState();
  showWelcome();
}

showWelcome();
