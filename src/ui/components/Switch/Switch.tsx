import './Switch.css'

// An OFF/ON toggle switch. Uses the ARIA `switch` role (a checkbox that is
// specifically "on"/"off"), driven by `aria-checked`. It's a native <button>,
// so Space/Enter toggle it for free. Give it an accessible name via
// `labelledBy` (id of the visible label) or `label`, and optionally point
// `describedBy` at a description element.
interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  labelledBy?: string
  describedBy?: string
  label?: string
}

export default function Switch({
  checked,
  onChange,
  disabled = false,
  labelledBy,
  describedBy,
  label,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-label={labelledBy ? undefined : label}
      disabled={disabled}
      className={'segmented-shell switch' + (checked ? ' is-on' : '')}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__option switch__option--off" aria-hidden="true">
        OFF
      </span>
      <span className="switch__option switch__option--on" aria-hidden="true">
        ON
      </span>
    </button>
  )
}
