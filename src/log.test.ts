import { describe, expect, it, vi } from 'vitest'
import {
  createLogEntry,
  dateInTimeZone,
  formatBasalUnits,
  formatBolusUnits,
  formatCarbohydrates,
  formatCarbs,
  groupLog,
  continuedTarget,
  hasTarget,
  latestTargetMmol,
  recordsTarget,
  loadLog,
  logDateKey,
  logMinutesOfDay,
  shiftDateKey,
  todayDateKey,
  formatDateKey,
  formatLocalDateKey,
  type LogEntry,
} from './log'

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: '1',
    at: '2026-10-06T06:30:00.000Z',
    timeZone: 'America/Los_Angeles',
    glucoseMmol: 12,
    insulinUnits: 1.5,
    insulinStep: 0.5,
    targetMmol: 7,
    carbsGrams: 0,
    note: '',
    basalUnits: null,
    basalPeriod: null,
    ...overrides,
  }
}

describe('log dates in the browser timezone', () => {
  it('keeps a late evening on the local date rather than the UTC date', () => {
    expect(logDateKey('2026-10-06T06:30:00.000Z', 'America/Los_Angeles')).toBe('2026-10-05')
    expect(logDateKey('2026-10-06T06:30:00.000Z', 'UTC')).toBe('2026-10-06')
  })

  it('groups entries by local date, newest day and time first', () => {
    const groups = groupLog([
      entry({ id: 'evening', at: '2026-10-06T06:30:00.000Z', timeZone: 'America/Los_Angeles' }),
      entry({ id: 'morning', at: '2026-10-05T16:00:00.000Z', timeZone: 'America/Los_Angeles' }),
      entry({ id: 'previous', at: '2026-10-04T20:00:00.000Z', timeZone: 'America/Los_Angeles' }),
    ])
    expect(groups.map((group) => group.key)).toEqual(['2026-10-05', '2026-10-04'])
    expect(groups[0]?.entries.map((item) => item.id)).toEqual(['evening', 'morning'])
    expect(groups[0]?.label).toMatch(/5/)
    expect(groups[0]?.label).toMatch(/October/)
  })

  it('places a local time on the 24-hour axis', () => {
    expect(logMinutesOfDay('2026-10-06T06:30:00.000Z', 'America/Los_Angeles')).toBe(23 * 60 + 30)
    expect(logMinutesOfDay('2026-10-05T16:00:00.000Z', 'America/Los_Angeles')).toBe(9 * 60)
    expect(logMinutesOfDay('2026-10-05T00:00:00.000Z', 'UTC')).toBe(0)
  })

  it('steps across month and leap-day boundaries', () => {
    expect(shiftDateKey('2026-10-05', -1)).toBe('2026-10-04')
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDateKey('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('names a calendar day without shifting it into another timezone', () => {
    expect(formatDateKey('2026-10-05')).toMatch(/5/)
    expect(formatDateKey('2026-10-05')).toMatch(/October/)
    expect(formatDateKey('2026-10-05')).toMatch(/2026/)
  })

  it('writes a calendar day in the local date format', () => {
    const local = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 9, 5, 12)),
    )
    expect(formatLocalDateKey('2026-10-05')).toBe(local)
    expect(formatLocalDateKey('2026-10-05')).not.toMatch(/Monday|October/)
  })

  it('uses the local calendar day for today', () => {
    expect(todayDateKey('America/Los_Angeles', new Date('2026-10-06T06:30:00.000Z'))).toBe('2026-10-05')
  })
})

describe('log entry target', () => {
  it('is calculated only when carbohydrate or bolus is recorded', () => {
    expect(recordsTarget(0, 0)).toBe(false)
    expect(recordsTarget(0, 1)).toBe(true)
    expect(recordsTarget(12, 0)).toBe(true)
  })

  it('has a target with carbohydrate or bolus units', () => {
    expect(hasTarget(entry({ insulinUnits: 0, carbsGrams: 20 }))).toBe(true)
    expect(hasTarget(entry({ insulinUnits: 1.5, carbsGrams: 0 }))).toBe(true)
  })

  it('has no target with neither', () => {
    expect(hasTarget(entry({ insulinUnits: 0, carbsGrams: 0 }))).toBe(false)
    expect(hasTarget(entry({ insulinUnits: 0, carbsGrams: null, basalUnits: 22 }))).toBe(false)
    expect(hasTarget(entry({ targetMmol: null, insulinUnits: 0, carbsGrams: 0 }))).toBe(false)
  })

  it('stores no calculated target when none was submitted', () => {
    const saved = createLogEntry(
      { glucoseMmol: 6, insulinUnits: 0, insulinStep: 0.5, targetMmol: null, carbsGrams: 0, note: '' },
      new Date('2026-10-06T20:00:00.000Z'),
      'UTC',
    )
    expect(saved.targetMmol).toBeNull()
    expect(hasTarget(saved)).toBe(false)
  })
})

describe('continued target', () => {
  it('uses the latest earlier target, including another day', () => {
    const target = continuedTarget(
      [
        entry({ id: 'older', at: '2026-10-04T20:00:00.000Z', targetMmol: 6, carbsGrams: 20 }),
        entry({ id: 'later-day', at: '2026-10-05T08:00:00.000Z', targetMmol: 7.2, carbsGrams: 15 }),
        entry({ id: 'now', at: '2026-10-05T12:00:00.000Z', insulinUnits: 0, carbsGrams: 0 }),
      ],
      '2026-10-05T12:00:00.000Z',
      6.5,
    )
    expect(target.mmol).toBe(7.2)
    expect(target.source?.id).toBe('later-day')
  })

  it('falls back when nothing earlier has a target', () => {
    const target = continuedTarget(
      [entry({ at: '2026-10-05T12:00:00.000Z', insulinUnits: 0, carbsGrams: 0 })],
      '2026-10-05T12:00:00.000Z',
      6.5,
    )
    expect(target.mmol).toBe(6.5)
    expect(target.source).toBeNull()
  })
})

