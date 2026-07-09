import { useGameEngine } from '#hooks/useGameEngine'
import type { GameNote, GameResult } from '#hooks/useGameEngine'
import type { Song, Section } from '#data/songs'
import { LANE_LABELS, LANE_COLORS, LANE_NOTES, type Direction } from '#data/instrument'
import { HIT_LINE_PCT, LEAD_TIME, noteX } from '#data/timing'
import './Game.css'

// The left edge of the note's card as a percent, or null when it shouldn't
// render. `spanPct` is the card's width, so a card is culled only once it has
// fully swept off the left edge.
function noteScreenX(note: GameNote, elapsed: number, spanPct: number): number | null {
  if (note.state === 'active' || note.state === 'holding') {
    const x = noteX(note.time - elapsed)
    return x + spanPct < -6 || x > 112 ? null : x
  }
  // Recently hit/missed: freeze it briefly at its judged spot for the pop-out.
  return elapsed - note.judgeElapsed < 340 ? note.judgeX : null
}

// Which direction the song wants right now (drives the mode UI).
function currentDir(sections: Section[], elapsed: number): Direction {
  for (const s of sections) if (elapsed < s.end) return s.dir
  return sections.length ? sections[sections.length - 1].dir : 'push'
}

interface NoteProps {
  note: GameNote
  left: number
  width: string
}

function Note({ note, left, width }: NoteProps) {
  const noteName = LANE_NOTES[note.lane][note.type].name
  const isPull = note.type === 'pull'
  const cls =
    'note note--' +
    note.type +
    (note.state === 'holding' ? ' note--holding' : '') +
    (note.state === 'hit' ? ' note--hit note--' + (note.rating ?? '') : '') +
    (note.state === 'miss' ? ' note--miss' : '')
  return (
    <div className={cls} style={{ left: left + '%', width }}>
      <span className="note-arrow" aria-hidden="true">
        {isPull ? '▲' : '▼'}
      </span>
      <span className="note-name">{noteName}</span>
    </div>
  )
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

  // Every note sustains for one beat. A card is anchored with its left edge on
  // its beat and is exactly one beat (`stepPct`) wide, so it lies over the hit
  // line for precisely the window in which the note can be held. A ~10px gap is
  // trimmed off so adjacent cards stay visibly separate — a re-press, not a hold.
  const stepMs = 60000 / (song.bpm * (song.subdivision || 1))
  const stepPct = (stepMs / LEAD_TIME) * (100 - HIT_LINE_PCT)
  const noteWidth = `max(56px, calc(${stepPct.toFixed(2)}% - 10px))`

  const judged = g.counts.perfect + g.counts.good + g.counts.ok + g.counts.miss
  const accuracy = judged
    ? Math.round(((g.counts.perfect + g.counts.good + g.counts.ok) / judged) * 100)
    : 100
  const mode = currentDir(song.sections, Math.max(g.elapsed, 0))

  return (
    <div className={'game mode--' + mode}>
      <div className="hud">
        <button className="btn btn--ghost quit-btn" onClick={onQuit}>
          ‹ Quit
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
            <span className="mic-chip__note">{g.micNote ? g.micNote.name : '…'}</span>
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

      <div className="playfield">
        {/* Scrolling ribbon showing the push/pull sections as they approach. */}
        <div className="section-ribbon">
          <div className="section-ribbon__marker" style={{ left: HIT_LINE_PCT + '%' }} />
          {song.sections.map((s) => {
            // Bands share the note anchoring, so a band starts exactly at the
            // leading edge of the first card in the run.
            const left = noteX(s.start - g.elapsed)
            const right = noteX(s.end - g.elapsed)
            if (right < -6 || left > 112) return null
            return (
              <div
                key={s.id}
                className={'section-block section-block--' + s.dir}
                style={{ left: left + '%', width: right - left + '%' }}
              >
                <span>{s.dir === 'pull' ? '▲ PULL' : '▼ PUSH'}</span>
              </div>
            )
          })}
        </div>

        <div className="lanes">
          <div className="hit-zone" style={{ left: HIT_LINE_PCT + '%' }} />

          {LANE_LABELS.map((label, i) => {
            const activeType = g.activeKeys[i]
            const micHere = g.micNote && g.micNote.lane === i
            const laneNotes: { n: GameNote; left: number }[] = []
            for (const n of g.notes) {
              if (n.lane !== i) continue
              const x = noteScreenX(n, g.elapsed, stepPct)
              if (x != null) laneNotes.push({ n, left: x })
            }
            return (
              <div className="lane" key={label} style={{ '--lane': LANE_COLORS[i] }}>
                <div className="lane-track">
                  {laneNotes.map(({ n, left }) => (
                    <Note key={n.id} note={n} left={left} width={noteWidth} />
                  ))}
                </div>
                <div
                  className={
                    'key-target' +
                    (activeType || micHere ? ' is-active' : '') +
                    (mode === 'pull' ? ' is-pull' : '')
                  }
                  style={{ left: HIT_LINE_PCT + '%' }}
                >
                  <span className="key-letter">{label}</span>
                </div>
              </div>
            )
          })}
        </div>

        {g.countdown > 0 && (
          <div className="countdown">
            <span key={g.countdown}>{g.countdown}</span>
          </div>
        )}

        {g.paused && (
          <div className="pause-overlay">
            <div className="paper pause-card">
              <span className="pause-card__title">⏸ Paused</span>
              <span className="pause-card__hint">
                Press <b>Space</b> to resume
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
