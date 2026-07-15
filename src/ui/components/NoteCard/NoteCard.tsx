import { NoteState, type GameNote } from '#engine/useGameEngine'
import { LANE_NOTES } from '#instrument/instrument'
import { LabelMode } from '#components/Keyboard/Keyboard'
import './NoteCard.css'

interface NoteCardProps {
  note: GameNote
  x: number // lane centre, 0…1
  color: string
  progress: number
  // What the card shows. Mode-sensitive, matching Keyboard: keyboard mode shows
  // the key to press (uppercase = pull/Shift+key, lowercase = push/key alone)
  // and no arrow — the case alone says the direction, so an arrow would be
  // redundant (and there's no arrow key to point at anyway). Mic mode shows the
  // note name plus its direction arrow, unchanged.
  labelMode: LabelMode
  keyLabel: string
}

// A single falling note card, positioned at its lane centre (`x`) and vertical
// `progress` (0 = top of the fall zone, 1 = the hit line). Its `--w`/`--h` sizing
// vars are inherited from the enclosing .playfield.
export default function NoteCard({
  note,
  x,
  color,
  progress,
  labelMode,
  keyLabel,
}: NoteCardProps) {
  const noteName = LANE_NOTES[note.lane][note.type].name
  const label =
    labelMode === LabelMode.Key
      ? note.type === 'pull'
        ? keyLabel
        : keyLabel.toLowerCase()
      : noteName
  const cls =
    'note note--' +
    note.type +
    (note.state === NoteState.Holding ? ' note--holding' : '') +
    (note.state === NoteState.Hit
      ? ' note--hit note--' + (note.rating ?? '')
      : '') +
    (note.state === NoteState.Miss ? ' note--miss' : '')
  return (
    <div
      className={cls}
      style={
        {
          '--note-color': color,
          left: `calc(${(x * 100).toFixed(3)}% - var(--w) / 2)`,
          // Lifted by the hit-bar height so the beat lands at the bar's top edge and
          // the note stays on screen, sinking through the bar, for the whole hold.
          bottom: `calc(${((1 - progress) * 100).toFixed(3)}% + var(--hit-h, 0%))`,
          // A held note (from a chart hold token) is that many beats tall, so its
          // extra length reads as "keep holding this one" while it falls.
          ...(note.beats > 1 && { height: `calc(var(--h) * ${note.beats})` }),
        } as React.CSSProperties
      }
    >
      {labelMode === LabelMode.Number && (
        <span className="note-arrow" aria-hidden="true">
          {note.type === 'pull' ? '▲' : '▼'}
        </span>
      )}
      <span className="note-name">{label}</span>
    </div>
  )
}
