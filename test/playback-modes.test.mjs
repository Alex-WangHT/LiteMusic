import test from 'node:test';
import assert from 'node:assert/strict';
import { nextTrackIndex } from '../public/playback-modes.mjs';

test('sequential stops at boundaries, list loop wraps, single loops only on end', () => {
  const next = (mode, index, direction = 1, ended = false) => nextTrackIndex({ mode, index, length: 3, direction, ended });
  assert.equal(next('order', 2), -1);
  assert.equal(next('order', 0, -1), -1);
  assert.equal(next('order', 0), 1);
  assert.equal(next('loop', 2), 0);
  assert.equal(next('loop', 0, -1), 2);
  assert.equal(next('single', 1, 1, true), 1);
  assert.equal(next('single', 1), 2);
  assert.equal(next('single', 0, -1), 2);
});
test('random excludes current, handles one song, empty list and unselected track', () => {
  for (let index = 0; index < 4; index++) {
    for (const value of [0, 0.3, 0.6, 0.999]) {
      const selected = nextTrackIndex({ mode: 'random', index, length: 4, random: () => value });
      assert.notEqual(selected, index);
      assert.ok(selected >= 0 && selected < 4);
    }
  }
  assert.equal(nextTrackIndex({ mode: 'random', index: 0, length: 1 }), 0);
  assert.equal(nextTrackIndex({ mode: 'loop', index: -1, length: 0 }), -1);
  assert.equal(nextTrackIndex({ mode: 'order', index: -1, length: 3 }), 0);
});
