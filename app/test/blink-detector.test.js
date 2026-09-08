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
