import test from 'node:test';
import assert from 'node:assert/strict';
import { getConsentActionPolicy, continueWithoutCameraAfterDenial } from '../src/screens/consent.js';

test('consent action policy allows no-camera and gates camera on acknowledgement', () => {
  const unacknowledged = getConsentActionPolicy(false);
  assert.deepEqual(unacknowledged, {
    canContinueWithoutCamera: true,
    canContinueWithCamera: false,
  });

  const acknowledged = getConsentActionPolicy(true);
  assert.deepEqual(acknowledged, {
    canContinueWithoutCamera: true,
    canContinueWithCamera: true,
  });
});

test('blocked-camera retry starts with the same no-camera policy', () => {
  assert.equal(getConsentActionPolicy(false).canContinueWithoutCamera, true);
  assert.equal(getConsentActionPolicy(false).canContinueWithCamera, false);
});

test('camera denial automatically selects the no-camera continuation path', () => {
  const calls = [];

  continueWithoutCameraAfterDenial((cameraWanted) => calls.push(cameraWanted));

  assert.deepEqual(calls, [false]);
});
