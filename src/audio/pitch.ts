// Microphone pitch detection. Two detectors share one mic:
//
//   detectNote()  - a single fundamental via (range-limited) autocorrelation,
//                   used by the tuning modal.
//   detectChord() - every note currently sounding, so a chord can be held.
//
// Both map what they hear onto the concertina's button notes.

import { LANE_NOTES, DIRECTIONS, NOTE_CANDIDATES, type Direction } from '../data/instrument.ts'
import { getAudioContext, resumeAudio } from './sound.ts'

let stream: MediaStream | null = null
let source: MediaStreamAudioSourceNode | null = null
let analyser: AnalyserNode | null = null
let buf: Float32Array<ArrayBuffer> | null = null

// The mic capture window. 4096 samples is ~93ms at 44.1kHz, giving ~10.8Hz bins
// (a ~43Hz Hann main lobe) — enough to resolve the closest two notes a single
// bellows direction can sound together (pull D 293.66 / F 349.23, 55.6Hz apart).
export const MIC_FFT_SIZE = 4096

// Autocorrelation is O(size x lag), so it only ever looks at the most recent
// samples. This keeps single-note latency exactly where it was.
const MONO_WINDOW = 2048

// The closest button note to a frequency, with the signed cents offset.
interface ClosestNote {
  lane: number
  type: Direction
  name: string
  cents: number
}

// A confident pitch reading. `matched` says whether it landed close enough to a
// button note; when it didn't, lane is -1 and type is null.
export type Detection =
  | { matched: true; freq: number; lane: number; type: Direction; name: string; cents: number }
  | { matched: false; freq: number; lane: -1; type: null; name: string | null; cents: number }

// How far off a played note may be (in cents) and still count as a button note.
export const TOLERANCE_CENTS = 60

// User-facing message when mic access fails or is denied.
export const MIC_ERROR = 'Could not access the microphone. Check browser permissions.'

// Ask for the mic and wire it into an analyser on the shared audio graph. Must
// be called from a user gesture (e.g. a button click).
export async function startMic(): Promise<boolean> {
  if (analyser) return true
  const ctx = getAudioContext()
  if (!ctx || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('mic-unsupported')
  }
  resumeAudio()
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  })
  source = ctx.createMediaStreamSource(stream)
  analyser = ctx.createAnalyser()
  analyser.fftSize = MIC_FFT_SIZE
  buf = new Float32Array(analyser.fftSize)
  source.connect(analyser) // note: NOT connected to destination — no playback
  return true
}

export function stopMic(): void {
  if (source) source.disconnect()
  if (stream) stream.getTracks().forEach((t) => t.stop())
  stream = source = analyser = buf = null
}

// Range-limited autocorrelation. Returns the detected frequency (Hz) or -1.
export function autoCorrelate(b: Float32Array, sampleRate: number): number {
  const SIZE = b.length
  let sumSq = 0
  for (let i = 0; i < SIZE; i++) sumSq += b[i] * b[i]
  const rms = Math.sqrt(sumSq / SIZE)
  if (rms < 0.01) return -1 // too quiet to be a note

  // Only search lags for the notes we care about (~150–1200 Hz).
  const minLag = Math.max(2, Math.floor(sampleRate / 1200))
  const maxLag = Math.min(SIZE - 1, Math.floor(sampleRate / 150))
  const corr = new Float32Array(maxLag + 1)
  let bestLag = -1
  let bestCorr = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i < SIZE - lag; i++) sum += b[i] * b[i + lag]
    const c = sum / (SIZE - lag)
    corr[lag] = c
    if (c > bestCorr) {
      bestCorr = c
      bestLag = lag
    }
  }
  if (bestLag <= 0) return -1
  if (bestCorr / (sumSq / SIZE) < 0.5) return -1 // not tonal enough

  // Prefer the shortest-lag strong peak (the fundamental) to dodge octave-down
  // errors, then refine it with parabolic interpolation.
  let chosen = bestLag
  const thr = 0.9 * bestCorr
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= thr && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) {
      chosen = lag
      break
    }
  }
  const a = corr[chosen - 1]
  const b0 = corr[chosen]
  const c0 = corr[chosen + 1]
  const denom = a - 2 * b0 + c0
  const refined = denom ? chosen + (0.5 * (a - c0)) / denom : chosen
  return sampleRate / refined
}

