import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import './Accordion.css'

// A collapsible "paper" card — a disclosure widget. It owns its open state: the
// toggle button reports it via `aria-expanded`, the chevron rotates, and the
// panel animates open/closed. When collapsed the panel is `inert`, so its
// content is pulled out of the tab order and the accessibility tree rather than
// merely hidden with CSS (which would leave it focusable and readable by AT).
interface AccordionProps {
  variant?: string
  heading: ReactNode
  defaultOpen?: boolean
  children?: ReactNode
}

export default function Accordion({
  variant = '',
  heading,
  defaultOpen = false,
  children,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <div className={'paper accordion' + (variant ? ' ' + variant : '')}>
      <h2 className="accordion__title">
        <button
          className="accordion__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span className="accordion__heading">{heading}</span>
          <span className="accordion__chevron" aria-hidden="true">
            ▼
          </span>
        </button>
      </h2>

      <div id={panelId} className={'accordion__panel' + (open ? ' is-open' : '')} inert={!open}>
        <div className="accordion__body">{children}</div>
      </div>
    </div>
  )
}
