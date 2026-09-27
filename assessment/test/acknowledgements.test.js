import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RETINAL_OPTIONS,
  RETINAL_ACK_TEXT,
  FINANCIAL_ACK_TEXT,
  FINANCIAL_ACK_POINTS,
  isRetinalChoiceComplete,
  isFinancialAckComplete,
  summarizeAcknowledgements,
} from '../src/content/acknowledgements.js';

test('RETINAL_OPTIONS: offers iWellness imaging, pupil dilation, and a decline-both option', () => {
  const ids = RETINAL_OPTIONS.map((o) => o.id);
  assert.equal(RETINAL_OPTIONS.length, 3);
  assert.equal(new Set(ids).size, 3, 'option ids must be unique');
  assert.ok(RETINAL_OPTIONS.some((o) => /iwellness/i.test(o.label)));
  assert.ok(RETINAL_OPTIONS.some((o) => /pupil dilation/i.test(o.label)));
  assert.ok(RETINAL_OPTIONS.some((o) => /decline/i.test(o.label) || /decline/i.test(o.id)));
});

test('RETINAL_OPTIONS: pupil dilation option discloses temporary blur/light sensitivity', () => {
  const dilation = RETINAL_OPTIONS.find((o) => /pupil dilation/i.test(o.label));
  assert.ok(dilation, 'pupil dilation option must exist');
  assert.match(dilation.description, /blur/i);
  assert.match(dilation.description, /light sensitiv/i);
});

test('local acknowledgement copy is explicit that this is not a legal/electronic signature and no remote actions occur', () => {
  for (const text of [RETINAL_ACK_TEXT, FINANCIAL_ACK_TEXT]) {
    assert.match(text, /not a legal|not a .*signature/i);
    assert.match(text, /claim/i);
    assert.match(text, /schedul/i);
    assert.match(text, /payment/i);
    assert.match(text, /diagnos/i);
    assert.match(text, /remote/i);
  }
});

test('FINANCIAL_ACK_POINTS: covers insurer-determined coverage, patient responsibility, and self-pay due at service', () => {
  const joined = FINANCIAL_ACK_POINTS.join(' ').toLowerCase();
  assert.match(joined, /insur/);
  assert.match(joined, /responsible|responsibility/);
  assert.match(joined, /copay|deductible/);
  assert.match(joined, /self-pay/);
  assert.match(joined, /due at/);
});

test('isRetinalChoiceComplete: false when no option has been selected, even with name/date filled', () => {
  assert.equal(isRetinalChoiceComplete({ name: 'Jane Doe', date: '2026-01-01' }), false);
  assert.equal(isRetinalChoiceComplete({}), false);
  assert.equal(isRetinalChoiceComplete(undefined), false);
});

test('isRetinalChoiceComplete: false when an option is selected but the acknowledgement name or date is missing', () => {
  assert.equal(isRetinalChoiceComplete({ selectedOption: 'decline-both' }), false);
  assert.equal(isRetinalChoiceComplete({ selectedOption: 'decline-both', name: 'Jane Doe' }), false);
  assert.equal(isRetinalChoiceComplete({ selectedOption: 'decline-both', date: '2026-01-01' }), false);
  assert.equal(isRetinalChoiceComplete({ selectedOption: 'decline-both', name: '   ', date: '2026-01-01' }), false);
});

test('isRetinalChoiceComplete: false when selectedOption is not one of the real options', () => {
  assert.equal(isRetinalChoiceComplete({ selectedOption: 'not-a-real-option', name: 'Jane Doe', date: '2026-01-01' }), false);
});

test('isRetinalChoiceComplete: true once a real option is selected and name/date are filled', () => {
  for (const option of RETINAL_OPTIONS) {
    assert.equal(
      isRetinalChoiceComplete({ selectedOption: option.id, name: 'Jane Doe', date: '2026-01-01' }),
      true,
      `option ${option.id} should complete the acknowledgement`
    );
  }
});

test('isFinancialAckComplete: requires signature name and date; guardian fields are optional', () => {
  assert.equal(isFinancialAckComplete({}), false);
  assert.equal(isFinancialAckComplete({ name: 'Jane Doe' }), false);
  assert.equal(isFinancialAckComplete({ date: '2026-01-01' }), false);
  assert.equal(isFinancialAckComplete({ name: 'Jane Doe', date: '2026-01-01' }), true);
  assert.equal(
    isFinancialAckComplete({ name: 'Jane Doe', date: '2026-01-01', guardianName: '', guardianDate: '' }),
    true,
    'guardian fields must be optional'
  );
});

test('summarizeAcknowledgements: reports completion + selected retinal option only, never names or dates', () => {
  const summary = summarizeAcknowledgements({
    retinal: { selectedOption: 'pupil-dilation', name: 'Jane Doe', date: '2026-01-15' },
    financial: { name: 'Jane Doe', date: '2026-01-15', guardianName: 'John Doe', guardianDate: '2026-01-15' },
  });

  assert.deepEqual(summary, {
    retinal: { completed: true, selectedOption: 'pupil-dilation' },
    financial: { completed: true },
  });

  const serialized = JSON.stringify(summary);
  for (const secret of ['Jane Doe', 'John Doe', '2026-01-15']) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `summary leaked: ${secret}`);
  }
});

test('summarizeAcknowledgements: incomplete sections report completed:false and no leaked selectedOption', () => {
  const summary = summarizeAcknowledgements({ retinal: {}, financial: {} });
  assert.deepEqual(summary, {
    retinal: { completed: false, selectedOption: null },
    financial: { completed: false },
  });
});

test('summarizeAcknowledgements: handles missing/undefined input like empty sections', () => {
  assert.deepEqual(summarizeAcknowledgements(undefined), summarizeAcknowledgements({}));
  assert.deepEqual(summarizeAcknowledgements({}), {
    retinal: { completed: false, selectedOption: null },
    financial: { completed: false },
  });
});

test('summarizeAcknowledgements: an invalid/spoofed selectedOption never passes through to the report', () => {
  const summary = summarizeAcknowledgements({ retinal: { selectedOption: 'made-up-id', name: 'Jane Doe', date: '2026-01-15' } });
  assert.equal(summary.retinal.selectedOption, null);
  assert.equal(summary.retinal.completed, false);
});
