import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlinkDetector, eyeAspectRatio3D } from '../src/blink-detector.js';

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

test('getDiagnostics() must be pure: must not call persistDiagnosticsLocally', (t) => {
  const detector = new BlinkDetector();
  const mockFace = new Array(468).fill({x: 0.5, y: 0.5, z: 0.1});
  detector.landmarker = { detectForVideo: () => ({ faceLandmarks: [mockFace] }) };

  const mockVideo = { currentTime: 0, videoWidth: 640, videoHeight: 480 };

  // Simulate 10 detector frames
  for (let i = 0; i < 10; i++) {
    mockVideo.currentTime = i;
    detector.detectFrame(mockVideo, 1000 + i * 33);
  }

  // Spy: count how many times persistDiagnosticsLocally is invoked by getDiagnostics()
  let persistCallCount = 0;
  const originalPersist = detector.persistDiagnosticsLocally.bind(detector);
  detector.persistDiagnosticsLocally = () => {
    persistCallCount++;
    originalPersist();
  };

  // Call getDiagnostics() 10 times (simulating the 500ms UI tick polling 10×)
  for (let i = 0; i < 10; i++) {
    detector.getDiagnostics(mockVideo);
  }

  // MUST be 0 — getDiagnostics() must be a pure read, never writing to storage
  assert.equal(persistCallCount, 0,
    `getDiagnostics() must not call persistDiagnosticsLocally(), but called it ${persistCallCount} time(s)`);
});

test('persistDiagnosticsLocally() writes to localStorage only when explicitly called', (t) => {
  const detector = new BlinkDetector();
  const mockFace = new Array(468).fill({x: 0.5, y: 0.5, z: 0.1});
  detector.landmarker = { detectForVideo: () => ({ faceLandmarks: [mockFace] }) };

  const mockVideo = { currentTime: 0, videoWidth: 640, videoHeight: 480 };

  // Spy on persistDiagnosticsLocally before any activity
  let persistCallCount = 0;
  const originalPersist = detector.persistDiagnosticsLocally.bind(detector);
  detector.persistDiagnosticsLocally = () => {
    persistCallCount++;
    originalPersist();
  };

  // Simulate detector activity
  mockVideo.currentTime = 0;
  detector.detectFrame(mockVideo, 1000);
  detector.getDiagnostics(mockVideo);

  // No implicit calls — only an explicit call should trigger it
  assert.equal(persistCallCount, 0, 'No writes before explicit persistDiagnosticsLocally() call');

  // Explicitly call persistDiagnosticsLocally()
  detector.persistDiagnosticsLocally();
  assert.equal(persistCallCount, 1, 'persistDiagnosticsLocally() should write exactly once when explicitly called');
});

test('export functionality still works: getDiagnostics() returns complete diagnostics object', (t) => {
  const detector = new BlinkDetector();
  const mockFace = new Array(468).fill({x: 0.5, y: 0.5, z: 0.1});
  detector.landmarker = { detectForVideo: () => ({ faceLandmarks: [mockFace] }) };

  const mockVideo = {
    currentTime: 0,
    videoWidth: 640,
    videoHeight: 480,
    srcObject: {
      getVideoTracks: () => [{
        getSettings: () => ({
          width: 640,
          height: 480,
          frameRate: 30,
          facingMode: 'user'
        })
      }]
    },
  };

  // Simulate detector activity
  for (let i = 0; i < 60; i++) {
    mockVideo.currentTime = i;
    detector.detectFrame(mockVideo, 1000 + i * 33);
  }

  // Get diagnostics for export
  const diag = detector.getDiagnostics(mockVideo);

  // Verify complete diagnostics are available
  assert.ok(diag.camera, 'Should have camera info');
  assert.ok(diag.decodedFps !== undefined, 'Should have decodedFps');
  assert.ok(diag.processedFps !== undefined, 'Should have processedFps');
  assert.ok(diag.longestFrameGapMs !== undefined, 'Should have longestFrameGapMs');
  assert.ok(diag.freezeCount !== undefined, 'Should have freezeCount');
  assert.ok(Array.isArray(diag.timeline), 'Should have timeline array');
  assert.ok(diag.lastLandmarkTimestampMs !== null, 'Should have landmark timestamp');

  // Verify that calling getDiagnostics multiple times returns consistent data
  const diag2 = detector.getDiagnostics(mockVideo);
  assert.equal(diag2.decodedFps, diag.decodedFps, 'Multiple calls should return consistent data');
  assert.equal(diag2.processedFps, diag.processedFps, 'Multiple calls should return consistent data');
});

