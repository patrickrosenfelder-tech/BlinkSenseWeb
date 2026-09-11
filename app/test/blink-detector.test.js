import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlinkDetector } from '../src/blink-detector.js';

test('BlinkDetector diagnostics before first frame', (t) => {
  const detector = new BlinkDetector();
  const diagnostics = detector.getDiagnostics();

  assert.equal(diagnostics.decodedFps, 0.0, 'decodedFps should be 0.0 before first frame');
  assert.equal(diagnostics.processedFps, 0.0, 'processedFps should be 0.0 before first frame');
  assert.ok(Number.isFinite(diagnostics.decodedFps), 'decodedFps should be finite');
  assert.ok(Number.isFinite(diagnostics.processedFps), 'processedFps should be finite');
});

test('BlinkDetector watchdog handles media pipeline freeze and recovers', (t) => {
  const detector = new BlinkDetector();
  // Mock landmarker
  const mockFace = new Array(468).fill({x: 0.5, y: 0.5, z: 0.1});
  detector.landmarker = { detectForVideo: () => ({ faceLandmarks: [mockFace] }) };

  let playCalled = false;
  const mockVideo = {
    currentTime: 0,
    videoWidth: 640,
    videoHeight: 480,
    paused: true,
    play: async () => { playCalled = true; }
  };

  // Setup tracker mock
  let resetCalled = false;
  const originalReset = detector.machine.resetTracking.bind(detector.machine);
  detector.machine.resetTracking = () => {
    resetCalled = true;
    originalReset();
  };

  detector.detectFrame(mockVideo, 1000);
  assert.equal(detector.freezeCount, 0);

  mockVideo.currentTime = 1;
  detector.detectFrame(mockVideo, 1030);
  assert.equal(detector.freezeCount, 0);

  mockVideo.currentTime = 1; // freeze video time
  detector.detectFrame(mockVideo, 3500);

  assert.equal(detector.freezeCount, 1, 'Should register a freeze for gap > 2000ms');
  assert.equal(detector.longestFrameGapMs, 2470, 'Should track longest gap');
  assert.ok(playCalled, 'Should attempt recovery by calling video.play()');
  assert.ok(resetCalled, 'Should reset state machine tracking');

  mockVideo.currentTime = 2;
  detector.detectFrame(mockVideo, 3530);
  assert.equal(detector.freezeCount, 1, 'Freeze count should not increment on normal gap');

  // Send a normal frame to clear the recovery latch
  mockVideo.currentTime = 3;
  detector.detectFrame(mockVideo, 3560);
  assert.equal(detector.isRecovering, false, 'Recovery latch should be cleared');

  mockVideo.currentTime = 3; // another freeze video time
  detector.detectFrame(mockVideo, 6000);
  assert.equal(detector.freezeCount, 2, 'Should register another freeze');
});

test('BlinkDetector exports timeline with stall start/end, cadence, exceptions, and state changes', (t) => {
  const detector = new BlinkDetector();
  const mockFace = new Array(468).fill({x: 0.5, y: 0.5, z: 0.1});
  detector.landmarker = { detectForVideo: () => ({ faceLandmarks: [mockFace] }) };

  const mockVideo = {
    currentTime: 0,
    videoWidth: 640,
    videoHeight: 480,
    paused: true,
    play: async () => {}
  };

  // 1. Trigger cadence events (60 callbacks)
  for(let i=0; i<60; i++) {
     mockVideo.currentTime = i;
     detector.detectFrame(mockVideo, 1000 + i * 16);
  }

  // 2. Trigger an exception
  detector.landmarker.detectForVideo = () => { throw new Error('Simulated exception'); };
  mockVideo.currentTime = 60;
  detector.detectFrame(mockVideo, 2000);

  // Restore landmarker
  detector.landmarker.detectForVideo = () => ({ faceLandmarks: [mockFace] });

  // 3. Trigger stall
  mockVideo.currentTime = 60; // time frozen
  detector.detectFrame(mockVideo, 4100); // 2100ms gap

  // 4. End stall
  mockVideo.currentTime = 61;
  detector.detectFrame(mockVideo, 4150);

  // 5. Trigger stall_end on next callback
  mockVideo.currentTime = 61;
  detector.detectFrame(mockVideo, 4166);

  const diag = detector.getDiagnostics();
  assert.ok(Array.isArray(diag.timeline), 'Timeline should be an array');

  const events = diag.timeline;

  const cadences = events.filter(e => e.type === 'cadence');
  assert.ok(cadences.length >= 1, 'Should have at least one cadence event');
  assert.ok('decodedFrames' in cadences[0]);
  assert.ok('processedFps' in cadences[0]);
  assert.ok('invokeDuration' in cadences[0]);
  assert.ok('ear' in cadences[0]);
  assert.ok('stateMachineState' in cadences[0]);

  const exceptions = events.filter(e => e.type === 'mediapipe_exception');
  assert.equal(exceptions.length, 1, 'Should log one exception');
  assert.ok(exceptions[0].error.includes('Simulated exception'));

  const stallStarts = events.filter(e => e.type === 'stall_start');
  assert.equal(stallStarts.length, 1, 'Should log stall_start');

  const stallEnds = events.filter(e => e.type === 'stall_end');
  assert.equal(stallEnds.length, 1, 'Should log stall_end');
});

