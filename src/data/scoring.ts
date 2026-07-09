// Scoring: the hit ratings, how a sustained note's held time turns into points,
// and the final rank shown on the results screen.

import type { Direction } from './instrument'

// The three hit ratings that score; a whiffed note is a 'miss'.
export type Rating = 'perfect' | 'good' | 'ok'
export type Judgement = Rating | 'miss'

// Points a note is worth at each rating, before the hold scaling and combo bonus.
export const POINTS: Record<Rating, number> = { perfect: 100, good: 60, ok: 30 }

const clamp01 = (v: number): number => (v > 1 ? 1 : v > 0 ? v : 0)

// How much of a note's sustain was actually held, as a fraction 0-1. A note with
// no length can't be under-held, so it always counts as fully held.
export function holdFraction(heldMs: number, durationMs: number): number {
  if (!(durationMs > 0)) return 1
  return clamp01(heldMs / durationMs)
}

// A held note's points: the grade earned at its onset, scaled by how much of the
// sustain was held. The combo bonus is added by the caller and is not scaled.
export function holdPoints(rating: Rating, fraction: number): number {
  return Math.round(POINTS[rating] * clamp01(fraction))
}

// Whether a lane is currently sounding the given bellows direction, from either
// a held key or a sustained mic note.
export function isSustaining(
  lane: number,
  type: Direction,
  keys: Record<number, Direction>,
  micNote: { lane: number; type: Direction } | null,
): boolean {
  if (keys[lane] === type) return true
  return !!micNote && micNote.lane === lane && micNote.type === type
}

// The final rank shown on the results screen, derived from a run's accuracy.

export interface Rank {
  grade: string
  label: string
  cls: string
}

// Map an accuracy percentage (0-100) to its rank badge.
export function rankFor(accuracy: number): Rank {
  switch (true) {
    case accuracy >= 95:
      return { grade: 'S', label: 'Maestro!', cls: 'rank--s' }
    case accuracy >= 85:
      return { grade: 'A', label: 'Bravo!', cls: 'rank--a' }
    case accuracy >= 70:
      return { grade: 'B', label: 'Nicely done', cls: 'rank--b' }
    case accuracy >= 50:
      return { grade: 'C', label: 'Keep squeezing', cls: 'rank--c' }
    default:
      return { grade: 'D', label: 'Needs practice', cls: 'rank--d' }
  }
}
