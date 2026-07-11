import { LANE_BUTTONS, LANE_COLORS, LANE_NOTES } from '#data/instrument'
import './HowToPlay.css'

// A compact "how to play": the whole game in two worked examples on one button —
// a push note (solid ▼, tap the key) and a pull note (striped ▲, hold Shift). Each
// shows a card falling to the hit line and the matching half of the button lit up.
// Content only; callers wrap it — an accordion on the Start screen, the pause
// overlay in-game.
export default function HowToPlay() {
  const keyLabel = LANE_BUTTONS[0].keyLabel
  const pushName = LANE_NOTES[0].push.name
  const pullName = LANE_NOTES[0].pull.name

  return (
    <div className="howto-play">
      <p className="howto-play__lead">
        Cards <b>fall</b> onto your keyboard. When one reaches the dashed line, play that button the
        way its <b>arrow</b> points.
      </p>

      <div
        className="howto-play__demos"
        style={{ '--lane': LANE_COLORS[0] } as React.CSSProperties}
      >
        <Demo dir="push" pushName={pushName} pullName={pullName} keyLabel={keyLabel} />
        <Demo dir="pull" pushName={pushName} pullName={pullName} keyLabel={keyLabel} />
      </div>

      <p className="howto-play__hint">
        No keyboard? <b>Tap</b> the button on screen — its top half pulls, its bottom half pushes.
      </p>
    </div>
  )
}

interface DemoProps {
  dir: 'push' | 'pull'
  pushName: string
  pullName: string
  keyLabel: string
}

// One worked example: a falling note card above the button, with the half you play
// filled in. `dir` picks which (solid push / striped pull).
function Demo({ dir, pushName, pullName, keyLabel }: DemoProps) {
  const name = dir === 'pull' ? pullName : pushName
  return (
    <div className="howto-play__demo">
      <div className="howto-play__lane">
        <div className={'howto-play__note howto-play__note--' + dir}>
          <span className="howto-play__arrow" aria-hidden="true">
            {dir === 'pull' ? '▲' : '▼'}
          </span>
          <span className="howto-play__name">{name}</span>
        </div>
        <div className="howto-play__line" />
      </div>

      <div className={'howto-play__key howto-play__key--' + dir}>
        <span className="howto-play__circle">
          <span className="howto-play__half howto-play__half--pull">{pullName}</span>
          <span className="howto-play__half howto-play__half--push">{pushName}</span>
        </span>
        <span className="howto-play__keylabel">{keyLabel}</span>
      </div>

      <p className="howto-play__how">
        {dir === 'push' ? (
          <>
            <b>Push ▼</b> — squeeze in. <b>Tap</b> the key.
          </>
        ) : (
          <>
            <b>Pull ▲</b> — draw out. Hold <span className="howto-play__shift">⇧ Shift</span> + key.
          </>
        )}
      </p>
    </div>
  )
}