test('BlinkDetector exports lastLandmarkTimestampMs and tracks actual closedDuration in state_open', (t) => {
  const detector = new BlinkDetector();
  const mockVideo = { currentTime: 0, videoWidth: 640, videoHeight: 480 };
  let currentFace = null;
  detector.landmarker = { detectForVideo: () => ({ faceLandmarks: currentFace ? [currentFace] : [] }) };

  // 1. No landmarks yet
  detector.detectFrame(mockVideo, 1000);
  let diag = detector.getDiagnostics();
  assert.equal(diag.lastLandmarkTimestampMs, null, 'Should be null before landmarks');

  // 2. Fresh landmarks accepted
  const RIGHT_EYE = [33, 160, 158, 133, 153, 144];
  const LEFT_EYE = [362, 385, 387, 263, 373, 380];
  // Function to create an open or closed eye mock face
  const makeFace = (isOpen) => {
    const face = new Array(468).fill({x: 0.5, y: 0.5, z: 0.1});
    const spread = isOpen ? 0.05 : 0.005;
    // Set vertical spread for right eye (indices 160 vs 144, etc)
    face[160] = {x: 0.5, y: 0.5 - spread, z: 0.1}; face[158] = {x: 0.5, y: 0.5 - spread, z: 0.1};
    face[153] = {x: 0.5, y: 0.5 + spread, z: 0.1}; face[144] = {x: 0.5, y: 0.5 + spread, z: 0.1};
    face[33] = {x: 0.4, y: 0.5, z: 0.1}; face[133] = {x: 0.6, y: 0.5, z: 0.1}; // horizontal spread

    // Set vertical spread for left eye
    face[385] = {x: 0.5, y: 0.5 - spread, z: 0.1}; face[387] = {x: 0.5, y: 0.5 - spread, z: 0.1};
    face[373] = {x: 0.5, y: 0.5 + spread, z: 0.1}; face[380] = {x: 0.5, y: 0.5 + spread, z: 0.1};
    face[362] = {x: 0.4, y: 0.5, z: 0.1}; face[263] = {x: 0.6, y: 0.5, z: 0.1}; // horizontal spread
    return face;
  };

  // Warmup frames with open eyes
  currentFace = makeFace(true);
  for (let i = 0; i < 40; i++) {
    mockVideo.currentTime = i;
    detector.detectFrame(mockVideo, 2000 + i * 33);
  }
  diag = detector.getDiagnostics();
  assert.equal(diag.lastLandmarkTimestampMs, 2000 + 39 * 33, 'Should track fresh landmark timestamp');

  // 3. Simulate a blink to check closedDuration
  currentFace = makeFace(false); // Close eyes
  mockVideo.currentTime = 40;
  detector.detectFrame(mockVideo, 3500); // state_closed fires

  currentFace = makeFace(true); // Open eyes
  mockVideo.currentTime = 41;
  detector.detectFrame(mockVideo, 3650); // state_open fires

  diag = detector.getDiagnostics();
  const stateOpenEvents = diag.timeline.filter(e => e.type === 'state_open');
  assert.equal(stateOpenEvents.length, 1, 'Should have exactly one state_open event');
  assert.equal(stateOpenEvents[0].closedDuration, 150, 'closedDuration should be exactly 150ms');
});
