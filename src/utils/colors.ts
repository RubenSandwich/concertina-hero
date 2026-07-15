// Color helpers. Currently just the accessible random accent used for a song's
// card colour, plus the WCAG-contrast math it needs.

// WCAG relative luminance of an [r, g, b] colour.
function luminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const PAPER_LUM = luminance(255, 251, 239) // the --paper card background

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

const toHex = (rgb: [number, number, number]) =>
  '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')

// A vivid but accessible random accent: keeps at least 3:1 contrast against the
// paper card so the coloured edge/ring stays clearly visible.
export function randomAccentColor(): string {
  const hue = Math.floor(Math.random() * 360)
  const sat = 0.6 + Math.random() * 0.25
  // Start bright and darken until the colour clears the 3:1 contrast bar.
  let rgb: [number, number, number] = [0, 0, 0]
  for (let l = 0.55; l >= 0.2; l -= 0.04) {
    rgb = hslToRgb(hue, sat, l)
    if ((PAPER_LUM + 0.05) / (luminance(...rgb) + 0.05) >= 3) break
  }
  return toHex(rgb)
}
