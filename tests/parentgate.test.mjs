// js/parentgate.js makeParentQuestion: ranges, answer = a × b, at most 3 digits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeDom } from './fixtures/fake-dom.mjs';

installFakeDom({});
const { makeParentQuestion } = await import('../js/parentgate.js');

test('a in 12..29, b in 3..9, answer = a × b, at most 3 digits', () => {
  for (let i = 0; i < 2000; i++) {
    const { a, b, answer } = makeParentQuestion();
    assert.ok(Number.isInteger(a) && a >= 12 && a <= 29, `a=${a}`);
    assert.ok(Number.isInteger(b) && b >= 3 && b <= 9, `b=${b}`);
    assert.equal(answer, a * b);
    assert.ok(answer <= 999);
  }
});

test('the extremes of rng give the extremes of the ranges', () => {
  assert.deepEqual(makeParentQuestion(() => 0), { a: 12, b: 3, answer: 36 });
  assert.deepEqual(makeParentQuestion(() => 0.999999), { a: 29, b: 9, answer: 261 });
});
