import { el } from '../ui/dom.js';
import { PROFILE_QUESTIONS, isProfileComplete } from '../content/profile-questions.js';

export function renderProfile(root, { onSubmit }) {
  const answers = {};
  const continueBtn = el('button', { class: 'button', type: 'button', disabled: true }, 'Continue');
  continueBtn.addEventListener('click', () => onSubmit(answers));

  const questionBlocks = PROFILE_QUESTIONS.map((q) =>
    el('fieldset', { class: 'question-block' }, [
      el('legend', {}, q.prompt),
      el('div', { class: 'option-list', role: 'radiogroup' },
        q.options.map((option, i) =>
          el('label', { class: 'option-card' }, [
            el('input', {
              type: 'radio',
              name: q.id,
              value: String(i),
              onChange: () => {
                answers[q.id] = i;
                continueBtn.disabled = !isProfileComplete(answers);
              },
            }),
            el('span', {}, option),
          ])
        )
      ),
    ])
  );

  return el('div', { class: 'screen' }, [
    el('section', { class: 'card', 'aria-labelledby': 'profile-heading' }, [
      el('h2', { id: 'profile-heading' }, 'A few quick questions'),
      el('p', { class: 'fine-print' }, 'These stay on your device and are only included in the report you choose to download.'),
      ...questionBlocks,
      el('div', { class: 'step-actions' }, [continueBtn]),
    ]),
  ]);
}
