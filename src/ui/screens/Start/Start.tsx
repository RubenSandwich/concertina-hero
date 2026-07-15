import { useEffect, useState } from 'react'
import {
  INSTRUMENT_SIZES,
  minInstrumentFor,
  type InstrumentSize,
} from '#data/layout'
import { getActivePreset, type Preset } from '#data/presets'
import { DIFF_CLASS, type Song } from '#data/songs'
import Accordion from '#components/Accordion/Accordion'
import HowToPlay from '#components/HowToPlay/HowToPlay'
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

const INSTRUMENTS = INSTRUMENT_SIZES.map((size) => ({
  label: `${size}`,
  value: size,
  note: 'button',
}))

// Which collapsible sections are open. Held in App so it survives the Start
// screen unmounting during a game and restores on return.
export type StartSections = {
  howto: boolean
  songs: boolean
  settings: boolean
}

interface StartProps {
  songs: Song[]
  onStart: (
    index: number,
    speed: number,
    waitForNote: boolean,
    hideFeedback: boolean,
  ) => void
  onSongsChange: () => void
  micEnabled: boolean
  onMicChange: (enabled: boolean) => void
  instrumentSize: InstrumentSize
  onInstrumentChange: (size: InstrumentSize) => void
  sections: StartSections
  onSectionToggle: (section: keyof StartSections, open: boolean) => void
}

