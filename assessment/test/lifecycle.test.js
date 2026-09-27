import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disposeCameraTracker } from '../src/blink/lifecycle.js';

// Pure lifecycle helper: no DOM/camera/MediaPipe required. Verifies the fix
// for a leaked camera stream when getUserMedia succeeds but a later step in
// camera setup (e.g. video.play()) fails — the tracker must be reliably
// disposed before the reference is dropped, not just nulled out.

test('disposeCameraTracker: disposes a live tracker exactly once and returns null', () => {
  let disposeCalls = 0;
  const fakeTracker = { dispose: () => { disposeCalls += 1; } };

  const result = disposeCameraTracker(fakeTracker);

  assert.equal(disposeCalls, 1);
  assert.equal(result, null);
});

test('disposeCameraTracker: is a safe no-op when there is no tracker', () => {
  const result = disposeCameraTracker(null);
  assert.equal(result, null);
});

test('disposeCameraTracker: propagates if dispose itself throws, without swallowing the error', () => {
  const fakeTracker = { dispose: () => { throw new Error('stream stop failed'); } };
  assert.throws(() => disposeCameraTracker(fakeTracker), /stream stop failed/);
});
