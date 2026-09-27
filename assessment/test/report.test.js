import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_VERSION, buildReportPayload, reportToJson, reportFilename } from '../src/report.js';
import { summarizeIntake } from '../src/content/intake-fields.js';
import { summarizeAcknowledgements } from '../src/content/acknowledgements.js';

const FIXED_DATE = '2026-01-15T10:30:00.000Z';

test('buildReportPayload: adult mode assembles a complete, deterministic payload', () => {
  const intakeSummary = { totalFields: 39, completedFields: 6, requiredComplete: true, sections: [{ id: 'identity', completedCount: 3, totalCount: 6 }] };
  const payload = buildReportPayload({
    mode: 'adult',
    generatedAt: FIXED_DATE,
    intakeSummary,
    readingResult: { correct: 3, total: 3, percent: 100, details: [] },
    visionResults: { acuity: { category: 'Excellent' }, contrast: { category: 'Excellent' }, color: { category: 'Typical color response' } },
    blinkSummary: { available: true, blinkCount: 10, activeDurationMs: 60000, avgBpm: 10 },
    acknowledgementsSummary: { retinal: { completed: true, selectedOption: 'pupil-dilation' }, financial: { completed: true } },
  });

  assert.deepEqual(payload, {
    version: REPORT_VERSION,
    generatedAt: FIXED_DATE,
    mode: 'adult',
    disclaimer: 'This is a screening tool only. It is not medical advice, a diagnosis, or a substitute for an eye-care professional.',
    privacy: 'Your camera video, face landmarks, answers, and blink metrics are processed on this device and are never uploaded, stored remotely, or shared. This app\'s code and its on-device face-tracking model are downloaded from hosting CDNs when the page loads or the camera is enabled.',
    intakeSummary,
    readingResult: { correct: 3, total: 3, percent: 100, details: [] },
    kidsResult: null,
    visionResults: { acuity: { category: 'Excellent' }, contrast: { category: 'Excellent' }, color: { category: 'Typical color response' } },
    blinkSummary: { available: true, blinkCount: 10, activeDurationMs: 60000, avgBpm: 10 },
    acknowledgements: { retinal: { completed: true, selectedOption: 'pupil-dilation' }, financial: { completed: true } },
  });
});

test('buildReportPayload: kids mode omits adult-only fields as null, not undefined/omitted', () => {
  const payload = buildReportPayload({
    mode: 'kids-6-9',
    generatedAt: FIXED_DATE,
    kidsResult: { correct: 4, total: 5, percent: 80 },
    blinkSummary: { available: false, blinkCount: 0, activeDurationMs: 0, avgBpm: 0 },
  });

  assert.equal(payload.mode, 'kids-6-9');
  assert.equal(payload.intakeSummary, null);
  assert.equal(payload.readingResult, null);
  assert.equal(payload.visionResults, null);
  assert.deepEqual(payload.kidsResult, { correct: 4, total: 5, percent: 80 });
  assert.equal(payload.version, REPORT_VERSION);
  assert.deepEqual(payload.acknowledgements, { retinal: { completed: false, selectedOption: null }, financial: { completed: false } });
});

test('buildReportPayload: acknowledgementsSummary defaults to a redacted, incomplete summary rather than null', () => {
  const payload = buildReportPayload({ mode: 'adult', generatedAt: FIXED_DATE, blinkSummary: { available: false, blinkCount: 0, activeDurationMs: 0, avgBpm: 0 } });
  assert.deepEqual(payload.acknowledgements, { retinal: { completed: false, selectedOption: null }, financial: { completed: false } });
});

test('reportToJson: produces valid, pretty-printed JSON that round-trips', () => {
  const payload = buildReportPayload({ mode: 'adult', generatedAt: FIXED_DATE, blinkSummary: { available: false, blinkCount: 0, activeDurationMs: 0, avgBpm: 0 } });
  const json = reportToJson(payload);
  assert.equal(typeof json, 'string');
  assert.ok(json.includes('\n'), 'should be pretty-printed');
  assert.deepEqual(JSON.parse(json), payload);
});

