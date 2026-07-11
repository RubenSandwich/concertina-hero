import { useEffect, useState } from 'react'
import './ScreenGuard.css'

// The app's minimum supported width. Below this the anglo keyboard (up to 30
// buttons split across two hands) can't fit without buttons colliding across the
// bellows divider, so the whole app is blocked.
export const MIN_APP_WIDTH = 1024

// A blocking, non-dismissable overlay shown whenever the window is narrower than
// MIN_APP_WIDTH. If the device's screen simply can't reach that width (a phone),
// it asks the player to move to a tablet/desktop; otherwise it asks them to widen
// the window. There is no close button — it clears itself once the width is enough.
export default function ScreenGuard() {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (width >= MIN_APP_WIDTH) return null

  // If the physical screen can reach the width in *some* orientation, the player
  // can just resize (or rotate); otherwise the device itself is too small.
  const canWiden = Math.max(window.screen.width, window.screen.height) >= MIN_APP_WIDTH

  return (
    <div
      className="screen-guard"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="screen-guard-title"
    >
      <div className="paper screen-guard__card">
        <img
          className="screen-guard__icon"
          src={`${import.meta.env.BASE_URL}concertina.svg`}
          alt=""
        />
        <h2 id="screen-guard-title" className="screen-guard__title">
          {canWiden ? 'A little more room, please' : 'Screen too small'}
        </h2>
        <p className="screen-guard__body">
          {canWiden ? (
            <>
              Concertina Hero needs a window at least <b>{MIN_APP_WIDTH}px</b> wide so the whole
              keyboard fits. Widen your browser window to keep playing.
            </>
          ) : (
            <>
              Concertina Hero needs a screen at least <b>{MIN_APP_WIDTH}px</b> wide — the keyboard
              can be up to 30 buttons across. Please switch to a tablet or desktop.
            </>
          )}
        </p>
        <p className="screen-guard__meter">
          {width}px<span> / {MIN_APP_WIDTH}px needed</span>
        </p>
      </div>
    </div>
  )
}
