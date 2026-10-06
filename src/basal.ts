export const BASAL_PERIODS = ['morning', 'lunch', 'dinner', 'overnight'] as const

export type BasalPeriod = (typeof BASAL_PERIODS)[number]

export type BasalAmount = {
  units: number
  from: string
}

export type Basal = {
  period: BasalPeriod
  amounts: BasalAmount[]
}

export type BasalDose = {
  period: BasalPeriod
  units: number
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const EARLIEST = '1970-01-01'
const MORNING = 4 * 60
const LUNCH = 10 * 60
const DINNER = 16 * 60
const OVERNIGHT = 22 * 60

export function parseBasals(value: unknown): Basal[] {
  if (!Array.isArray(value)) return []
  const byPeriod = new Map<BasalPeriod, BasalAmount[]>()
  for (const item of value) {
    const basal = parseBasal(item)
    if (!basal) continue
    let amounts = byPeriod.get(basal.period) ?? []
    for (const amount of basal.amounts) amounts = recordBasalAmount(amounts, amount.units, amount.from)
    byPeriod.set(basal.period, amounts)
  }
  return BASAL_PERIODS.flatMap((period) => {
    const amounts = byPeriod.get(period)
    return amounts && amounts.length > 0 ? [{ period, amounts }] : []
  })
}

export function minutesOfTime(time: string): number | null {
  const match = TIME.exec(time)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function periodForMinutes(minutes: number): BasalPeriod | null {
  if (!Number.isFinite(minutes)) return null
  const minute = ((Math.floor(minutes) % 1440) + 1440) % 1440
  if (minute >= OVERNIGHT || minute < MORNING) return 'overnight'
  if (minute < LUNCH) return 'morning'
  if (minute < DINNER) return 'lunch'
  return 'dinner'
}

export function periodLabel(period: BasalPeriod): string {
  if (period === 'morning') return 'Morning'
  if (period === 'lunch') return 'Lunch'
  if (period === 'dinner') return 'Dinner'
  return 'Overnight'
}

export function periodHours(period: BasalPeriod): string {
  if (period === 'morning') return '4am to 10am'
  if (period === 'lunch') return '10am to 4pm'
  if (period === 'dinner') return '4pm to 10pm'
  return '10pm to 4am'
}

export function isBasalPeriod(value: unknown): value is BasalPeriod {
  return value === 'morning' || value === 'lunch' || value === 'dinner' || value === 'overnight'
}

export function recordBasalAmount(amounts: BasalAmount[], units: number, on: string): BasalAmount[] {
  const sorted = sortAmounts(amounts)
  const prior = sorted.filter((amount) => amount.from < on)
  const previous = prior[prior.length - 1]
  const current = previous && previous.units === units ? prior : [...prior, { units, from: on }]
  return [...current, ...sorted.filter((amount) => amount.from > on)]
}

export function unitsOnDate(amounts: BasalAmount[], dateKey: string): number | null {
  const sorted = sortAmounts(amounts)
  if (sorted.length === 0) return null
  let chosen = sorted[0]!
  for (const amount of sorted) {
    if (amount.from <= dateKey) chosen = amount
    else break
  }
  return chosen.units
}

export function basalForDateTime(basals: Basal[], dateKey: string, minutes: number): BasalDose | null {
  const start = periodForMinutes(minutes)
  if (!start) return null
  let period = start
  for (let step = 0; step < BASAL_PERIODS.length; step++) {
    const slot = basals.find((basal) => basal.period === period)
    const units = slot ? unitsOnDate(slot.amounts, dateKey) : null
    if (units !== null) return { period, units }
    period = previousPeriod(period)
  }
  return null
}

function previousPeriod(period: BasalPeriod): BasalPeriod {
  const index = BASAL_PERIODS.indexOf(period)
  return BASAL_PERIODS[(index + BASAL_PERIODS.length - 1) % BASAL_PERIODS.length]!
}

function parseBasal(value: unknown): Basal | null {
  if (!value || typeof value !== 'object') return null
  const period = periodFromStored((value as { period?: unknown; time?: unknown }).period ?? (value as { time?: unknown }).time)
  if (!period) return null
  const amounts = parseAmounts(value)
  if (amounts.length === 0) return null
  return { period, amounts }
}

function periodFromStored(value: unknown): BasalPeriod | null {
  if (isBasalPeriod(value)) return value
  if (typeof value !== 'string') return null
  const minutes = minutesOfTime(value)
  if (minutes === null) return null
  return periodForMinutes(minutes)
}

function parseAmounts(value: object): BasalAmount[] {
  const stored = (value as { amounts?: unknown }).amounts
  if (Array.isArray(stored)) return sortAmounts(stored.map(parseAmount).filter((amount): amount is BasalAmount => amount !== null))
  const units = (value as { units?: unknown }).units
  const amount = parseAmount({ units, from: EARLIEST })
  return amount ? [amount] : []
}

function parseAmount(value: unknown): BasalAmount | null {
  if (!value || typeof value !== 'object') return null
  const units = (value as { units?: unknown }).units
  const from = (value as { from?: unknown }).from
  if (typeof units !== 'number' || !Number.isFinite(units) || units <= 0 || units > 100) return null
  if (typeof from !== 'string' || !DATE.test(from)) return null
  return { units, from }
}

function sortAmounts(amounts: BasalAmount[]): BasalAmount[] {
  return [...amounts].sort((a, b) => a.from.localeCompare(b.from))
}
