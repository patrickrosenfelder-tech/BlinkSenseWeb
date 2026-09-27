import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READING_PASSAGE, scoreReading } from '../src/content/reading.js';

test('READING_PASSAGE: has passage text, a time limit, and exactly three questions', () => {
  assert.equal(typeof READING_PASSAGE.text, 'string');
  assert.ok(READING_PASSAGE.text.split(/\s+/).length >= 40, 'passage should be a real short passage, not a stub');
  assert.equal(typeof READING_PASSAGE.timeLimitSeconds, 'number');
  assert.ok(READING_PASSAGE.timeLimitSeconds > 0);
  assert.equal(READING_PASSAGE.questions.length, 3);
  for (const q of READING_PASSAGE.questions) {
    assert.equal(typeof q.id, 'string');
    assert.ok(Array.isArray(q.options));
    assert.equal(q.options.length, 4);
    assert.ok(Number.isInteger(q.correctIndex));
    assert.ok(q.correctIndex >= 0 && q.correctIndex < q.options.length);
  }
});

test('scoreReading: all correct answers -> 100%', () => {
  const answers = {};
  READING_PASSAGE.questions.forEach((q) => { answers[q.id] = q.correctIndex; });
  const result = scoreReading(answers);
  assert.equal(result.correct, 3);
  assert.equal(result.total, 3);
  assert.equal(result.percent, 100);
});

test('scoreReading: all wrong answers -> 0%', () => {
  const answers = {};
  READING_PASSAGE.questions.forEach((q) => {
    answers[q.id] = (q.correctIndex + 1) % q.options.length;
  });
  const result = scoreReading(answers);
  assert.equal(result.correct, 0);
  assert.equal(result.percent, 0);
});

test('scoreReading: partial and missing answers are handled deterministically', () => {
  const [q1, q2, q3] = READING_PASSAGE.questions;
  const answers = { [q1.id]: q1.correctIndex };
  // q2 unanswered, q3 wrong on purpose
  answers[q3.id] = (q3.correctIndex + 1) % q3.options.length;
  const result = scoreReading(answers);
  assert.equal(result.correct, 1);
  assert.equal(result.total, 3);
  assert.equal(result.percent, Math.round((1 / 3) * 100));
  assert.equal(result.details.length, 3);
  assert.equal(result.details.find((d) => d.id === q2.id).correct, false);
  assert.equal(result.details.find((d) => d.id === q2.id).selectedIndex, null);
});

test('scoreReading: empty answers object never throws', () => {
  const result = scoreReading({});
  assert.equal(result.correct, 0);
  assert.equal(result.total, 3);
});
