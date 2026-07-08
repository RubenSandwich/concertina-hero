// Small shared helpers used across components.

// A friendly message for a failed JSON file read.
export const jsonErrorText = (err: unknown): string =>
  err instanceof SyntaxError
    ? "That file isn't valid JSON."
    : err instanceof Error
      ? err.message
      : String(err)

// Turn a name into a safe-ish download filename slug (falls back to `fallback`).
export const slug = (name: string, fallback = 'file'): string =>
  (name || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback

// Trigger a browser download of `data` as a pretty-printed JSON file.
export function downloadJSON(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
