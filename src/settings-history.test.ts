import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from './calculator'
import { EARLIEST, parseSettingsHistory, recordSettings, settingsAt } from './settings-history'

const at = (minute: number, hour = 9) => new Date(Date.UTC(2026, 9, 12, hour, minute))
const withRise = (mmolRisePer10g: number): Settings => ({ ...DEFAULT_SETTINGS, mmolRisePer10g })

describe('settings history', () => {
  it('dates the first settings from before anything was logged', () => {
    expect(recordSettings([], DEFAULT_SETTINGS, at(0))).toEqual([{ ...DEFAULT_SETTINGS, from: EARLIEST }])
  })

  it('records nothing when the settings are unchanged', () => {
    const history = recordSettings([], DEFAULT_SETTINGS, at(0))
    expect(recordSettings(history, { ...DEFAULT_SETTINGS }, at(30))).toBe(history)
  })

  it('records a change with the date and time it was made', () => {
    const history = recordSettings(recordSettings([], DEFAULT_SETTINGS, at(0)), withRise(4), at(30))
    expect(history).toHaveLength(2)
    expect(history[1]).toEqual({ ...withRise(4), from: at(30).toISOString() })
  })

  it('keeps only where a quick run of changes settled when nothing was logged in between', () => {
    let history = recordSettings(recordSettings([], DEFAULT_SETTINGS, at(0)), withRise(3.1), at(30))
    history = recordSettings(history, withRise(3.2), at(31))
    history = recordSettings(history, withRise(3.3), at(32))
    expect(history.map((change) => [change.mmolRisePer10g, change.from])).toEqual([
      [3, EARLIEST],
      [3.3, at(32).toISOString()],
    ])
  })

  it('leaves no record when a quick run of changes ends where it started', () => {
    const start = recordSettings([], DEFAULT_SETTINGS, at(0))
    const stepped = recordSettings(start, withRise(3.1), at(30))
    expect(recordSettings(stepped, DEFAULT_SETTINGS, at(31))).toEqual(start)
  })

  it('keeps each change when a log entry was made in between, or when they are minutes apart', () => {
    const first = recordSettings(recordSettings([], DEFAULT_SETTINGS, at(0)), withRise(3.1), at(30))
    expect(recordSettings(first, withRise(3.2), at(31), [at(30, 9).toISOString()])).toHaveLength(3)
    expect(recordSettings(first, withRise(3.2), at(36))).toHaveLength(3)
    expect(recordSettings(first, withRise(3.2), at(31), [at(10, 9).toISOString()])).toHaveLength(2)
  })

  it('finds the settings in use when a log entry was made', () => {
    let history = recordSettings([], DEFAULT_SETTINGS, at(0))
    history = recordSettings(history, withRise(4), at(0, 12))
    history = recordSettings(history, withRise(5), at(0, 18))
    expect(settingsAt(history, at(0, 6).toISOString())?.mmolRisePer10g).toBe(3)
    expect(settingsAt(history, at(0, 12).toISOString())?.mmolRisePer10g).toBe(4)
    expect(settingsAt(history, at(59, 17).toISOString())?.mmolRisePer10g).toBe(4)
    expect(settingsAt(history, at(0, 20).toISOString())?.mmolRisePer10g).toBe(5)
    expect(settingsAt([], at(0).toISOString())).toBeNull()
  })

  it('reads a stored history in time order and drops unreadable changes', () => {
    const later = { ...withRise(4), from: at(0, 12).toISOString() }
    const first = { ...DEFAULT_SETTINGS, from: EARLIEST }
    expect(
      parseSettingsHistory([later, { ...DEFAULT_SETTINGS, from: 'soon' }, { from: EARLIEST, targetMmol: 6 }, null, first]),
    ).toEqual([first, later])
    expect(parseSettingsHistory(undefined)).toEqual([])
  })
})
