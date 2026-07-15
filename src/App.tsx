import { useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { getSongs, findSongVersionMismatches } from '#songs/songLibrary'
import { withLeadIn, type Song } from '#songs/songs'
import {
  getActiveInstrument,
  setActiveInstrument,
  type InstrumentSize,
} from '#instrument/instrument'
import {
  applyActivePreset,
  findPresetVersionMismatches,
} from '#instrument/presets'
import type { VersionMismatch } from './utils/storageVersion'
import type { GameResult } from '#engine/useGameEngine'
import Start, { type StartSections } from '#screens/Start/Start'
import Game from '#screens/Game/Game'
import Results from '#screens/Results/Results'
import ScreenGuard from '#modals/ScreenGuard/ScreenGuard'
import VersionMismatchModal from '#modals/VersionMismatch/VersionMismatch'

type Screen = 'start' | 'game' | 'results'
type TransitionDirection = 'forward' | 'backward'

// Run a screen change inside a directional View Transition. `direction` is
// 'forward' (new screen slides in from the right) or 'backward' (from the left).
// Falls back to an instant swap where the API isn't supported.
function transition(direction: TransitionDirection, update: () => void) {
  if (!document.startViewTransition) {
    update()
    return
  }
  document.documentElement.dataset.transition = direction
  document.startViewTransition(() => flushSync(update))
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('start') // 'start' | 'game' | 'results'
  const [songs, setSongs] = useState<Song[]>(() => getSongs()) // built-in + saved songs
  const [songIndex, setSongIndex] = useState(0)
  const [speed, setSpeed] = useState(1) // practice playback multiplier
  const [waitForNote, setWaitForNote] = useState(false) // hold on each note
  const [hideFeedback, setHideFeedback] = useState(false) // play without the live score
  const [micEnabled, setMicEnabled] = useState(false) // play via microphone
  const [result, setResult] = useState<GameResult | null>(null)
  const [runId, setRunId] = useState(0) // bump to force a fresh Game mount

  // Saved presets/songs stamped with an older model version (see
  // storageVersion.ts) — checked once at startup. Non-empty blocks the
  // app behind VersionMismatchModal until they're all deleted.
  const [versionMismatches, setVersionMismatches] = useState<VersionMismatch[]>(
    () => [...findSongVersionMismatches(), ...findPresetVersionMismatches()],
  )

  // Re-read the songs list too, in case what changed was a mismatched song.
  const handleMismatchChange = (remaining: VersionMismatch[]) => {
    setVersionMismatches(remaining)
    setSongs(getSongs())
  }

  // Start-screen section open states — kept here so they persist while Start is
  // unmounted during a game and restore on return.
  const [startSections, setStartSections] = useState<StartSections>({
    howto: false,
    songs: true,
    settings: false,
  })
  const toggleStartSection = (section: keyof StartSections, open: boolean) =>
    setStartSections((s) => ({ ...s, [section]: open }))

  // The active instrument (a global setting): drives geometry/colours/tuning, and
  // gates which songs are playable.
  const [instrumentSize, setInstrumentSize] = useState<InstrumentSize>(() =>
    getActiveInstrument(),
  )

  // Switch instruments: rebuild the note map from the new layout, re-apply that
  // size's own saved tuning on top, then re-render everything that reads them.
  const changeInstrument = (size: InstrumentSize) => {
    setActiveInstrument(size)
    applyActivePreset()
    setInstrumentSize(size)
  }

  // The run-ready song: notes/sections shifted so nothing appears until the
  // countdown ends. Stable within a run (only changes when the song changes).
  const song = useMemo(() => withLeadIn(songs[songIndex]), [songs, songIndex])

  // Append an uploaded song to the list so it can be selected and played.
  const refreshSongs = () => setSongs(getSongs())

  const startGame = (
    index: number,
    spd = speed,
    wait = waitForNote,
    hide = hideFeedback,
    direction: TransitionDirection = 'forward',
  ) => {
    transition(direction, () => {
      setSongIndex(index)
      setSpeed(spd)
      setWaitForNote(wait)
      setHideFeedback(hide)
      setRunId((n) => n + 1)
      setResult(null)
      setScreen('game')
    })
  }

  const handleFinish = (r: GameResult) => {
    transition('forward', () => {
      setResult(r)
      setScreen('results')
    })
  }

  const goToMenu = () => transition('backward', () => setScreen('start'))

  return (
    <div className="app paper-grain">
      <div className="app-bg" aria-hidden="true" />

      <div className="screen-stage">
        {screen === 'start' && (
          <Start
            songs={songs}
            onStart={startGame}
            onSongsChange={refreshSongs}
            micEnabled={micEnabled}
            onMicChange={setMicEnabled}
            instrumentSize={instrumentSize}
            onInstrumentChange={changeInstrument}
            sections={startSections}
            onSectionToggle={toggleStartSection}
          />
        )}

        {screen === 'game' && (
          <Game
            key={runId}
            song={song}
            speed={speed}
            micEnabled={micEnabled}
            waitForNote={waitForNote}
            hideFeedback={hideFeedback}
            onFinish={handleFinish}
            onQuit={goToMenu}
          />
        )}

        {screen === 'results' && result && (
          <Results
            song={song}
            result={result}
            speed={speed}
            onReplay={() =>
              startGame(songIndex, speed, waitForNote, hideFeedback, 'backward')
            }
            onMenu={goToMenu}
          />
        )}
      </div>

      <ScreenGuard />
      {versionMismatches.length > 0 && (
        <VersionMismatchModal
          mismatches={versionMismatches}
          onChange={handleMismatchChange}
        />
      )}
    </div>
  )
}
