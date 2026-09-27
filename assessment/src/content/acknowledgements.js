// Local-only content and completion rules for two pre-visit acknowledgement
// sections (retinal evaluation choice, financial responsibility). Both are
// plain-language, local acknowledgements of choice/understanding — not legal
// or electronic signatures — and never file an insurance claim, schedule
// anything, process payment, diagnose any condition, or get stored remotely.
// Only a redacted completion summary (never the name/date entered here) is
// ever included in the downloadable report — see summarizeAcknowledgements.

export const RETINAL_OPTIONS = [
  {
    id: 'iwellness-imaging',
    label: 'iWellness retinal imaging',
    description: 'A brief, non-invasive photograph of the retina, used as an optional screening aid.',
  },
  {
    id: 'pupil-dilation',
    label: 'Pupil dilation (included)',
    description: 'Eye drops widen the pupil for a closer look. Expect temporary blurry vision and light sensitivity for a few hours afterward.',
  },
  {
    id: 'decline-both',
    label: 'Decline both',
    description: 'No retinal imaging or pupil dilation will be performed at this visit.',
  },
];

export const RETINAL_ACK_TEXT =
  'This is a local, plain-language acknowledgement of your choice — not a legal or electronic signature. It does not file an insurance claim, schedule an appointment, process any payment, diagnose any condition, or get stored remotely.';

export const FINANCIAL_ACK_POINTS = [
  'Insurance coverage and benefits are determined solely by your insurance company, not by this office.',
  'You are responsible for any balance, copay, or deductible that your insurance does not cover.',
  'If you are self-pay, or your insurance has not been verified, payment is due at the time of service.',
];

export const FINANCIAL_ACK_TEXT =
  'This is a local, plain-language acknowledgement of financial responsibility — not a legal or electronic signature. It does not file an insurance claim, schedule an appointment, process any payment, diagnose any condition, or get stored remotely.';

function isFilled(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value != null && value !== '';
}

function isRealOption(id) {
  return RETINAL_OPTIONS.some((option) => option.id === id);
}

export function isRetinalChoiceComplete(values) {
  const safe = values || {};
  return isRealOption(safe.selectedOption) && isFilled(safe.name) && isFilled(safe.date);
}

export function isFinancialAckComplete(values) {
  const safe = values || {};
  return isFilled(safe.name) && isFilled(safe.date);
}

export function summarizeAcknowledgements({ retinal, financial } = {}) {
  const safeRetinal = retinal || {};
  return {
    retinal: {
      completed: isRetinalChoiceComplete(safeRetinal),
      selectedOption: isRealOption(safeRetinal.selectedOption) ? safeRetinal.selectedOption : null,
    },
    financial: {
      completed: isFinancialAckComplete(financial),
    },
  };
}
