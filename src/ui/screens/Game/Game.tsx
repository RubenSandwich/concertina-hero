import { useMemo } from 'react'
import { useGameEngine } from '#hooks/useGameEngine'
import type { GameNote, GameResult } from '#hooks/useGameEngine'
import type { Song, Section } from '#data/songs'
import { LANE_COLORS, getActiveLayout, type Direction } from '#data/instrument'
import type { InstrumentSize } from '#data/layout'
import { LEAD_TIME, noteProgress, noteVisible } from '#data/timing'
import Keyboard from '#components/Keyboard/Keyboard'
import NoteCard from '#components/NoteCard/NoteCard'
import HowToPlay from '#components/HowToPlay/HowToPlay'
import Modal from '#components/Modal/Modal'
import './Game.css'

// The tallest a note card is allowed to grow (fraction of the fall zone), so a
// slow song's one-beat cards don't swallow the whole playfield.
const MAX_CARD_FRAC = 0.42

// The note letter/arrow are sized in viewport units, but the sparse 7/10-button
// layouts have far fewer lanes, so their cards are much wider — scale the text up
// to fill them. The dense 20/30-button layouts keep the base size.
const NOTE_TEXT_SCALE: Record<InstrumentSize, number> = { 7: 1.5, 10: 1.25, 20: 1, 30: 1 }

// A falling note with the vertical progress at which to draw it (0 = top of the
// fall zone, 1 = the hit line). Active/holding notes track the clock; a just-
// judged note freezes at where it was for a brief pop-out.
interface PlacedNote {
  note: GameNote
  progress: number
}

function placeNotes(notes: GameNote[], elapsed: number, beatFrac: number): PlacedNote[] {
  const placed: PlacedNote[] = []
  for (const note of notes) {
    if (note.state === 'active' || note.state === 'holding') {
      const progress = noteProgress(note.time - elapsed)
      if (noteVisible(progress, beatFrac)) placed.push({ note, progress })
    } else if (elapsed - note.judgeElapsed < 340) {
      // Recently hit/missed: freeze it at its judged spot for the pop-out.
      placed.push({ note, progress: note.judgeAt })
    }
  }
  return placed
}

// Which direction the song wants right now (drives the mode UI).
function currentDir(sections: Section[], elapsed: number): Direction {
  for (const s of sections) if (elapsed < s.end) return s.dir
  return sections.length ? sections[sections.length - 1].dir : 'push'
}

// A push/pull run as a full-width "breath band". The whole song is precomputed
// once into a fixed film strip: `bottom`/`height` are percentages of the fall-zone
// height at song time 0, so the strip only ever needs a single `translateY` to
// scroll (a compositor transform — no per-frame layout or repaint of the big
// translucent gradients). `count` labels the run; a push run's label sits on the
// left, a pull run's on the right, so the direction reads from position too.
interface BandStripItem {
  id: number
  dir: Direction
  count: number
  bottom: number
  height: number
}

function buildBandStrip(song: Song): BandStripItem[] {
  return song.sections.map((s) => ({
    id: s.id,
    dir: s.dir,
    count: song.notes.reduce((c, n) => (n.time >= s.start && n.time < s.end ? c + 1 : c), 0),
    bottom: (s.start / LEAD_TIME) * 100,
    height: ((s.end - s.start) / LEAD_TIME) * 100,
  }))
}

interface GameProps {
  song: Song
  speed?: number
  micEnabled?: boolean
  waitForNote?: boolean
  hideFeedback?: boolean
  onFinish: (result: GameResult) => void
  onQuit: () => void
}