describe('custom log entry', () => {
  it('marks a retroactive entry as custom', () => {
    const saved = createLogEntry(
      {
        glucoseMmol: 8,
        insulinUnits: 1,
        insulinStep: 0.5,
        targetMmol: 6,
        carbsGrams: 20,
        note: '',
        custom: true,
      },
      new Date('2026-10-05T19:00:00.000Z'),
      'UTC',
    )
    expect(saved.custom).toBe(true)
  })
})

describe('starting glucose', () => {
  it('uses the target from the newest log entry', () => {
    const target = latestTargetMmol([
      entry({ at: '2026-10-01T12:00:00.000Z', targetMmol: 6 }),
      entry({ at: '2026-10-05T12:00:00.000Z', targetMmol: 7.5 }),
    ])
    expect(target).toBe(7.5)
  })

  it('skips newer entries with no carbohydrate or bolus', () => {
    const target = latestTargetMmol([
      entry({ at: '2026-10-01T12:00:00.000Z', targetMmol: 6, insulinUnits: 0, carbsGrams: 40 }),
      entry({ at: '2026-10-05T12:00:00.000Z', targetMmol: 7.5, insulinUnits: 0, carbsGrams: 0, basalUnits: 22 }),
    ])
    expect(target).toBe(6)
  })

  it('has no target when the log is empty', () => {
    expect(latestTargetMmol([])).toBeNull()
  })
})

describe('carbohydrate on a log entry', () => {
  it('stores the carbohydrate that was entered', () => {
    const saved = createLogEntry(
      { glucoseMmol: 8, insulinUnits: 1.2, insulinStep: 0.1, targetMmol: 6, carbsGrams: 30, note: '  Pizza, then a walk  ' },
      new Date('2026-10-05T19:00:00.000Z'),
      'UTC',
    )
    expect(saved.carbsGrams).toBe(30)
    expect(formatCarbs(30)).toBe('30 g')
    expect(formatBasalUnits(22)).toBe('22 basal units')
    expect(formatBasalUnits(7.5)).toBe('7.5 basal units')
    expect(formatBasalUnits(1)).toBe('1 basal unit')
    expect(formatBolusUnits(3.5, 0.5)).toBe('3.5 bolus units')
    expect(formatBolusUnits(1, 1)).toBe('1 bolus unit')
    expect(formatCarbohydrates(34)).toBe('34g of carbohydrates')
    expect(saved.note).toBe('Pizza, then a walk')
    expect(saved.basalUnits).toBeNull()
    expect(saved.basalPeriod).toBeNull()
  })

  it('stores a basal amount with the entry', () => {
    const saved = createLogEntry(
      { glucoseMmol: 8, insulinUnits: 1.2, insulinStep: 0.1, targetMmol: 6, carbsGrams: 0, note: '', basalUnits: 10 },
      new Date('2026-10-05T15:00:00.000Z'),
      'UTC',
    )
    expect(saved.basalUnits).toBe(10)
  })

  it('keeps older entries that were saved before carbohydrate was stored', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    })
    store.set(
      'insulin-calculator.log.v1',
      JSON.stringify([
        {
          id: 'old',
          at: '2026-10-05T12:00:00.000Z',
          timeZone: 'UTC',
          glucoseMmol: 6,
          insulinUnits: 1,
          insulinStep: 0.1,
          targetMmol: 6,
        },
      ]),
    )
    expect(loadLog()[0]?.carbsGrams).toBeNull()
    expect(loadLog()[0]?.note).toBe('')
    const stored = JSON.parse(store.get('insulin-calculator.log.v1')!) as { carbsGrams?: unknown }[]
    stored[0]!.carbsGrams = null
    store.set('insulin-calculator.log.v1', JSON.stringify(stored))
    expect(loadLog()[0]?.carbsGrams).toBeNull()
    expect(loadLog()[0]?.basalUnits).toBeNull()
    expect(loadLog()[0]?.basalPeriod).toBeNull()
    vi.unstubAllGlobals()
  })

  it('keeps a reading that was saved without a calculated target', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
    })
    store.set(
      'insulin-calculator.log.v1',
      JSON.stringify([
        {
          id: 'glucose-only',
          at: '2026-10-06T20:00:00.000Z',
          timeZone: 'UTC',
          glucoseMmol: 6,
          insulinUnits: 0,
          insulinStep: 0.5,
          targetMmol: null,
          carbsGrams: 0,
        },
      ]),
    )
    expect(loadLog()[0]?.targetMmol).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('a chosen local date and time', () => {
  it('keeps the wall clock in that timezone', () => {
    const utc = dateInTimeZone('2026-10-05', '15:45', 'UTC')
    expect(utc?.toISOString()).toBe('2026-10-05T15:45:00.000Z')

    const losAngeles = dateInTimeZone('2026-10-05', '21:15', 'America/Los_Angeles')
    expect(losAngeles).not.toBeNull()
    expect(logDateKey(losAngeles!.toISOString(), 'America/Los_Angeles')).toBe('2026-10-05')
    expect(logMinutesOfDay(losAngeles!.toISOString(), 'America/Los_Angeles')).toBe(21 * 60 + 15)
  })

  it('rejects a time that the clock skips', () => {
    expect(dateInTimeZone('2026-03-08', '02:30', 'America/Los_Angeles')).toBeNull()
  })
})
