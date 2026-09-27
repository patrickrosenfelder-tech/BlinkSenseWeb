export function createInitialState() {
  return {
    mode: null, // 'adult' | 'kids'
    ageBand: null, // '6-9' | '10-13' (kids only)
    cameraEnabled: false,
    profileAnswers: {},
    readingAnswers: {},
    acuityFlags: [],
    contrastFlags: [],
    colorAnswers: [],
    kidsResponses: { storyAnswerIndex: null, letterAnswers: [], colorAnswers: [] },
  };
}
