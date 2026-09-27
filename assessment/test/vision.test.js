import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACUITY_LEVELS,
  CONTRAST_LEVELS,
  COLOR_PLATES,
  scoreAcuity,
  scoreContrast,
  scoreColorPlates,
} from '../src/content/vision.js';

test('ACUITY_LEVELS: at least four levels, strictly decreasing size, largest first', () => {
  assert.ok(ACUITY_LEVELS.length >= 4);
  for (let i = 1; i < ACUITY_LEVELS.length; i++) {
    assert.ok(ACUITY_LEVELS[i].sizePx < ACUITY_LEVELS[i - 1].sizePx);
  }
});

test('CONTRAST_LEVELS: at least four levels, strictly decreasing opacity, most visible first', () => {
  assert.ok(CONTRAST_LEVELS.length >= 4);
  for (let i = 1; i < CONTRAST_LEVELS.length; i++) {
    assert.ok(CONTRAST_LEVELS[i].opacity < CONTRAST_LEVELS[i - 1].opacity);
    assert.ok(CONTRAST_LEVELS[i].opacity > 0);
  }
});

test('COLOR_PLATES: at least three plates, each with a valid correct index', () => {
  assert.ok(COLOR_PLATES.length >= 3);
  for (const plate of COLOR_PLATES) {
    assert.ok(Array.isArray(plate.options));
    assert.ok(plate.options.length >= 3);
    assert.ok(plate.correctIndex >= 0 && plate.correctIndex < plate.options.length);
  }
});

test('scoreAcuity: reading every level down to the smallest -> best category', () => {
  const allTrue = ACUITY_LEVELS.map(() => true);
  const result = scoreAcuity(allTrue);
  assert.equal(result.smallestReadableIndex, ACUITY_LEVELS.length - 1);
  assert.equal(result.category, 'Excellent');
});

test('scoreAcuity: failing at the very first (largest) level -> lowest category', () => {
  const allFalse = ACUITY_LEVELS.map(() => false);
  const result = scoreAcuity(allFalse);
  assert.equal(result.smallestReadableIndex, -1);
  assert.equal(result.smallestReadableLabel, null);
  assert.equal(result.category, 'Needs attention');
});

test('scoreAcuity: stops at first unreadable level even if later flags are (incorrectly) true', () => {
  const flags = ACUITY_LEVELS.map((_, i) => i < 2); // true, true, false, false...
  const result = scoreAcuity(flags);
  assert.equal(result.smallestReadableIndex, 1);
  assert.equal(result.smallestReadableLabel, ACUITY_LEVELS[1].label);
});

test('scoreContrast: full pass -> best category; full fail -> lowest category', () => {
  const allTrue = CONTRAST_LEVELS.map(() => true);
  const allFalse = CONTRAST_LEVELS.map(() => false);
  assert.equal(scoreContrast(allTrue).category, 'Excellent');
  assert.equal(scoreContrast(allFalse).category, 'Needs attention');
});

test('scoreColorPlates: all correct -> typical, all wrong -> follow-up suggested', () => {
  const allCorrect = COLOR_PLATES.map((p) => p.correctIndex);
  const allWrong = COLOR_PLATES.map((p) => (p.correctIndex + 1) % p.options.length);
  const goodResult = scoreColorPlates(allCorrect);
  const badResult = scoreColorPlates(allWrong);
  assert.equal(goodResult.correct, COLOR_PLATES.length);
  assert.equal(goodResult.category, 'Typical color response');
  assert.equal(badResult.correct, 0);
  assert.equal(badResult.category, 'Possible color-vision difference — consider follow-up');
});

test('scoreColorPlates: never throws on missing answers', () => {
  const result = scoreColorPlates([]);
  assert.equal(result.correct, 0);
  assert.equal(result.total, COLOR_PLATES.length);
});
