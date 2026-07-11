// Tests for the chart parser (multi-digit buttons, chords) and instrument gating.
// Run with: npm test

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSong,
  chartNoteCount,
  chartRequiredButtons,
  chartOutOfRange,
  type Song,
} from './songs.ts'
import { minInstrumentFor, INSTRUMENT_SIZES } from './layout.ts'

const build = (chart: string): Song =>
  buildSong({ id: 't', name: 't', blurb: '', bpm: 120, color: '#fff', difficulty: 'Easy', chart })

// The lane/type/time of every note, for compact comparisons.
const shape = (song: Song) => song.notes.map((n) => ({ lane: n.lane, type: n.type, time: n.time }))

test('a 7-button chart round-trips to the same notes it always did', () => {
  const song = build('+1 +1 +3 -3 X -2')
  assert.deepEqual(shape(song), [
    { lane: 0, type: 'push', time: 0 },
    { lane: 0, type: 'push', time: 500 },
    { lane: 2, type: 'push', time: 1000 },
    { lane: 2, type: 'pull', time: 1500 },
    // the X rest is a silent beat: the next note lands one beat later
    { lane: 1, type: 'pull', time: 2500 },
  ])
})

test('parses two-digit buttons and multi-digit chords', () => {
  const song = build('-14 (+21 +26) 30')
  assert.deepEqual(shape(song), [
    { lane: 13, type: 'pull', time: 0 }, // button 14
    { lane: 20, type: 'push', time: 500 }, // button 21, in a chord…
    { lane: 25, type: 'push', time: 500 }, // …with button 26, same beat
    { lane: 29, type: 'push', time: 1000 }, // bare 30 defaults to push
  ])
})

test('button numbers outside 1–30 are not notes', () => {
  // 0, 31 and 99 never match; only the two valid buttons count.
  assert.equal(chartNoteCount('+0 +31 +99 +5 -12'), 2)
})

test('requiredButtons is the highest button the chart uses', () => {
  assert.equal(build('+1 +3 -2').requiredButtons, 3)
  assert.equal(build('-14 (+21 +26)').requiredButtons, 26)
  assert.equal(build('+30').requiredButtons, 30)
  assert.equal(chartRequiredButtons('+2 +7 (-4 -6)'), 7)
  assert.equal(chartRequiredButtons('X X'), 0) // no notes → needs nothing
})

test('gating enables songs that fit and disables ones that need more buttons', () => {
  const fits = (song: Song, size: number) => song.requiredButtons <= size
  const small = build('+1 +3 -2') // needs 3
  const big = build('-14 (+18 +20)') // needs 20

  assert.equal(fits(small, 7), true, '3-button song plays on a 7-button')
  assert.equal(fits(small, 30), true, 'and on everything larger')
  assert.equal(fits(big, 7), false, '20-button song is disabled on a 7-button')
  assert.equal(fits(big, 10), false, 'and on a 10-button')
  assert.equal(fits(big, 20), true, 'but enabled on a 20-button')
  assert.equal(fits(big, 30), true, 'and a 30-button')
})

test('chartOutOfRange flags buttons outside 1–30, and nothing when all are valid', () => {
  assert.deepEqual(chartOutOfRange('+1 +30 -15'), [])
  assert.deepEqual(chartOutOfRange('+31'), [31])
  assert.deepEqual(chartOutOfRange('+0 -99 (+5 +40)'), [0, 40, 99])
  // A chord with one bad button flags just that one.
  assert.deepEqual(chartOutOfRange('(+2 +31)'), [31])
  // Rests and junk aren't buttons.
  assert.deepEqual(chartOutOfRange('X X foo'), [])
})

test('minInstrumentFor picks the smallest instrument that fits', () => {
  assert.equal(minInstrumentFor(0), 7)
  assert.equal(minInstrumentFor(7), 7)
  assert.equal(minInstrumentFor(8), 10)
  assert.equal(minInstrumentFor(10), 10)
  assert.equal(minInstrumentFor(11), 20)
  assert.equal(minInstrumentFor(20), 20)
  assert.equal(minInstrumentFor(21), 30)
  assert.equal(minInstrumentFor(30), 30)
  assert.equal(minInstrumentFor(31), INSTRUMENT_SIZES[INSTRUMENT_SIZES.length - 1]) // clamps
})
