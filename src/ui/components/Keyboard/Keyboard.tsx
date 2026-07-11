import type { ButtonSpec, HandGeom } from '#data/layout'
import type { Direction } from '#data/instrument'
import './Keyboard.css'

interface KeyboardProps {
  buttons: ButtonSpec[]
  geom: HandGeom
  // A note is falling in this lane (its direction), else null — the "active" state.
  active: (Direction | null)[]
  // Its key/tap/mic is being played right now (its direction), else null — the
  // "pressed" state, which wins over active.
  pressed: (Direction | null)[]
  // What the label under each button shows: the key to press, or the button
  // number. Mode-sensitive (Decision 5): keyboard mode shows the key, mic the number.
  labelMode: 'number' | 'key'
  // Tapping a button's half plays that direction (pull on top, push below),
  // through the same press path as a key. Release stops the hold.
  onPress: (lane: number, pull: boolean) => void
  onRelease: (lane: number) => void
}

// The drawn anglo keyboard beneath the fall zone. Every button shows its two
// notes (pull on top, push below) and its label. Each button has three visually
// distinct states: idle (muted), active (a note is falling in its lane — it wakes
// up and rings, but is not filled), and pressed (being played — fully coloured in,
// solid for push, striped for pull). The right hand mirrors the left across the
// bellows divider. Each half of a button is tappable.
export default function Keyboard({
  buttons,
  geom,
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
      className={'keyboard' + (geom.split ? ' keyboard--split' : '')}
      style={{ '--rows': geom.rows } as React.CSSProperties}
    >
      {geom.split && (
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
                {b.pull.name}
              </button>
              <button
                type="button"
                className="key-btn__note key-btn__note--push"
                aria-label={`Button ${b.number} push ${b.push.name}`}
                onPointerDown={press(b.lane, false)}
                onPointerUp={release(b.lane)}
                onPointerCancel={release(b.lane)}
              >
                {b.push.name}
              </button>
            </span>
            <span className="key-btn__label">{labelMode === 'key' ? b.keyLabel : b.number}</span>
          </div>
        )
      })}
    </div>
  )
}
