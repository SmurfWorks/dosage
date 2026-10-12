import { browserTimeZone } from './log'

/** The list starts here, then follows offsets from GMT and wraps back around. */
export const FIRST_TIMEZONE = 'Pacific/Auckland'

export type TimezoneChoice = {
  id: string
  offsetMinutes: number
  label: string
}

type ZoneOffset = { id: string; offsetMinutes: number }

/** Minutes ahead of GMT for `timeZone` at `now`. New Zealand daylight time is 780. */
export function timezoneOffsetMinutes(timeZone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now)
  const value: Record<string, number> = {}
  for (const part of parts) {
    if (part.type === 'literal') continue
    value[part.type] = Number(part.value)
  }
  // Some engines report midnight as hour 24 on the previous date.
  if (value.hour === 24) value.hour = 0
  const asUtc = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second)
  return Math.round((asUtc - now.getTime()) / 60_000)
}

/** `GMT+13:00`, `GMT-07:00`, `GMT+00:00`. */
export function formatGmtOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)
  const hours = Math.floor(absolute / 60)
  const minutes = absolute % 60
  return `GMT${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Zones in offset order, starting at New Zealand. Zones ahead of New Zealand
 * come after the rest, still in offset order.
 */
export function orderTimeZones<T extends ZoneOffset>(zones: T[], first = FIRST_TIMEZONE): T[] {
  const sorted = [...zones].sort(
    (a, b) => b.offsetMinutes - a.offsetMinutes || a.id.localeCompare(b.id),
  )
  const start = sorted.findIndex((zone) => zone.id === first)
  if (start <= 0) return sorted
  return [...sorted.slice(start), ...sorted.slice(0, start)]
}

export function timezoneChoices(zones: string[], now: Date): TimezoneChoice[] {
  return orderTimeZones(
    zones.map((id) => ({ id, offsetMinutes: timezoneOffsetMinutes(id, now) })),
  ).map((zone) => ({
    ...zone,
    label: `${zone.id} (${formatGmtOffset(zone.offsetMinutes)})`,
  }))
}

export function supportedTimeZones(): string[] {
  try {
    const zones = Intl.supportedValuesOf?.('timeZone')
    if (zones && zones.length > 0) return [...zones]
  } catch {
    // Older browsers have no list. The phone's own timezone is still a valid choice.
  }
  return [browserTimeZone()]
}

/** A saved choice, or the timezone this browser is set to. */
export function chosenTimezone(stored: string | null, browser: string, zones: string[]): string {
  if (stored && zones.includes(stored)) return stored
  if (zones.includes(browser)) return browser
  if (zones.includes(FIRST_TIMEZONE)) return FIRST_TIMEZONE
  if (zones.includes('UTC')) return 'UTC'
  return zones[0] ?? 'UTC'
}
