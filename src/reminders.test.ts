import { describe, expect, it } from 'vitest'
import type { LogEntry } from './log'
import {
  activeHours,
  DEFAULT_REMINDER_SETTINGS,
  dueReminders,
  EMPTY_REMINDER_LOG,
  hasActiveTarget,
  normaliseTimes,
  parseReminderLog,
  parseReminderSettings,
  type ReminderLog,
  type ReminderSettings,
} from './reminders'

// Local times, so the tests read the same in any time zone.
const at = (hour: number, minute = 0, day = 8) => new Date(2026, 9, day, hour, minute)

function entry(id: string, when: Date, insulinUnits = 3): LogEntry {
  return {
    id,
    at: when.toISOString(),
    timeZone: 'UTC',
    glucoseMmol: 8,
    insulinUnits,
    insulinStep: 0.1,
    targetMmol: 6,
    carbsGrams: 40,
    note: '',
    basalUnits: null,
    basalPeriod: null,
  }
}

const on: ReminderSettings = { ...DEFAULT_REMINDER_SETTINGS, expiryEnabled: true, notify: true }
const describe12 = (item: LogEntry) => (item.id === 'lunch' ? '12:00 pm' : item.id)

function run(entries: LogEntry[], settings: ReminderSettings, sent: ReminderLog, now: Date) {
  return dueReminders(entries, settings, sent, now, describe12)
}

describe('target expiry', () => {
  it('uses the expiry hours for the recent bolus warning only while expiry is on', () => {
    expect(activeHours({ ...on, expiryHours: 3 })).toBe(3)
    expect(activeHours({ ...on, expiryEnabled: false, expiryHours: 3 })).toBe(4)
  })

  it('counts any entry in the expiry window as an active target', () => {
    const entries = [entry('lunch', at(12))]
    expect(hasActiveTarget(entries, at(15, 59), 4)).toBe(true)
    expect(hasActiveTarget(entries, at(16), 4)).toBe(false)
    expect(hasActiveTarget(entries, at(11, 59), 4)).toBe(false)
  })
})

describe('expiry reminder', () => {
  const entries = [entry('lunch', at(12))]

  it('sends one reminder when the latest entry reaches the expiry age', () => {
    expect(run(entries, on, EMPTY_REMINDER_LOG, at(15, 59)).reminders).toEqual([])
    const first = run(entries, on, EMPTY_REMINDER_LOG, at(16, 2))
    expect(first.reminders).toEqual([
      {
        kind: 'expiry',
        title: 'Your target has expired',
        body: "It's been 4 hours since your 12:00 pm entry, so that bolus could be wearing off.",
        tag: 'target-expiry',
      },
    ])
    expect(first.sent.expirySentAt).toBe(at(16, 2).getTime())
    expect(run(entries, on, first.sent, at(16, 5)).reminders).toEqual([])
  })

  it('leaves out the bolus when the entry had none, and follows the hours setting', () => {
    const checkIn = [entry('lunch', at(12), 0)]
    expect(run(checkIn, { ...on, expiryHours: 1 }, EMPTY_REMINDER_LOG, at(13)).reminders[0].body).toBe(
      "It's been 1 hour since your 12:00 pm entry.",
    )
  })

  it('drops an expiry it missed by more than 30 minutes', () => {
    const late = run(entries, on, EMPTY_REMINDER_LOG, at(16, 31))
    expect(late.reminders).toEqual([])
    expect(late.sent.expiryEntryId).toBe('lunch')
  })

  it('starts again after a new entry', () => {
    const first = run(entries, on, EMPTY_REMINDER_LOG, at(16, 1))
    const later = [...entries, entry('dinner', at(18))]
    expect(run(later, on, first.sent, at(21, 59)).reminders).toEqual([])
    expect(run(later, on, first.sent, at(22)).reminders).toHaveLength(1)
  })

  it('stays quiet when expiry, notifications or this reminder is off', () => {
    expect(run(entries, { ...on, expiryEnabled: false }, EMPTY_REMINDER_LOG, at(16)).reminders).toEqual([])
    expect(run(entries, { ...on, notify: false }, EMPTY_REMINDER_LOG, at(16)).reminders).toEqual([])
    expect(run(entries, { ...on, remindOnExpiry: false }, EMPTY_REMINDER_LOG, at(16)).reminders).toEqual([])
  })
})

