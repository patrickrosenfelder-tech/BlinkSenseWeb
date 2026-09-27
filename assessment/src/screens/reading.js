import { el } from '../ui/dom.js';
import { READING_PASSAGE } from '../content/reading.js';

export function renderReading(root, { onSubmit }) {
  const answers = {};
  let secondsLeft = READING_PASSAGE.timeLimitSeconds;
  let submitted = false;

  const timerEl = el('span', { class: 'timer-value', role: 'timer', 'aria-live': 'polite' }, formatTime(secondsLeft));
  const submitBtn = el('button', { class: 'button', type: 'button' }, 'Submit answers');

  function formatTime(s) {
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function finish() {
    if (submitted) return;
    submitted = true;
    clearInterval(intervalId);
    onSubmit({ ...answers });
  }

  submitBtn.addEventListener('click', finish);

  const intervalId = setInterval(() => {
    secondsLeft -= 1;
    timerEl.textContent = formatTime(Math.max(secondsLeft, 0));
    if (secondsLeft <= 0) finish();
  }, 1000);

  const questionBlocks = READING_PASSAGE.questions.map((q) =>
    el('fieldset', { class: 'question-block' }, [
      el('legend', {}, q.prompt),
      el('div', { class: 'option-list', role: 'radiogroup' },
        q.options.map((option, i) =>
          el('label', { class: 'option-card' }, [
            el('input', {
              type: 'radio',
              name: q.id,
              value: String(i),
              onChange: () => { answers[q.id] = i; },
            }),
            el('span', {}, option),
          ])
        )
      ),
    ])
  );

  return el('div', { class: 'screen' }, [
    el('section', { class: 'card', 'aria-labelledby': 'reading-heading' }, [
      el('div', { class: 'reading-head' }, [
        el('h2', { id: 'reading-heading' }, READING_PASSAGE.title),
        el('span', { class: 'status-pill' }, ['Time left: ', timerEl]),
      ]),
      el('p', { class: 'reading-passage' }, READING_PASSAGE.text),
    ]),
    el('section', { class: 'card', 'aria-labelledby': 'reading-questions-heading' }, [
      el('h2', { id: 'reading-questions-heading' }, 'Comprehension questions'),
      ...questionBlocks,
      el('div', { class: 'step-actions' }, [submitBtn]),
    ]),
  ]);
}
