import { el, clear } from '../ui/dom.js';
import { ACUITY_LEVELS, ACUITY_LETTERS, CONTRAST_LEVELS, COLOR_PLATES } from '../content/vision.js';

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Small deterministic PRNG so a given plate's dot pattern looks stable, not diagnostic-grade. */
function mulberry32(seed) {
  let a = seed;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function renderAcuityStep(root, { onComplete }) {
  const flags = [];
  let levelIndex = 0;

  const letterEl = el('div', { class: 'acuity-letter', 'aria-hidden': 'true' });
  const promptEl = el('p', { class: 'fine-print' });
  const yesBtn = el('button', { class: 'button', type: 'button' }, 'Yes, clearly');
  const noBtn = el('button', { class: 'button button-outline', type: 'button' }, "No / not sure");

  function showLevel() {
    const level = ACUITY_LEVELS[levelIndex];
    letterEl.textContent = ACUITY_LETTERS[levelIndex % ACUITY_LETTERS.length];
    letterEl.style.fontSize = `${level.sizePx}px`;
    promptEl.textContent = `Level ${levelIndex + 1} of ${ACUITY_LEVELS.length} — from your normal screen distance, can you read this letter clearly?`;
  }

  function answer(canRead) {
    flags[levelIndex] = canRead;
    levelIndex += 1;
    if (!canRead || levelIndex >= ACUITY_LEVELS.length) {
      onComplete(flags);
      return;
    }
    showLevel();
  }

  yesBtn.addEventListener('click', () => answer(true));
  noBtn.addEventListener('click', () => answer(false));
  showLevel();

  return el('div', { class: 'screen' }, [
    el('section', { class: 'card', 'aria-labelledby': 'acuity-heading' }, [
      el('h2', { id: 'acuity-heading' }, 'Vision check 1 of 3 — Letter size'),
      el('p', { class: 'fine-print' }, 'Self-report screening only — not a substitute for a professional eye exam.'),
      el('div', { class: 'acuity-stage' }, [letterEl]),
      promptEl,
      el('div', { class: 'step-actions' }, [yesBtn, noBtn]),
    ]),
  ]);
}

export function renderContrastStep(root, { onComplete }) {
  const flags = [];
  let levelIndex = 0;

  const shape = el('div', { class: 'contrast-shape', 'aria-hidden': 'true' });
  const box = el('div', { class: 'contrast-box' }, [shape]);
  const promptEl = el('p', { class: 'fine-print' });
  const yesBtn = el('button', { class: 'button', type: 'button' }, 'Yes, I can see it');
  const noBtn = el('button', { class: 'button button-outline', type: 'button' }, "No / not sure");

  function showLevel() {
    const level = CONTRAST_LEVELS[levelIndex];
    shape.style.opacity = String(level.opacity);
    promptEl.textContent = `Level ${levelIndex + 1} of ${CONTRAST_LEVELS.length} — can you make out the shape below?`;
  }

  function answer(visible) {
    flags[levelIndex] = visible;
    levelIndex += 1;
    if (!visible || levelIndex >= CONTRAST_LEVELS.length) {
      onComplete(flags);
      return;
    }
    showLevel();
  }

  yesBtn.addEventListener('click', () => answer(true));
  noBtn.addEventListener('click', () => answer(false));
  showLevel();

  return el('div', { class: 'screen' }, [
    el('section', { class: 'card', 'aria-labelledby': 'contrast-heading' }, [
      el('h2', { id: 'contrast-heading' }, 'Vision check 2 of 3 — Contrast'),
      el('p', { class: 'fine-print' }, 'Self-report screening only — not a substitute for a professional eye exam.'),
      box,
      promptEl,
      el('div', { class: 'step-actions' }, [yesBtn, noBtn]),
    ]),
  ]);
}

export function renderColorStep(root, { onComplete }) {
  const answers = [];
  let plateIndex = 0;

  const plateVisual = el('div', { class: 'color-plate', 'aria-hidden': 'true' });
  const optionsWrap = el('div', { class: 'option-list color-options' });
  const promptEl = el('p', { class: 'fine-print' });

  function renderDots(plate) {
    clear(plateVisual);
    const rand = mulberry32(hashSeed(plate.id));
    for (let i = 0; i < 90; i++) {
      const size = (rand() * 7 + 4).toFixed(1);
      const dot = el('span', {
        class: 'color-dot',
        style: `left:${(rand() * 92 + 3).toFixed(1)}%;top:${(rand() * 84 + 8).toFixed(1)}%;width:${size}px;height:${size}px;background:${plate.hueB};`,
      });
      plateVisual.appendChild(dot);
    }
    plateVisual.appendChild(el('span', { class: 'color-plate-numeral', style: `color:${plate.hueA};` }, plate.numeral));
  }

  function showPlate() {
    const plate = COLOR_PLATES[plateIndex];
    renderDots(plate);
    promptEl.textContent = `Plate ${plateIndex + 1} of ${COLOR_PLATES.length} — what number do you see?`;
    clear(optionsWrap);
    plate.options.forEach((option, i) => {
      optionsWrap.appendChild(
        el('button', { class: 'button button-outline option-button', type: 'button', onClick: () => selectAnswer(i) }, option)
      );
    });
  }

  function selectAnswer(i) {
    answers[plateIndex] = i;
    plateIndex += 1;
    if (plateIndex >= COLOR_PLATES.length) {
      onComplete(answers);
      return;
    }
    showPlate();
  }

  showPlate();

  return el('div', { class: 'screen' }, [
    el('section', { class: 'card', 'aria-labelledby': 'color-heading' }, [
      el('h2', { id: 'color-heading' }, 'Vision check 3 of 3 — Color'),
      el('p', { class: 'fine-print' }, 'A simplified, non-diagnostic color-response demo — not a clinical color-vision test.'),
      plateVisual,
      promptEl,
      optionsWrap,
    ]),
  ]);
}
