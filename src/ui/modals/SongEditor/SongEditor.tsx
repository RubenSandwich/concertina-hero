import { useState } from 'react'
import {
  DIFFICULTIES,
  DIFF_CLASS,
  chartNoteCount,
  chartRequiredButtons,
  chartOutOfRange,
  type Song,
  type Difficulty,
} from '#data/songs'
import { minInstrumentFor } from '#data/layout'
import { randomAccentColor } from '#data/colors'
import { slug, downloadJSON } from '../../../utils'
import Modal from '#components/Modal/Modal'
import './SongEditor.css'

// Editor draft: bpm may be a string mid-edit (coerced to a number on save).
interface DraftState {
  name: string
  blurb: string
  bpm: number | string
  color: string
  difficulty: Difficulty
  chart: string
}

// The validated payload handed back to the parent on save.
export interface SongDraft {
  id?: string
  name: string
  blurb: string
  bpm: number
  color: string
  difficulty: Difficulty
  chart: string
}

// Blank starting point for a brand-new song.
const emptyDraft = (): DraftState => ({
  name: '',
  blurb: '',
  bpm: 100,
  color: randomAccentColor(),
  difficulty: 'Medium',
  chart: '',
})

interface SongEditorProps {
  song?: Song | null
  onSave: (draft: SongDraft) => void
  onClose: () => void
}

// A full-page modal for creating or editing a song: name, colour, BPM, blurb,
// difficulty and the note chart. Nothing is applied until "Save & Close", which
// hands the draft back to the parent via onSave; it can also be downloaded.
export default function SongEditor({ song = null, onSave, onClose }: SongEditorProps) {
  const [draft, setDraft] = useState<DraftState>(() =>
    song
      ? {
          name: song.name,
          blurb: song.blurb,
          bpm: song.bpm,
          color: song.color,
          difficulty: song.difficulty,
          chart: song.chart,
        }
      : emptyDraft(),
  )
  const [error, setError] = useState('')

  const set = (patch: Partial<DraftState>) => {
    setDraft((d) => ({ ...d, ...patch }))
    if (error) setError('')
  }

  const noteCount = chartNoteCount(draft.chart)
  const required = chartRequiredButtons(draft.chart)
  const outOfRange = chartOutOfRange(draft.chart)

  const download = () => {
    downloadJSON(`concertina-song-${slug(draft.name, 'song')}.json`, {
      name: draft.name.trim() || 'Untitled song',
      blurb: draft.blurb.trim(),
      bpm: Number(draft.bpm) || 0,
      color: draft.color,
      difficulty: draft.difficulty,
      chart: draft.chart,
    })
  }

  const save = () => {
    if (!draft.name.trim()) return setError('Give your song a name.')
    const bpm = Number(draft.bpm)
    if (!Number.isFinite(bpm) || bpm <= 0) return setError('BPM must be a positive number.')
    if (!noteCount) return setError('Add some notes to the chart (tokens like +3 or -4).')
    if (outOfRange.length) {
      return setError(`Buttons must be 1–30. Out of range: ${outOfRange.join(', ')}.`)
    }
    try {
      onSave({
        id: song?.id,
        ...draft,
        name: draft.name.trim(),
        blurb: draft.blurb.trim(),
        bpm,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const colorValue = /^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : '#8ac926'

  return (
    <Modal title={song ? 'Edit song' : 'New song'} onClose={onClose}>
      <div className="modal__body">
        <div className="song-form">
          <label className="modal__field">
            <span className="modal__field-label">Song name</span>
            <input
              className="modal__field-input"
              type="text"
              value={draft.name}
              placeholder="e.g. My Song"
              maxLength={60}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>

          <label className="modal__field">
            <span className="modal__field-label">Blurb</span>
            <input
              className="modal__field-input"
              type="text"
              value={draft.blurb}
              placeholder="A short description shown on the card"
              maxLength={120}
              onChange={(e) => set({ blurb: e.target.value })}
            />
          </label>

          <div className="song-form-row">
            <label className="modal__field song-form-row__bpm">
              <span className="modal__field-label">BPM</span>
              <input
                className="modal__field-input"
                type="number"
                min="20"
                max="400"
                value={draft.bpm}
                onChange={(e) => set({ bpm: e.target.value })}
              />
            </label>
            <div className="modal__field song-form-row__color">
              <span className="modal__field-label">Colour</span>
              <span className="song-color">
                <input
                  className="song-color__input"
                  type="color"
                  value={colorValue}
                  onChange={(e) => set({ color: e.target.value })}
                  aria-label="Song colour"
                />
                <button
                  type="button"
                  className="song-color__random"
                  onClick={() => set({ color: randomAccentColor() })}
                  title="Random colour"
                  aria-label="Random colour"
                >
                  🎲
                </button>
              </span>
            </div>
          </div>

          <div className="modal__field">
            <span className="modal__field-label">Difficulty</span>
            <div className="diff-choices">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={
                    'diff diff-choice ' +
                    DIFF_CLASS[d] +
                    (draft.difficulty === d ? ' is-selected' : '')
                  }
                  onClick={() => set({ difficulty: d })}
                  aria-pressed={draft.difficulty === d}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <label className="modal__field">
            <span className="modal__field-label">
              Notes (chart)
              <span className="modal__field-note">
                {' '}
                — {noteCount} note{noteCount === 1 ? '' : 's'}
                {required > 0 && (
                  <>
                    {' '}
                    · needs a {minInstrumentFor(required)}-button (up to {required})
                  </>
                )}
              </span>
            </span>
            <textarea
              className="modal__field-input modal__field-textarea"
              rows={6}
              value={draft.chart}
              placeholder={'+3 +3 +3 -3 -4\n-4 X (-4 -3) +4 -5'}
              spellCheck={false}
              onChange={(e) => set({ chart: e.target.value })}
            />
            <span className="modal__field-hint">
              One token per beat: <b>+N</b> push, <b>−N</b> pull (button 1–30). <b>X</b> is a rest,
              and <b>(−4 −3)</b> plays a chord. Line breaks are just for readability. A song's
              highest button sets the smallest concertina that can play it.
            </span>
          </label>
        </div>
      </div>

      {error && <p className="modal__err">{error}</p>}

      <div className="modal__footer">
        <button className="btn btn--ghost" onClick={download}>
          Download
        </button>
        <button className="btn btn--primary" onClick={save}>
          Save &amp; Close
        </button>
      </div>
    </Modal>
  )
}