describe('timed reminders', () => {
  const settings = { ...on, remindOnExpiry: false, times: ['09:00', '20:00'] }

  it('reminds at a set time when there is no active target', () => {
    const result = run([entry('lunch', at(12, 0, 7))], settings, EMPTY_REMINDER_LOG, at(9, 1))
    expect(result.reminders).toEqual([
      {
        kind: 'time',
        title: 'No active target',
        body: "You haven't logged a target in the last 4 hours. Open Dosage Helper to check in.",
        tag: 'reminder-09:00',
      },
    ])
    expect(run([], settings, result.sent, at(9, 10)).reminders).toEqual([])
  })

  it('stays quiet while a target is active, including one logged since the reminder time', () => {
    expect(run([entry('breakfast', at(7))], settings, EMPTY_REMINDER_LOG, at(9)).reminders).toEqual([])
    expect(run([entry('late', at(9, 5))], settings, EMPTY_REMINDER_LOG, at(9, 10)).reminders).toEqual([])
  })

  it('does not send a reminder missed by more than 30 minutes, or later the same day', () => {
    const missed = run([], settings, EMPTY_REMINDER_LOG, at(9, 31))
    expect(missed.reminders).toEqual([])
    expect(run([], settings, missed.sent, at(9, 40)).reminders).toEqual([])
  })

  it('stays quiet within an hour of an expiry reminder', () => {
    const both = { ...settings, remindOnExpiry: true, times: ['16:30'] }
    const entries = [entry('lunch', at(12))]
    const expiry = run(entries, both, EMPTY_REMINDER_LOG, at(16))
    expect(expiry.reminders.map((item) => item.kind)).toEqual(['expiry'])
    expect(run(entries, both, expiry.sent, at(16, 30)).reminders).toEqual([])
    const afterHour = { ...both, times: ['17:01'] }
    expect(run(entries, afterHour, expiry.sent, at(17, 1)).reminders.map((item) => item.kind)).toEqual(['time'])
  })

  it('reminds again the next day and keeps only today in its record', () => {
    const first = run([], settings, EMPTY_REMINDER_LOG, at(20))
    const next = run([], settings, first.sent, at(9, 0, 9))
    expect(next.reminders).toHaveLength(1)
    expect(next.sent.timesHandled).toEqual(['2026-10-09 09:00'])
  })
})

describe('stored reminder settings', () => {
  it('fills in defaults and drops anything it cannot use', () => {
    expect(parseReminderSettings(null)).toEqual(DEFAULT_REMINDER_SETTINGS)
    expect(
      parseReminderSettings({ expiryEnabled: true, expiryHours: 40, notify: 'yes', times: ['20:00', '7:5', '08:30', '20:00', 3] }),
    ).toEqual({ ...DEFAULT_REMINDER_SETTINGS, expiryEnabled: true, times: ['08:30', '20:00'] })
    expect(parseReminderSettings({ expiryHours: 3, remindOnExpiry: false }).expiryHours).toBe(3)
    expect(parseReminderLog({ expiryEntryId: 5, expirySentAt: 10, timesHandled: ['x', 1] })).toEqual({
      expiryEntryId: null,
      expirySentAt: 10,
      timesHandled: ['x'],
    })
  })

  it('sorts times and removes repeats', () => {
    expect(normaliseTimes(['21:00', '06:30', '21:00', '25:00'])).toEqual(['06:30', '21:00'])
  })
})
