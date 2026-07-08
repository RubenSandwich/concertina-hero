import { useEffect, useState } from 'react'
import { LANE_LABELS, LANE_COLORS, LANE_NOTES } from '#data/instrument'
import { getActivePreset, type Preset } from '#data/presets'
import { DIFF_CLASS, type Song } from '#data/songs'
import Accordion from '#components/Accordion/Accordion'
import SegmentedControl from '#components/SegmentedControl/SegmentedControl'
import Switch from '#components/Switch/Switch'
import PresetPicker from '#modals/PresetPicker/PresetPicker'
import SongLibrary from '#modals/SongLibrary/SongLibrary'
import { resumeAudio } from '#audio/sound'
import { startMic, stopMic, MIC_ERROR } from '#audio/pitch'
import './Start.css'

const SPEEDS = [
  { label: '0.5×', value: 0.5, note: 'Practice' },
  { label: '0.75×', value: 0.75, note: 'Relaxed' },
  { label: '1×', value: 1, note: 'Full speed' },
]

interface StartProps {
  songs: Song[]
  onStart: (index: number, speed: number, waitForNote: boolean, hideFeedback: boolean) => void
  onSongsChange: () => void
  micEnabled: boolean
  onMicChange: (enabled: boolean) => void
}

export default function Start({
  songs,
  onStart,
  onSongsChange,
  micEnabled,
  onMicChange,
}: StartProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(() => songs[0]?.id)
  const [speed, setSpeed] = useState(1)
  const [waitForNote, setWaitForNote] = useState(false)
  const [hideFeedback, setHideFeedback] = useState(false)
  const [micBusy, setMicBusy] = useState(false)
  const [micError, setMicError] = useState('')
  const [showSongLibrary, setShowSongLibrary] = useState(false)
  const [showPresetPicker, setShowPresetPicker] = useState(false)
  const [activePreset, setActivePreset] = useState<Preset>(() => getActivePreset())

  // Track the selected song by id so it survives songs being added or removed.
  const selectedIndex = Math.max(
    0,
    songs.findIndex((s) => s.id === selectedId),
  )
  useEffect(() => {
    if (songs.length && !songs.some((s) => s.id === selectedId)) {
      setSelectedId(songs[0].id)
    }
  }, [songs, selectedId])

  const handleStart = () => {
    resumeAudio() // unlock audio on this user gesture
    onStart(selectedIndex, speed, waitForNote, hideFeedback)
  }

  const toggleMic = async () => {
    if (micEnabled) {
      stopMic()
      onMicChange(false)
      return
    }
    setMicBusy(true)
    setMicError('')
    try {
      await startMic()
      onMicChange(true)
    } catch {
      setMicError(MIC_ERROR)
      onMicChange(false)
    } finally {
      setMicBusy(false)
    }
  }

  return (
    <div className="start-screen">
      <h1 className="title">
        <img className="title__logo" src={`${import.meta.env.BASE_URL}concertina.svg`} alt="" />
        Concertina&nbsp;Hero
      </h1>
      <p className="subtitle">A squeezebox rhythm game — notes fly in from the right!</p>

      <Accordion variant="howto" heading="How to play">
        <div className="howto__keys">
          {LANE_LABELS.map((label, i) => (
            <span key={label} className="key-cap" style={{ '--lane': LANE_COLORS[i] }}>
              {label}
            </span>
          ))}
        </div>

        <div className="howto__row">
          <span className="badge badge--push">▼ PUSH</span>
          <span>
            Squeeze the bellows in — just <strong>tap</strong> the button's number key.
          </span>
        </div>
        <div className="howto__row">
          <span className="badge badge--pull">▲ PULL</span>
          <span>
            Draw the bellows out — hold <span className="key-cap key-cap--shift">⇧ Shift</span> +
            the number key.
          </span>
        </div>
        <p className="howto__hint">
          Every button plays a different note on push vs pull. The moving cards show the note —
          squeeze the matching button the right way!
        </p>

        <div className="note-map">
          {LANE_NOTES.map((n, i) => (
            <div key={i} className="note-map__btn" style={{ '--lane': LANE_COLORS[i] }}>
              <span className="note-map__num">{i + 1}</span>
              <span className="note-map__notes">
                <span className="nm nm--push">▼ {n.push.name}</span>
                <span className="nm nm--pull">▲ {n.pull.name}</span>
              </span>
            </div>
          ))}
        </div>
      </Accordion>

      <Accordion
        variant="songs"
        defaultOpen
        heading={
          <>
            Song
            <span className="accordion__current" style={{ '--card': songs[selectedIndex].color }}>
              {songs[selectedIndex].name}
            </span>
          </>
        }
      >
        <div className="song-list">
          {songs.map((song, i) => (
            <button
              key={song.id}
              className={'paper song-card' + (i === selectedIndex ? ' is-selected' : '')}
              style={{ '--card': song.color }}
              onClick={() => setSelectedId(song.id)}
            >
              <span className="song-card__name">{song.name}</span>
              <span className="song-card__blurb">{song.blurb}</span>
              <span className="song-card__meta">
                <span className={'diff ' + DIFF_CLASS[song.difficulty]}>{song.difficulty}</span>
                <span className="song-card__bpm">{song.bpm} BPM</span>
              </span>
            </button>
          ))}
        </div>
        <button className="song-manage-btn" onClick={() => setShowSongLibrary(true)}>
          🎵 Add / edit songs
        </button>
      </Accordion>

      <Accordion variant="settings" heading="Settings">
        <div className="practice-row">
          <span className="practice-row__label">Speed</span>
          <SegmentedControl label="Speed" options={SPEEDS} value={speed} onChange={setSpeed} />
        </div>

        <div className="practice-row practice-row--divider practice-row--wait">
          <div className="practice-row__info">
            <span className="practice-row__label" id="wait-label">
              🐢 Wait for correct note
            </span>
            <span className="practice-row__desc" id="wait-desc">
              Pauses on each note until you play it right
            </span>
          </div>
          <Switch
            checked={waitForNote}
            onChange={setWaitForNote}
            labelledBy="wait-label"
            describedBy="wait-desc"
          />
        </div>

        <div className="practice-row practice-row--divider">
          <div className="practice-row__info">
            <span className="practice-row__label" id="hide-label">
              🙈 Hide feedback
            </span>
            <span className="practice-row__desc" id="hide-desc">
              Play without the live score or hit popups — your results still count.
            </span>
          </div>
          <Switch
            checked={hideFeedback}
            onChange={setHideFeedback}
            labelledBy="hide-label"
            describedBy="hide-desc"
          />
        </div>

        <div className="practice-row practice-row--divider">
          <div className="practice-row__info">
            <span className="practice-row__label" id="mic-label">
              🎤 Microphone mode
            </span>
            <span className="practice-row__desc" id="mic-desc">
              Play a note into the mic and it counts as the button press. The keyboard still works
              too.
            </span>
            {micError && <span className="practice-row__err">{micError}</span>}
          </div>
          <Switch
            checked={micEnabled}
            onChange={toggleMic}
            disabled={micBusy}
            labelledBy="mic-label"
            describedBy="mic-desc"
          />
        </div>

        <div className="practice-row practice-row--divider note-freq-row">
          <div className="practice-row__info">
            <span className="practice-row__label">🎹 Note frequencies</span>
            <span className="practice-row__desc">Tune each button to your instrument</span>
          </div>
          <div className="note-freq-current">
            <span className="note-freq-current__caption">Current preset</span>
            <span className="note-freq-current__name">{activePreset.name}</span>
          </div>
          <button className="note-btn" onClick={() => setShowPresetPicker(true)}>
            Select preset
          </button>
        </div>
      </Accordion>

      <button className="btn btn--primary btn--big" onClick={handleStart}>
        ▶ Play {songs[selectedIndex].name}
      </button>

      {showSongLibrary && (
        <SongLibrary
          onClose={() => setShowSongLibrary(false)}
          onChange={onSongsChange}
          onSelect={setSelectedId}
        />
      )}

      {showPresetPicker && (
        <PresetPicker
          micEnabled={micEnabled}
          onMicStarted={() => setMicError('')}
          onActiveChange={setActivePreset}
          onClose={() => setShowPresetPicker(false)}
        />
      )}
    </div>
  )
}
