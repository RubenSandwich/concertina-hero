// Tests for the hold scoring and the accuracy -> rank mapping. Run with: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import { rankFor, holdFraction, holdPoints, isSustaining } from './scoring.ts'

test('holdFraction reports the share of the sustain that was held', () => {
  assert.equal(holdFraction(0, 600), 0)
  assert.equal(holdFraction(300, 600), 0.5)
  assert.equal(holdFraction(600, 600), 1)
})

test('holdFraction clamps over-held, negative, and zero-length notes', () => {
  assert.equal(holdFraction(900, 600), 1, 'held past the end is still just fully held')
  assert.equal(holdFraction(-50, 600), 0, 'negative held time floors at zero')
  assert.equal(holdFraction(0, 0), 1, 'a zero-length note cannot be under-held')
})

test('holdPoints scales the onset grade by the held fraction', () => {
  assert.equal(holdPoints('perfect', 1), 100)
  assert.equal(holdPoints('perfect', 0.8), 80)
  assert.equal(holdPoints('good', 0.5), 30)
  assert.equal(holdPoints('ok', 1), 30)
})

test('holdPoints rounds to a whole score and floors at zero', () => {
  assert.equal(holdPoints('ok', 0.5), 15)
  assert.equal(holdPoints('good', 1 / 3), 20)
  assert.equal(holdPoints('perfect', 0.125), 13, 'rounds 12.5 up')
  assert.equal(holdPoints('perfect', 0), 0, 'a note released instantly scores nothing')
})

test('isSustaining accepts a held key or a matching sustained mic note', () => {
  assert.equal(isSustaining(2, 'push', { 2: 'push' }, null), true)
  assert.equal(isSustaining(2, 'push', { 2: 'pull' }, null), false, 'wrong bellows direction')
  assert.equal(isSustaining(2, 'push', {}, null), false)
  assert.equal(isSustaining(2, 'push', {}, { lane: 2, type: 'push' }), true, 'mic sustains it')
  assert.equal(isSustaining(2, 'push', {}, { lane: 3, type: 'push' }), false, 'wrong lane')
})

test('rankFor picks the right grade at each threshold boundary', () => {
  assert.equal(rankFor(100).grade, 'S')
  assert.equal(rankFor(95).grade, 'S')
  assert.equal(rankFor(94).grade, 'A')
  assert.equal(rankFor(85).grade, 'A')
  assert.equal(rankFor(84).grade, 'B')
  assert.equal(rankFor(70).grade, 'B')
  assert.equal(rankFor(69).grade, 'C')
  assert.equal(rankFor(50).grade, 'C')
  assert.equal(rankFor(49).grade, 'D')
  assert.equal(rankFor(0).grade, 'D')
})

test('rankFor always returns a label and a rank-- css class', () => {
  for (const accuracy of [100, 90, 75, 60, 10]) {
    const rank = rankFor(accuracy)
    assert.ok(rank.label.length > 0)
    assert.match(rank.cls, /^rank--[sabcd]$/)
  }
})
