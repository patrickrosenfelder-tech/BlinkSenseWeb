import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_QUESTIONS,
  isProfileComplete,
  formatProfileAnswers,
} from '../src/content/profile-questions.js';

test('PROFILE_QUESTIONS: exposes exactly three local profile questions (A/B/C)', () => {
  assert.equal(PROFILE_QUESTIONS.length, 3);
  for (const q of PROFILE_QUESTIONS) {
    assert.equal(typeof q.id, 'string');
    assert.equal(typeof q.prompt, 'string');
    assert.ok(q.prompt.length > 0);
    assert.ok(Array.isArray(q.options));
    assert.ok(q.options.length >= 2);
  }
  // ids must be unique
  const ids = PROFILE_QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('isProfileComplete: false when answers missing entirely', () => {
  assert.equal(isProfileComplete(undefined), false);
  assert.equal(isProfileComplete({}), false);
});

test('isProfileComplete: false when partially answered', () => {
  const partial = { [PROFILE_QUESTIONS[0].id]: 0 };
  assert.equal(isProfileComplete(partial), false);
});

test('isProfileComplete: true when every question has a valid selected index', () => {
  const answers = {};
  PROFILE_QUESTIONS.forEach((q) => { answers[q.id] = 0; });
  assert.equal(isProfileComplete(answers), true);
});

test('isProfileComplete: false when an index is out of range', () => {
  const answers = {};
  PROFILE_QUESTIONS.forEach((q) => { answers[q.id] = 999; });
  assert.equal(isProfileComplete(answers), false);
});

test('formatProfileAnswers: resolves indices to human-readable text', () => {
  const answers = {};
  PROFILE_QUESTIONS.forEach((q) => { answers[q.id] = 1; });
  const formatted = formatProfileAnswers(answers);
  assert.equal(formatted.length, 3);
  formatted.forEach((entry, i) => {
    assert.equal(entry.id, PROFILE_QUESTIONS[i].id);
    assert.equal(entry.prompt, PROFILE_QUESTIONS[i].prompt);
    assert.equal(entry.answer, PROFILE_QUESTIONS[i].options[1]);
  });
});

test('formatProfileAnswers: uses null for unanswered questions', () => {
  const formatted = formatProfileAnswers({});
  formatted.forEach((entry) => assert.equal(entry.answer, null));
});
