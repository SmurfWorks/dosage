export type LogEntry = {
  id: string
  at: string
  timeZone: string
  glucoseMmol: number
  insulinUnits: number
  insulinStep: number
  targetMmol: number
  carbsGrams: number | null
  note: string
  basalUnits: number | null
  basalPeriod: string | null
  custom?: boolean
}

export type LogGroup = {
  key: string
  label: string
  entries: LogEntry[]
}

const LOG_KEY = 'insulin-calculator.log.v1'

export function createLogEntry(
  input: {
    glucoseMmol: number
    insulinUnits: number
    insulinStep: number
    targetMmol: number
    carbsGrams: number
    note: string
    basalUnits?: number | null
    basalPeriod?: string | null
    custom?: boolean
  },
  now = new Date(),
  timeZone = browserTimeZone(),
): LogEntry {
  return {
    id: crypto.randomUUID(),
    at: now.toISOString(),
    timeZone,
    glucoseMmol: input.glucoseMmol,
    insulinUnits: input.insulinUnits,
    insulinStep: input.insulinStep,
    targetMmol: input.targetMmol,
    carbsGrams: input.carbsGrams,
    note: input.note.trim().slice(0, 400),
    basalUnits: positiveBasal(input.basalUnits),
    basalPeriod: periodName(input.basalPeriod),
    custom: input.custom === true,
  }
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function loadLog(): LogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(readLogEntry).filter((entry): entry is LogEntry => entry !== null)
  } catch {
    return []
  }
}

export function saveLog(entries: LogEntry[]) {
  localStorage.setItem(LOG_KEY, JSON.stringify(entries))
}

export function hasTarget(entry: LogEntry): boolean {
  return entry.insulinUnits > 0 || (entry.carbsGrams ?? 0) > 0
}

export function latestTargetMmol(entries: LogEntry[]): number | null {
  let latest: LogEntry | null = null
  for (const entry of entries) {
    if (!hasTarget(entry)) continue
    if (!latest || Date.parse(entry.at) > Date.parse(latest.at)) latest = entry
  }
  return latest ? latest.targetMmol : null
}

export function continuedTarget(entries: LogEntry[], at: string, fallback: number): { mmol: number; source: LogEntry | null } {
  let latest: LogEntry | null = null
  const time = Date.parse(at)
  for (const entry of entries) {
    if (!hasTarget(entry)) continue
    const when = Date.parse(entry.at)
    if (when >= time) continue
    if (!latest || when > Date.parse(latest.at)) latest = entry
  }
  return { mmol: latest ? latest.targetMmol : fallback, source: latest }
}