test('reportFilename: deterministic, filesystem-safe filename', () => {
  const name = reportFilename('adult', FIXED_DATE);
  assert.equal(name, 'blinksense-assessment-adult-2026-01-15T10-30-00-000Z.json');
  assert.doesNotMatch(name, /[:]/);
});

test('reportFilename: incorporates the mode for kids reports', () => {
  const name = reportFilename('kids-10-13', FIXED_DATE);
  assert.match(name, /^blinksense-assessment-kids-10-13-/);
});

test('buildReportPayload: privacy wording discloses on-device processing without an absolute zero-download claim', () => {
  const payload = buildReportPayload({ mode: 'adult', generatedAt: FIXED_DATE, blinkSummary: { available: false, blinkCount: 0, activeDurationMs: 0, avgBpm: 0 } });
  const privacy = payload.privacy.toLowerCase();

  // What stays on-device: video/landmarks/answers/blink metrics.
  assert.match(privacy, /device/);
  assert.match(privacy, /(video|landmark)/);
  assert.match(privacy, /answer/);
  assert.match(privacy, /blink/);
  assert.match(privacy, /never uploaded/);

  // What is NOT claimed to stay local: app assets / the face-tracking model,
  // which are fetched from hosting CDNs — an absolute "nothing is ever
  // downloaded" claim would be false, so the wording must disclose this.
  assert.match(privacy, /(cdn|download)/);
});

test('buildReportPayload: redaction contract — a report built from real intake answers never contains the entered PII', () => {
  const rawAnswers = {
    first: 'Jane',
    last: 'Doe',
    middle: 'Q',
    preferredName: 'Janie',
    dob: '1990-01-01',
    addressLine1: '123 Main St',
    city: 'Springfield',
    email: 'jane.doe@example.com',
    cellPhone: '555-0100',
    homePhone: '555-0101',
    workPhone: '555-0102',
    chartNumber: 'CHT-99887',
    clinician: 'Dr. Alex Rivera',
    appointmentNote: 'Patient reports blurry vision in left eye',
    insuranceProvider: 'Acme Health',
    memberNumber: 'M123456789',
    authorizationCode: 'AUTH-4471',
    policyHolder: 'John Doe',
  };

  const payload = buildReportPayload({
    mode: 'adult',
    generatedAt: FIXED_DATE,
    intakeSummary: summarizeIntake(rawAnswers),
    readingResult: { correct: 2, total: 3, percent: 67, details: [] },
    visionResults: { acuity: { category: 'Good' }, contrast: { category: 'Good' }, color: { category: 'Typical color response' } },
    blinkSummary: { available: true, blinkCount: 5, activeDurationMs: 30000, avgBpm: 10 },
  });

  const serialized = reportToJson(payload);
  const secrets = Object.values(rawAnswers);
  for (const secret of secrets) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `report leaked: ${secret}`);
  }
  // The summary contract itself, not raw answers, must be what's present.
  assert.equal(typeof payload.intakeSummary.totalFields, 'number');
  assert.equal(typeof payload.intakeSummary.completedFields, 'number');
});

test('buildReportPayload: redaction contract — acknowledgement names/dates never reach the report; only completion + selected retinal option do', () => {
  const rawRetinal = { selectedOption: 'iwellness-imaging', name: 'Jane Q. Doe', date: '2026-03-02', confirmed: true };
  const rawFinancial = { name: 'Jane Q. Doe', date: '2026-03-02', guardianName: 'John R. Doe', guardianDate: '2026-03-02', confirmed: true };

  const payload = buildReportPayload({
    mode: 'adult',
    generatedAt: FIXED_DATE,
    acknowledgementsSummary: summarizeAcknowledgements({ retinal: rawRetinal, financial: rawFinancial }),
    blinkSummary: { available: false, blinkCount: 0, activeDurationMs: 0, avgBpm: 0 },
  });

  const serialized = reportToJson(payload);
  for (const secret of ['Jane Q. Doe', 'John R. Doe', '2026-03-02']) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `report leaked: ${secret}`);
  }

  assert.deepEqual(payload.acknowledgements, {
    retinal: { completed: true, selectedOption: 'iwellness-imaging' },
    financial: { completed: true },
  });
});
