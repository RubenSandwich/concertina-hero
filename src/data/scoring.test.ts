// Tests for the accuracy -> rank mapping. Run with: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import { rankFor } from './scoring.ts'

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
