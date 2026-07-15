import { test } from '@playwright/test'
import { setWaitForNote, startSong, pressUntilCombo } from './helpers'

// Regression test: the shell used to grade every key/tap press queued before
// the engine's next processed frame against the *same* stale clock reading,
// instead of each press's own instant. Two presses landing in that window (a
// genuine chord, or just a fast run) would then collapse onto one instant,
// and whichever one no longer matched its note's window was silently
// dropped — see useGameEngine.ts's `gameTimeNow` and docs/conventions.md's
// "The game loop" section.
//
// "Wait for correct note" sidesteps needing to time anything: it holds the
// song on each note until it's played, so `pressUntilCombo` can just retry a
// press every so often (a no-op until the note is actually reachable) instead
// of racing a song's BPM/lead-in against however long a given test step
// happens to take. "Chord Parade" opens with two single notes on button 1
// (push, key Q), then its first chord: buttons 1 and 3 together, both push
// ("(+1 +3)", keys Q/E).
test('a simultaneous chord registers every note, not just one', async ({
  page,
}) => {
  await page.goto('/')
  await setWaitForNote(page, true)
  await startSong(page, 'Chord Parade')

  await pressUntilCombo(page, () => page.keyboard.press('q'), '1')
  await pressUntilCombo(page, () => page.keyboard.press('q'), '2')

  // The chord: button 1 (Q) and button 3 (E) pressed together, the way a real
  // chord is played — both held down before either is released. Both notes
  // must land: combo goes to 4, not 3 (one dropped).
  await pressUntilCombo(
    page,
    async () => {
      await page.keyboard.down('q')
      await page.keyboard.down('e')
      await page.keyboard.up('q')
      await page.keyboard.up('e')
    },
    '4',
  )
})
