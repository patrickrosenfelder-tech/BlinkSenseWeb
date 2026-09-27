// Age-adjusted mini task for the kids flow. Combines a short story
// (reading-friendly), a letter-matching round (vision-friendly, acuity-like),
// and a color round (vision-friendly). Larger targets and simpler wording
// for the younger band.

export const KIDS_AGE_BANDS = ['6-9', '10-13'];

export function isValidAgeBand(band) {
  return KIDS_AGE_BANDS.includes(band);
}

const KIDS_TASKS = {
  '6-9': {
    story: {
      text: 'Sam the cat sat on a big red mat. Sam saw a small blue ball. Sam liked to play with the ball all day.',
      question: 'What color was the ball?',
      options: ['Red', 'Blue', 'Green', 'Yellow'],
      correctIndex: 1,
    },
    letterRounds: [
      { prompt: 'Which letter matches the big letter?', target: 'B', options: ['E', 'B', 'R', 'P'], correctIndex: 1, fontSizePx: 96 },
      { prompt: 'Which letter matches the big letter?', target: 'O', options: ['Q', 'D', 'O', 'C'], correctIndex: 2, fontSizePx: 96 },
    ],
    colorRounds: [
      {
        prompt: 'Tap the RED circle.',
        colors: [
          { hex: '#2E7D32', name: 'Green' },
          { hex: '#C62828', name: 'Red' },
          { hex: '#1565C0', name: 'Blue' },
        ],
        correctIndex: 1,
      },
      {
        prompt: 'Tap the YELLOW circle.',
        colors: [
          { hex: '#F9A825', name: 'Yellow' },
          { hex: '#6A1B9A', name: 'Purple' },
          { hex: '#00838F', name: 'Teal' },
        ],
        correctIndex: 0,
      },
    ],
  },
  '10-13': {
    story: {
      text:
        'Mia planted a small garden behind her house. Every morning before school, she watered the ' +
        'seedlings and checked for weeds. By the end of summer, her garden was full of bright sunflowers ' +
        'and ripe tomatoes.',
      question: 'When did Mia water her garden?',
      options: ['After school', 'Before school', 'At night', 'On weekends only'],
      correctIndex: 1,
    },
    letterRounds: [
      { prompt: 'Which letter matches the letter?', target: 'M', options: ['N', 'M', 'W', 'H'], correctIndex: 1, fontSizePx: 56 },
      { prompt: 'Which letter matches the letter?', target: 'S', options: ['Z', 'S', '5', '8'], correctIndex: 1, fontSizePx: 56 },
    ],
    colorRounds: [
      {
        prompt: 'Tap the TEAL circle.',
        colors: [
          { hex: '#00695C', name: 'Teal' },
          { hex: '#5D4037', name: 'Brown' },
          { hex: '#AD1457', name: 'Magenta' },
        ],
        correctIndex: 0,
      },
      {
        prompt: 'Tap the AMBER circle.',
        colors: [
          { hex: '#37474F', name: 'Slate' },
          { hex: '#FF8F00', name: 'Amber' },
          { hex: '#283593', name: 'Indigo' },
        ],
        correctIndex: 1,
      },
    ],
  },
};

export function getKidsTask(band) {
  if (!isValidAgeBand(band)) {
    throw new Error(`Unknown age band: ${band}`);
  }
  return KIDS_TASKS[band];
}

/**
 * @param {'6-9'|'10-13'} band
 * @param {{ storyAnswerIndex?: number, letterAnswers?: number[], colorAnswers?: number[] }} responses
 */
export function scoreKidsTask(band, responses = {}) {
  const task = getKidsTask(band);
  const { storyAnswerIndex, letterAnswers = [], colorAnswers = [] } = responses;

  let correct = 0;
  let total = 0;

  total += 1;
  if (storyAnswerIndex === task.story.correctIndex) correct += 1;

  task.letterRounds.forEach((round, i) => {
    total += 1;
    if (letterAnswers[i] === round.correctIndex) correct += 1;
  });

  task.colorRounds.forEach((round, i) => {
    total += 1;
    if (colorAnswers[i] === round.correctIndex) correct += 1;
  });

  return { correct, total, percent: total > 0 ? Math.round((correct / total) * 100) : 0 };
}
