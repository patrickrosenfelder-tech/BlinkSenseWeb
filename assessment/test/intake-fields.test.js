import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTAKE_SECTIONS,
  REQUIRED_FIELD_IDS,
  SSN_NOTICE,
  isIntakeComplete,
  summarizeIntake,
} from '../src/content/intake-fields.js';

function allFields() {
  return INTAKE_SECTIONS.flatMap((s) => s.fields);
}

const EXPECTED_FIELD_IDS = [
  // Patient identity
  'last', 'first', 'middle', 'preferredName', 'dob', 'age',
  // Address
  'addressLine1', 'addressLine2', 'zip', 'state', 'city', 'country',
  // Gender & identity
  'legalGender', 'assignedSex', 'genderIdentity', 'pronouns',
  // Contact
  'email', 'cellPhone', 'homePhone', 'workPhone', 'extension', 'chartNumber',
  // Appointment
  'clinician', 'appointmentType', 'appointmentDate', 'startTime', 'endTime', 'durationMinutes', 'appointmentNote',
  // Status & insurance
  'appointmentStatus', 'insuranceVerified', 'insuranceProvider', 'insuranceType',
  'policyHolderPosition', 'groupNumber', 'memberNumber', 'eligibility', 'authorizationCode', 'copay',
  'policyHolder', 'policyHolderDob',
];

test('INTAKE_SECTIONS: every section has an id, title, and at least one field', () => {
  assert.ok(Array.isArray(INTAKE_SECTIONS));
  assert.ok(INTAKE_SECTIONS.length > 0);
  for (const section of INTAKE_SECTIONS) {
    assert.equal(typeof section.id, 'string');
    assert.ok(section.id.length > 0);
    assert.equal(typeof section.title, 'string');
    assert.ok(section.title.length > 0);
    assert.ok(Array.isArray(section.fields));
    assert.ok(section.fields.length > 0);
  }
  const sectionIds = INTAKE_SECTIONS.map((s) => s.id);
  assert.equal(new Set(sectionIds).size, sectionIds.length, 'section ids must be unique');
});

test('INTAKE_SECTIONS: every field has a unique id, a label, and a supported input type', () => {
  const SUPPORTED_TYPES = new Set(['text', 'date', 'time', 'number', 'email', 'tel', 'select', 'textarea']);
  const fields = allFields();
  const ids = fields.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'field ids must be unique');
  for (const field of fields) {
    assert.equal(typeof field.id, 'string');
    assert.equal(typeof field.label, 'string');
    assert.ok(field.label.length > 0, `field ${field.id} needs a visible label`);
    assert.ok(SUPPORTED_TYPES.has(field.type), `unsupported type for ${field.id}: ${field.type}`);
    if (field.type === 'select') {
      assert.ok(Array.isArray(field.options) && field.options.length > 1, `select field ${field.id} needs 2+ options`);
    }
  }
});

test('INTAKE_SECTIONS: includes every appointment-intake field named in the source form', () => {
  const ids = new Set(allFields().map((f) => f.id));
  assert.equal(ids.size, EXPECTED_FIELD_IDS.length);
  for (const id of EXPECTED_FIELD_IDS) {
    assert.ok(ids.has(id), `missing expected intake field: ${id}`);
  }
});

test('legalGender and assignedSex are restricted to female/male, per the source form', () => {
  const fields = allFields();
  const legalGender = fields.find((f) => f.id === 'legalGender');
  const assignedSex = fields.find((f) => f.id === 'assignedSex');
  assert.ok(legalGender, 'legalGender field must exist');
  assert.ok(assignedSex, 'assignedSex field must exist');
  assert.equal(legalGender.type, 'select');
  assert.equal(assignedSex.type, 'select');
  assert.deepEqual(legalGender.options, ['Female', 'Male']);
  assert.deepEqual(assignedSex.options, ['Female', 'Male']);
});

test('genderIdentity and pronouns are free-text, not constrained to a fixed list', () => {
  const fields = allFields();
  const genderIdentity = fields.find((f) => f.id === 'genderIdentity');
  const pronouns = fields.find((f) => f.id === 'pronouns');
  assert.equal(genderIdentity.type, 'text');
  assert.equal(pronouns.type, 'text');
});

