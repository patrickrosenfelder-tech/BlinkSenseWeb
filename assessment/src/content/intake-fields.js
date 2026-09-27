// Local, privacy-first intake form fields asked before the adult assessment.
// Every value here stays in this session's in-memory state — nothing is
// uploaded. Only a redacted, non-identifying completion summary (see
// summarizeIntake) is ever attached to the downloadable report; the raw
// values below never leave renderIntake's local `values` object.
//
// Social Security Numbers are deliberately excluded from this schema — see
// SSN_NOTICE — rather than collected and hidden.

export const SSN_NOTICE = {
  label: 'Social Security Number',
  collected: false,
  reason: 'Deliberately not collected, for privacy — BlinkSense Assessment never asks for or stores a Social Security Number, on this device or anywhere else.',
};

export const INTAKE_SECTIONS = [
  {
    id: 'identity',
    title: 'Patient identity',
    fields: [
      { id: 'last', label: 'Last name', type: 'text', required: true, autoComplete: 'family-name' },
      { id: 'first', label: 'First name', type: 'text', required: true, autoComplete: 'given-name' },
      { id: 'middle', label: 'Middle name', type: 'text', autoComplete: 'additional-name' },
      { id: 'preferredName', label: 'Preferred name', type: 'text', autoComplete: 'nickname' },
      { id: 'dob', label: 'Date of birth', type: 'date', required: true, autoComplete: 'bday' },
      { id: 'age', label: 'Age', type: 'number' },
    ],
  },
  {
    id: 'address',
    title: 'Address',
    fields: [
      { id: 'addressLine1', label: 'Address line 1', type: 'text', autoComplete: 'address-line1' },
      { id: 'addressLine2', label: 'Address line 2', type: 'text', autoComplete: 'address-line2' },
      { id: 'city', label: 'City', type: 'text', autoComplete: 'address-level2' },
      { id: 'state', label: 'State', type: 'text', autoComplete: 'address-level1' },
      { id: 'zip', label: 'ZIP code', type: 'text', autoComplete: 'postal-code' },
      { id: 'country', label: 'Country', type: 'text', autoComplete: 'country-name' },
    ],
  },
  {
    id: 'gender',
    title: 'Gender & identity',
    fields: [
      { id: 'legalGender', label: 'Legal gender', type: 'select', options: ['Female', 'Male'] },
      { id: 'assignedSex', label: 'Sex assigned at birth', type: 'select', options: ['Female', 'Male'] },
      { id: 'genderIdentity', label: 'Gender identity', type: 'text' },
      { id: 'pronouns', label: 'Pronouns', type: 'text', placeholder: 'e.g. she/her' },
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    fields: [
      { id: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
      { id: 'cellPhone', label: 'Cell phone', type: 'tel', autoComplete: 'tel' },
      { id: 'homePhone', label: 'Home phone', type: 'tel' },
      { id: 'workPhone', label: 'Work phone', type: 'tel' },
      { id: 'extension', label: 'Extension', type: 'text' },
      { id: 'chartNumber', label: 'Chart number', type: 'text' },
    ],
  },
  {
    id: 'appointment',
    title: 'Appointment',
    fields: [
      { id: 'clinician', label: 'Clinician', type: 'text' },
      { id: 'appointmentType', label: 'Appointment type', type: 'select', options: ['New patient exam', 'Follow-up', 'Consultation', 'Procedure', 'Other'] },
      { id: 'appointmentDate', label: 'Date', type: 'date' },
      { id: 'startTime', label: 'Start time', type: 'time' },
      { id: 'endTime', label: 'End time', type: 'time' },
      { id: 'durationMinutes', label: 'Duration (minutes)', type: 'number' },
      { id: 'appointmentNote', label: 'Appointment note', type: 'textarea' },
    ],
  },
  {
    id: 'insurance',
    title: 'Status & insurance',
    fields: [
      { id: 'appointmentStatus', label: 'Appointment status', type: 'select', options: ['Scheduled', 'Confirmed', 'Checked in', 'Completed', 'Cancelled', 'No-show'] },
      { id: 'insuranceVerified', label: 'Insurance verified', type: 'select', options: ['Not verified', 'Verified', 'Pending'] },
      { id: 'insuranceProvider', label: 'Insurance provider', type: 'text' },
      { id: 'insuranceType', label: 'Insurance type', type: 'select', options: ['Medical', 'Vision', 'Dental', 'Other'] },
      { id: 'policyHolderPosition', label: 'Policy-holder relationship', type: 'select', options: ['Self', 'Spouse', 'Child', 'Other'] },
      { id: 'groupNumber', label: 'Group number', type: 'text' },
      { id: 'memberNumber', label: 'Member number', type: 'text' },
      { id: 'eligibility', label: 'Eligibility', type: 'select', options: ['Eligible', 'Not eligible', 'Pending verification'] },
      { id: 'authorizationCode', label: 'Authorization code', type: 'text' },
      { id: 'copay', label: 'Copay', type: 'text' },
      { id: 'policyHolder', label: 'Policy holder name', type: 'text' },
      { id: 'policyHolderDob', label: 'Policy-holder date of birth', type: 'date' },
    ],
  },
];

export const REQUIRED_FIELD_IDS = INTAKE_SECTIONS
  .flatMap((section) => section.fields)
  .filter((field) => field.required)
  .map((field) => field.id);

function isFilled(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value != null && value !== '';
}

export function isIntakeComplete(values) {
  if (!values) return false;
  return REQUIRED_FIELD_IDS.every((id) => isFilled(values[id]));
}

export function summarizeIntake(values = {}) {
  const safeValues = values || {};
  const sections = INTAKE_SECTIONS.map((section) => {
    const totalCount = section.fields.length;
    const completedCount = section.fields.filter((field) => isFilled(safeValues[field.id])).length;
    return { id: section.id, completedCount, totalCount };
  });

  const totalFields = sections.reduce((sum, s) => sum + s.totalCount, 0);
  const completedFields = sections.reduce((sum, s) => sum + s.completedCount, 0);

  return {
    totalFields,
    completedFields,
    requiredComplete: isIntakeComplete(safeValues),
    sections,
  };
}
