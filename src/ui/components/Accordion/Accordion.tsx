import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import './Accordion.css'

// A collapsible "paper" card — a disclosure widget. The toggle button reports
// open state via `aria-expanded`, the chevron rotates, and the panel animates
// open/closed. When collapsed the panel is `inert`, so its content is pulled out
// of the tab order and the accessibility tree rather than merely hidden with CSS
// (which would leave it focusable and readable by AT).
//
// Uncontrolled by default (owns its open state, seeded by `defaultOpen`). Pass
// `open` to control it and get toggles back via `onOpenChange` — the Start screen
// uses this to keep its sections' open state in App, so they survive a game.
interface AccordionProps {
  variant?: string
  heading: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: ReactNode
}

export default function Accordion({
  variant = '',
  heading,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  children,
}: AccordionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const controlled = openProp !== undefined
  const open = controlled ? openProp : internalOpen
  const panelId = useId()

  const toggle = () => {
    if (!controlled) setInternalOpen((v) => !v)
    onOpenChange?.(!open)
  }

  return (
    <div className={'paper accordion' + (variant ? ' ' + variant : '')}>
      <h2 className="accordion__title">
        <button
          className="accordion__toggle"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span className="accordion__heading">{heading}</span>
          <span className="accordion__chevron" aria-hidden="true">
            ▼
          </span>
        </button>
      </h2>

      <div
        id={panelId}
        className={'accordion__panel' + (open ? ' is-open' : '')}
        inert={!open}
      >
        <div className="accordion__body">{children}</div>
      </div>
    </div>
  )
}