export default function Game({
  song,
  speed = 1,
  micEnabled = false,
  waitForNote = false,
  hideFeedback = false,
  onFinish,
  onQuit,
}: GameProps) {
  const g = useGameEngine(song, { speed, micEnabled, waitForNote, onFinish })
  const layout = getActiveLayout()
  const { buttons, geom } = layout

  // Each note sustains one beat; its card is that many fall-zone-heights tall, so
  // it covers the hit line for exactly the window in which it can be held.
  const stepMs = 60000 / (song.bpm * (song.subdivision || 1))
  const beatFrac = stepMs / LEAD_TIME
  const cardHpct = Math.min(beatFrac, MAX_CARD_FRAC) * 100
  const cardH = `max(46px, calc(${cardHpct.toFixed(2)}% - 6px))`

  // Note/lane-band width: a little under the tightest gap between two lanes, so
  // even the staggered 30-button rows stay visibly apart.
  const xs = [...new Set(buttons.map((b) => b.x))].sort((a, b) => a - b)
  let minGap = 1
  for (let i = 1; i < xs.length; i++) minGap = Math.min(minGap, xs[i] - xs[i - 1])
  const cardW = `max(34px, ${(minGap * 82).toFixed(2)}%)`
  // Keyboard circle diameter as a fraction of the playfield width — a bit under the
  // tightest lane gap, so even the staggered 20/30-button rows never collide across
  // the bellows divider. CSS caps it by the row height.
  const keyFrac = (minGap * 0.82).toFixed(4)

  // Hit-bar height: a short, fixed strike zone whose top edge is the press line —
  // the note's leading edge lands there on the beat and dips into the bar as it's
  // held. Kept thin (a target band, not a full-height zone).
  const hitH = (Math.max(0.1, Math.min(beatFrac, 0.1)) * 100).toFixed(2) + '%'

  const judged = g.counts.perfect + g.counts.good + g.counts.ok + g.counts.miss
  const accuracy = judged
    ? Math.round(((g.counts.perfect + g.counts.good + g.counts.ok) / judged) * 100)
    : 100
  const mode = currentDir(song.sections, Math.max(g.elapsed, 0))

  // The breath bands are static per song, so build them (and their label elements)
  // once. Only the enclosing track's translateY changes each frame, so React skips
  // reconciling these children and the browser never repaints the gradients.
  const bandStrip = useMemo(() => buildBandStrip(song), [song])
  const bandEls = useMemo(
    () =>
      bandStrip.map((b) => {
        const label = (b.dir === 'pull' ? '▲ PULL' : '▼ PUSH') + ' ×' + b.count
        return (
          <div
            key={b.id}
            className={'breath-band breath-band--' + b.dir}
            style={{ bottom: b.bottom.toFixed(3) + '%', height: b.height.toFixed(3) + '%' }}
          >
            <span className="breath-band__arrow" aria-hidden="true">
              {b.dir === 'pull' ? '▲' : '▼'}
            </span>
            {/* Repeated on both edges so the count is readable wherever the eyes are. */}
            <span className="breath-band__label breath-band__label--left">{label}</span>
            <span className="breath-band__label breath-band__label--right">{label}</span>
          </div>
        )
      }),
    [bandStrip],
  )

  const placed = placeNotes(g.notes, g.elapsed, beatFrac)

  // Two independent per-lane signals drive the keyboard's three states:
  //   active  — a note is falling in this lane (it wakes up, but isn't filled in)
  //   pressed — its key/tap/mic is being played right now (fully coloured in)
  const active: (Direction | null)[] = buttons.map(() => null)
  const pressed: (Direction | null)[] = buttons.map(() => null)
  // When a lane has several notes falling at once, the highlight tracks the next
  // one to play — the note nearest the hit line (highest progress), not whichever
  // was spawned last.
  const activeProgress: number[] = buttons.map(() => -Infinity)
  for (const { note, progress } of placed) {
    if ((note.state === 'active' || note.state === 'holding') && progress > 0) {
      if (progress > activeProgress[note.lane]) {
        activeProgress[note.lane] = progress
        active[note.lane] = note.type
      }
    }
  }
  for (const n of g.micNotes) pressed[n.lane] = n.type
  for (const laneStr of Object.keys(g.activeKeys)) {
    pressed[Number(laneStr)] = g.activeKeys[Number(laneStr)]
  }

  return (
    <div className={'game mode--' + mode}>
      <div className="hud">
        <button className="btn btn--ghost quit-btn" onClick={onQuit}>
          ‹ Quit
        </button>
        <button className="btn btn--ghost pause-btn" onClick={g.togglePause}>
          ⏸ Pause
        </button>
        <div className="hud__song">
          <span className="hud__label">Now Playing</span>
          <span className="hud__song-name">
            {song.name}
            {speed < 1 && <span className="speed-tag">{speed}× slow</span>}
            {waitForNote && <span className="speed-tag speed-tag--wait">wait mode</span>}
          </span>
        </div>

        {micEnabled && (
          <div className="mic-chip">
            <span className="mic-chip__dot" />
            <span className="mic-chip__note">
              {/* Aliases share a pitch, so the same name can appear more than once. */}
              {g.micNotes.length ? [...new Set(g.micNotes.map((n) => n.name))].join(' ') : '…'}
            </span>
          </div>
        )}

        {!hideFeedback && (
          <div className="hud__stats">
            <div className="hud__block">
              <span className="hud__label">Score</span>
              <span className="hud__value">{g.score}</span>
            </div>
            <div className="hud__block">
              <span className="hud__label">Accuracy</span>
              <span className="hud__value">{accuracy}%</span>
            </div>
            <div className={'hud__block combo' + (g.combo >= 5 ? ' combo--hot' : '')}>
              <span className="hud__label">Combo</span>
              <span className="hud__value">{g.combo}</span>
            </div>
          </div>
        )}

        {/* Feedback pops over the HUD to save vertical room for the playfield. */}
        {!hideFeedback && (
          <div className="feedback-bar">
            {g.feedback && (
              <div key={g.feedback.id} className={'feedback feedback--' + g.feedback.rating}>
                {g.feedback.text}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="playfield"
        style={
          {
            '--w': cardW,
            '--h': cardH,
            '--key-frac': keyFrac,
            '--hit-h': hitH,
            '--note-scale': NOTE_TEXT_SCALE[layout.size],
          } as React.CSSProperties
        }
      >
        <div className="fall-zone">
          {/* A faint colour band runs down each lane. */}
          {buttons.map((b) => (
            <div
              key={b.lane}
              className="lane-band"
              style={
                { '--x': (b.x * 100).toFixed(3) + '%', '--band': b.color } as React.CSSProperties
              }
            />
          ))}

          {/* Breath bands: one tinted push/pull zone per run. The strip is built
              once (bandEls) and only translated here, so scrolling it is a single
              compositor transform rather than a per-frame relayout. */}
          <div
            className="breath-track"
            style={{
              transform: `translateY(calc(${((g.elapsed / LEAD_TIME) * 100).toFixed(3)}% - var(--hit-h)))`,
            }}
          >
            {bandEls}
          </div>

          {geom.split && <div className="hand-divider" />}

          {placed.map(({ note, progress }) => (
            <NoteCard
              key={note.id}
              note={note}
              x={buttons[note.lane].x}
              color={LANE_COLORS[note.lane]}
              progress={progress}
            />
          ))}

          <div className="hit-bar">
            <span className="hit-bar__label">HIT</span>
          </div>
        </div>

        <Keyboard
          buttons={buttons}
          geom={geom}
          active={active}
          pressed={pressed}
          labelMode={micEnabled ? 'number' : 'key'}
          onPress={g.pressLane}
          onRelease={g.releaseLane}
        />

        {g.countdown > 0 && (
          <div className="countdown">
            <span key={g.countdown}>{g.countdown}</span>
          </div>
        )}

        {g.paused && (
          <Modal title="⏸ Paused" onClose={g.togglePause} className="pause-modal">
            <div className="modal__body">
              <HowToPlay />
            </div>
          </Modal>
        )}
      </div>
    </div>
  )
}