// Find the closest button note to a frequency. Returns the note plus the signed
// cents offset (positive = the played note is sharp), or null if there are no
// notes. Does not apply the tolerance — callers decide with `cents`.
export function closestNote(freq: number): ClosestNote | null {
  let best: { lane: number; type: Direction } | null = null
  let bestCents = Infinity
  for (let lane = 0; lane < LANE_NOTES.length; lane++) {
    for (const type of DIRECTIONS) {
      const cents = 1200 * Math.log2(freq / LANE_NOTES[lane][type].freq)
      if (Math.abs(cents) < Math.abs(bestCents)) {
        bestCents = cents
        best = { lane, type }
      }
    }
  }
  if (!best) return null
  return {
    lane: best.lane,
    type: best.type,
    name: LANE_NOTES[best.lane][best.type].name,
    cents: bestCents,
  }
}

// Analyse a raw time-domain buffer. Returns null when there's no confident
// pitch, otherwise a Detection where lane is -1 (and matched false) when the
// pitch isn't close enough to a button note. This is the whole detection
// pipeline, factored out so it can be unit-tested.
export function analyzeBuffer(b: Float32Array, sampleRate: number): Detection | null {
  const freq = autoCorrelate(b, sampleRate)
  if (freq <= 0) return null
  const c = closestNote(freq)
  if (!c) return { matched: false, freq, lane: -1, type: null, name: null, cents: 0 }
  if (Math.abs(c.cents) <= TOLERANCE_CENTS) {
    return { matched: true, freq, lane: c.lane, type: c.type, name: c.name, cents: c.cents }
  }
  return { matched: false, freq, lane: -1, type: null, name: c.name, cents: c.cents }
}

// Sample the mic once and analyse it. Returns null if the mic isn't running or
// there's no confident pitch. Only the most recent MONO_WINDOW samples are used.
export function detectNote(): Detection | null {
  if (!analyser || !buf) return null
  const ctx = getAudioContext()
  if (!ctx) return null
  analyser.getFloatTimeDomainData(buf)
  const window = buf.length > MONO_WINDOW ? buf.subarray(buf.length - MONO_WINDOW) : buf
  return analyzeBuffer(window, ctx.sampleRate)
}

// ---------------------------------------------------------------------------
// Multi-pitch (chord) detection
//
// General polyphonic transcription is hard because the fundamentals are unknown
// and low notes' harmonics sit on top of high notes' fundamentals. We sidestep
// most of it: the concertina can only sound 14 known frequencies, and a chord is
// played with the bellows moving one way, so at most 7 are live at once. So
// rather than estimate fundamentals, we *score the ones we already know* against
// the spectrum, take the strongest, cancel the harmonics it explains, and repeat.
// That is multi-F0 estimation against a fixed dictionary.
// ---------------------------------------------------------------------------

const HARMONICS = 5 // harmonics folded into a candidate's salience
const SEARCH_BINS = 2 // +/- bins scanned around a harmonic, to absorb detuning
const CANCEL_BINS = 1 // +/- bins an accepted note is allowed to cancel
const MAX_CHORD_NOTES = 3
const RMS_MIN = 0.01 // below this the buffer is silence

// What a candidate's level is measured against.
//
// Not the loudest bin: a speaker-and-mic path attenuates low fundamentals, so the
// loudest bin is often some note's *harmonic*. Measured on a laptop, G's 2nd
// harmonic came back 2.3x louder than G itself, which squeezed the real notes of a
// chord down to a ~2x margin and made them drop out between frames.
//
// So the first (lowest) note is admitted against the loudest bin, and every note
// after it is measured against *that note's fundamental* — the notes of a chord
// are within an order of magnitude of each other, whatever the channel does to
// the absolute levels.
const FIRST_FUND_MIN = 0.08 // the first note, as a fraction of the loudest bin
const NEXT_FUND_MIN = 0.1 // later notes, as a fraction of the first note's fundamental
const SAL_MIN = 0.18 // harmonic salience, against the same reference

// One note heard sounding. `salience` is its harmonic-sum score, for debugging.
export interface ChordNote {
  lane: number
  type: Direction
  name: string
  freq: number
  salience: number
}

// In-place iterative radix-2 Cooley-Tukey FFT. Length must be a power of two.
// Float64 throughout: the twiddle recurrence drifts badly in Float32.
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    const half = len >> 1
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < half; k++) {
        const ur = re[i + k]
        const ui = im[i + k]
        const xr = re[i + k + half]
        const xi = im[i + k + half]
        const vr = xr * cr - xi * ci
        const vi = xr * ci + xi * cr
        re[i + k] = ur + vr
        im[i + k] = ui + vi
        re[i + k + half] = ur - vr
        im[i + k + half] = ui - vi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

// Hann-windowed magnitude spectrum of a time-domain buffer. Uses the largest
// power-of-two prefix of the buffer. `binHz` is the width of one bin.
export function spectrum(
  b: Float32Array,
  sampleRate: number,
): {
  mag: Float64Array
  binHz: number
} {
  let n = 1
  while (n * 2 <= b.length) n *= 2
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    re[i] = b[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)))
  }
  fft(re, im)
  const mag = new Float64Array(n >> 1)
  for (let k = 0; k < mag.length; k++) mag[k] = Math.hypot(re[k], im[k])
  return { mag, binHz: sampleRate / n }
}

