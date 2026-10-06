import { describe, expect, it } from 'vitest'
import {
  basalForDateTime,
  minutesOfTime,
  parseBasals,
  periodForMinutes,
  periodHours,
  recordBasalAmount,
  type Basal,
} from './basal'

function daily(period: Basal['period'], units: number, from = '1970-01-01'): Basal {
  return { period, amounts: [{ units, from }] }
}

describe('basal parts of the day', () => {
  it('splits the day into overnight and three equal stretches', () => {
    expect(periodForMinutes(22 * 60)).toBe('overnight')
    expect(periodForMinutes(2 * 60)).toBe('overnight')
    expect(periodForMinutes(4 * 60 - 1)).toBe('overnight')
    expect(periodForMinutes(4 * 60)).toBe('morning')
    expect(periodForMinutes(10 * 60 - 1)).toBe('morning')
    expect(periodForMinutes(10 * 60)).toBe('lunch')
    expect(periodForMinutes(16 * 60 - 1)).toBe('lunch')
    expect(periodForMinutes(16 * 60)).toBe('dinner')
    expect(periodForMinutes(22 * 60 - 1)).toBe('dinner')
    expect(periodHours('morning')).toBe('4am to 10am')
    expect(periodHours('lunch')).toBe('10am to 4pm')
    expect(periodHours('dinner')).toBe('4pm to 10pm')
    expect(periodHours('overnight')).toBe('10pm to 4am')
  })

  it('uses the amount for the part of the day that contains the time', () => {
    const basals = [daily('morning', 10), daily('lunch', 8), daily('dinner', 6), daily('overnight', 4)]
    expect(basalForDateTime(basals, '2026-10-05', 8 * 60)?.period).toBe('morning')
    expect(basalForDateTime(basals, '2026-10-05', 8 * 60)?.units).toBe(10)
    expect(basalForDateTime(basals, '2026-10-05', 12 * 60)?.units).toBe(8)
    expect(basalForDateTime(basals, '2026-10-05', 18 * 60)?.units).toBe(6)
    expect(basalForDateTime(basals, '2026-10-05', 23 * 60)?.units).toBe(4)
    expect(basalForDateTime(basals, '2026-10-05', 1 * 60)?.units).toBe(4)
  })

  it('uses the latest earlier amount when that part of the day has none', () => {
    expect(basalForDateTime([daily('morning', 10)], '2026-10-05', 18 * 60)?.units).toBe(10)
    expect(basalForDateTime([daily('dinner', 6)], '2026-10-05', 8 * 60)?.units).toBe(6)
    expect(basalForDateTime([daily('overnight', 4)], '2026-10-05', 11 * 60)?.period).toBe('overnight')
  })

  it('has no basal when none is configured', () => {
    expect(basalForDateTime([], '2026-10-05', 12 * 60)).toBeNull()
    expect(minutesOfTime('24:00')).toBeNull()
    expect(periodForMinutes(Number.NaN)).toBeNull()
  })

  it('keeps an earlier amount for days before a dose change', () => {
    const basals: Basal[] = [
      {
        period: 'morning',
        amounts: [
          { units: 10, from: '2026-01-01' },
          { units: 12, from: '2026-10-05' },
        ],
      },
    ]
    expect(basalForDateTime(basals, '2026-10-04', 9 * 60)?.units).toBe(10)
    expect(basalForDateTime(basals, '2026-10-05', 9 * 60)?.units).toBe(12)
    expect(basalForDateTime(basals, '2025-12-01', 9 * 60)?.units).toBe(10)
  })

  it('replaces the amount changed on the same day and keeps the previous day', () => {
    const first = recordBasalAmount([{ units: 10, from: '2026-10-01' }], 12, '2026-10-05')
    expect(first).toEqual([
      { units: 10, from: '2026-10-01' },
      { units: 12, from: '2026-10-05' },
    ])
    expect(recordBasalAmount(first, 14, '2026-10-05')).toEqual([
      { units: 10, from: '2026-10-01' },
      { units: 14, from: '2026-10-05' },
    ])
    expect(recordBasalAmount(first, 10, '2026-10-05')).toEqual([{ units: 10, from: '2026-10-01' }])
  })

  it('keeps saved clock times in the part of the day they fall in', () => {
    expect(
      parseBasals([
        { time: '08:00', units: 15 },
        { time: '20:00', amounts: [{ units: 8, from: '2026-09-01' }, { units: 9, from: '2026-10-02' }] },
        { period: 'lunch', amounts: [{ units: 4, from: '2026-10-01' }] },
        { time: '25:00', units: 4 },
        { time: '12:00', units: 0 },
        { note: 'no' },
      ]),
    ).toEqual([
      daily('morning', 15),
      daily('lunch', 4, '2026-10-01'),
      {
        period: 'dinner',
        amounts: [
          { units: 8, from: '2026-09-01' },
          { units: 9, from: '2026-10-02' },
        ],
      },
    ])
  })
})
