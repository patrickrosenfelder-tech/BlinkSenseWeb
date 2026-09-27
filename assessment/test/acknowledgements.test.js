import test from 'node:test';
import assert from 'node:assert/strict';
import { FINANCIAL_ACKNOWLEDGEMENT, FINANCIAL_CLAUSES, FINANCIAL_DOCUMENT_TITLE, FINANCIAL_INSURANCE_DISCLAIMER, FINANCIAL_INTRO, FINANCIAL_RESPONSIBILITY_HEADING, FINANCIAL_SELF_PAY_DISCLAIMER, RETINAL_DOCUMENT_SUBTITLE, RETINAL_DOCUMENT_TITLE, RETINAL_INTRO, RETINAL_OPTIONS, summarizeAcknowledgements } from '../src/content/acknowledgements.js';
import { agreementHtml, escapeHtml } from '../src/local-agreements.js';

test('agreements retain supplied source wording exactly', () => {
  assert.equal(RETINAL_INTRO, 'We are committed to providing high-quality eye care. As part of a comprehensive eye exam, your doctor evaluates the health of the retina each year. This helps screen for eye diseases such as glaucoma, retinal tears, diabetic eye disease, and other conditions that may affect vision and overall health.');
  assert.equal(RETINAL_DOCUMENT_TITLE, 'New iWellness and Fundus Photo agreement');
  assert.equal(RETINAL_DOCUMENT_SUBTITLE, 'iWellness/Fundus or Dilation');
  assert.deepEqual(RETINAL_OPTIONS[0].bullets, ['A detailed wide-field retinal photograph', 'A scan that evaluates the layers of the retina']);
  assert.equal(RETINAL_OPTIONS[2].description, 'I would like to decline both options (I understand this may limit the doctor’s ability to fully evaluate my retina)');
  assert.match(RETINAL_OPTIONS[1].description, /Dr\. Nim/);
  assert.equal(FINANCIAL_INSURANCE_DISCLAIMER, 'While we will file claims on your behalf with your insurance provider, it is important to understand that your insurance policy is a contract between you and your insurance company. As such, any determination of coverage, benefits, and payment for services rendered is ultimately made by your insurance provider.');
  assert.equal(FINANCIAL_INTRO, 'Thank you for choosing Precision Vision Institute for your healthcare needs. We are committed to providing you with the highest quality care. Please read and sign this Patient Financial Responsibility Agreement, which outlines your financial responsibilities regarding services rendered and insurance coverage.');
  assert.equal(FINANCIAL_SELF_PAY_DISCLAIMER, 'Patients understand that the quoted price must be paid at the end of service. If services include Scleral/Hybrid/CRT lenses and/or fittings, the patient can pay half of the amount at the end of the contact lens evaluation and the remaining amount during the follow-up appointment.');
  assert.equal(FINANCIAL_CLAUSES.length, 3);
  assert.equal(FINANCIAL_CLAUSES[0], 'Financial Responsibility: You are responsible for the payment of any and all charges for services provided to you by Precision Vision Institute that are not covered or only partially covered by your insurance plan. This includes, but is not limited to, deductibles, co-pays, co-insurance, and any non-covered services.');
  assert.equal(FINANCIAL_CLAUSES[1], 'Service Authorization: You are responsible for verifying the details of your insurance coverage, including any pre-authorization requirements for specific services or procedures. Precision Vision Institute is not liable for any services rendered that are denied coverage by your insurance provider.');
  assert.equal(FINANCIAL_CLAUSES[2], 'Payment Terms: Payment for any outstanding balance is due upon receipt of your statement.');
  assert.equal(FINANCIAL_RESPONSIBILITY_HEADING, 'Patient Responsibility: By signing this waiver, you acknowledge and agree to the following:');
  assert.equal(FINANCIAL_ACKNOWLEDGEMENT, 'By signing below, you acknowledge that you have read and understood this Patient Financial Responsibility Waiver and agree to the outlined terms:');
  assert.equal(RETINAL_OPTIONS[0].followup, 'These images allow your doctor to document and compare your eye health over time. This test is non-invasive, does not require eye drops, and does not cause changes in vision.');
  assert.equal(RETINAL_OPTIONS[1].closing, 'These effects are temporary and wear off as the drops wear off. In some cases, Doctor may still recommend dilation even if imaging is performed, if needed for medical reasons.');
});
test('local HTML contains every exact source paragraph', () => {
  const financial = agreementHtml('financial');
  const retinal = agreementHtml('retinal');
  for (const source of [FINANCIAL_DOCUMENT_TITLE, FINANCIAL_INTRO, FINANCIAL_INSURANCE_DISCLAIMER, FINANCIAL_SELF_PAY_DISCLAIMER, FINANCIAL_RESPONSIBILITY_HEADING, ...FINANCIAL_CLAUSES, FINANCIAL_ACKNOWLEDGEMENT]) assert.match(financial, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const source of [RETINAL_DOCUMENT_TITLE, RETINAL_DOCUMENT_SUBTITLE, RETINAL_OPTIONS[0].followup, RETINAL_OPTIONS[1].closing]) assert.match(retinal, new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
test('local HTML escapes every typed value', () => { const hostile = '<img src=x onerror=alert(1)>&"\''; const html = agreementHtml('financial', { name: hostile, date: hostile, guardianName: hostile, guardianDate: hostile }); assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(html, /<img|onerror=alert\(1\)>/); assert.equal(escapeHtml(hostile), '&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;'); });
test('report summary is redacted', () => { const summary = summarizeAcknowledgements({ retinal: { selectedOption: 'pupil-dilation', name: 'Jane Doe', date: '2026-01-15', confirmed: true }, financial: { name: 'Jane Doe', date: '2026-01-15', guardianName: 'John Doe', guardianDate: '2026-01-15', confirmed: true } }); assert.deepEqual(summary, { retinal: { completed: true, selectedOption: 'pupil-dilation' }, financial: { completed: true } }); assert.doesNotMatch(JSON.stringify(summary), /Jane|John|2026-01-15/); });