test('SSN is never a collectible field, and is explicitly labeled as deliberately not collected', () => {
  const fields = allFields();
  const hasSsnField = fields.some(
    (f) => /ssn|social\s*security/i.test(f.id) || /ssn|social\s*security/i.test(f.label)
  );
  assert.equal(hasSsnField, false, 'no field should collect a Social Security Number');

  assert.equal(typeof SSN_NOTICE, 'object');
  assert.match(SSN_NOTICE.label, /social security/i);
  assert.equal(SSN_NOTICE.collected, false);
  assert.match(SSN_NOTICE.reason, /privacy|not collect/i);
});

test('REQUIRED_FIELD_IDS: a small, real subset of fields gates progress', () => {
  const ids = new Set(allFields().map((f) => f.id));
  assert.ok(Array.isArray(REQUIRED_FIELD_IDS));
  assert.ok(REQUIRED_FIELD_IDS.length > 0);
  assert.ok(REQUIRED_FIELD_IDS.length < allFields().length);
  for (const id of REQUIRED_FIELD_IDS) assert.ok(ids.has(id), `required id ${id} must be a real field`);
});

test('isIntakeComplete: false when answers are missing entirely', () => {
  assert.equal(isIntakeComplete(undefined), false);
  assert.equal(isIntakeComplete({}), false);
});

test('isIntakeComplete: false when a required field is blank or whitespace-only', () => {
  const values = {};
  REQUIRED_FIELD_IDS.forEach((id) => { values[id] = 'x'; });
  values[REQUIRED_FIELD_IDS[0]] = '   ';
  assert.equal(isIntakeComplete(values), false);
});

test('isIntakeComplete: false when partially answered', () => {
  const values = { [REQUIRED_FIELD_IDS[0]]: 'x' };
  assert.equal(isIntakeComplete(values), false);
});

test('isIntakeComplete: true once every required field has a non-blank value, regardless of optional fields', () => {
  const values = {};
  REQUIRED_FIELD_IDS.forEach((id) => { values[id] = 'x'; });
  assert.equal(isIntakeComplete(values), true);
});

test('summarizeIntake: reports counts only, never the raw entered values', () => {
  const values = {
    first: 'Jane',
    last: 'Doe',
    dob: '1990-01-01',
    email: 'jane.doe@example.com',
    cellPhone: '555-0100',
    insuranceProvider: 'Acme Health',
    memberNumber: 'M123456789',
    appointmentNote: 'Patient reports blurry vision in left eye',
  };
  const summary = summarizeIntake(values);
  const serialized = JSON.stringify(summary);
  const secrets = ['Jane', 'Doe', '1990-01-01', 'jane.doe@example.com', '555-0100', 'Acme Health', 'M123456789', 'blurry vision'];

  for (const secret of secrets) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `summary leaked: ${secret}`);
  }

  assert.equal(typeof summary.totalFields, 'number');
  assert.equal(typeof summary.completedFields, 'number');
  assert.ok(summary.completedFields >= 8);
  assert.equal(summary.requiredComplete, true);
  assert.ok(Array.isArray(summary.sections));
  for (const section of summary.sections) {
    assert.equal(typeof section.id, 'string');
    assert.equal(typeof section.completedCount, 'number');
    assert.equal(typeof section.totalCount, 'number');
    assert.ok(section.completedCount <= section.totalCount);
  }
});

test('summarizeIntake: totalFields matches the full schema size; empty input completes nothing', () => {
  const summary = summarizeIntake({});
  assert.equal(summary.totalFields, allFields().length);
  assert.equal(summary.completedFields, 0);
  assert.equal(summary.requiredComplete, false);
});

test('summarizeIntake: blank/whitespace-only values do not count as completed', () => {
  const values = {};
  allFields().forEach((f) => { values[f.id] = '   '; });
  const summary = summarizeIntake(values);
  assert.equal(summary.completedFields, 0);
  assert.equal(summary.requiredComplete, false);
});

test('summarizeIntake: handles undefined/null input like an empty form', () => {
  assert.deepEqual(summarizeIntake(undefined), summarizeIntake({}));
  assert.deepEqual(summarizeIntake(null), summarizeIntake({}));
});