// PAT-897: 3D EAR must be rotation-invariant. Yawing the head (rotating the
// eye landmark cloud around the vertical axis) must not collapse the EAR as
// the old 2D projection did — a genuine blink during head movement must
// still be visible, and head movement alone must not fake a blink.
test('PAT-897: 3D eyeAspectRatio is invariant under head yaw rotation', (t) => {
  // dlib-style 6-point eye contour: [outer, upper, upper, inner, lower, lower].
  // Upper/lower pairs (p1/p5, p2/p4) share x so vertical distance isolates lid
  // closure instead of being swamped by horizontal offset between the pairs.
  const width = 1280;
  const height = 720;
  const openEye = [
    { x: 0.10, y: 0.40, z: 0 }, // p0 outer
    { x: 0.13, y: 0.38, z: 0 }, // p1 upper-left
    { x: 0.17, y: 0.38, z: 0 }, // p2 upper-right
    { x: 0.20, y: 0.40, z: 0 }, // p3 inner
    { x: 0.17, y: 0.42, z: 0 }, // p4 lower-right
    { x: 0.13, y: 0.42, z: 0 }, // p5 lower-left
  ];
  const earStraight = eyeAspectRatio3D(openEye, [0, 1, 2, 3, 4, 5], width, height);

  // Yaw rotation by theta around the Y axis (head turning): x' = x cos, z' = -x sin
  const theta = (30 * Math.PI) / 180;
  const rotated = openEye.map(({ x, y, z }) => ({
    x: x * Math.cos(theta) + z * Math.sin(theta),
    y,
    z: -x * Math.sin(theta) + z * Math.cos(theta),
  }));
  const earYaw = eyeAspectRatio3D(rotated, [0, 1, 2, 3, 4, 5], width, height);

  // 3D EAR must barely change under rotation (<5% relative), so head turns
  // cannot masquerade as blinks and real blinks stay visible during movement.
  const ratio = Math.abs(earYaw - earStraight) / earStraight;
  assert.ok(ratio < 0.05, `3D EAR drifted ${(ratio * 100).toFixed(1)}% under 30deg yaw (${earStraight.toFixed(3)} -> ${earYaw.toFixed(3)})`);

  // Sanity: the closed eye EAR must still be clearly below the open eye EAR.
  // Collapse the upper/lower lid pair toward the eye's horizontal midline (0.40).
  const closedEye = openEye.map((p, i) => {
    if (i === 1 || i === 2) return { ...p, y: 0.399 }; // upper lid dropped
    if (i === 4 || i === 5) return { ...p, y: 0.401 }; // lower lid raised
    return p;
  });
  const earClosed = eyeAspectRatio3D(closedEye, [0, 1, 2, 3, 4, 5], width, height);
  assert.ok(earClosed < earStraight * 0.6, `closed EAR (${earClosed.toFixed(3)}) must be far below open EAR (${earStraight.toFixed(3)})`);
});

// PAT-925 Fix 4: face-not-found spans must be tracked separately from rAF/video stalls
// and inference exceptions — privacy-safe scalars + timeline event only.
test('PAT-925: face-not-found frames produce scalar counter and face_not_found_span timeline event', (t) => {
  const detector = new BlinkDetector();
  // Return empty landmarks (face not detected) on every call.
  detector.landmarker = {
    detectForVideo: () => ({ faceLandmarks: [], facialTransformationMatrixes: [] })
  };

  const mockVideo = {
    currentTime: 0,
    videoWidth: 640,
    videoHeight: 480,
    paused: false,
    play: async () => {}
  };

  // Feed 10 decoded frames with no face found (advancing currentTime each time).
  for (let i = 0; i < 10; i++) {
    mockVideo.currentTime = i + 1; // unique currentTime each frame
    detector.detectFrame(mockVideo, 1000 + i * 100);
  }

  const diag = detector.getDiagnostics(mockVideo);

  // PAT-925 RED: faceNotFoundFrames and longestFaceDropMs do not exist yet.
  assert.ok('faceNotFoundFrames' in diag,
    'getDiagnostics must expose faceNotFoundFrames scalar');
  assert.equal(diag.faceNotFoundFrames, 10,
    'All 10 frames with no landmarks must be counted');

  assert.ok('longestFaceDropMs' in diag,
    'getDiagnostics must expose longestFaceDropMs scalar');
  assert.ok(diag.longestFaceDropMs > 0,
    'longestFaceDropMs must be > 0 after 10 consecutive no-face frames');

  // A face_not_found_span event must appear in the timeline after enough consecutive misses.
  const spanEvents = diag.timeline.filter(e => e.type === 'face_not_found_span');
  assert.ok(spanEvents.length > 0,
    'face_not_found_span timeline event must be emitted on consecutive face-not-found frames');

  // Verify no landmark data is stored (privacy: only scalars allowed).
  for (const event of diag.timeline) {
    assert.ok(!('landmarks' in event), 'Timeline events must never contain raw landmark data');
  }
});

