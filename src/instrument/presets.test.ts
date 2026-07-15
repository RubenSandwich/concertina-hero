// Tests that note-frequency presets are scoped per instrument size and never leak
// across sizes. Run with: npm test  (own process, so the in-memory localStorage
// and the active instrument here don't touch the other test files).

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  setActiveInstrument,
  getDefaultNotes,
  LANE_NOTES,
} from './instrument.ts'
import {
  getPresets,
  savePreset,
  setActivePreset,
  getActivePreset,
} from './presets.ts'

// A minimal in-memory localStorage so the preset store has somewhere to persist.
const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size
  },
} as Storage

// A copy of the active instrument's defaults with every push freq nudged, so a
// saved preset is clearly distinct from the built-in one.
function bumpedNotes() {
  return getDefaultNotes().map((n) => ({
    push: { ...n.push, freq: Math.round(n.push.freq * 1.01 * 100) / 100 },
    pull: { ...n.pull },
  }))
}

test('a preset saved for a 20-button round-trips and applies its frequencies', () => {
  setActiveInstrument(20)
  const notes = bumpedNotes()
  const saved = savePreset({ name: 'My 20', notes })

  // It shows up in the 20-button's list…
  assert.ok(getPresets().some((p) => p.id === saved.id && p.name === 'My 20'))
  // …and activating it pushes its (bumped) frequencies into the live note map.
  setActivePreset(saved.id)
  assert.equal(LANE_NOTES.length, 20)
  assert.equal(LANE_NOTES[0].push.freq, notes[0].push.freq)
  assert.notEqual(notes[0].push.freq, getDefaultNotes()[0].push.freq)
})

test('presets do not leak across instrument sizes', () => {
  setActiveInstrument(20)
  const saved = savePreset({ name: 'Twenty only', notes: getDefaultNotes() })
  assert.ok(
    getPresets().some((p) => p.id === saved.id),
    'present on the 20-button',
  )

  // A different size never sees it, and falls back to its own Default.
  setActiveInstrument(7)
  assert.ok(
    !getPresets().some((p) => p.id === saved.id),
    'absent on the 7-button',
  )
  assert.equal(
    getActivePreset().name,
    'Default',
    'the 7-button starts on its own Default',
  )
  assert.equal(LANE_NOTES.length, 7)

  // Switching back, it is still there.
  setActiveInstrument(20)
  assert.ok(
    getPresets().some((p) => p.id === saved.id),
    'back on the 20-button',
  )

  setActiveInstrument(7)
})
