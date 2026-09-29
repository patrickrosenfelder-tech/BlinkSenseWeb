import { el, svgEl } from '../ui/dom.js';
import { downloadReportJson } from '../report.js';
import { downloadAgreement, agreementHtml } from '../local-agreements.js';
import { buildLineChartGeometry, describeBlinkChart } from '../blink/chart-geometry.js';

function statRow(label, value) {
  return el('div', { class: 'result-stat' }, [el('dt', {}, label), el('dd', {}, value)]);
}

function renderIntakeSummary(intakeSummary) {
  if (!intakeSummary) return null;
  return el('section', { class: 'card', 'aria-labelledby': 'intake-summary-heading' }, [
    el('h3', { id: 'intake-summary-heading' }, 'Intake form'),
    el('p', { class: 'fine-print' }, 'The names, dates, contact details, and insurance information you entered stay on this device — they are not shown here or included in the downloaded report, only this completion summary is.'),
    el('dl', { class: 'result-stats' }, [
      statRow('Fields completed', `${intakeSummary.completedFields} / ${intakeSummary.totalFields}`),
      statRow('Required fields', intakeSummary.requiredComplete ? 'Complete' : 'Incomplete'),
    ]),
  ]);
}

function renderReadingSummary(readingResult) {
  if (!readingResult) return null;
  return el('section', { class: 'card', 'aria-labelledby': 'reading-summary-heading' }, [
    el('h3', { id: 'reading-summary-heading' }, 'Reading comprehension'),
    el('dl', { class: 'result-stats' }, [
      statRow('Score', `${readingResult.correct} / ${readingResult.total} correct (${readingResult.percent}%)`),
    ]),
  ]);
}

function renderVisionSummary(visionResults) {
  if (!visionResults) return null;
  return el('section', { class: 'card', 'aria-labelledby': 'vision-summary-heading' }, [
    el('h3', { id: 'vision-summary-heading' }, 'Vision checks'),
    el('p', { class: 'fine-print' }, 'Self-report screening only — not a substitute for a professional eye exam.'),
    el('dl', { class: 'result-stats' }, [
      statRow('Letter size (acuity)', `${visionResults.acuity.category}${visionResults.acuity.smallestReadableLabel ? ` — smallest read: ${visionResults.acuity.smallestReadableLabel}` : ''}`),
      statRow('Contrast', `${visionResults.contrast.category}${visionResults.contrast.smallestVisibleLabel ? ` — smallest seen: ${visionResults.contrast.smallestVisibleLabel}` : ''}`),
      statRow('Color response', `${visionResults.color.category} (${visionResults.color.correct} / ${visionResults.color.total})`),
    ]),
  ]);
}

function renderKidsSummary(kidsResult) {
  if (!kidsResult) return null;
  return el('section', { class: 'card', 'aria-labelledby': 'kids-summary-heading' }, [
    el('h3', { id: 'kids-summary-heading' }, 'Story & picture game'),
    el('dl', { class: 'result-stats' }, [
      statRow('Score', `${kidsResult.correct} / ${kidsResult.total} correct (${kidsResult.percent}%)`),
    ]),
  ]);
}

function renderBlinkChart(blinkSummary) {
  const geometry = buildLineChartGeometry(blinkSummary.series);
  if (!geometry) return null;

  const description = describeBlinkChart({
    series: blinkSummary.series,
    sessionAverageBpm: blinkSummary.avgBpm,
    peakBpm: blinkSummary.peakBpm,
    activeDurationMs: blinkSummary.activeDurationMs,
  });
  const title = 'Blink rate over time';
  const chartChildren = [
    svgEl('title', {}, title),
    svgEl('desc', {}, description),
    svgEl('line', { x1: geometry.paddingX, y1: geometry.height - geometry.paddingY, x2: geometry.width - geometry.paddingX, y2: geometry.height - geometry.paddingY, class: 'blink-chart-axis' }),
    geometry.isSinglePoint
      ? svgEl('circle', { cx: geometry.points[0].x, cy: geometry.points[0].y, r: 4, class: 'blink-chart-line' })
      : svgEl('polyline', { points: geometry.pointsAttr, fill: 'none', class: 'blink-chart-line' }),
  ];
  return el('div', { class: 'blink-chart-wrap' }, [
    el('h4', {}, title),
    svgEl('svg', {
      class: 'blink-chart',
      viewBox: `0 0 ${geometry.width} ${geometry.height}`,
      role: 'img',
      'aria-label': description,
      preserveAspectRatio: 'none',
    }, chartChildren),
    el('p', { class: 'fine-print' }, 'Rolling BPM over active tracking time.'),
  ]);
}

