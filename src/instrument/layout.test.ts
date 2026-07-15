// Tests for the instrument layout geometry, numbering, key map and notes.
// Run with: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LAYOUTS,
  INSTRUMENT_SIZES,
  KEY_ORDER,
  Hand,
  type InstrumentSize,
} from './layout.ts'
import { Direction } from './instrument.ts'

const EPS = 1e-9

test('every layout has exactly `size` buttons, numbered 1…N with lane = number − 1', () => {
  for (const size of INSTRUMENT_SIZES) {
    const { buttons } = LAYOUTS[size]
    assert.equal(buttons.length, size, `${size}-button count`)
    buttons.forEach((b, i) => {
      assert.equal(b.lane, i, `${size}: lane at index ${i}`)
      assert.equal(b.number, i + 1, `${size}: number at index ${i}`)
    })
  }
})

test('numbering runs top-to-bottom, left-to-right across the screen', () => {
  for (const size of INSTRUMENT_SIZES) {
    const { buttons } = LAYOUTS[size]
    // Consecutive numbers never step to a higher row, and within a row x increases.
    for (let i = 1; i < buttons.length; i++) {
      const prev = buttons[i - 1]
      const cur = buttons[i]
      assert.ok(
        cur.row >= prev.row,
        `${size}: row must not decrease at ${cur.number}`,
      )
      if (cur.row === prev.row) {
        assert.ok(
          cur.x > prev.x,
          `${size}: x must increase within a row at ${cur.number}`,
        )
      }
    }
  }
})

test('the 7-button is one centred rainbow row, no hands, no divider', () => {
  const { geometry, buttons } = LAYOUTS[7]
  assert.equal(geometry.split, false)
  assert.equal(geometry.rows, 1)
  assert.ok(buttons.every((b) => b.hand === Hand.Single && b.row === 0))
  // Evenly spaced centres at (i + 0.5) / 7.
  buttons.forEach((b, i) =>
    assert.ok(Math.abs(b.x - (i + 0.5) / 7) < EPS, `x of button ${i + 1}`),
  )
  // Distinct rainbow colours.
  assert.equal(new Set(buttons.map((b) => b.color)).size, 7)
})

test('two-hand layouts split left | right at the divider', () => {
  for (const size of [10, 20, 30] as InstrumentSize[]) {
    const { buttons } = LAYOUTS[size]
    assert.ok(buttons.every((b) => b.hand !== Hand.Single))
    assert.ok(
      buttons.filter((b) => b.hand === Hand.Left).every((b) => b.x < 0.5),
    )
    assert.ok(
      buttons.filter((b) => b.hand === Hand.Right).every((b) => b.x > 0.5),
    )
    // Equal split between the hands.
    assert.equal(buttons.filter((b) => b.hand === Hand.Left).length, size / 2)
    assert.equal(buttons.filter((b) => b.hand === Hand.Right).length, size / 2)
  }
})

test('the right hand mirrors the left across the divider', () => {
  for (const size of [10, 20, 30] as InstrumentSize[]) {
    const { buttons } = LAYOUTS[size]
    // A left button and its mirror (same hand-column and row on the right) sit at
    // reflected x positions and share the outer→inner colour.
    for (const left of buttons.filter((b) => b.hand === Hand.Left)) {
      const right = buttons.find(
        (b) =>
          b.hand === Hand.Right && b.row === left.row && b.col === left.col,
      )
      assert.ok(right, `${size}: mirror of button ${left.number}`)
      assert.ok(
        Math.abs(right!.x - (1 - left.x)) < EPS,
        `${size}: mirrored x of ${left.number}`,
      )
      assert.equal(
        right!.color,
        left.color,
        `${size}: mirrored colour of ${left.number}`,
      )
    }
  }
})

test('20-button rows are staggered by half a column', () => {
  const { geometry, buttons } = LAYOUTS[20]
  const unit = 0.5 / geometry.cols
  const row0 = buttons
    .filter((b) => b.hand === Hand.Left && b.row === 0)
    .map((b) => b.x)
  const row1 = buttons
    .filter((b) => b.hand === Hand.Left && b.row === 1)
    .map((b) => b.x)
  // Each staggered-row lane sits half a column off the aligned row.
  row0.forEach((x, i) =>
    assert.ok(Math.abs(row1[i] - x - unit / 2) < EPS, `stagger at col ${i}`),
  )
})

test('30-button top and bottom rows align; the middle row is offset', () => {
  const { geometry, buttons } = LAYOUTS[30]
  const unit = 0.5 / geometry.cols
  const col = (row: number) =>
    buttons.filter((b) => b.hand === Hand.Left && b.row === row).map((b) => b.x)
  const [top, mid, bottom] = [col(0), col(1), col(2)]
  top.forEach((x, i) => {
    assert.ok(Math.abs(bottom[i] - x) < EPS, `top/bottom aligned at col ${i}`)
    assert.ok(
      Math.abs(mid[i] - x - unit / 2) < EPS,
      `middle offset at col ${i}`,
    )
  })
})

test('the fixed key map yields Q→1, Y→6, A→11, Z→21, /→30', () => {
  const { buttons } = LAYOUTS[30]
  const keyOf = (n: number) => buttons.find((b) => b.number === n)!.keyLabel
  assert.equal(keyOf(1), 'Q')
  assert.equal(keyOf(6), 'Y')
  assert.equal(keyOf(11), 'A')
  assert.equal(keyOf(21), 'Z')
  assert.equal(keyOf(30), '/')
  // Buttons take the physical keys in order.
  buttons.forEach((b) =>
    assert.equal(b.key, KEY_ORDER[b.lane], `key code of button ${b.number}`),
  )
})

test('smaller instruments use the front of the same key grid', () => {
  // 7 → Q W E R T Y U; 10 → the whole top row.
  assert.deepEqual(
    LAYOUTS[7].buttons.map((b) => b.keyLabel),
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U'],
  )
  assert.deepEqual(
    LAYOUTS[10].buttons.map((b) => b.keyLabel),
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  )
})

test('every lane has a valid push and pull note', () => {
  for (const size of INSTRUMENT_SIZES) {
    for (const b of LAYOUTS[size].buttons) {
      for (const type of [Direction.Push, Direction.Pull]) {
        assert.ok(
          b[type].name.length > 0,
          `${size}: button ${b.number} ${type} name`,
        )
        assert.ok(
          Number.isFinite(b[type].freq) && b[type].freq > 0,
          `${size}: button ${b.number} ${type} freq`,
        )
      }
    }
  }
})

test('the 7-button keeps its exact original tuning', () => {
  // A regression guard: the toy concertina's frequencies must never drift.
  assert.deepEqual(
    LAYOUTS[7].buttons.map((b) => [b.push.name, b.push.freq]),
    [
      ['C', 261.63],
      ['E', 329.63],
      ['G', 392.0],
      ['C', 523.25],
      ['E', 659.25],
      ['G', 783.99],
      ['B', 987.77],
    ],
  )
})
