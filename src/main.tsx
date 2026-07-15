import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyActiveInstrument } from '#instrument/instrument'
import { applyActivePreset } from '#instrument/presets'
import App from './App'
import './index.css'

// Select the saved instrument, then apply its saved tuning on top — both before
// anything renders or plays.
applyActiveInstrument()
applyActivePreset()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
