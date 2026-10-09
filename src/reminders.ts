import type { LogEntry } from './log'

/** Bolus insulin is typically active for up to 4 hours. */
export const DEFAULT_EXPIRY_HOURS = 4
export const EXPIRY_HOURS_MIN = 1
export const EXPIRY_HOURS_MAX = 12
/** A reminder missed while the app was closed still arrives if the app opens within this long. */
export const REMINDER_GRACE_MS = 30 * 60 * 1000
/** Timed reminders stay quiet this long after an expiry reminder. */
export const QUIET_AFTER_EXPIRY_MS = 60 * 60 * 1000

export type ReminderSettings = {
  /** Let target glucose levels expire after `expiryHours`. */
  expiryEnabled: boolean
  expiryHours: number
  /** Send notifications at all. */
  notify: boolean
  /** One reminder when the latest entry reaches the expiry age. */
  remindOnExpiry: boolean
  /** "HH:MM" times to remind at when there is no active target. */
  times: string[]
}

/** What has already been sent, so nothing is sent twice. */
export type ReminderLog = {
  /** The entry whose expiry was last dealt with, whether or not a reminder was sent for it. */
  expiryEntryId: string | null
  /** When an expiry reminder was last sent, in milliseconds. */
  expirySentAt: number | null
  /** "YYYY-MM-DD HH:MM" for each timed reminder already dealt with. */
  timesHandled: string[]
}

export type Reminder = { kind: 'expiry' | 'time'; title: string; body: string; tag: string }

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  expiryEnabled: false,
  expiryHours: DEFAULT_EXPIRY_HOURS,
  notify: false,
  remindOnExpiry: true,
  times: [],
}

export const EMPTY_REMINDER_LOG: ReminderLog = { expiryEntryId: null, expirySentAt: null, timesHandled: [] }

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

/** How long a target stays active, and so how far back the recent bolus warning looks. */
export function activeHours(settings: ReminderSettings): number {
  return settings.expiryEnabled ? settings.expiryHours : DEFAULT_EXPIRY_HOURS
}

export function latestEntry(entries: LogEntry[], now: Date): LogEntry | null {
  let latest: LogEntry | null = null
  let latestMs = -Infinity
  for (const entry of entries) {
    const at = Date.parse(entry.at)
    if (!Number.isFinite(at) || at > now.getTime() + 60_000) continue
    if (at > latestMs) {
      latest = entry
      latestMs = at
    }
  }
  return latest
}

/** Whether a log entry made in the `hours` before `at` keeps a target active then. */
export function hasActiveTarget(entries: LogEntry[], at: Date, hours: number): boolean {
  const since = at.getTime() - hours * 60 * 60 * 1000
  return entries.some((entry) => {
    const time = Date.parse(entry.at)
    return Number.isFinite(time) && time > since && time <= at.getTime()
  })
}

export function normaliseTimes(times: string[]): string[] {
  return [...new Set(times.filter((time) => TIME.test(time)))].sort()
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function atLocalTime(day: Date, time: string): Date {
  const [hour, minute] = time.split(':').map(Number)
  const at = new Date(day)
  at.setHours(hour, minute, 0, 0)
  return at
}

/**
 * The reminders due at `now`, and the updated record of what has been dealt with. A reminder that is due but no
 * longer wanted, such as a timed one while a target is active, is marked as dealt with so it never arrives late.
 */
export function dueReminders(
  entries: LogEntry[],
  settings: ReminderSettings,
  sent: ReminderLog,
  now: Date,
  describeTime: (entry: LogEntry) => string,
): { reminders: Reminder[]; sent: ReminderLog } {
  if (!settings.expiryEnabled || !settings.notify) return { reminders: [], sent }
  const reminders: Reminder[] = []
  const next: ReminderLog = { ...sent, timesHandled: [...sent.timesHandled] }
  const hours = settings.expiryHours
  const hourMs = 60 * 60 * 1000
  const nowMs = now.getTime()

  const latest = latestEntry(entries, now)
  if (latest && latest.id !== next.expiryEntryId) {
    const expiresAt = Date.parse(latest.at) + hours * hourMs
    if (nowMs >= expiresAt) {
      next.expiryEntryId = latest.id
      if (settings.remindOnExpiry && nowMs - expiresAt <= REMINDER_GRACE_MS) {
        const hoursText = hours === 1 ? '1 hour' : `${hours} hours`
        const since = `It's been ${hoursText} since your ${describeTime(latest)} entry`
        reminders.push({
          kind: 'expiry',
          title: 'Your target has expired',
          body: latest.insulinUnits > 0 ? `${since}, so that bolus could be wearing off.` : `${since}.`,
          tag: 'target-expiry',
        })
        next.expirySentAt = nowMs
      }
    }
  }

  const today = localDateKey(now)
  for (const time of normaliseTimes(settings.times)) {
    const key = `${today} ${time}`
    if (next.timesHandled.includes(key)) continue
    const at = atLocalTime(now, time)
    if (nowMs < at.getTime()) continue
    next.timesHandled.push(key)
    if (nowMs - at.getTime() > REMINDER_GRACE_MS) continue
    // Judged when the reminder would arrive, so an entry made since its time still counts.
    if (hasActiveTarget(entries, now, hours)) continue
    if (next.expirySentAt !== null && nowMs - next.expirySentAt < QUIET_AFTER_EXPIRY_MS) continue
    reminders.push({
      kind: 'time',
      title: 'No active target',
      body: "You haven't logged a target in the last " +
        (hours === 1 ? 'hour' : `${hours} hours`) +
        '. Open Dosage Helper to check in.',
      tag: `reminder-${time}`,
    })
  }

  // Only today's timed reminders matter; older keys are dropped so the record stays small.
  next.timesHandled = next.timesHandled.filter((key) => key.startsWith(today))
  return { reminders, sent: next }
}

export function parseReminderSettings(value: unknown): ReminderSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_REMINDER_SETTINGS }
  const stored = value as Partial<ReminderSettings>
  const hours = Number(stored.expiryHours)
  return {
    expiryEnabled: stored.expiryEnabled === true,
    expiryHours:
      Number.isInteger(hours) && hours >= EXPIRY_HOURS_MIN && hours <= EXPIRY_HOURS_MAX ? hours : DEFAULT_EXPIRY_HOURS,
    notify: stored.notify === true,
    remindOnExpiry: stored.remindOnExpiry !== false,
    times: Array.isArray(stored.times) ? normaliseTimes(stored.times.filter((t): t is string => typeof t === 'string')) : [],
  }
}

export function parseReminderLog(value: unknown): ReminderLog {
  if (!value || typeof value !== 'object') return { ...EMPTY_REMINDER_LOG, timesHandled: [] }
  const stored = value as Partial<ReminderLog>
  return {
    expiryEntryId: typeof stored.expiryEntryId === 'string' ? stored.expiryEntryId : null,
    expirySentAt: typeof stored.expirySentAt === 'number' ? stored.expirySentAt : null,
    timesHandled: Array.isArray(stored.timesHandled)
      ? stored.timesHandled.filter((key): key is string => typeof key === 'string')
      : [],
  }
}
