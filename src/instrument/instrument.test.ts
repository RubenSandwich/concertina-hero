// Tests for the active-instrument seam: the spatial key map and the note map it
// derives, plus mic aliasing when a bigger instrument repeats a pitch.
// Run with: npm test  (each file runs in its own process, so switching the active
// instrument here does not leak into the other test files).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  KEY_CODES,
  LANE_NOTES,
  setActiveInstrument,
  getActiveInstrument,
  Direction,
} from './instrument.ts'
import { aliasesOf } from '../audio/pitch.ts'

// Always hand the module back to the 7-button default after a test mutates it.
function withInstrument(size: 7 | 10 | 20 | 30, run: () => void) {
  const prev = getActiveInstrument()
  try {
    setActiveInstrument(size)
    run()
  } finally {
    setActiveInstrument(prev)
  }
}

test('the 30-button maps the whole spatial grid: KeyQ→0 … Slash→29', () => {
  withInstrument(30, () => {
    assert.equal(KEY_CODES.KeyQ, 0)
    assert.equal(KEY_CODES.KeyY, 5) // first key of the right hand
    assert.equal(KEY_CODES.KeyA, 10) // home row
    assert.equal(KEY_CODES.KeyZ, 20) // bottom row
    assert.equal(KEY_CODES.Slash, 29) // button 30
    assert.equal(KEY_CODES.Space, undefined, 'a non-button key is undefined')
  })
})

test('a smaller instrument only binds the front of the grid', () => {
  withInstrument(7, () => {
    assert.equal(KEY_CODES.KeyQ, 0)
    assert.equal(KEY_CODES.KeyU, 6, 'button 7')
    assert.equal(
      KEY_CODES.KeyI,
      undefined,
      'button 8 is past a 7-button — ignored',
    )
    assert.equal(
      KEY_CODES.Digit1,
      undefined,
      'the old number-key controls are gone',
    )
  })
})

test('switching instrument rebuilds the note map and the key map in place', () => {
  withInstrument(7, () => {
    assert.equal(LANE_NOTES.length, 7)
    assert.equal(KEY_CODES.KeyP, undefined)
  })
  withInstrument(20, () => {
    assert.equal(LANE_NOTES.length, 20)
    assert.equal(KEY_CODES.KeyP, 9, 'button 10 now bound')
    assert.equal(KEY_CODES.Semicolon, 19, 'button 20 now bound')
  })
  // Back to the default after the helper restores it.
  assert.equal(LANE_NOTES.length, 7)
})

test('a pitch the 30-button repeats aliases to every button that sounds it', () => {
  withInstrument(30, () => {
    // Buttons 13 and 16 (lanes 12 and 15) both push G4 in the C row.
    assert.equal(LANE_NOTES[12].push.name, 'G')
    assert.equal(LANE_NOTES[15].push.name, 'G')
    assert.equal(LANE_NOTES[12].push.freq, LANE_NOTES[15].push.freq)

    const aliases = aliasesOf(12, Direction.Push)
    assert.ok(
      aliases.some((a) => a.lane === 12 && a.type === Direction.Push),
      'a note is always its own alias',
    )
    assert.ok(
      aliases.some((a) => a.lane === 15 && a.type === Direction.Push),
      'and its twin at the same pitch',
    )
  })
})

test('under the default 7-button every note is its own only alias', () => {
  withInstrument(7, () => {
    for (let lane = 0; lane < LANE_NOTES.length; lane++) {
      for (const type of [Direction.Push, Direction.Pull]) {
        assert.deepEqual(
          aliasesOf(lane, type),
          [{ lane, type }],
          `button ${lane + 1} ${type}`,
        )
      }
    }
  })
})