// PAT-925 Fix 4: face_found_resume event fires when face re-appears after a dropout span.
test('PAT-925: face_found_resume fires when landmarks re-appear after a face_not_found_span', (t) => {
  const detector = new BlinkDetector();
  let returnFace = false;
  const mockFace = new Array(468).fill({ x: 0.5, y: 0.5, z: 0.0 });
  detector.landmarker = {
    detectForVideo: () => ({
      faceLandmarks: returnFace ? [mockFace] : [],
      facialTransformationMatrixes: []
    })
  };

  const mockVideo = {
    currentTime: 0,
    videoWidth: 640,
    videoHeight: 480,
    paused: false,
    play: async () => {}
  };

  // 8 frames with no face (triggers span event at frame 5).
  for (let i = 0; i < 8; i++) {
    mockVideo.currentTime = i + 1;
    detector.detectFrame(mockVideo, 1000 + i * 100);
  }

  // Face re-appears.
  returnFace = true;
  mockVideo.currentTime = 9;
  detector.detectFrame(mockVideo, 1800);

  const diag = detector.getDiagnostics(mockVideo);
  const resumeEvents = diag.timeline.filter(e => e.type === 'face_found_resume');
  assert.ok(resumeEvents.length > 0,
    'face_found_resume must be logged when face re-appears after a dropout span');
  assert.ok('gapMs' in resumeEvents[0],
    'face_found_resume must include gapMs field describing dropout duration');
});

// PAT-1093: the closure-entry gate is supposed to block blinks that start during
// a head shake, using both nose-velocity (`motion`) and head-rotation (`yawProxy`)
// signals. But yawProxy was computed as `1.0 - matrix[10]` against the MediaPipe
// `Matrix` result object, which exposes its values under `matrix.data[10]`, not a
// direct numeric index — `matrix[10]` is always `undefined`, so yawProxy is always
// NaN and the rotation half of the entry gate never fires. A real head-turn/shake
// with little nose translation (rotation without much translation) then sails
// through the gate and gets counted as a blink.
test('PAT-1093: head rotation with negligible nose translation is blocked at closure entry (not silently admitted via NaN yawProxy)', () => {
  const detector = new BlinkDetector();
  const makeFace = (isOpen) => {
    const face = new Array(468).fill({ x: 0.5, y: 0.5, z: 0.1 });
    const spread = isOpen ? 0.05 : 0.005;
    face[160] = { x: 0.5, y: 0.5 - spread, z: 0.1 }; face[158] = { x: 0.5, y: 0.5 - spread, z: 0.1 };
    face[153] = { x: 0.5, y: 0.5 + spread, z: 0.1 }; face[144] = { x: 0.5, y: 0.5 + spread, z: 0.1 };
    face[33] = { x: 0.4, y: 0.5, z: 0.1 }; face[133] = { x: 0.6, y: 0.5, z: 0.1 };
    face[385] = { x: 0.5, y: 0.5 - spread, z: 0.1 }; face[387] = { x: 0.5, y: 0.5 - spread, z: 0.1 };
    face[373] = { x: 0.5, y: 0.5 + spread, z: 0.1 }; face[380] = { x: 0.5, y: 0.5 + spread, z: 0.1 };
    face[362] = { x: 0.4, y: 0.5, z: 0.1 }; face[263] = { x: 0.6, y: 0.5, z: 0.1 };
    return face;
  };

  // A real MediaPipe FaceLandmarker Matrix result: { rows, columns, data }.
  // data[10] is the rotation matrix's R[2][2] term; 0.5 models a substantial
  // head turn/shake (yawProxy = 1.0 - 0.5 = 0.5, well past the 0.20 gate).
  const rotatedMatrix = { rows: 4, columns: 4, data: new Array(16).fill(0) };
  rotatedMatrix.data[10] = 0.5;

  let currentFace = makeFace(true);
  detector.landmarker = {
    detectForVideo: () => ({ faceLandmarks: [currentFace], facialTransformationMatrixes: [rotatedMatrix] })
  };

  const mockVideo = { currentTime: 0, videoWidth: 640, videoHeight: 480 };

  // Warm up and settle with the head already rotated but the nose landmark held
  // fixed, so nose-velocity `motion` stays 0 and only the rotation signal can gate.
  for (let i = 0; i < 20; i++) {
    mockVideo.currentTime = i;
    detector.detectFrame(mockVideo, 1000 + i * 33);
  }

  currentFace = makeFace(false); // eyes close while still rotated
  mockVideo.currentTime = 20;
  const closeResult = detector.detectFrame(mockVideo, 1000 + 20 * 33);

  assert.equal(closeResult.decision, 'rejected_unstable',
    `closure entry during head rotation must be rejected, got '${closeResult.decision}'`);

  currentFace = makeFace(true); // reopen shortly after
  mockVideo.currentTime = 21;
  const reopenResult = detector.detectFrame(mockVideo, 1000 + 21 * 33);

  assert.equal(reopenResult.blinked, false, 'rotation-only head shake must never be counted as a blink');
  assert.equal(detector.machine.blinkCount, 0, 'blinkCount must stay 0 for a head rotation with no eyelid closure intent');
});
