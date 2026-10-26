import test from 'node:test';
import assert from 'node:assert/strict';
import { VIDEO_SOLUTION_SLUG_REGEX } from '../video-solution-schema.js';

test('VIDEO_SOLUTION_SLUG_REGEX kabul edilen sluglar', () => {
  assert.equal(VIDEO_SOLUTION_SLUG_REGEX.test('2025-8-matematik-yazili1'), true);
  assert.equal(VIDEO_SOLUTION_SLUG_REGEX.test('abc'), true);
  assert.equal(VIDEO_SOLUTION_SLUG_REGEX.test('a-b-c'), true);
});

test('VIDEO_SOLUTION_SLUG_REGEX reddedilen sluglar', () => {
  assert.equal(VIDEO_SOLUTION_SLUG_REGEX.test('Bad-Slug'), false);
  assert.equal(VIDEO_SOLUTION_SLUG_REGEX.test('-leading'), false);
  assert.equal(VIDEO_SOLUTION_SLUG_REGEX.test('trailing-'), false);
  assert.equal(VIDEO_SOLUTION_SLUG_REGEX.test('under_score'), false);
});
