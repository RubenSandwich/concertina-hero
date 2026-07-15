import { useEffect, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { VersionMismatch } from '../../../utils/storageVersion'
import { deleteVersionMismatch } from '../../../utils/storageVersion'
import ListRow from '#components/ListRow/ListRow'
import './VersionMismatch.css'

interface VersionMismatchModalProps {
  mismatches: VersionMismatch[]
  onChange: (remaining: VersionMismatch[]) => void
}

// A blocking, non-dismissable overlay shown at startup when one or more
// records saved in localStorage (presets/songs — see storageVersion.ts)
// were stamped with a different schema version than the app currently
// expects. Unlike the shared Modal component, there is deliberately no close
// button, backdrop-click, or Escape dismissal, and no "keep"/"ignore" option
// either: an old-shape record is likely to make the app misbehave, so the
// only way out is to delete the offending record(s), one at a time or all at
// once. Renders nothing once `mismatches` is empty (the caller should stop
// mounting it at that point, same as it started).
export default function VersionMismatchModal({
  mismatches,
  onChange,
}: VersionMismatchModalProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Focus the title as soon as the overlay appears, same as the shared Modal
  // component does — announces it to screen readers immediately and gives
  // Tab a sane starting point, without relying on a native <dialog> (which
  // we deliberately don't use here — see the no-Escape guard below).
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  if (mismatches.length === 0) return null

  const remove = (m: VersionMismatch) => {
    deleteVersionMismatch(m)
    onChange(mismatches.filter((x) => x !== m))
  }

  const removeAll = () => {
    mismatches.forEach(deleteVersionMismatch)
    onChange([])
  }

  // A plain div (not <dialog>) has no built-in Escape-to-close behaviour, so
  // this is only here to make the "can't be dismissed" guarantee explicit
  // and future-proof — swallow Escape outright rather than silently relying
  // on nothing else happening to be listening for it.
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <div
      className="blocking-overlay version-mismatch"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="version-mismatch-title"
      onKeyDown={handleKeyDown}
    >
      <div className="paper version-mismatch__card">
        <h2
          id="version-mismatch-title"
          className="version-mismatch__title"
          tabIndex={-1}
          ref={titleRef}
        >
          Outdated saved data
        </h2>
        <p className="version-mismatch__body">
          {mismatches.length === 1
            ? 'One item saved in your browser is'
            : `${mismatches.length} items saved in your browser are`}{' '}
          from an older version of Concertina Hero and can't be read safely.
          Delete {mismatches.length === 1 ? 'it' : 'them'} to continue — there's
          no way to keep outdated data around.
        </p>

        <ul
          className="list-rows version-mismatch__list"
          aria-label="Outdated saved items"
        >
          {mismatches.map((m, i) => (
            <ListRow
              key={m.key + m.recordId + i}
              name={m.label}
              noun={m.kind}
              tags={[{ label: m.kind }]}
              onDelete={() => remove(m)}
            />
          ))}
        </ul>

        <div className="version-mismatch__footer">
          <button className="btn btn--primary" onClick={removeAll}>
            Delete all
          </button>
        </div>
      </div>
    </div>
  )
}
