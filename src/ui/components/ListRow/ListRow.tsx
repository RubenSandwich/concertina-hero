import type { ReactNode } from 'react'
import './ListRow.css'

// A trailing status pill (e.g. "Built-in").
export interface RowTag {
  label: string
}

// A "paper card" row shared by the song library and the preset picker: a
// coloured left spine, a bold name (+ optional secondary line), trailing status
// tags, and optional edit/delete actions. When `onSelect` is given the main area
// becomes a radio-style select button and `selected` shows the active state.
interface ListRowProps {
  name: string
  color?: string // left-edge spine colour; falls back to a neutral tone
  meta?: ReactNode // secondary line under the name (e.g. difficulty + BPM)
  tags?: RowTag[]
  selected?: boolean
  onSelect?: () => void
  noun?: string // used in action tooltips: `Edit ${noun}` / `Delete ${noun}`
  onEdit?: () => void
  onDelete?: () => void
}

export default function ListRow({
  name,
  color,
  meta,
  tags,
  selected = false,
  onSelect,
  noun = 'item',
  onEdit,
  onDelete,
}: ListRowProps) {
  const body = (
    <span className="list-row__body">
      <span className="list-row__name">{name}</span>
      {meta && <span className="list-row__meta">{meta}</span>}
    </span>
  )

  const hasTrailing =
    Boolean(tags?.length) || Boolean(onEdit) || Boolean(onDelete)

  return (
    <li
      className={
        'list-row' +
        (onSelect ? ' is-selectable' : '') +
        (selected ? ' is-selected' : '')
      }
      style={color ? { '--card': color } : undefined}
    >
      {onSelect ? (
        <button
          type="button"
          className="list-row__main"
          onClick={onSelect}
          aria-pressed={selected}
        >
          <span className="list-row__check" aria-hidden="true">
            ✓
          </span>
          {body}
        </button>
      ) : (
        <div className="list-row__main">{body}</div>
      )}

      {hasTrailing && (
        <div className="list-row__trailing">
          {tags?.map((t) => (
            <span key={t.label} className="list-row__tag">
              {t.label}
            </span>
          ))}
          {(onEdit || onDelete) && (
            <div className="list-row__actions">
              {onEdit && (
                <button
                  type="button"
                  className="list-row__icon"
                  onClick={onEdit}
                  title={`Edit ${noun}`}
                  aria-label={`Edit ${name}`}
                >
                  ✎
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  className="list-row__icon list-row__icon--danger"
                  onClick={onDelete}
                  title={`Delete ${noun}`}
                  aria-label={`Delete ${name}`}
                >
                  🗑
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
