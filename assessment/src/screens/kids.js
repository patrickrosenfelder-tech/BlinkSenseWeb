import { el, clear } from '../ui/dom.js';
import { KIDS_AGE_BANDS, getKidsTask } from '../content/kids.js';

const BAND_LABELS = { '6-9': 'Ages 6–9', '10-13': 'Ages 10–13' };

export function renderAgeChoice(root, { onChoose }) {
  return el('div', { class: 'screen' }, [
    el('section', { class: 'card', 'aria-labelledby': 'age-heading' }, [
      el('h2', { id: 'age-heading' }, 'How old is the child?'),
      el('p', { class: 'fine-print' }, 'This adjusts the story, letters, and colors to fit their age.'),
      el('div', { class: 'choice-grid' },
        KIDS_AGE_BANDS.map((band) =>
          el('button', { class: 'choice-button', type: 'button', onClick: () => onChoose(band) }, [
            el('span', { class: 'choice-title' }, BAND_LABELS[band]),
          ])
        )
      ),
    ]),
  ]);
}

/** Runs the story question, then each letter round, then each color round, one at a time. */
export function renderKidsTask(root, { band, onSubmit }) {
  const task = getKidsTask(band);
  const responses = { storyAnswerIndex: null, letterAnswers: [], colorAnswers: [] };
  const stage = el('div', { class: 'kids-stage' });
  const progressEl = el('p', { class: 'fine-print' });

  const steps = [
    () => renderStory(),
    ...task.letterRounds.map((round, i) => () => renderLetterRound(round, i)),
    ...task.colorRounds.map((round, i) => () => renderColorRound(round, i)),
  ];
  let stepIndex = 0;

  function advance() {
    stepIndex += 1;
    if (stepIndex >= steps.length) {
      onSubmit(responses);
      return;
    }
    progressEl.textContent = `Step ${stepIndex + 1} of ${steps.length}`;
    clear(stage);
    stage.appendChild(steps[stepIndex]());
  }

  function renderStory() {
    return el('div', { class: 'kids-round' }, [
      el('p', { class: 'kids-story-text' }, task.story.text),
      el('p', { class: 'kids-question' }, task.story.question),
      el('div', { class: 'choice-grid kids-answer-grid' },
        task.story.options.map((option, i) =>
          el('button', { class: 'choice-button', type: 'button', onClick: () => { responses.storyAnswerIndex = i; advance(); } }, option)
        )
      ),
    ]);
  }

  function renderLetterRound(round, i) {
    return el('div', { class: 'kids-round' }, [
      el('p', { class: 'kids-question' }, round.prompt),
      el('div', { class: 'acuity-letter kids-target-letter', style: `font-size:${round.fontSizePx}px;`, 'aria-hidden': 'true' }, round.target),
      el('div', { class: 'choice-grid kids-answer-grid' },
        round.options.map((option, optIndex) =>
          el('button', {
            class: 'choice-button kids-letter-button',
            type: 'button',
            style: `font-size:${Math.max(28, round.fontSizePx / 2)}px;`,
            onClick: () => { responses.letterAnswers[i] = optIndex; advance(); },
          }, option)
        )
      ),
    ]);
  }

  function renderColorRound(round, i) {
    return el('div', { class: 'kids-round' }, [
      el('p', { class: 'kids-question' }, round.prompt),
      el('div', { class: 'kids-color-row' },
        round.colors.map((color, colorIndex) =>
          el('button', {
            class: 'kids-color-circle',
            type: 'button',
            style: `background:${color.hex};`,
            'aria-label': `${color.name} color option`,
            onClick: () => { responses.colorAnswers[i] = colorIndex; advance(); },
          })
        )
      ),
    ]);
  }

  progressEl.textContent = `Step 1 of ${steps.length}`;
  stage.appendChild(steps[0]());

  return el('div', { class: 'screen' }, [
    el('section', { class: 'card', 'aria-labelledby': 'kids-task-heading' }, [
      el('h2', { id: 'kids-task-heading' }, 'Story & picture game'),
      progressEl,
      stage,
    ]),
  ]);
}
