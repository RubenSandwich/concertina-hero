import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import './SegmentedControl.css'

// A segmented control: a connected row of options where exactly one is active.
// It's a single-select control, so it's exposed as a radiogroup — arrow keys
// (and Home/End) move the selection, and the group is a single tab stop.
//
// Props:
//   options  — [{ value, label, note? }]
//   value    — the currently selected value
//   onChange — called with the new value
//   label    — accessible name for the group
interface Option<T> {
  value: T
  label: string
  note?: string
}

interface SegmentedControlProps<T> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}

export default function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null)

  const focusOption = (index: number) => {
    ref.current?.querySelectorAll<HTMLElement>('.segmented__option')[index]?.focus()
  }

  const select = (index: number) => {
    onChange(options[index].value)
    focusOption(index)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const index = options.findIndex((o) => o.value === value)
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        select((index + 1) % options.length)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        select((index - 1 + options.length) % options.length)
        break
      case 'Home':
        e.preventDefault()
        select(0)
        break
      case 'End':
        e.preventDefault()
        select(options.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div className="segmented" role="radiogroup" aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={'segmented__option' + (selected ? ' is-selected' : '')}
            onClick={() => onChange(opt.value)}
          >
            <strong>{opt.label}</strong>
            {opt.note && <span>{opt.note}</span>}
          </button>
        )
      })}
    </div>
  )
}
