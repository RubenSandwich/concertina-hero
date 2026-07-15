import { LANE_BUTTONS, LANE_COLORS, LANE_NOTES } from '#instrument/instrument'
import './HowToPlay.css'

// "How to play" in two passes, in the order they're easiest to learn.
//
// First the idea the whole game rests on: a button is *two* notes — one as the
// bellows squeeze in (push, tap the key), one as they draw out (pull, hold
// Shift). It's shown on one button, its two halves lit in turn. Then the
// moment-to-moment flow: cards fall to the hit line and you play whichever the
// arrow shows. Content only; callers wrap it — the Start accordion, the in-game
// pause overlay.
export default function HowToPlay() {
  const { keyLabel } = LANE_BUTTONS[0]
  const pushName = LANE_NOTES[0].push.name
  const pullName = LANE_NOTES[0].pull.name

  return (
    <div
      className="howto-play"
      style={{ '--lane': LANE_COLORS[0] } as React.CSSProperties}
    >
      <p className="howto-play__lead">
        Every button is <b>two notes</b> — one as you squeeze the bellows in,
        one as you draw them back out.
      </p>

      <div className="howto-play__dirs">
        <Dir
          dir="push"
          pushName={pushName}
          pullName={pullName}
          keyLabel={keyLabel}
        />
        <Dir
          dir="pull"
          pushName={pushName}
          pullName={pullName}
          keyLabel={keyLabel}
        />
      </div>

      <p className="howto-play__flow-lead">
        In a song those notes fall onto your keyboard:
      </p>

      <ol className="howto-play__steps">
        <li className="howto-play__step">
          <StepHead n={1} title="Watch" />
          <MiniLane name={pushName} falling />
          <p className="howto-play__step-sub">Cards fall down your keyboard.</p>
        </li>
        <li className="howto-play__step">
          <StepHead n={2} title="At the line" />
          <MiniLane name={pushName} />
          <p className="howto-play__step-sub">
            Play the moment one lands on the dashed line.
          </p>
        </li>
        <li className="howto-play__step">
          <StepHead n={3} title="Play it" />
          <div className="howto-play__acts">
            <p className="howto-play__act">
              <span
                className="howto-play__achip howto-play__achip--push"
                aria-hidden="true"
              >
                ▼
              </span>
              <span>
                <b>Push</b> — tap
              </span>
              <kbd className="howto-play__kc">{keyLabel}</kbd>
            </p>
            <p className="howto-play__act">
              <span
                className="howto-play__achip howto-play__achip--pull"
                aria-hidden="true"
              >
                ▲
              </span>
              <span>
                <b>Pull</b> — hold
              </span>
              <kbd className="howto-play__kc howto-play__kc--shift">⇧</kbd>
              <span>+</span>
              <kbd className="howto-play__kc">{keyLabel}</kbd>
            </p>
          </div>
        </li>
      </ol>

      <p className="howto-play__hint">
        No keyboard? <b>Tap</b> the button on screen — its top half pulls, its
        bottom half pushes.
      </p>
    </div>
  )
}

interface DirProps {
  dir: 'push' | 'pull'
  pushName: string
  pullName: string
  keyLabel: string
}

// One direction of the shared button: its bellows motion, the button with the
// played half lit, and how you play it on the keyboard.
function Dir({ dir, pushName, pullName, keyLabel }: DirProps) {
  const isPull = dir === 'pull'
  return (
    <div className="howto-play__dir">
      <div className="howto-play__dirhd">
        <span
          className={'howto-play__badge howto-play__badge--' + dir}
          aria-hidden="true"
        >
          {isPull ? '▲' : '▼'}
        </span>
        <span className="howto-play__dirword">{isPull ? 'Pull' : 'Push'}</span>
      </div>

      <Bellows dir={dir} />

      <div className={'howto-play__key howto-play__key--' + dir}>
        <span className="howto-play__circle">
          <span className="howto-play__half howto-play__half--pull">
            {pullName}
          </span>
          <span className="howto-play__half howto-play__half--push">
            {pushName}
          </span>
        </span>
        <span className="howto-play__keylabel">{keyLabel}</span>
      </div>

      <p className="howto-play__how">
        {isPull ? (
          <>
            Draw out — hold <span className="howto-play__shift">⇧ Shift</span> +
            key.
          </>
        ) : (
          <>
            Squeeze in — <b>tap</b> the key.
          </>
        )}
      </p>
    </div>
  )
}

// A little concertina end-to-end: push draws the folds together, pull pulls them
// apart. Decorative — the arrows carry the meaning for a screen reader.
function Bellows({ dir }: { dir: 'push' | 'pull' }) {
  if (dir === 'push') {
    return (
      <span className="howto-play__bellows" aria-hidden="true">
        <span className="howto-play__plate" />
        <span className="howto-play__move">›</span>
        <span className="howto-play__fold howto-play__fold--in" />
        <span className="howto-play__move">‹</span>
        <span className="howto-play__plate" />
      </span>
    )
  }
  return (
    <span className="howto-play__bellows" aria-hidden="true">
      <span className="howto-play__move">‹</span>
      <span className="howto-play__plate" />
      <span className="howto-play__fold howto-play__fold--out" />
      <span className="howto-play__plate" />
      <span className="howto-play__move">›</span>
    </span>
  )
}

// A push note card in the mini fall zone — falling on a loop, or resting on the
// hit line when `falling` is omitted.
function MiniLane({
  name,
  falling = false,
}: {
  name: string
  falling?: boolean
}) {
  return (
    <div className="howto-play__lane">
      <div
        className={
          'howto-play__note howto-play__note--push' +
          (falling ? ' howto-play__note--falling' : '')
        }
      >
        <span className="howto-play__arrow" aria-hidden="true">
          ▼
        </span>
        <span className="howto-play__name">{name}</span>
      </div>
      <div className="howto-play__line" />
    </div>
  )
}

function StepHead({ n, title }: { n: number; title: string }) {
  return (
    <div className="howto-play__step-hd">
      <span className="howto-play__num">{n}</span>
      <span className="howto-play__step-t">{title}</span>
    </div>
  )
}
