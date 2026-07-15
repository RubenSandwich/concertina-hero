import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Regression coverage for the startup "outdated saved data" guard (see
// utils/storageVersion.ts + ui/modals/VersionMismatch/VersionMismatch.tsx):
// a preset/song stamped with a version other than the store's current one
// must block the app behind a modal that can't be dismissed except by
// deleting the offending record(s) — no Escape, no backdrop click, no
// "keep"/ignore option.

// Seeds one outdated preset (7-button) and one outdated user song directly
// into localStorage before the app's own startup code runs — must be called
// before page.goto() (addInitScript only affects the next navigation).
async function seedOutdatedRecords(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'concertina-presets-7',
      JSON.stringify([
        { id: 'p-old-1', name: 'Old Tuning', notes: [], version: '0' },
      ]),
    )
    localStorage.setItem(
      'accordion-user-songs',
      JSON.stringify([
        {
          id: 'song-old-1',
          name: 'Old Song',
          blurb: 'A stale song.',
          bpm: 100,
          subdivision: 1,
          color: '#ff0000',
          difficulty: 'Easy',
          chart: ['+1'],
          // no `version` at all — predates the check entirely, same as a
          // mismatched version.
        },
      ]),
    )
  })
}

test('outdated saved data blocks the app and cannot be dismissed', async ({
  page,
}) => {
  await seedOutdatedRecords(page)
  await page.goto('/')

  const modal = page.getByRole('alertdialog', { name: 'Outdated saved data' })
  await expect(modal).toBeVisible()
  await expect(modal.getByText('Old Song')).toBeVisible()
  await expect(modal.getByText('Old Tuning (7-button)')).toBeVisible()

  // Escape is the standard way to dismiss a dialog — must be a no-op here.
  await page.keyboard.press('Escape')
  await expect(modal).toBeVisible()

  // Clicking the backdrop (outside the card, which is centered) must also
  // leave it open.
  await modal.click({ position: { x: 5, y: 5 } })
  await expect(modal).toBeVisible()

  // Nothing was deleted by any of the above.
  expect(
    await page.evaluate(() => localStorage.getItem('accordion-user-songs')),
  ).toContain('song-old-1')
  expect(
    await page.evaluate(() => localStorage.getItem('concertina-presets-7')),
  ).toContain('p-old-1')

  // The start screen underneath is unreachable: the overlay is what actually
  // receives a click at a point where a start-screen button sits.
  const receivedBy = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Twinkle'),
    )
    if (!btn) return 'not-found'
    const { x, y, width, height } = btn.getBoundingClientRect()
    const hit = document.elementFromPoint(x + width / 2, y + height / 2)
    return hit?.closest('.version-mismatch') ? 'blocked' : 'reachable'
  })
  expect(receivedBy).toBe('blocked')
})

test('deleting the outdated records one at a time clears the modal and unblocks the app', async ({
  page,
}) => {
  await seedOutdatedRecords(page)
  await page.goto('/')

  const modal = page.getByRole('alertdialog', { name: 'Outdated saved data' })
  await expect(modal).toBeVisible()

  // Delete just the song first — the preset row (and the modal itself, one
  // mismatch still remaining) stays.
  await page.getByRole('button', { name: 'Delete Old Song' }).click()
  await expect(modal.getByText('Old Song')).toBeHidden()
  await expect(modal).toBeVisible()
  await expect(modal.getByText('Old Tuning (7-button)')).toBeVisible()
  expect(
    await page.evaluate(() => localStorage.getItem('accordion-user-songs')),
  ).toBe('[]')

  // "Delete all" (here, the one remaining preset) closes the modal entirely.
  await page.getByRole('button', { name: 'Delete all' }).click()
  await expect(modal).toBeHidden()
  expect(
    await page.evaluate(() => localStorage.getItem('concertina-presets-7')),
  ).toBe('[]')

  // The app is fully usable again.
  await expect(
    page.getByRole('heading', { name: 'Concertina Hero' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Twinkle, Twinkle/ }).first(),
  ).toBeVisible()
})

test('"Delete all" clears every outdated record in one step', async ({
  page,
}) => {
  await seedOutdatedRecords(page)
  await page.goto('/')

  const modal = page.getByRole('alertdialog', { name: 'Outdated saved data' })
  await expect(modal).toBeVisible()

  await page.getByRole('button', { name: 'Delete all' }).click()
  await expect(modal).toBeHidden()

  expect(
    await page.evaluate(() => localStorage.getItem('accordion-user-songs')),
  ).toBe('[]')
  expect(
    await page.evaluate(() => localStorage.getItem('concertina-presets-7')),
  ).toBe('[]')
  await expect(
    page.getByRole('heading', { name: 'Concertina Hero' }),
  ).toBeVisible()
})
