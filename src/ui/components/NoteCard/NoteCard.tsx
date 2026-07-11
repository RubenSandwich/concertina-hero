import type { GameNote } from '#hooks/useGameEngine'
import { LANE_NOTES } from '#data/instrument'
import './NoteCard.css'

interface NoteCardProps {
  note: GameNote
  x: number // lane centre, 0…1
  color: string
  progress: number
}

// A single falling note card, positioned at its lane centre (`x`) and vertical
// `progress` (0 = top of the fall zone, 1 = the hit line). Its `--w`/`--h` sizing
// vars are inherited from the enclosing .playfield.
export default function NoteCard({ note, x, color, progress }: NoteCardProps) {
  const noteName = LANE_NOTES[note.lane][note.type].name
  const cls =
    'note note--' +
    note.type +
    (note.state === 'holding' ? ' note--holding' : '') +
    (note.state === 'hit' ? ' note--hit note--' + (note.rating ?? '') : '') +
    (note.state === 'miss' ? ' note--miss' : '')
  return (
    <div
      className={cls}
      style={
        {
          '--note-color': color,
          left: `calc(${(x * 100).toFixed(3)}% - var(--w) / 2)`,
          bottom: `${((1 - progress) * 100).toFixed(3)}%`,
        } as React.CSSProperties
      }
    >
      <span className="note-arrow" aria-hidden="true">
        {note.type === 'pull' ? '▲' : '▼'}
      </span>
      <span className="note-name">{noteName}</span>
    </div>
  )
}
