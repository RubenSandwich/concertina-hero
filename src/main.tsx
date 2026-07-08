import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyActivePreset } from '#data/presets'
import App from './App'
import './index.css'

// Apply the saved note-frequency tuning before anything renders or plays.
applyActivePreset()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
