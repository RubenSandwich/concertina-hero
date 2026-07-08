import { useEffect, useId, useRef } from 'react'
import type { ReactNode, SyntheticEvent, MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import './Modal.css'

// A shared modal built on the native <dialog> element. Using the platform
// dialog gives us real focus trapping, Escape handling, top-layer stacking and
// an inert background for free — the things a hand-rolled overlay div can't do
// accessibly. When the modal opens its title is focused first so screen readers
// announce what it is.
//
// Props:
//   title     — heading text (also the dialog's accessible name)
//   onClose   — called on the ✕ button, a backdrop click, or Escape
//   className — extra class(es) for the <dialog> (optional)
//   children  — the modal body (hint, scrollable body, footer, …)
interface ModalProps {
  title: ReactNode
  onClose: () => void
  className?: string
  children?: ReactNode
}

export default function Modal({ title, onClose, className = '', children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    // Remember what had focus so we can restore it when the modal closes.
    const prevFocused = document.activeElement
    if (dialog && !dialog.open) dialog.showModal()
    // Override the dialog's default initial focus with the title.
    titleRef.current?.focus()
    return () => {
      if (dialog?.open) dialog.close()
      // React can unmount the <dialog> before the browser restores focus, so
      // send it back to the trigger ourselves.
      if (prevFocused instanceof HTMLElement && document.contains(prevFocused)) {
        prevFocused.focus()
      }
    }
  }, [])

  // Escape fires `cancel`; keep React the single source of truth for visibility.
  const handleCancel = (e: SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault()
    onClose()
  }

  // A click that lands on the dialog itself (its ::backdrop) closes it.
  const handleClick = (e: ReactMouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose()
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className={'modal-dialog' + (className ? ' ' + className : '')}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClick={handleClick}
    >
      <div className="paper modal">
        <div className="modal__head">
          <h2 className="modal__title" id={titleId} tabIndex={-1} ref={titleRef}>
            {title}
          </h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>,
    document.body,
  )
}
