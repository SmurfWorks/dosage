import { describe, expect, it } from 'vitest'
import {
  FIRST_TIMEZONE,
  chosenTimezone,
  formatGmtOffset,
  orderTimeZones,
  supportedTimeZones,
  timezoneChoices,
  timezoneOffsetMinutes,
} from './timezone'

const at = new Date('2026-10-12T12:00:00Z')

describe('timezones', () => {
  it('reads the offset from GMT, including New Zealand daylight time', () => {
    expect(timezoneOffsetMinutes('Pacific/Auckland', at)).toBe(13 * 60)
    expect(timezoneOffsetMinutes('Pacific/Chatham', at)).toBe(13 * 60 + 45)
    expect(timezoneOffsetMinutes('Pacific/Kiritimati', at)).toBe(14 * 60)
    expect(timezoneOffsetMinutes('America/Los_Angeles', at)).toBe(-7 * 60)
    expect(formatGmtOffset(13 * 60)).toBe('GMT+13:00')
    expect(formatGmtOffset(13 * 60 + 45)).toBe('GMT+13:45')
    expect(formatGmtOffset(-7 * 60)).toBe('GMT-07:00')
    expect(formatGmtOffset(0)).toBe('GMT+00:00')
  })

  it('starts with New Zealand and then follows the offset from GMT', () => {
    const ordered = orderTimeZones([
      { id: 'Pacific/Kiritimati', offsetMinutes: 14 * 60 },
      { id: 'Pacific/Chatham', offsetMinutes: 13 * 60 + 45 },
      { id: 'Pacific/Apia', offsetMinutes: 13 * 60 },
      { id: 'Pacific/Auckland', offsetMinutes: 13 * 60 },
      { id: 'Europe/London', offsetMinutes: 60 },
      { id: 'UTC', offsetMinutes: 0 },
      { id: 'America/Los_Angeles', offsetMinutes: -7 * 60 },
    ])

    expect(ordered.map((zone) => zone.id)).toEqual([
      'Pacific/Auckland',
      'Europe/London',
      'UTC',
      'America/Los_Angeles',
      'Pacific/Kiritimati',
      'Pacific/Chatham',
      'Pacific/Apia',
    ])
  })

  it('lists real timezones from New Zealand, with the offset beside each name', () => {
    const choices = timezoneChoices(supportedTimeZones(), at)
    expect(choices[0]).toMatchObject({ id: FIRST_TIMEZONE, label: 'Pacific/Auckland (GMT+13:00)' })
    let wrapped = false
    for (let index = 1; index < choices.length; index += 1) {
      const previous = choices[index - 1].offsetMinutes
      const next = choices[index].offsetMinutes
      if (next > previous) {
        expect(wrapped).toBe(false)
        wrapped = true
      } else {
        expect(next).toBeLessThanOrEqual(previous)
      }
    }
    expect(wrapped).toBe(true)
  })

  it('keeps a saved timezone and otherwise uses the one on this device', () => {
    const zones = ['Pacific/Auckland', 'America/Los_Angeles', 'UTC']
    expect(chosenTimezone('America/Los_Angeles', 'Pacific/Auckland', zones)).toBe('America/Los_Angeles')
    expect(chosenTimezone(null, 'America/Los_Angeles', zones)).toBe('America/Los_Angeles')
    expect(chosenTimezone('Not/Azone', 'Also/Missing', zones)).toBe('Pacific/Auckland')
  })
})