export function groupLog(entries: LogEntry[]): LogGroup[] {
  const sorted = [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  const groups: LogGroup[] = []
  for (const entry of sorted) {
    const key = logDateKey(entry.at, entry.timeZone)
    const current = groups[groups.length - 1]
    if (current && current.key === key) current.entries.push(entry)
    else groups.push({ key, label: formatLogDate(entry.at, entry.timeZone), entries: [entry] })
  }
  return groups
}

export function todayDateKey(timeZone = browserTimeZone(), now = new Date()): string {
  return logDateKey(now.toISOString(), timeZone)
}

export function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  const nextYear = date.getUTCFullYear()
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0')
  const nextDay = String(date.getUTCDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDay}`
}

function dateKeyAtNoon(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

export function formatDateKey(key: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateKeyAtNoon(key))
}

export function formatLocalDateKey(key: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC' }).format(dateKeyAtNoon(key))
}

export function dateInTimeZone(dateKey: string, time: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)
  if (!timeMatch) return null
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  if (hour > 23 || minute > 59) return null
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null

  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  const firstOffset = zoneOffset(new Date(wallClockAsUtc), timeZone)
  let instant = new Date(wallClockAsUtc - firstOffset)
  const secondOffset = zoneOffset(instant, timeZone)
  if (secondOffset !== firstOffset) instant = new Date(wallClockAsUtc - secondOffset)
  if (logDateKey(instant.toISOString(), timeZone) !== dateKey) return null
  if (logMinutesOfDay(instant.toISOString(), timeZone) !== hour * 60 + minute) return null
  return instant
}

export function insulinStepFor(units: number): number {
  const scaled = Math.round(units * 100)
  if (scaled % 100 === 0) return 1
  if (scaled % 10 === 0) return 0.1
  return 0.01
}

export function logDateKey(at: string, timeZone: string): string {
  const parts = zonedParts(at, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' })
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function logMinutesOfDay(at: string, timeZone: string): number {
  const parts = zonedParts(at, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '0'
  let hour = Number(value('hour'))
  const minute = Number(value('minute'))
  if (!Number.isFinite(hour)) hour = 0
  if (hour === 24) hour = 0
  return hour * 60 + (Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0)
}

export function formatLogDate(at: string, timeZone: string): string {
  return zonedFormat(at, timeZone, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatLogTime(at: string, timeZone: string): string {
  return zonedFormat(at, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function formatInsulin(units: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))
  const figure = units.toFixed(decimals)
  return `${figure} ${units === 1 ? 'unit' : 'units'}`
}

export function formatBolusUnits(units: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))
  return `${units.toFixed(decimals)} bolus ${units === 1 ? 'unit' : 'units'}`
}

export function formatCarbohydrates(grams: number): string {
  return `${Number(grams.toFixed(2)).toString()}g of carbohydrates`
}

export function formatBasalUnits(units: number): string {
  const figure = Number(units.toFixed(2)).toString()
  return `${figure} basal ${units === 1 ? 'unit' : 'units'}`
}

export function formatCarbs(grams: number): string {
  const figure = Number(grams.toFixed(2)).toString()
  return `${figure} g`
}

function readLogEntry(value: unknown): LogEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<LogEntry>
  if (
    typeof entry.id !== 'string' ||
    typeof entry.at !== 'string' ||
    !Number.isFinite(Date.parse(entry.at)) ||
    typeof entry.timeZone !== 'string' ||
    typeof entry.glucoseMmol !== 'number' ||
    !Number.isFinite(entry.glucoseMmol) ||
    typeof entry.insulinUnits !== 'number' ||
    !Number.isFinite(entry.insulinUnits) ||
    typeof entry.insulinStep !== 'number' ||
    !(entry.insulinStep > 0) ||
    typeof entry.targetMmol !== 'number' ||
    !Number.isFinite(entry.targetMmol)
  ) {
    return null
  }
  const storedCarbs = (value as { carbsGrams?: unknown }).carbsGrams
  const carbsGrams =
    storedCarbs === undefined
      ? null
      : typeof storedCarbs === 'number' && Number.isFinite(storedCarbs) && storedCarbs >= 0
        ? storedCarbs
        : undefined
  if (carbsGrams === undefined) return null
  const storedNote = (value as { note?: unknown }).note
  const note = typeof storedNote === 'string' ? storedNote.trim().slice(0, 400) : ''
  return {
    id: entry.id,
    at: entry.at,
    timeZone: entry.timeZone,
    glucoseMmol: entry.glucoseMmol,
    insulinUnits: entry.insulinUnits,
    insulinStep: entry.insulinStep,
    targetMmol: entry.targetMmol,
    carbsGrams,
    note,
    basalUnits: positiveBasal((value as { basalUnits?: unknown }).basalUnits),
    basalPeriod: periodName((value as { basalPeriod?: unknown }).basalPeriod),
    custom: (value as { custom?: unknown }).custom === true,
  }
}

function periodName(value: unknown): string | null {
  if (value === 'morning' || value === 'lunch' || value === 'dinner' || value === 'overnight') return value
  return null
}

function positiveBasal(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value
}

function zoneOffset(date: Date, timeZone: string): number {
  const parts = zonedParts(date.toISOString(), timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '0'
  let hour = Number(value('hour'))
  if (!Number.isFinite(hour) || hour === 24) hour = 0
  const asUtc = Date.UTC(
    Number(value('year')),
    Number(value('month')) - 1,
    Number(value('day')),
    hour,
    Number(value('minute')),
    Number(value('second')),
  )
  return asUtc - date.getTime()
}

function zonedFormat(at: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(at)
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date)
  }
}

function zonedParts(at: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] {
  const date = new Date(at)
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).formatToParts(date)
  } catch {
    return new Intl.DateTimeFormat('en-US', options).formatToParts(date)
  }
}
