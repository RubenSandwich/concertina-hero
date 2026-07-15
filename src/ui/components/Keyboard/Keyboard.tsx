import type { ButtonSpec, HandGeometry } from '#instrument/layout'
import type { Direction } from '#instrument/instrument'
import './Keyboard.css'

// What each button/note-card shows (Decision 5): keyboard mode shows the key to
// press, mic mode shows the note name + button number. Shared with NoteCard, so
// the fall zone and the drawn keyboard always agree.
export const LabelMode = {
  Number: 'number',
  Key: 'key',
} as const
export type LabelMode = (typeof LabelMode)[keyof typeof LabelMode]

interface KeyboardProps {
  buttons: ButtonSpec[]
  geometry: HandGeometry
  // A note is falling in this lane (its direction), else null — the "active" state.
  active: (Direction | null)[]
  // Its key/tap/mic is being played right now (its direction), else null — the
  // "pressed" state, which wins over active.
  pressed: (Direction | null)[]
  // What each button shows. Mode-sensitive (Decision 5): keyboard mode shows the
  // key to press on each half (Shift+key, uppercase, on top for pull; key,
  // lowercase, below for push) with no separate label; mic mode shows the note
  // name on each half plus the button number underneath.
  labelMode: LabelMode
  // Tapping a button's half plays that direction (pull on top, push below),
  // through the same press path as a key. Release stops the hold.
  onPress: (lane: number, pull: boolean) => void
  onRelease: (lane: number) => void
}

// The drawn anglo keyboard beneath the fall zone. In keyboard mode every button
// shows the key that plays it — uppercase on top (Shift+key = pull), lowercase
// below (key alone = push) — matching the actual keystroke instead of a note
// name, so there's nothing to translate in your head. In mic mode (no keyboard
// involved) it shows the two note names instead, plus the button number
// underneath. Each button has three visually distinct states: idle (muted),
// active (a note is falling in its lane — it wakes up and rings, but is not
// filled), and pressed (being played — fully coloured in, solid for push,
// striped for pull). The right hand mirrors the left across the bellows
// divider. Each half of a button is tappable.
export default function Keyboard({
  buttons,
  geometry,
  active,
  pressed,
  labelMode,
  onPress,
  onRelease,
}: KeyboardProps) {
  const press = (lane: number, pull: boolean) => (e: React.PointerEvent) => {
    e.preventDefault()
    // Capture so the matching release lands even if the finger slides off; never
    // let a capture hiccup swallow the press itself.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* no active pointer (or unsupported) — the press still counts */
    }
    onPress(lane, pull)
  }
  const release = (lane: number) => () => onRelease(lane)

  return (
    <div
      className={'keyboard' + (geometry.split ? ' keyboard--split' : '')}
      style={{ '--rows': geometry.rows } as React.CSSProperties}
    >
      {geometry.split && (
        <>
          <div className="hand-divider--keys" />
          <span className="hand-label hand-label--left">Left</span>
          <span className="hand-label hand-label--right">Right</span>
        </>
      )}
      {buttons.map((b) => {
        const pressDir = pressed[b.lane]
        const activeDir = active[b.lane]
        // The direction modifier marks which half (push/pull) to light up; the
        // state class (active/pressed) sets how strongly.
        const cls = pressDir
          ? ' is-pressed key-btn--' + pressDir
          : activeDir
            ? ' is-active key-btn--' + activeDir
            : ''
        return (
          <div
            key={b.lane}
            className={'key-btn' + cls}
            style={
              {
                '--x': (b.x * 100).toFixed(3) + '%',
                '--row': b.row,
                '--btn-color': b.color,
              } as React.CSSProperties
            }
          >
            <span className="key-btn__circle">
              <button
                type="button"
                className="key-btn__note key-btn__note--pull"
                aria-label={`Button ${b.number} pull ${b.pull.name}`}
                onPointerDown={press(b.lane, true)}
                onPointerUp={release(b.lane)}
                onPointerCancel={release(b.lane)}
              >
                {labelMode === LabelMode.Key ? b.keyLabel : b.pull.name}
              </button>
              <button
                type="button"
                className="key-btn__note key-btn__note--push"
                aria-label={`Button ${b.number} push ${b.push.name}`}
                onPointerDown={press(b.lane, false)}
                onPointerUp={release(b.lane)}
                onPointerCancel={release(b.lane)}
              >
                {labelMode === LabelMode.Key
                  ? b.keyLabel.toLowerCase()
                  : b.push.name}
              </button>
            </span>
            {labelMode === LabelMode.Number && (
              <span className="key-btn__label">{b.number}</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