const BLINK_UNAVAILABLE_MESSAGES = {
  'camera-denied': 'Blink data is not available for this session because the camera was not enabled.',
  'no-usable-frames': 'Blink data is not available for this session because no usable camera frames were captured.',
  'no-face-detected': 'Blink data is not available for this session because a face could not be detected in the camera feed.',
};

function renderBlinkSummary(blinkSummary) {
  const unavailableText = BLINK_UNAVAILABLE_MESSAGES[blinkSummary.reason] ?? 'Blink data is not available for this session.';
  return el('section', { class: 'card', 'aria-labelledby': 'blink-summary-heading' }, [
    el('h3', { id: 'blink-summary-heading' }, 'Blink tracking'),
    ...(blinkSummary.available
      ? [
          renderBlinkChart(blinkSummary),
          el('dl', { class: 'result-stats' }, [
            statRow('Total blinks', String(blinkSummary.blinkCount)),
            statRow('Session average BPM', `${Math.round(blinkSummary.avgBpm)} blinks / min`),
            statRow('Final rolling BPM', `${Math.round(blinkSummary.finalRollingBpm)} blinks / min`),
            statRow('Peak rolling BPM', `${Math.round(blinkSummary.peakBpm)} blinks / min`),
            statRow('Active tracking time', `${Math.round(blinkSummary.activeDurationMs / 1000)}s`),
          ]),
        ]
      : [el('p', { class: 'fine-print' }, unavailableText)]),
  ]);
}

export function renderResults(root, { report, acknowledgements, onRestart }) {
  const downloadBtn = el('button', { class: 'button', type: 'button', onClick: () => downloadReportJson(report) }, 'Download JSON report');
  const retinalBtn = el('button', { class: 'button button-outline', type: 'button', onClick: () => downloadAgreement('retinal', acknowledgements.retinal) }, 'Download retinal agreement');
  const financialBtn = el('button', { class: 'button button-outline', type: 'button', onClick: () => downloadAgreement('financial', acknowledgements.financial) }, 'Download financial agreement');
  const printBtn = el('button', { class: 'button button-outline', type: 'button', onClick: () => { const w = window.open('', '_blank'); w.document.write(agreementHtml('retinal', acknowledgements.retinal).replace('</body>', `${agreementHtml('financial', acknowledgements.financial).replace(/^.*?<body>|<\/body>.*$/gs, '')}</body>`)); w.document.close(); w.print(); } }, 'Print/save agreements as PDF');
  const restartBtn = el('button', { class: 'button button-outline', type: 'button', onClick: onRestart }, 'Start a new assessment');

  const sections =
    report.mode === 'adult'
      ? [renderIntakeSummary(report.intakeSummary), renderReadingSummary(report.readingResult), renderVisionSummary(report.visionResults)]
      : [renderKidsSummary(report.kidsResult)];
  sections.push(renderBlinkSummary(report.blinkSummary));

  return el('div', { class: 'screen' }, [
    el('section', { class: 'card', 'aria-labelledby': 'results-heading' }, [
      el('h2', { id: 'results-heading' }, 'Your results'),
      el('div', { class: 'disclaimer-banner', role: 'note' }, [el('strong', {}, 'Screening only — not medical advice. '), report.disclaimer]),
      el('div', { class: 'privacy-banner', role: 'note' }, [el('strong', {}, 'Private by design. '), report.privacy]),
    ]),
    ...sections.filter(Boolean),
    el('section', { class: 'card results-actions' }, [downloadBtn, retinalBtn, financialBtn, printBtn, restartBtn]),
  ]);
}
