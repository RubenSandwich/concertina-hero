// Tests for when a note can still be played and when it is finally missed.
// Run with: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  missTime,
  isPlayable,
  noteProgress,
  noteVisible,
  HIT_WINDOW,
  MISS_AT,
  LEAD_TIME,
} from './timing.ts'

const BEAT = 600 // one beat at 100 BPM

test('missTime lands at the end of the note s one-beat hold window', () => {
  assert.equal(missTime(0, BEAT), 600)
  assert.equal(missTime(1200, BEAT), 1800)
  assert.equal(missTime(0, BEAT), BEAT * MISS_AT)
})

test('isPlayable opens HIT_WINDOW before the beat', () => {
  assert.equal(isPlayable(1000 - HIT_WINDOW, 1000, BEAT), true, 'earliest allowed press')
  assert.equal(isPlayable(1000 - HIT_WINDOW - 1, 1000, BEAT), false, 'too early to count')
})

test('isPlayable keeps a late note catchable until it is all the way gone', () => {
  assert.equal(isPlayable(1000, 1000, BEAT), true, 'right on the beat')
  assert.equal(isPlayable(1300, 1000, BEAT), true, 'half a beat late still catches it')
  assert.equal(isPlayable(1599, 1000, BEAT), true, 'a hair before it leaves the line')
  assert.equal(isPlayable(1600, 1000, BEAT), false, 'missed once the card has fully gone')
  assert.equal(isPlayable(1700, 1000, BEAT), false, 'well past the note')
})

test('a note is never both missed and still playable', () => {
  for (const now of [800, 900, 1000, 1200, 1400, 1599, 1600, 1700]) {
    const missed = now >= missTime(1000, BEAT)
    assert.equal(isPlayable(now, 1000, BEAT) && missed, false, `at ${now}ms`)
  }
})

test('short beats shrink the late window below the early one', () => {
  const fast = 100 // a 16th at speed, shorter than HIT_WINDOW
  assert.equal(missTime(0, fast), 100)
  assert.equal(isPlayable(-HIT_WINDOW, 0, fast), true, 'early tolerance is unchanged')
  assert.equal(isPlayable(99, 0, fast), true)
  assert.equal(isPlayable(100, 0, fast), false, 'the beat is over, so the note is gone')
})

test('noteProgress maps time-until-hit to a fall from the top (0) to the line (1)', () => {
  assert.equal(noteProgress(LEAD_TIME), 0, 'just spawned at the top')
  assert.equal(noteProgress(LEAD_TIME / 2), 0.5, 'halfway down')
  assert.equal(noteProgress(0), 1, 'leading edge on the hit line')
  assert.ok(noteProgress(-LEAD_TIME / 2) > 1, 'past the line, being clipped')
})

test('noteVisible spans spawn to one beat past the line, and nothing else', () => {
  const beatFrac = 0.2 // a one-beat-tall card
  assert.equal(noteVisible(-0.01, beatFrac), false, 'not spawned yet')
  assert.equal(noteVisible(0.0, beatFrac), false, 'exactly at the top edge is not yet in')
  assert.equal(noteVisible(0.5, beatFrac), true, 'falling through the zone')
  assert.equal(noteVisible(1, beatFrac), true, 'on the hit line')
  assert.equal(noteVisible(1 + beatFrac - 0.01, beatFrac), true, 'still clipping away')
  assert.equal(noteVisible(1 + beatFrac, beatFrac), false, 'fully past the line — gone')
})
