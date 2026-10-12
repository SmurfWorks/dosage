import type { Settings } from './calculator'

/** The dose settings in use from `from` until the next change. */
export type SettingsChange = Settings & { from: string }

/** Settings already in place before changes were recorded are dated here, so every log entry maps to one. */
export const EARLIEST = '1970-01-01T00:00:00.000Z'

/** A change made this soon after the last one replaces it, when nothing was logged in between. */
export const SETTLE_MS = 5 * 60 * 1000

const FIELDS = ['rangeLow', 'rangeHigh', 'targetMmol', 'mmolRisePer10g', 'mmolFallPerUnit', 'insulinStep'] as const

function sameSettings(a: Settings, b: Settings): boolean {
  return FIELDS.every((field) => a[field] === b[field])
}

function settingsOf(change: SettingsChange): Settings {
  return Object.fromEntries(FIELDS.map((field) => [field, change[field]])) as Settings
}

/**
 * The history after `settings` are saved at `now`. Nothing changes when the settings are the same as the latest.
 * The first record is dated {@link EARLIEST}. Stepping a value up and down a few times in a row keeps only where it
 * settled, unless a log entry was made in between, so each entry still maps to the settings in use when it was made.
 */
export function recordSettings(
  history: SettingsChange[],
  settings: Settings,
  now: Date,
  logTimes: string[] = [],
): SettingsChange[] {
  const values = settingsOf({ ...settings, from: '' })
  if (history.length === 0) return [{ ...values, from: EARLIEST }]
  const latest = history[history.length - 1]
  if (sameSettings(latest, values)) return history
  const latestMs = Date.parse(latest.from)
  const settling =
    latest.from !== EARLIEST &&
    now.getTime() - latestMs < SETTLE_MS &&
    !logTimes.some((at) => Date.parse(at) >= latestMs)
  if (!settling) return [...history, { ...values, from: now.toISOString() }]
  const earlier = history.slice(0, -1)
  const before = earlier[earlier.length - 1]
  // Back where it was before this burst of changes, so the burst leaves no record.
  if (before && sameSettings(before, values)) return earlier
  return [...earlier, { ...values, from: now.toISOString() }]
}

/** The settings in use at `at`, or null when the history is empty. */
export function settingsAt(history: SettingsChange[], at: string): SettingsChange | null {
  const time = Date.parse(at)
  let found: SettingsChange | null = null
  for (const change of history) {
    if (Date.parse(change.from) <= time) found = change
  }
  return found ?? history[0] ?? null
}

/** Reads a stored history, dropping anything unreadable and keeping the changes in time order. */
export function parseSettingsHistory(value: unknown): SettingsChange[] {
  if (!Array.isArray(value)) return []
  const changes: SettingsChange[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const stored = item as Record<string, unknown>
    if (typeof stored.from !== 'string' || !Number.isFinite(Date.parse(stored.from))) continue
    if (!FIELDS.every((field) => typeof stored[field] === 'number' && Number.isFinite(stored[field]))) continue
    changes.push({ ...(settingsOf(stored as unknown as SettingsChange)), from: new Date(stored.from).toISOString() })
  }
  return changes.sort((a, b) => Date.parse(a.from) - Date.parse(b.from))
}
