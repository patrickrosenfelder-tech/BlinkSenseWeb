import { el } from '../ui/dom.js';
import { INTAKE_SECTIONS, SSN_NOTICE, isIntakeComplete } from '../content/intake-fields.js';

function renderField(field, values, onChange) {
  const inputId = `intake-${field.id}`;
  const commonAttrs = {
    id: inputId,
    name: field.id,
    autocomplete: field.autoComplete || 'off',
    ...(field.required ? { required: true, 'aria-required': 'true' } : {}),
  };

  let input;
  if (field.type === 'select') {
    input = el('select', {
      ...commonAttrs,
      onChange: (e) => onChange(field.id, e.target.value),
    }, [
      el('option', { value: '' }, 'Select…'),
      ...field.options.map((option) => el('option', { value: option }, option)),
    ]);
  } else if (field.type === 'textarea') {
    input = el('textarea', {
      ...commonAttrs,
      rows: 3,
      placeholder: field.placeholder || '',
      onInput: (e) => onChange(field.id, e.target.value),
    });
  } else {
    input = el('input', {
      ...commonAttrs,
      type: field.type,
      placeholder: field.placeholder || '',
      onInput: (e) => onChange(field.id, e.target.value),
    });
  }

  return el('div', { class: 'field' }, [
    el('label', { for: inputId, class: 'field-label' }, [
      field.label,
      field.required ? el('span', { class: 'field-required', 'aria-hidden': 'true' }, ' *') : null,
    ]),
    input,
  ]);
}

function renderSection(section, values, onChange) {
  return el('fieldset', { class: 'intake-section' }, [
    el('legend', { class: 'intake-section-title' }, section.title),
    el('div', { class: 'intake-grid' }, section.fields.map((field) => renderField(field, values, onChange))),
  ]);
}

export function renderIntake(root, { onSubmit }) {
  const values = {};
  const continueBtn = el('button', { class: 'button', type: 'button', disabled: true }, 'Continue');
  continueBtn.addEventListener('click', () => onSubmit(values));

  const sectionBlocks = INTAKE_SECTIONS.map((section) =>
    renderSection(section, values, (id, value) => {
      values[id] = value;
      continueBtn.disabled = !isIntakeComplete(values);
    })
  );

  return el('div', { class: 'screen' }, [
    el('section', { class: 'card', 'aria-labelledby': 'intake-heading' }, [
      el('p', { class: 'eyebrow' }, 'Local intake — nothing leaves this device'),
      el('h2', { id: 'intake-heading' }, 'New appointment intake'),
      el('p', { class: 'fine-print' }, 'Every field below stays in this browser tab\'s memory. Nothing here is uploaded, sent to a server, or saved once you close this page — and only a completion summary (never these values) is ever included in your downloaded report.'),
      el('div', { class: 'privacy-banner', role: 'note' }, [
        el('strong', {}, `${SSN_NOTICE.label} — not collected. `),
        SSN_NOTICE.reason,
      ]),
    ]),
    ...sectionBlocks.map((section) => el('section', { class: 'card' }, [section])),
    el('section', { class: 'card step-actions' }, [continueBtn]),
  ]);
}
