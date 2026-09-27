import { el } from '../ui/dom.js';
import {
  RETINAL_OPTIONS,
  RETINAL_ACK_TEXT,
  FINANCIAL_ACK_TEXT,
  FINANCIAL_ACK_POINTS,
  isRetinalChoiceComplete,
  isFinancialAckComplete,
} from '../content/acknowledgements.js';

function renderRetinalSection(onChange) {
  const optionRows = RETINAL_OPTIONS.map((option) =>
    el('label', { class: 'option-card' }, [
      el('input', {
        type: 'radio',
        name: 'retinal-option',
        value: option.id,
        onChange: () => onChange('selectedOption', option.id),
      }),
      el('span', {}, [
        el('div', {}, option.label),
        el('div', { class: 'fine-print' }, option.description),
      ]),
    ])
  );

  return el('section', { class: 'card', 'aria-labelledby': 'retinal-heading' }, [
    el('p', { class: 'eyebrow' }, 'Local acknowledgement — not a signature'),
    el('h2', { id: 'retinal-heading' }, 'Retinal evaluation choice'),
    el('div', { class: 'option-list' }, optionRows),
    el('div', { class: 'intake-grid' }, [
      el('div', { class: 'field' }, [
        el('label', { for: 'retinal-name', class: 'field-label' }, 'Acknowledgement name'),
        el('input', { id: 'retinal-name', type: 'text', onInput: (e) => onChange('name', e.target.value) }),
      ]),
      el('div', { class: 'field' }, [
        el('label', { for: 'retinal-date', class: 'field-label' }, 'Date'),
        el('input', { id: 'retinal-date', type: 'date', onInput: (e) => onChange('date', e.target.value) }),
      ]),
    ]),
    el('p', { class: 'fine-print' }, RETINAL_ACK_TEXT),
  ]);
}

function renderFinancialSection(onChange) {
  return el('section', { class: 'card', 'aria-labelledby': 'financial-heading' }, [
    el('p', { class: 'eyebrow' }, 'Local acknowledgement — not a signature'),
    el('h2', { id: 'financial-heading' }, 'Financial responsibility'),
    el('ul', { class: 'consent-list' }, FINANCIAL_ACK_POINTS.map((point) => el('li', {}, point))),
    el('div', { class: 'intake-grid' }, [
      el('div', { class: 'field' }, [
        el('label', { for: 'financial-name', class: 'field-label' }, 'Acknowledgement name'),
        el('input', { id: 'financial-name', type: 'text', onInput: (e) => onChange('name', e.target.value) }),
      ]),
      el('div', { class: 'field' }, [
        el('label', { for: 'financial-date', class: 'field-label' }, 'Date'),
        el('input', { id: 'financial-date', type: 'date', onInput: (e) => onChange('date', e.target.value) }),
      ]),
      el('div', { class: 'field' }, [
        el('label', { for: 'financial-guardian-name', class: 'field-label' }, 'Guardian name (optional)'),
        el('input', { id: 'financial-guardian-name', type: 'text', onInput: (e) => onChange('guardianName', e.target.value) }),
      ]),
      el('div', { class: 'field' }, [
        el('label', { for: 'financial-guardian-date', class: 'field-label' }, 'Guardian date (optional)'),
        el('input', { id: 'financial-guardian-date', type: 'date', onInput: (e) => onChange('guardianDate', e.target.value) }),
      ]),
    ]),
    el('p', { class: 'fine-print' }, FINANCIAL_ACK_TEXT),
  ]);
}

export function renderAcknowledgements(root, { onSubmit }) {
  const values = { retinal: {}, financial: {} };
  const continueBtn = el('button', { class: 'button', type: 'button', disabled: true }, 'Continue');
  continueBtn.addEventListener('click', () => onSubmit(values));

  function refreshContinue() {
    continueBtn.disabled = !(isRetinalChoiceComplete(values.retinal) && isFinancialAckComplete(values.financial));
  }

  const retinalSection = renderRetinalSection((id, value) => { values.retinal[id] = value; refreshContinue(); });
  const financialSection = renderFinancialSection((id, value) => { values.financial[id] = value; refreshContinue(); });

  return el('div', { class: 'screen' }, [
    el('section', { class: 'card' }, [
      el('h2', {}, 'Local acknowledgements'),
      el('p', { class: 'fine-print' }, 'These are local, plain-language acknowledgements only — not legal or electronic signatures. Nothing here files an insurance claim, schedules an appointment, processes payment, diagnoses any condition, or is stored remotely. Only a redacted completion summary — never the names or dates below — is ever included in your downloaded report.'),
    ]),
    retinalSection,
    financialSection,
    el('section', { class: 'card step-actions' }, [continueBtn]),
  ]);
}