// The strongest bin within +/- span of `freq` — a peak that may be a little
// detuned still counts.
function peakNear(mag: Float64Array, binHz: number, freq: number, span: number): number {
  const centre = Math.round(freq / binHz)
  let best = 0
  for (let k = centre - span; k <= centre + span; k++) {
    if (k >= 0 && k < mag.length && mag[k] > best) best = mag[k]
  }
  return best
}

// How much energy at a candidate's fundamental is still unexplained.
//
// Two arrays, two questions. `orig` (never mutated) answers "is there a real
// peak here?" — a fundamental must be a local maximum of the *observed* spectrum,
// which rejects the skirt of a louder neighbour's lobe. `work` answers "is any of
// it left over?" once earlier notes have subtracted what they account for.
//
// Asking both of `work` is what produces phantoms: cancelling a band flattens it,
// and the bin at its edge is then trivially a local maximum.
function fundamentalResidual(
  orig: Float64Array,
  work: Float64Array,
  binHz: number,
  freq: number,
  span: number,
): number {
  const centre = Math.round(freq / binHz)
  let bestBin = -1
  let best = 0
  for (let k = centre - span; k <= centre + span; k++) {
    if (k >= 0 && k < orig.length && orig[k] > best) {
      best = orig[k]
      bestBin = k
    }
  }
  if (bestBin <= 0 || bestBin >= orig.length - 1) return 0
  if (orig[bestBin] < orig[bestBin - 1] || orig[bestBin] < orig[bestBin + 1]) return 0
  return work[bestBin]
}

// Damp what an accepted note explains, so it can't inflate another candidate's
// salience. The amount is only a model (a reed's h-th harmonic carries roughly
// amp/h) and a real speaker-to-mic path violates it badly — low fundamentals are
// attenuated, so overtones arrive far louder than amp/h. Eligibility therefore
// never rests on this subtraction; see `overtoneLanes`.
//
// The span is deliberately narrower than SEARCH_BINS: flattening a neighbour's
// lobe skirt would turn the bin beside it into a phantom local maximum.
function subtractHarmonics(mag: Float64Array, binHz: number, freq: number, amp: number): void {
  for (let h = 1; h <= HARMONICS; h++) {
    const centre = Math.round((freq * h) / binHz)
    const explained = amp / h
    for (let k = centre - CANCEL_BINS; k <= centre + CANCEL_BINS; k++) {
      if (k >= 0 && k < mag.length) mag[k] = Math.max(0, mag[k] - explained)
    }
  }
}

// The lanes whose fundamental lands on an overtone of an accepted note.
//
// Such a candidate has no independent evidence: nothing in the spectrum can tell
// "a real note here" from "the note below, with a loud overtone" — the classic
// octave ambiguity. Rather than subtract a guessed amount and hope the remainder
// is meaningful, rule it out. Measured against a real mic, guessing produced a
// phantom G6 under every C (its 3rd harmonic) and a phantom A7 under every A.
//
// The cost is that a true octave chord is heard as its lower note alone. No chart
// uses one, and none of the concertina's other intervals are integer ratios, so
// no real chord note is ever ruled out this way.
function overtoneLanes(binHz: number, freq: number, type: Direction): Set<number> {
  const ruled = new Set<number>()
  for (const candidate of NOTE_CANDIDATES[type]) {
    const bin = Math.round(candidate.freq / binHz)
    for (let h = 2; h <= HARMONICS; h++) {
      if (Math.abs(bin - Math.round((freq * h) / binHz)) <= CANCEL_BINS) ruled.add(candidate.lane)
    }
  }
  return ruled
}

// How strongly the spectrum supports a note at `freq`: its harmonics summed with
// a 1/h weight, so the fundamental dominates but overtones corroborate.
function salience(mag: Float64Array, binHz: number, freq: number): number {
  let sum = 0
  for (let h = 1; h <= HARMONICS; h++) {
    if ((freq * h) / binHz >= mag.length - 1) break
    sum += peakNear(mag, binHz, freq * h, SEARCH_BINS) / h
  }
  return sum
}

