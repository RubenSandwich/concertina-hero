// Playfield clock & geometry: how long a note travels, the timing windows that
// grade a hit, and the mapping from time-until-hit to an on-screen x-position.

// How long (ms) a note is visible before it must be hit.
export const LEAD_TIME = 2200

// Extra silent runway (ms) added before the first note so the 3-2-1 countdown
// fully finishes before anything scrolls in. One note's travel time (plus a
// small breather) means the playfield is empty until "1" disappears.
export const LEAD_IN = LEAD_TIME + 200

// Horizontal position of the hit line, as a percent from the left edge.
export const HIT_LINE_PCT = 17

// Timing windows (ms) measured from the ideal hit moment.
export const PERFECT_WINDOW = 70
export const GOOD_WINDOW = 125
export const HIT_WINDOW = 185 // largest offset that still counts as a hit
export const MISS_WINDOW = 185 // after this the note is auto-missed

// Convert a note's time-until-hit into a horizontal percent position.
// delta === LEAD_TIME  -> just entering from the right edge (~100%)
// delta === 0          -> exactly on the hit line
// delta < 0            -> already swept past the hit line (moving off left)
export function noteX(delta: number): number {
  return HIT_LINE_PCT + (delta / LEAD_TIME) * (100 - HIT_LINE_PCT)
}
