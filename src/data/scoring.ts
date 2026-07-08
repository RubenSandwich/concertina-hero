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
