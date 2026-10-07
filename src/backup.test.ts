import { describe, expect, it } from 'vitest'
import { backupFilename, createBackup, parseBackup, type Routine } from './backup'
import type { LogEntry } from './log'

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    rangeLow: 4,
    rangeHigh: 8,
    targetMmol: 6,
    mmolRisePer10g: 3,
    mmolFallPerUnit: 3,
    insulinStep: 0.1,
    glucoseUnit: 'mmol',
    showFibre: true,
    basals: [
      {
        period: 'morning',
        amounts: [
          { units: 8, from: '2026-01-01' },
          { units: 10, from: '2026-06-01' },
        ],
      },
    ],
    ...overrides,
  }
}

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: '1',
    at: '2026-10-06T06:30:00.000Z',
    timeZone: 'America/Los_Angeles',
    glucoseMmol: 12,
    insulinUnits: 1.5,
    insulinStep: 0.5,
    targetMmol: 7,
    carbsGrams: 20,
    note: 'Lunch',
    basalUnits: 10,
    basalPeriod: 'morning',
    custom: false,
    ...overrides,
  }
}

describe('dosage backups', () => {
  const when = new Date('2026-10-07T22:15:00.000Z')

  it('round-trips the routine and log', () => {
    const backup = createBackup(routine(), [entry(), entry({ id: '2', carbsGrams: null, note: '' })], when)
    const parsed = parseBackup(JSON.parse(JSON.stringify(backup)))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.routine).toEqual(routine())
    expect(parsed.backup.log).toEqual(backup.log)
    expect(parsed.backup.exportedAt).toBe(when.toISOString())
  })

  it('names the file with the local date', () => {
    expect(backupFilename(new Date(2026, 9, 7, 15, 4))).toBe('dosage-backup-2026-10-07.json')
  })

  it('rejects a file that is not a backup', () => {
    expect(parseBackup(null).ok).toBe(false)
    expect(parseBackup({ app: 'other', version: 1 }).ok).toBe(false)
    expect(parseBackup({ app: 'dosage', version: 0 }).ok).toBe(false)
    expect(parseBackup({ app: 'dosage', version: 1, exportedAt: 'yesterday' }).ok).toBe(false)
  })

  it('rejects a backup from a newer version', () => {
    const result = parseBackup({ app: 'dosage', version: 2, exportedAt: when.toISOString() })
    expect(result).toEqual({ ok: false, message: 'That backup is from a newer version of Dosage.' })
  })

  it('rejects a routine the app cannot store', () => {
    const backup = createBackup(routine(), [], when)
    expect(parseBackup({ ...backup, routine: { ...backup.routine, insulinStep: 2 } }).ok).toBe(false)
    expect(parseBackup({ ...backup, routine: { ...backup.routine, glucoseUnit: 'mg' } }).ok).toBe(false)
    expect(parseBackup({ ...backup, routine: { ...backup.routine, showFibre: 'yes' } }).ok).toBe(false)
    expect(parseBackup({ ...backup, routine: { ...backup.routine, rangeHigh: 40 } }).ok).toBe(false)
    expect(parseBackup({ ...backup, routine: { ...backup.routine, basals: [{ period: 'dawn' }] } }).ok).toBe(false)
  })

  it('rejects a log entry that cannot be read, or a repeated id', () => {
    const backup = createBackup(routine({ basals: [] }), [entry()], when)
    expect(parseBackup({ ...backup, log: [{ ...entry(), at: 'not-a-time' }] }).ok).toBe(false)
    expect(parseBackup({ ...backup, log: [entry(), entry()] }).ok).toBe(false)
  })
})
