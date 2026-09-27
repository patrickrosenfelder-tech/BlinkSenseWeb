import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KIDS_AGE_BANDS,
  isValidAgeBand,
  getKidsTask,
  scoreKidsTask,
} from '../src/content/kids.js';

test('KIDS_AGE_BANDS: exposes the two supported age choices', () => {
  assert.deepEqual(KIDS_AGE_BANDS, ['6-9', '10-13']);
});

test('isValidAgeBand: validates supported bands only', () => {
  assert.equal(isValidAgeBand('6-9'), true);
  assert.equal(isValidAgeBand('10-13'), true);
  assert.equal(isValidAgeBand('adult'), false);
  assert.equal(isValidAgeBand(undefined), false);
});

test('getKidsTask: throws for an unknown band', () => {
  assert.throws(() => getKidsTask('grownup'));
});

for (const band of KIDS_AGE_BANDS) {
  test(`getKidsTask('${band}'): returns a complete, age-appropriate task`, () => {
    const task = getKidsTask(band);
    assert.equal(typeof task.story.text, 'string');
    assert.ok(task.story.text.length > 10);
    assert.ok(Array.isArray(task.story.options));
    assert.ok(Number.isInteger(task.story.correctIndex));

    assert.equal(task.letterRounds.length, 2);
    task.letterRounds.forEach((round) => {
      assert.ok(Array.isArray(round.options));
      assert.ok(Number.isInteger(round.correctIndex));
      assert.ok(round.fontSizePx > 0);
    });

    assert.equal(task.colorRounds.length, 2);
    task.colorRounds.forEach((round) => {
      assert.ok(Array.isArray(round.colors));
      assert.ok(Number.isInteger(round.correctIndex));
      // Each swatch must carry an accessible color name, not just a hex value,
      // so the UI can give kids-color-circle buttons a real aria-label.
      round.colors.forEach((color) => {
        assert.equal(typeof color.hex, 'string');
        assert.match(color.hex, /^#[0-9a-fA-F]{6}$/);
        assert.equal(typeof color.name, 'string');
        assert.ok(color.name.length > 0);
      });
    });
  });
}

test('getKidsTask: younger band (6-9) uses larger letter targets than older band (10-13)', () => {
  const younger = getKidsTask('6-9');
  const older = getKidsTask('10-13');
  younger.letterRounds.forEach((round, i) => {
    assert.ok(round.fontSizePx > older.letterRounds[i].fontSizePx);
  });
});

test('scoreKidsTask: perfect responses score 100%', () => {
  const band = '6-9';
  const task = getKidsTask(band);
  const responses = {
    storyAnswerIndex: task.story.correctIndex,
    letterAnswers: task.letterRounds.map((r) => r.correctIndex),
    colorAnswers: task.colorRounds.map((r) => r.correctIndex),
  };
  const result = scoreKidsTask(band, responses);
  assert.equal(result.correct, result.total);
  assert.equal(result.percent, 100);
});

test('scoreKidsTask: all-wrong responses score 0%', () => {
  const band = '10-13';
  const task = getKidsTask(band);
  const responses = {
    storyAnswerIndex: (task.story.correctIndex + 1) % task.story.options.length,
    letterAnswers: task.letterRounds.map((r) => (r.correctIndex + 1) % r.options.length),
    colorAnswers: task.colorRounds.map((r) => (r.correctIndex + 1) % r.colors.length),
  };
  const result = scoreKidsTask(band, responses);
  assert.equal(result.correct, 0);
  assert.equal(result.percent, 0);
});

test('scoreKidsTask: missing responses do not throw and count as incorrect', () => {
  const result = scoreKidsTask('6-9', {});
  assert.equal(result.correct, 0);
  assert.equal(result.total, 5);
});
