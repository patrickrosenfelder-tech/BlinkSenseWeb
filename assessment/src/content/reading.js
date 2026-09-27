// Short, timed reading-comprehension passage for the adult flow.
// Blink tracking (if the camera was granted) runs while this task is on screen.

export const READING_PASSAGE = {
  title: 'The Lighthouse Keeper',
  text:
    "Mara had kept the lighthouse for eleven years, ever since her father passed the job to her. " +
    "Every evening at dusk she climbed the spiral stairs, wound the old mechanism, and lit the lamp " +
    "before the fishing boats turned home. Storms rarely frightened her anymore, but she still logged " +
    "every gale in a worn notebook, noting wind direction and wave height. One October night, a small boat " +
    "signaled distress near the rocks. Mara radioed the coast guard, then kept the light steady until help " +
    "arrived. She never learned the sailors' names, only that they made it home safely, which was, she " +
    "decided, the only ending that mattered.",
  timeLimitSeconds: 90,
  questions: [
    {
      id: 'q1',
      prompt: 'How long had Mara kept the lighthouse?',
      options: ['Five years', 'Eleven years', 'Twenty years', 'Since she was a child'],
      correctIndex: 1,
    },
    {
      id: 'q2',
      prompt: 'What did Mara do every evening at dusk?',
      options: [
        'Called the coast guard',
        'Repaired the fishing boats',
        'Climbed the stairs and lit the lamp',
        'Wrote letters to sailors',
      ],
      correctIndex: 2,
    },
    {
      id: 'q3',
      prompt: 'What happened one October night?',
      options: [
        'The lamp went out',
        'A small boat signaled distress near the rocks',
        'Mara retired from the lighthouse',
        "Mara's father visited",
      ],
      correctIndex: 1,
    },
  ],
};

/**
 * @param {Record<string, number>} answers - question id -> selected option index.
 */
export function scoreReading(answers = {}) {
  const details = READING_PASSAGE.questions.map((q) => {
    const selectedIndex = Number.isInteger(answers[q.id]) ? answers[q.id] : null;
    return {
      id: q.id,
      selectedIndex,
      correctIndex: q.correctIndex,
      correct: selectedIndex === q.correctIndex,
    };
  });
  const correct = details.filter((d) => d.correct).length;
  const total = details.length;
  return {
    correct,
    total,
    percent: total > 0 ? Math.round((correct / total) * 100) : 0,
    details,
  };
}
