// Tests for the hold scoring and the accuracy -> rank mapping. Run with: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import { rankFor, holdFraction, holdPoints, isSustaining, gradeFor } from './scoring.ts'
import { PERFECT_WINDOW, GOOD_WINDOW, MIC_WINDOW_SCALE } from './timing.ts'

test('gradeFor grades a press by its distance from the beat', () => {
  assert.equal(gradeFor(0), 'perfect')
  assert.equal(gradeFor(PERFECT_WINDOW), 'perfect')
  assert.equal(gradeFor(PERFECT_WINDOW + 1), 'good')
  assert.equal(gradeFor(GOOD_WINDOW), 'good')
  assert.equal(gradeFor(GOOD_WINDOW + 1), 'ok')
  assert.equal(gradeFor(10_000), 'ok', 'a very late press still only ever grades Ok')
})

test('gradeFor treats early and late presses alike', () => {
  assert.equal(gradeFor(-PERFECT_WINDOW), 'perfect')
  assert.equal(gradeFor(-GOOD_WINDOW), 'good')
  assert.equal(gradeFor(-GOOD_WINDOW - 1), 'ok')
})

test('gradeFor widens both windows for the microphone', () => {
  const mic = MIC_WINDOW_SCALE
  assert.equal(gradeFor(PERFECT_WINDOW + 1, mic), 'perfect', 'would be Good on the keyboard')
  assert.equal(gradeFor(PERFECT_WINDOW * mic, mic), 'perfect')
  assert.equal(gradeFor(PERFECT_WINDOW * mic + 1, mic), 'good')
  assert.equal(gradeFor(GOOD_WINDOW * mic, mic), 'good')
  assert.equal(gradeFor(GOOD_WINDOW * mic + 1, mic), 'ok')
})

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
  assert.equal(isSustaining(2, 'push', { 2: 'push' }, []), true)
  assert.equal(isSustaining(2, 'push', { 2: 'pull' }, []), false, 'wrong bellows direction')
  assert.equal(isSustaining(2, 'push', {}, []), false)
  assert.equal(isSustaining(2, 'push', {}, [{ lane: 2, type: 'push' }]), true, 'mic sustains it')
  assert.equal(isSustaining(2, 'push', {}, [{ lane: 3, type: 'push' }]), false, 'wrong lane')
})

test('isSustaining holds every note of a chord the mic hears', () => {
  const chord = [
    { lane: 0, type: 'push' as const },
    { lane: 2, type: 'push' as const },
    { lane: 4, type: 'push' as const },
  ]
  for (const lane of [0, 2, 4]) {
    assert.equal(isSustaining(lane, 'push', {}, chord), true, `button ${lane + 1} held by mic`)
  }
  assert.equal(isSustaining(1, 'push', {}, chord), false, 'a lane not in the chord is not held')
  assert.equal(isSustaining(0, 'pull', {}, chord), false, 'right lane, wrong direction')
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
