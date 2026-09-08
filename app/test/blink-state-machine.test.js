import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlinkStateMachine } from '../src/blink-state-machine.js';

const OPEN_EAR = 0.30;
const CLOSED_EAR = 0.12;

function frame(machine, timestampMs, ear) {
  return machine.process({ timestampMs, ear });
}

function intentionalBlink(machine, startMs, fps, openEar = OPEN_EAR, closedEar = CLOSED_EAR) {
  const interval = 1000 / fps;
  // A 150ms closure is long enough to be intentional at every required FPS.
  for (let time = startMs; time < startMs + 160; time += interval) frame(machine, time, closedEar);
  for (let time = startMs + 160; time < startMs + 340; time += interval) frame(machine, time, openEar);
}

test('diagnostics returns 0.0 before first decoded frame', () => {
  const machine = new BlinkStateMachine();
  const diag = machine.getDiagnostics();
  assert.equal(diag.openBaseline, 0.0);
  assert.equal(diag.closeThreshold, 0.0);
  assert.equal(diag.reopenThreshold, 0.0);
});

for (const fps of [10, 15, 24, 30, 60]) {
  test(`counts exactly 100 close/reopen cycles at ${fps} processed FPS`, () => {
    const machine = new BlinkStateMachine();
    frame(machine, 0, OPEN_EAR);
    for (let cycle = 0; cycle < 100; cycle++) intentionalBlink(machine, 500 + cycle * 700, fps);
    assert.equal(machine.blinkCount, 100);
  });

  test(`counts exactly 100 close/reopen cycles at ${fps} processed FPS (low EAR fixture)`, () => {
    const machine = new BlinkStateMachine();
    frame(machine, 0, 0.20);
    for (let cycle = 0; cycle < 100; cycle++) intentionalBlink(machine, 500 + cycle * 700, fps, 0.20, 0.08);
    assert.equal(machine.blinkCount, 100);
  });
}

test('rejects micro-closures and noisy threshold crossings', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  frame(machine, 50, CLOSED_EAR);
  frame(machine, 100, OPEN_EAR); // 50ms micro-closure
  for (let time = 200; time <= 600; time += 50) frame(machine, time, time % 100 ? 0.24 : 0.23);
  assert.equal(machine.blinkCount, 0);
  assert.ok(machine.getDiagnostics().rejectedEvents.some((event) => event.reason === 'closure_too_short'));
});

test('sustained closure counts once and reopen jitter cannot over-count', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  for (let time = 50; time <= 1000; time += 50) frame(machine, time, CLOSED_EAR);
  for (const [time, ear] of [[1050, OPEN_EAR], [1100, 0.20], [1150, OPEN_EAR], [1200, 0.20], [1250, OPEN_EAR], [1300, OPEN_EAR]]) {
    frame(machine, time, ear);
  }
  assert.equal(machine.blinkCount, 1);
});

test('EAR is scale invariant for equivalent landmark coordinates', () => {
  const machine = new BlinkStateMachine();
  const eye = [
    { x: 0, y: 0 }, { x: 2, y: 4 }, { x: 8, y: 4 },
    { x: 10, y: 0 }, { x: 8, y: -4 }, { x: 2, y: -4 },
  ];
  const scaled = eye.map(({ x, y }) => ({ x: x * 7.25, y: y * 7.25 }));
  assert.equal(BlinkStateMachine.eyeAspectRatio(eye), BlinkStateMachine.eyeAspectRatio(scaled));
});

test('enforces refractory period (debounce) for rapid successive closures', () => {
  const machine = new BlinkStateMachine();
  frame(machine, 0, OPEN_EAR);
  
  // First valid blink (lasts 100ms)
  for (let time = 100; time <= 200; time += 20) frame(machine, time, CLOSED_EAR);
  frame(machine, 250, OPEN_EAR); 
  assert.equal(machine.blinkCount, 1);
  
  // Second closure within refractory period (refractory is 180ms, lastAcceptedAt = 250)
  const res = frame(machine, 350, CLOSED_EAR);
  assert.equal(res.decision, 'rejected_refractory');
  assert.equal(machine.getDiagnostics().state, 'open');
  
  // Close after refractory period
  frame(machine, 450, CLOSED_EAR);
  frame(machine, 600, OPEN_EAR);
  assert.equal(machine.blinkCount, 2);
});
