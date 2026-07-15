import './Results.css'
import type { Song } from '#data/songs'
import { rankFor } from '#data/scoring'
import type { GameResult } from '#hooks/useGameEngine'

interface ResultsProps {
  song: Song
  result: GameResult
  speed?: number
  onReplay: () => void
  onMenu: () => void
}

export default function Results({
  song,
  result,
  speed = 1,
  onReplay,
  onMenu,
}: ResultsProps) {
  const rank = rankFor(result.accuracy)
  const { counts } = result

  return (
    <div className="results">
      <h1 className="title title--small">Song Complete!</h1>
      <p className="subtitle">
        {song.name}
        {speed < 1 && ` · practiced at ${speed}×`}
      </p>

      <div className={'paper results__rank ' + rank.cls}>
        <span className="rank">{rank.grade}</span>
        <span className="rank__label">{rank.label}</span>
      </div>

      <div className="paper results__panel">
        <div className="stat-grid">
          <div className="stat stat--score">
            <span className="stat__label">Score</span>
            <span className="stat__value">{result.score}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Accuracy</span>
            <span className="stat__value">{result.accuracy}%</span>
          </div>
          <div className="stat">
            <span className="stat__label">Max Combo</span>
            <span className="stat__value">{result.maxCombo}</span>
          </div>
        </div>

        <div className="judge-grid">
          <div className="judge judge--perfect">
            <span>Perfect</span>
            <strong>{counts.perfect}</strong>
          </div>
          <div className="judge judge--good">
            <span>Good</span>
            <strong>{counts.good}</strong>
          </div>
          <div className="judge judge--ok">
            <span>Ok</span>
            <strong>{counts.ok}</strong>
          </div>
          <div className="judge judge--miss">
            <span>Miss</span>
            <strong>{counts.miss}</strong>
          </div>
        </div>
      </div>

      <div className="results__actions">
        <button className="btn btn--primary btn--big" onClick={onReplay}>
          ↻ Play Again
        </button>
        <button className="btn btn--ghost btn--big" onClick={onMenu}>
          ♪ Main Menu
        </button>
      </div>
    </div>
  )
}
