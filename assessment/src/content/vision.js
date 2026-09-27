// Lightweight, self-report vision screening content.
// These are simplified, on-device checks for general awareness only — not a
// substitute for a comprehensive eye exam by a qualified professional.

export const ACUITY_LEVELS = [
  { id: 'A1', sizePx: 96, label: '20/70 (large)' },
  { id: 'A2', sizePx: 64, label: '20/50' },
  { id: 'A3', sizePx: 44, label: '20/40' },
  { id: 'A4', sizePx: 30, label: '20/30' },
  { id: 'A5', sizePx: 20, label: '20/20 (small)' },
];

// A pangram-friendly, visually distinct letter set for each acuity level.
export const ACUITY_LETTERS = ['E', 'F', 'P', 'T', 'O'];

export const CONTRAST_LEVELS = [
  { id: 'C1', opacity: 0.85, label: 'High contrast' },
  { id: 'C2', opacity: 0.55, label: 'Medium contrast' },
  { id: 'C3', opacity: 0.32, label: 'Low contrast' },
  { id: 'C4', opacity: 0.18, label: 'Very low contrast' },
  { id: 'C5', opacity: 0.08, label: 'Minimal contrast' },
];

// Simplified, original dot-pattern "plates" using red/green confusion-line
// hues. These are an approximate screening demo, not a clinical Ishihara
// test, and are always presented with a not-diagnostic disclaimer.
export const COLOR_PLATES = [
  { id: 'P1', numeral: '12', options: ['12', '17', '71', 'No number'], correctIndex: 0, hueA: '#c1666b', hueB: '#6b8f71' },
  { id: 'P2', numeral: '8', options: ['3', '8', '9', 'No number'], correctIndex: 1, hueA: '#b0703c', hueB: '#3c7a8f' },
  { id: 'P3', numeral: '29', options: ['29', '20', '9', 'No number'], correctIndex: 0, hueA: '#a85c5c', hueB: '#5c8f6a' },
  { id: 'P4', numeral: '5', options: ['5', '6', '2', 'No number'], correctIndex: 0, hueA: '#bf7a4a', hueB: '#4a8fbf' },
];

function classifyLevelIndex(smallestReadableIndex, totalLevels) {
  if (smallestReadableIndex === totalLevels - 1) return 'Excellent';
  if (smallestReadableIndex >= Math.floor(totalLevels / 2)) return 'Good';
  if (smallestReadableIndex >= 0) return 'Reduced';
  return 'Needs attention';
}

/** Finds the smallest level the participant could still read, stopping at the first "no". */
function smallestReadableIndexFrom(flags, levels) {
  let index = -1;
  for (let i = 0; i < levels.length; i++) {
    if (flags[i]) index = i;
    else break;
  }
  return index;
}

/**
 * @param {boolean[]} readableFlags - in level order (largest -> smallest), true if participant could read it.
 */
export function scoreAcuity(readableFlags = []) {
  const smallestReadableIndex = smallestReadableIndexFrom(readableFlags, ACUITY_LEVELS);
  return {
    smallestReadableIndex,
    smallestReadableLabel: smallestReadableIndex >= 0 ? ACUITY_LEVELS[smallestReadableIndex].label : null,
    category: classifyLevelIndex(smallestReadableIndex, ACUITY_LEVELS.length),
  };
}

/**
 * @param {boolean[]} visibleFlags - in level order (most -> least contrast), true if participant could see it.
 */
export function scoreContrast(visibleFlags = []) {
  const smallestVisibleIndex = smallestReadableIndexFrom(visibleFlags, CONTRAST_LEVELS);
  return {
    smallestVisibleIndex,
    smallestVisibleLabel: smallestVisibleIndex >= 0 ? CONTRAST_LEVELS[smallestVisibleIndex].label : null,
    category: classifyLevelIndex(smallestVisibleIndex, CONTRAST_LEVELS.length),
  };
}

/**
 * @param {number[]} answers - selected option index per plate, aligned with COLOR_PLATES.
 */
export function scoreColorPlates(answers = []) {
  const total = COLOR_PLATES.length;
  const correct = COLOR_PLATES.reduce((count, plate, i) => (answers[i] === plate.correctIndex ? count + 1 : count), 0);
  const category =
    correct === total
      ? 'Typical color response'
      : correct >= Math.ceil(total / 2)
        ? 'Mostly typical'
        : 'Possible color-vision difference — consider follow-up';
  return { correct, total, category };
}
