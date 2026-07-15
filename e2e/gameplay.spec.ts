import { test, expect } from '@playwright/test'
import { startSong } from './helpers'

// A baseline regression net for the whole screen flow (start → game → results)
// in a real browser — the class of thing rAF timing, keyboard listeners, and
// audio-unlock gestures can only be wrong in an actual browser, not a pure
// unit test. See docs/conventions.md's "The game loop" section.

test('the start screen lists the built-in songs and can start one', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Concertina Hero' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Twinkle, Twinkle/ }).first()).toBeVisible()

  await startSong(page, 'Twinkle, Twinkle')
  await expect(page.getByText('Now Playing')).toBeVisible()
  await expect(page.getByText('Twinkle, Twinkle')).toBeVisible()
})

test('quitting mid-song returns to the start screen', async ({ page }) => {
  await page.goto('/')
  await startSong(page, 'Twinkle, Twinkle')

  await page.getByRole('button', { name: '‹ Quit' }).click()
  await expect(page.getByRole('heading', { name: 'Concertina Hero' })).toBeVisible()
})

test('a played-through song reaches the results screen with a rank', async ({ page }) => {
  await page.goto('/')
  // Taps is the shortest built-in song (a handful of long notes) - let it run
  // to completion untouched so this stays fast and deterministic (every note
  // misses, but that's fine: this test only cares that the run *finishes*).
  await startSong(page, 'Taps')

  await expect(page.getByRole('heading', { name: 'Song Complete!' })).toBeVisible({
    timeout: 30_000,
  })
  await expect(page.getByText(/Score/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Play Again/ })).toBeVisible()
})
