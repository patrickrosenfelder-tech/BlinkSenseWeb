// Builds the local JSON report downloaded at the end of a session.
// buildReportPayload/reportToJson are pure and never touch the network;
// downloadReportJson only ever writes a local Blob download.

import { summarizeAcknowledgements } from './content/acknowledgements.js';

export const REPORT_VERSION = 1;

const DISCLAIMER =
  'This is a screening tool only. It is not medical advice, a diagnosis, or a substitute for an eye-care professional.';
const PRIVACY_NOTE =
  "Your camera video, face landmarks, answers, and blink metrics are processed on this device and are never uploaded, stored remotely, or shared. This app's code and its on-device face-tracking model are downloaded from hosting CDNs when the page loads or the camera is enabled.";

/**
 * @param {object} input
 * @param {string} input.mode - 'adult' | 'kids-6-9' | 'kids-10-13'
 * @param {string} input.generatedAt - ISO timestamp string.
 */
export function buildReportPayload({
  mode,
  generatedAt,
  intakeSummary = null,
  readingResult = null,
  kidsResult = null,
  visionResults = null,
  blinkSummary,
  acknowledgementsSummary = summarizeAcknowledgements(),
}) {
  return {
    version: REPORT_VERSION,
    generatedAt,
    mode,
    disclaimer: DISCLAIMER,
    privacy: PRIVACY_NOTE,
    intakeSummary,
    readingResult,
    kidsResult,
    visionResults,
    blinkSummary,
    acknowledgements: acknowledgementsSummary,
  };
}

export function reportToJson(payload) {
  return JSON.stringify(payload, null, 2);
}

export function reportFilename(mode, generatedAt) {
  const safeDate = generatedAt.replace(/[:.]/g, '-');
  return `blinksense-assessment-${mode}-${safeDate}.json`;
}

/** Browser-only: triggers a local file download. Never called during tests. */
export function downloadReportJson(payload) {
  const json = reportToJson(payload);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = reportFilename(payload.mode, payload.generatedAt);
  link.click();
  URL.revokeObjectURL(url);
}
