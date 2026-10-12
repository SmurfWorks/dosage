import { describe, expect, it } from 'vitest'
import type { LogEntry } from './log'
import {
  activeHours,
  DEFAULT_REMINDER_SETTINGS,
  describeNextReminder,
  dueReminders,
  EMPTY_REMINDER_LOG,
  hasActiveTarget,
  nextReminder,
  normaliseTimes,
  parseReminderLog,
  parseReminderSettings,
  scheduledReminders,
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

/** A glucose reading with no carbs or bolus, which carries the earlier target forward. */
function reading(id: string, when: Date): LogEntry {
  return { ...entry(id, when, 0), carbsGrams: 0, targetMmol: null }
}

const on: ReminderSettings = { ...DEFAULT_REMINDER_SETTINGS, expiryEnabled: true, notify: true }

function run(entries: LogEntry[], settings: ReminderSettings, sent: ReminderLog, now: Date) {
  return dueReminders(entries, settings, sent, now)
}

describe('target expiry', () => {
  it('uses the expiry hours for the recent bolus warning only while expiry is on', () => {
    expect(activeHours({ ...on, expiryHours: 3 })).toBe(3)
    expect(activeHours({ ...on, expiryEnabled: false, expiryHours: 3 })).toBe(4)
  })

  it('counts a target set in the expiry window as an active target', () => {
    const entries = [entry('lunch', at(12))]
    expect(hasActiveTarget(entries, at(15, 59), 4)).toBe(true)
    expect(hasActiveTarget(entries, at(16), 4)).toBe(false)
    expect(hasActiveTarget(entries, at(11, 59), 4)).toBe(false)
  })

  it('does not count a reading logged on its own as an active target', () => {
    const entries = [entry('lunch', at(12)), reading('check', at(15))]
    expect(hasActiveTarget(entries, at(17), 4)).toBe(false)
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
        title: 'Time to update your target',
        body: 'Your last bolus should be wearing off - please test again and update your target.',
        tag: 'target-expiry',
      },
    ])
    expect(first.sent.expirySentAt).toBe(at(16, 2).getTime())
    expect(run(entries, on, first.sent, at(16, 5)).reminders).toEqual([])
  })

  it('leaves the bolus amount out, so the reminder server never sees a dose', () => {
    const one = [entry('lunch', at(12), 1.5)]
    expect(run(one, on, EMPTY_REMINDER_LOG, at(16)).reminders[0].body).not.toMatch(/\d/)
  })

  it('talks about the meal when the entry had carbs but no bolus, and follows the hours setting', () => {
    const meal = [entry('lunch', at(12), 0)]
    expect(run(meal, { ...on, expiryHours: 1 }, EMPTY_REMINDER_LOG, at(13)).reminders[0].body).toBe(
      "It's been 1 hour since you ate - please test again and update your target.",
    )
  })

  it('keeps the expiry of the last target when a reading is logged after it', () => {
    const withReading = [...entries, reading('check', at(14))]
    expect(run(withReading, on, EMPTY_REMINDER_LOG, at(16, 1)).reminders).toHaveLength(1)
    expect(scheduledReminders(withReading, on, EMPTY_REMINDER_LOG, at(15))[0].deliverAt).toBe(at(16).toISOString())
  })

  it('sends no expiry reminder for readings alone', () => {
    expect(run([reading('check', at(12))], on, EMPTY_REMINDER_LOG, at(16)).reminders).toEqual([])
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
    expect(parseReminderSettings({ pushUrl: ' https://push.example/ ', pushToken: ' secret ' })).toMatchObject({
      pushUrl: 'https://push.example',
      pushToken: 'secret',
    })
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

describe('reminders booked on the server', () => {
  const entries = [entry('lunch', at(12))]

  it('books the expiry at the moment the target expires, with the same words', () => {
    expect(scheduledReminders(entries, on, EMPTY_REMINDER_LOG, at(13))).toEqual([
      {
        key: 'expiry',
        deliverAt: at(16).toISOString(),
        title: 'Time to update your target',
        body: 'Your last bolus should be wearing off - please test again and update your target.',
        tag: 'target-expiry',
      },
    ])
  })

  it('still books an expiry inside the 30 minute grace, and drops one that is later', () => {
    expect(scheduledReminders(entries, on, EMPTY_REMINDER_LOG, at(16, 10))[0].deliverAt).toBe(
      at(16).toISOString(),
    )
    expect(scheduledReminders(entries, on, EMPTY_REMINDER_LOG, at(16, 31))).toEqual([])
  })

  it('does not book an expiry that has already been dealt with', () => {
    const sent = { ...EMPTY_REMINDER_LOG, expiryEntryId: 'lunch' }
    expect(scheduledReminders(entries, on, sent, at(13))).toEqual([])
  })

  it('books each timed reminder for the next 7 days when no target is active', () => {
    const settings = { ...on, remindOnExpiry: false, times: ['09:00'] }
    const booked = scheduledReminders([], settings, EMPTY_REMINDER_LOG, at(8))
    expect(booked.map((item) => item.deliverAt)).toEqual([
      at(9, 0, 8).toISOString(),
      at(9, 0, 9).toISOString(),
      at(9, 0, 10).toISOString(),
      at(9, 0, 11).toISOString(),
      at(9, 0, 12).toISOString(),
      at(9, 0, 13).toISOString(),
      at(9, 0, 14).toISOString(),
    ])
    expect(booked[0]).toMatchObject({
      key: 'time-2026-10-08-09:00',
      title: 'No active target',
      tag: 'reminder-09:00',
    })
  })

  it('skips a time covered by an active target, and the hour after an expiry', () => {
    const settings = { ...on, times: ['15:00', '16:30', '17:01'] }
    const keys = scheduledReminders(entries, settings, EMPTY_REMINDER_LOG, at(13)).map((item) => item.key)
    expect(keys).toContain('expiry')
    expect(keys).not.toContain('time-2026-10-08-15:00')
    expect(keys).not.toContain('time-2026-10-08-16:30')
    expect(keys).toContain('time-2026-10-08-17:01')
    expect(keys).toContain('time-2026-10-09-15:00')
    expect(keys).toContain('time-2026-10-09-16:30')
  })

  it('does not book a time already dealt with today', () => {
    const settings = { ...on, remindOnExpiry: false, times: ['09:00'] }
    const sent = { ...EMPTY_REMINDER_LOG, timesHandled: ['2026-10-08 09:00'] }
    const keys = scheduledReminders([], settings, sent, at(9, 10)).map((item) => item.key)
    expect(keys).not.toContain('time-2026-10-08-09:00')
    expect(keys).toContain('time-2026-10-09-09:00')
  })

  it('books nothing when reminders are off', () => {
    expect(scheduledReminders(entries, { ...on, notify: false }, EMPTY_REMINDER_LOG, at(13))).toEqual([])
    expect(scheduledReminders(entries, { ...on, expiryEnabled: false }, EMPTY_REMINDER_LOG, at(13))).toEqual(
      [],
    )
  })
})

describe('next reminder message', () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const booked = (key: string, when: Date) => ({ key, deliverAt: when.toISOString(), title: '', body: '', tag: '' })
  const time = (when: Date) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).format(when)

  it('picks the earliest reminder still to come', () => {
    const items = [booked('time-2026-10-09-09:00', at(9, 0, 9)), booked('expiry', at(16)), booked('time-2026-10-08-09:00', at(9))]
    expect(nextReminder(items, at(13))?.key).toBe('expiry')
  })

  it('names a target expiry today', () => {
    expect(describeNextReminder(booked('expiry', at(16)), at(13), zone)).toBe(
      `Next reminder: today at ${time(at(16))}, when your target expires.`,
    )
  })

  it('says tomorrow, then the weekday, for timed reminders', () => {
    expect(describeNextReminder(booked('time-2026-10-09-09:00', at(9, 0, 9)), at(13), zone)).toBe(
      `Next reminder: tomorrow at ${time(at(9, 0, 9))}.`,
    )
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: zone }).format(at(9, 0, 11))
    expect(describeNextReminder(booked('time-2026-10-11-09:00', at(9, 0, 11)), at(13), zone)).toBe(
      `Next reminder: ${weekday} at ${time(at(9, 0, 11))}.`,
    )
  })

  it('says when nothing is booked', () => {
    expect(nextReminder([], at(13))).toBeNull()
    expect(describeNextReminder(null, at(13), zone)).toBe('No reminders are due in the next 7 days.')
  })
})
