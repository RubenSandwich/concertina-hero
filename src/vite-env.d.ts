/// <reference types="vite/client" />

import 'react'

declare module 'react' {
  // Allow CSS custom properties (e.g. `--lane`) in inline `style` objects.
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined
  }
}

declare global {
  interface Window {
    // Safari's prefixed AudioContext, used as a fallback by the synth.
    webkitAudioContext?: typeof AudioContext
  }
}