// Greedily pull notes out of one direction's dictionary. Each accepted note damps
// the harmonics it explains and rules out the candidates that sit on them.
function pickNotes(
  mag: Float64Array,
  binHz: number,
  type: Direction,
  peak: number,
  maxNotes: number,
): ChordNote[] {
  const work = Float64Array.from(mag)
  const picked: ChordNote[] = []
  const ruledOut = new Set<number>()
  let ref = peak // becomes the first accepted note's fundamental
  while (picked.length < maxNotes) {
    const fundGate = (picked.length ? NEXT_FUND_MIN : FIRST_FUND_MIN) * ref
    const salGate = SAL_MIN * ref
    let chosen: ChordNote | null = null
    let chosenFund = 0
    // NOTE_CANDIDATES is ordered by frequency, and a note's overtones only ever
    // lie *above* it, so the lowest surviving candidate cannot be anyone's
    // overtone. Taking it first — rather than whichever peak is loudest — makes
    // the result immune to a channel that attenuates fundamentals, as a speaker
    // and a mic do.
    for (const { lane, name, freq } of NOTE_CANDIDATES[type]) {
      if (ruledOut.has(lane)) continue
      // Without unexplained energy at a real peak of its own, a "note" is just
      // someone else's overtones or the skirt of their lobe.
      const fund = fundamentalResidual(mag, work, binHz, freq, SEARCH_BINS)
      if (fund < fundGate) continue
      const s = salience(work, binHz, freq)
      if (s < salGate) continue
      chosen = { lane, type, name, freq, salience: s }
      chosenFund = fund
      break
    }
    if (!chosen) break
    if (!picked.length) ref = chosenFund
    picked.push(chosen)
    ruledOut.add(chosen.lane)
    for (const lane of overtoneLanes(binHz, chosen.freq, type)) ruledOut.add(lane)
    subtractHarmonics(work, binHz, chosen.freq, chosenFund)
  }
  return picked
}

// Every button note currently sounding, lowest lane first. Empty when the buffer
// is silent or nothing matches. This is the whole chord pipeline, factored out
// so it can be unit-tested on synthesised audio.
export function analyzeChord(
  b: Float32Array,
  sampleRate: number,
  { maxNotes = MAX_CHORD_NOTES }: { maxNotes?: number } = {},
): ChordNote[] {
  let sumSq = 0
  for (let i = 0; i < b.length; i++) sumSq += b[i] * b[i]
  if (Math.sqrt(sumSq / b.length) < RMS_MIN) return []

  const { mag, binHz } = spectrum(b, sampleRate)
  let peak = 0
  for (const m of mag) if (m > peak) peak = m
  if (peak <= 0) return []

  // The bellows move one way at a time, so a chord is all push or all pull.
  // Score each dictionary separately and keep whichever explains more of the
  // spectrum — this also doubles the spacing between rival candidates.
  let best: ChordNote[] = []
  let bestScore = 0
  for (const type of DIRECTIONS) {
    const picked = pickNotes(mag, binHz, type, peak, maxNotes)
    const score = picked.reduce((s, n) => s + n.salience, 0)
    if (score > bestScore) {
      bestScore = score
      best = picked
    }
  }
  return best.sort((a, b) => a.lane - b.lane)
}

// How much the window straddles a change in the sound: the difference in level
// between its first and second half, 0 (steady) to 1 (silence beside a note).
//
// A window caught on a note boundary holds the old note's tail, the new note's
// attack, and the broadband splatter of the step between them — `analyzeChord`
// reads notes out of that mess which were never played. Those readings are what
// this catches. Measured through a real mic: correct readings sat at a median of
// 0.017, every phantom at 0.418 or above.
export function transience(b: Float32Array): number {
  const half = b.length >> 1
  if (half === 0) return 0
  let first = 0
  let second = 0
  for (let i = 0; i < half; i++) first += b[i] * b[i]
  for (let i = half; i < b.length; i++) second += b[i] * b[i]
  first = Math.sqrt(first / half)
  second = Math.sqrt(second / (b.length - half))
  const loudest = Math.max(first, second)
  return loudest > 0 ? Math.abs(second - first) / loudest : 0
}

// Above this a window is mid-transition and nothing new should be believed.
export const TRANSIENT_MAX = 0.3

// One frame's hearing. `stable` is false when the window spans a note boundary,
// which means the notes may include phantoms — sustain what you hold, but do not
// start anything new on it.
export interface ChordReading {
  notes: ChordNote[]
  stable: boolean
}

// Sample the mic once and return every note sounding. Empty if the mic is off.
export function detectChord(): ChordReading {
  if (!analyser || !buf) return { notes: [], stable: true }
  const ctx = getAudioContext()
  if (!ctx) return { notes: [], stable: true }
  analyser.getFloatTimeDomainData(buf)
  return {
    notes: analyzeChord(buf, ctx.sampleRate),
    stable: transience(buf) <= TRANSIENT_MAX,
  }
}
