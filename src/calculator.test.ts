import { describe, expect, it } from 'vitest'
import { calculate, DEFAULT_SETTINGS, type Settings } from './calculator'
import { describeDose } from './format'

const settings: Settings = { ...DEFAULT_SETTINGS }

function dose(
  glucoseMmol: number,
  carbsGrams = 0,
  overrides: Partial<Settings> = {},
  fibreGrams = 0,
) {
  return calculate({
    glucoseMmol,
    carbsGrams,
    fibreGrams,
    settings: { ...settings, ...overrides },
  })
}

describe('correction without food', () => {
  it('leaves a reading inside 4–8 alone', () => {
    for (const glucose of [4, 5.4, 6, 8]) {
      const result = dose(glucose)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.action).toBe('none')
      expect(result.value.insulinUnits).toBe(0)
      expect(result.value.carbGrams).toBe(0)
      expect(result.value.projectedMmol).toBeCloseTo(glucose, 5)
    }
  })

  it('suggests 10 g at 3.0 mmol/L so glucose reaches 6', () => {
    const result = dose(3)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.action).toBe('carbs')
    expect(result.value.carbGrams).toBe(10)
    expect(result.value.projectedMmol).toBeCloseTo(6, 5)
  })

  it('suggests 2 units at 12 mmol/L', () => {
    const result = dose(12)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.action).toBe('insulin')
    expect(result.value.insulinUnits).toBeCloseTo(2, 5)
    expect(result.value.projectedMmol).toBeCloseTo(6, 5)
  })

  it('suggests insulin once glucose is just above 8', () => {
    const result = dose(8.1)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.action).toBe('insulin')
    expect(result.value.insulinUnits).toBeCloseTo(0.7, 5)
    expect(result.value.projectedMmol).toBeCloseTo(6, 1)
  })
})

describe('meals', () => {
  it('covers 30 g at a glucose of 6 with 3 units', () => {
    const result = dose(6, 30)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.action).toBe('insulin')
    expect(result.value.insulinUnits).toBeCloseTo(3, 5)
    expect(result.value.projectedMmol).toBeCloseTo(6, 5)
  })

  it('adds a correction to the meal dose', () => {
    const result = dose(9, 20)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.insulinUnits).toBeCloseTo(3, 5)
    expect(result.value.projectedMmol).toBeCloseTo(6, 5)
  })

  it('uses 1 unit for 10 g when glucose is already on target', () => {
    const result = dose(6, 10)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.insulinUnits).toBeCloseTo(1, 5)
    expect(result.value.projectedMmol).toBeCloseTo(6, 5)
  })

  it('withholds insulin when the meal already finishes inside the range under target', () => {
    const result = dose(4.2, 5)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.action).toBe('none')
    expect(result.value.projectedMmol).toBeCloseTo(5.7, 5)
  })

  it('removes fibre from carbohydrate before the insulin dose', () => {
    const result = dose(6, 30, {}, 10)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.netCarbGrams).toBe(20)
    expect(result.value.insulinUnits).toBeCloseTo(2, 5)
    expect(result.value.projectedMmol).toBeCloseTo(6, 5)
  })

  it('counts no carbohydrate when fibre covers the meal', () => {
    const result = dose(6, 12, {}, 20)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.action).toBe('none')
    expect(result.value.insulinUnits).toBe(0)
    expect(result.value.netCarbGrams).toBe(0)
    expect(result.value.projectedMmol).toBeCloseTo(6, 5)
  })

  it('asks for more carbohydrate when the meal stays below the range', () => {
    const result = dose(2, 2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.action).toBe('carbs')
    expect(result.value.carbGrams).toBe(11)
    expect(result.value.projectedMmol).toBeCloseTo(5.9, 5)
  })
})

describe('pen increments', () => {
  it('picks the half-unit that finishes closest to target inside the range', () => {
    const result = dose(6, 8, { insulinStep: 0.5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.insulinUnits).toBe(1)
    expect(result.value.projectedMmol).toBeCloseTo(5.4, 5)
  })

  it('does not dose a half unit for a tiny meal rise that stays in range', () => {
    const result = dose(6, 2, { insulinStep: 0.5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.action).toBe('none')
    expect(result.value.projectedMmol).toBeCloseTo(6.6, 5)
  })
})

describe('validation', () => {
  it('rejects an empty-looking zero glucose and a target outside the range', () => {
    expect(dose(0).ok).toBe(false)
    expect(dose(6, 0, { targetMmol: 9 }).ok).toBe(false)
  })
})

describe('wording', () => {
  it('keeps the insulin figure on screen and calls out carbohydrate when glucose is low', () => {
    const result = dose(3)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const copy = describeDose(result.value, {
      glucoseMmol: 3,
      carbsGrams: 0,
      settings,
    })
    expect(copy.kicker).toBe('Calculated bolus')
    expect(copy.figure).toBe('0.0')
    expect(copy.unit).toBe('units')
    expect(copy.carbCallout).toBe('Eat 10 g')
    expect(copy.working.some((line) => /should|recheck|sick-day|large amount/i.test(line))).toBe(false)
  })

  it('shows 0 units when glucose is already inside the range', () => {
    const result = dose(6)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const copy = describeDose(result.value, {
      glucoseMmol: 6,
      carbsGrams: 0,
      settings,
    })
    expect(copy.kicker).toBe('Calculated bolus')
    expect(copy.figure).toBe('0.0')
    expect(copy.carbCallout).toBeNull()
  })

  it('describes the same dose in mg/dL', () => {
    const result = dose(12)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const copy = describeDose(result.value, {
      glucoseMmol: 12,
      carbsGrams: 0,
      settings,
      glucoseUnit: 'mgdl',
    })
    expect(copy.figure).toBe('2.0')
    expect(copy.after).toBe('108')
    expect(copy.afterUnit).toBe('mg/dL')
    expect(copy.working.some((line) => line.includes('54 mg/dL'))).toBe(true)
  })

  it('explains that fibre was taken off the carbohydrate', () => {
    const result = dose(6, 30, {}, 10)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const copy = describeDose(result.value, {
      glucoseMmol: 6,
      carbsGrams: 30,
      settings,
    })
    expect(copy.figure).toBe('2.0')
    expect(copy.working.some((line) => line.includes('Fibre removed: 30 g − 10 g = 20 g'))).toBe(true)
  })

  it('omits exact insulin from the working when insulin is not included', () => {
    const result = dose(8.1, 0, { insulinStep: 0.5 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.action).toBe('insulin')
    expect(Math.abs(result.value.exactInsulinUnits - result.value.insulinUnits)).toBeGreaterThan(0.001)
    const withInsulin = describeDose(result.value, {
      glucoseMmol: 8.1,
      carbsGrams: 0,
      settings: { ...settings, insulinStep: 0.5 },
    })
    expect(withInsulin.working.some((line) => line.startsWith('Exact insulin'))).toBe(true)
    const withoutInsulin = describeDose(result.value, {
      glucoseMmol: 8.1,
      carbsGrams: 0,
      settings: { ...settings, insulinStep: 0.5 },
      includeInsulin: false,
    })
    expect(withoutInsulin.working.some((line) => line.startsWith('Exact insulin'))).toBe(false)
  })
})
