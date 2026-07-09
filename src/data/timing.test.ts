// Tests for when a note can still be played and when it is finally missed.
// Run with: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import { missTime, isPlayable, HIT_WINDOW, MISS_AT } from './timing.ts'

const BEAT = 600 // one beat at 100 BPM

test('missTime lands 90% of the way through the note s hold window', () => {
  assert.equal(missTime(0, BEAT), 540)
  assert.equal(missTime(1200, BEAT), 1740)
  assert.equal(missTime(0, BEAT), BEAT * MISS_AT)
})

test('isPlayable opens HIT_WINDOW before the beat', () => {
  assert.equal(isPlayable(1000 - HIT_WINDOW, 1000, BEAT), true, 'earliest allowed press')
  assert.equal(isPlayable(1000 - HIT_WINDOW - 1, 1000, BEAT), false, 'too early to count')
})

test('isPlayable keeps a late note catchable until the moment it is missed', () => {
  assert.equal(isPlayable(1000, 1000, BEAT), true, 'right on the beat')
  assert.equal(isPlayable(1300, 1000, BEAT), true, 'half a beat late still catches it')
  assert.equal(isPlayable(1539, 1000, BEAT), true, 'a hair before the miss')
  assert.equal(isPlayable(1540, 1000, BEAT), false, 'missed exactly at missTime')
  assert.equal(isPlayable(1600, 1000, BEAT), false, 'well past the note')
})

test('a note is never both missed and still playable', () => {
  for (const now of [800, 900, 1000, 1200, 1400, 1539, 1540, 1700]) {
    const missed = now >= missTime(1000, BEAT)
    assert.equal(isPlayable(now, 1000, BEAT) && missed, false, `at ${now}ms`)
  }
})

test('short beats shrink the late window below the early one', () => {
  const fast = 100 // a 16th at speed, shorter than HIT_WINDOW
  assert.equal(missTime(0, fast), 90)
  assert.equal(isPlayable(-HIT_WINDOW, 0, fast), true, 'early tolerance is unchanged')
  assert.equal(isPlayable(89, 0, fast), true)
  assert.equal(isPlayable(90, 0, fast), false, 'the beat is over, so the note is gone')
})
