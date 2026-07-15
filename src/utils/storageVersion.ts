// Generic support for a hardcoded "schema version" stamped onto every user
// record persisted in localStorage. Presets (presets.ts) and user songs
// (songLibrary.ts) each keep their own version constant, starting at '1', and
// bump theirs independently whenever *their* stored shape changes in a way an
// old record can't just fall back to sane defaults for — the two kinds of
// record aren't related, so there's no reason a change to one should ever
// force-bump the other. findVersionMismatches() lets the startup modal
// (ui/modals/VersionMismatch) find and offer to delete anything stamped with
// a different (or missing) version, instead of the app trying to load data it
// doesn't understand.

// One stored record whose `version` doesn't match the caller's current
// version, found by scanning a raw localStorage array. `key` + `recordId` are
// enough to delete just that one entry (see deleteVersionMismatch);
// `kind`/`label` are for display in the mismatch modal.
export interface VersionMismatch {
  key: string
  recordId: string
  kind: string
  label: string
  version: string
}

// A record's identity for matching across find/delete calls: its own `id`
// field when it has one (every Preset/SongDef does once saved), falling back
// to its full JSON so even a malformed record with no id can be targeted.
function identify(raw: unknown): string {
  const id =
    raw &&
    typeof raw === 'object' &&
    typeof (raw as Record<string, unknown>).id === 'string'
      ? ((raw as Record<string, unknown>).id as string)
      : ''
  return id || JSON.stringify(raw)
}

// Scan the JSON array stored under `key` (if any) for entries whose `version`
// field isn't `currentVersion` — including entries with no version at all,
// which predate this check entirely. Corrupt/non-array storage is left alone;
// the store's own reader already tolerates that.
export function findVersionMismatches(
  key: string,
  kind: string,
  currentVersion: string,
  labelOf: (raw: unknown) => string,
): VersionMismatch[] {
  let arr: unknown
  try {
    arr = JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const mismatches: VersionMismatch[] = []
  for (const raw of arr) {
    const version =
      raw &&
      typeof raw === 'object' &&
      typeof (raw as Record<string, unknown>).version === 'string'
        ? ((raw as Record<string, unknown>).version as string)
        : ''
    if (version !== currentVersion) {
      mismatches.push({
        key,
        recordId: identify(raw),
        kind,
        label: labelOf(raw),
        version: version || 'unknown',
      })
    }
  }
  return mismatches
}

// Remove one previously-found mismatch from its localStorage array, matching
// by the same identity findVersionMismatches used.
export function deleteVersionMismatch(m: VersionMismatch): void {
  try {
    const arr = JSON.parse(localStorage.getItem(m.key) || '[]')
    if (!Array.isArray(arr)) return
    const next = arr.filter((raw) => identify(raw) !== m.recordId)
    localStorage.setItem(m.key, JSON.stringify(next))
  } catch {
    /* storage unavailable — ignore */
  }
}