export default function Start({
  songs,
  onStart,
  onSongsChange,
  micEnabled,
  onMicChange,
  instrumentSize,
  onInstrumentChange,
  sections,
  onSectionToggle,
}: StartProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => songs[0]?.id,
  )
  const [speed, setSpeed] = useState(1)
  const [waitForNote, setWaitForNote] = useState(false)
  const [hideFeedback, setHideFeedback] = useState(false)
  const [micBusy, setMicBusy] = useState(false)
  const [micError, setMicError] = useState('')
  const [showSongLibrary, setShowSongLibrary] = useState(false)
  const [showPresetPicker, setShowPresetPicker] = useState(false)
  const [activePreset, setActivePreset] = useState<Preset>(() =>
    getActivePreset(),
  )

  // A song needs more buttons than the selected instrument has.
  const isLocked = (song: Song) => song.requiredButtons > instrumentSize

  // Track the selected song by id so it survives songs being added or removed.
  const selectedIndex = Math.max(
    0,
    songs.findIndex((s) => s.id === selectedId),
  )
  const selectedLocked = songs.length > 0 && isLocked(songs[selectedIndex])

  useEffect(() => {
    // Keep a valid, *playable* song selected as songs change or the instrument
    // shrinks under the current pick (re-runs on instrumentSize via isLocked).
    const current = songs.find((s) => s.id === selectedId)
    if (songs.length && (!current || isLocked(current))) {
      setSelectedId((songs.find((s) => !isLocked(s)) ?? songs[0]).id)
    }
  }, [songs, selectedId, instrumentSize])

  // Presets are per-instrument, so the active tuning display follows the size.
  useEffect(() => {
    setActivePreset(getActivePreset())
  }, [instrumentSize])

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

  // Keyboard ↔ Mic mode. Selecting Mic requests permission (via toggleMic);
  // Keyboard turns it back off. Only act when the mode actually changes.
  const setInputMode = (mode: 'keyboard' | 'mic') => {
    if ((mode === 'mic') !== micEnabled) toggleMic()
  }

  return (
    <div className="start-screen">
      <h1 className="title">
        <img
          className="title__logo"
          src={`${import.meta.env.BASE_URL}concertina.svg`}
          alt=""
        />
        Concertina&nbsp;Hero
      </h1>
      <p className="subtitle">
        A squeezebox rhythm game — notes fall onto the keyboard!
      </p>

      <Accordion
        variant="howto"
        heading="How to play"
        open={sections.howto}
        onOpenChange={(o) => onSectionToggle('howto', o)}
      >
        <HowToPlay />
      </Accordion>

      <Accordion
        variant="songs"
        open={sections.songs}
        onOpenChange={(o) => onSectionToggle('songs', o)}
        heading={
          <>
            Song
            <span
              className="accordion__current"
              style={{ '--card': songs[selectedIndex].color }}
            >
              {songs[selectedIndex].name}
            </span>
          </>
        }
      >
        <div className="song-list">
          {songs.map((song, i) => {
            const locked = isLocked(song)
            const minSize = minInstrumentFor(song.requiredButtons)
            return (
              <button
                key={song.id}
                className={
                  'paper song-card' +
                  (i === selectedIndex ? ' is-selected' : '') +
                  (locked ? ' is-locked' : '')
                }
                style={{ '--card': song.color }}
                onClick={() => setSelectedId(song.id)}
                disabled={locked}
              >
                <span className="song-card__name">{song.name}</span>
                <span className="song-card__blurb">{song.blurb}</span>
                <span className="song-card__meta">
                  <span className={'diff ' + DIFF_CLASS[song.difficulty]}>
                    {song.difficulty}
                  </span>
                  <span className="song-card__bpm">{song.bpm} BPM</span>
                  <span
                    className={
                      'song-card__supports' + (locked ? ' is-blocked' : '')
                    }
                    title={`Plays on the ${minSize}-button and any larger concertina`}
                  >
                    <img
                      className="song-card__supports-icon"
                      src={`${import.meta.env.BASE_URL}concertina.svg`}
                      alt=""
                    />
                    {minSize}+
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        <button
          className="song-manage-btn"
          onClick={() => setShowSongLibrary(true)}
        >
          🎵 Add / edit songs
        </button>
      </Accordion>

      <Accordion
        variant="settings"
        heading="Settings"
        open={sections.settings}
        onOpenChange={(o) => onSectionToggle('settings', o)}
      >
        <div className="practice-row">
          <div className="practice-row__info">
            <span className="practice-row__label">⏩ Speed</span>
            <span className="practice-row__desc">
              Slow the notes down while you learn, then work back up to full
              speed.
            </span>
          </div>
          <SegmentedControl
            label="Speed"
            options={SPEEDS}
            value={speed}
            onChange={setSpeed}
          />
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
              Play without the live score or hit popups — your results still
              count.
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
            <span className="practice-row__label">🎛️ Play style</span>
            <span className="practice-row__desc">
              Press keys, or switch to the mic to play your real concertina —
              the keyboard stays a fallback. Mic needs permission.
            </span>
            {micError && <span className="practice-row__err">{micError}</span>}
          </div>
          <SegmentedControl
            label="Input mode"
            options={[
              { label: '⌨ Keys', value: 'keyboard' },
              { label: micBusy ? '🎤 …' : '🎤 Mic', value: 'mic' },
            ]}
            value={micEnabled ? 'mic' : 'keyboard'}
            onChange={setInputMode}
          />
        </div>

        <div className="practice-row practice-row--divider">
          <div className="practice-row__info">
            <span className="practice-row__label">
              <img
                className="practice-row__icon"
                src={`${import.meta.env.BASE_URL}concertina.svg`}
                alt=""
              />
              Your concertina
            </span>
            <span className="practice-row__desc">
              Pick the anglo you own — sets the keyboard, colours and tuning.
            </span>
          </div>
          <SegmentedControl
            label="Instrument size"
            options={INSTRUMENTS}
            value={instrumentSize}
            onChange={onInstrumentChange}
          />
        </div>

        <div className="practice-row practice-row--divider note-freq-row">
          <div className="practice-row__info">
            <span className="practice-row__label">🔘 Note frequencies</span>
            <span className="practice-row__desc">
              Tune each button to your instrument — presets are saved per size.
            </span>
          </div>
          <div className="note-freq-current">
            <span className="note-freq-current__caption">
              Preset · {instrumentSize}-button
            </span>
            <span className="note-freq-current__name">{activePreset.name}</span>
          </div>
          <button
            className="note-btn"
            onClick={() => setShowPresetPicker(true)}
          >
            Select preset
          </button>
        </div>
      </Accordion>

      <button
        className="btn btn--primary btn--big"
        onClick={handleStart}
        disabled={selectedLocked}
      >
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
