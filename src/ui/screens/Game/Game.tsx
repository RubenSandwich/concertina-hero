import { useMemo } from 'react'
import { useGameEngine } from '#hooks/useGameEngine'
import type { GameNote, GameResult } from '#hooks/useGameEngine'
import type { Song, Section } from '#data/songs'
import { LANE_LABELS, LANE_COLORS, LANE_NOTES, type Direction } from '#data/instrument'
import { HIT_LINE_PCT, LEAD_TIME, noteX } from '#data/timing'
import './Game.css'

// The note's on-screen x-position (percent), or null when it shouldn't render.
// Bounds are generous so wide notes stay visible until fully off-screen.
function noteScreenX(note: GameNote, elapsed: number): number | null {
  if (note.state === 'active') {
    const x = noteX(note.time - elapsed)
    return x < -18 || x > 118 ? null : x
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

  // A note is as wide as the time until the next note, so a lone note fills its
  // whole push/pull section; a ~10px gap is left before the following card.
  // One beat spans `stepPct` percent of the lane. Notes are anchored by their
  // left edge (half a beat left of their beat) so a standard one-beat note still
  // straddles the hit line exactly as before. `halfNotePct` also lines the
  // ribbon bands up with the note-card leading edges.
  const stepMs = 60000 / (song.bpm * (song.subdivision || 1))
  const stepPct = (stepMs / LEAD_TIME) * (100 - HIT_LINE_PCT)
  const halfNotePct = stepPct / 2
  const laneSpan = 100 - HIT_LINE_PCT
  const noteWidthCss = (gapMs: number) =>
    `max(56px, calc(${((gapMs / LEAD_TIME) * laneSpan).toFixed(2)}% - 10px))`
  const gapById = useMemo(() => {
    const m: Record<number, number> = {}
    const ns = song.notes
    for (let i = 0; i < ns.length; i++) {
      // Skip chord siblings (same beat) so every note spans to the *next* beat.
      let j = i + 1
      while (j < ns.length && ns[j].time === ns[i].time) j++
      m[ns[i].id] = j < ns.length ? ns[j].time - ns[i].time : stepMs
    }
    return m
  }, [song, stepMs])

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
            // Shift left by half a note so a band starts at the note's leading
            // edge rather than through its middle.
            const left = noteX(s.start - g.elapsed) - halfNotePct
            const right = noteX(s.end - g.elapsed) - halfNotePct
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
            const laneNotes: { n: GameNote; left: number; width: string }[] = []
            for (const n of g.notes) {
              if (n.lane !== i) continue
              const x = noteScreenX(n, g.elapsed)
              if (x != null)
                laneNotes.push({
                  n,
                  left: x - halfNotePct,
                  width: noteWidthCss(gapById[n.id] ?? stepMs),
                })
            }
            return (
              <div className="lane" key={label} style={{ '--lane': LANE_COLORS[i] }}>
                <div className="lane-track">
                  {laneNotes.map(({ n, left, width }) => (
                    <Note key={n.id} note={n} left={left} width={width} />
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
