// Three short, local-only profile questions asked before the adult assessment.
// Answers are never uploaded — they exist only in this session's in-memory
// state and, if the user downloads a report, in that local JSON file.

export const PROFILE_QUESTIONS = [
  {
    id: 'screenHours',
    prompt: 'A. How many hours a day do you typically spend looking at a screen?',
    options: ['Less than 2 hours', '2–4 hours', '4–8 hours', 'More than 8 hours'],
  },
  {
    id: 'eyeDiscomfort',
    prompt: 'B. Do you notice dry, tired, or strained eyes by the end of the day?',
    options: ['Never', 'Sometimes', 'Often', 'Almost always'],
  },
  {
    id: 'lastEyeExam',
    prompt: 'C. When did you last have your eyes checked by an eye-care professional?',
    options: ['Within the past year', '1–2 years ago', 'More than 2 years ago', "Can't recall / never"],
  },
];

export function isProfileComplete(answers) {
  if (!answers) return false;
  return PROFILE_QUESTIONS.every((q) => {
    const index = answers[q.id];
    return Number.isInteger(index) && index >= 0 && index < q.options.length;
  });
}

export function formatProfileAnswers(answers = {}) {
  return PROFILE_QUESTIONS.map((q) => {
    const index = answers[q.id];
    const hasAnswer = Number.isInteger(index) && index >= 0 && index < q.options.length;
    return {
      id: q.id,
      prompt: q.prompt,
      answer: hasAnswer ? q.options[index] : null,
    };
  });
}
