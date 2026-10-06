import type { GlucoseUnit } from './units'

export const DEFAULT_SETTINGS = {
  rangeLow: 4,
  rangeHigh: 8,
  targetMmol: 6,
  mmolRisePer10g: 3,
  mmolFallPerUnit: 3,
  insulinStep: 0.1,
} as const

export type Settings = {
  rangeLow: number
  rangeHigh: number
  targetMmol: number
  mmolRisePer10g: number
  mmolFallPerUnit: number
  insulinStep: number
}

export type DoseAction = 'insulin' | 'carbs' | 'none'

export type Calculation = {
  action: DoseAction
  insulinUnits: number
  carbGrams: number
  fibreGrams: number
  netCarbGrams: number
  projectedMmol: number
  mealRiseMmol: number
  insulinFallMmol: number
  carbRiseMmol: number
  mmolPerGram: number
  mmolPerUnit: number
  exactInsulinUnits: number
  exactCarbGrams: number
}

export type CalcResult =
  | { ok: true; value: Calculation }
  | { ok: false; message: string }

const EPS = 1e-6

export function roundToStep(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(value)) return value
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))
  const rounded = Math.round(value / step) * step
  return Number(rounded.toFixed(decimals))
}

function candidateDoses(exact: number, step: number): number[] {
  const maxIndex = Math.max(0, Math.ceil((exact + step) / step))
  const doses: number[] = []
  for (let i = 0; i <= maxIndex; i++) {
    doses.push(roundToStep(i * step, step))
  }
  return [...new Set(doses)]
}

function pickDose(
  doses: number[],
  endFor: (dose: number) => number,
  target: number,
  low: number,
  high: number,
): number {
  const inRange = doses.filter((dose) => {
    const end = endFor(dose)
    return end >= low - EPS && end <= high + EPS
  })
  const pool = inRange.length > 0 ? inRange : doses
  return pool.reduce((best, dose) => {
    const doseDistance = Math.abs(endFor(dose) - target)
    const bestDistance = Math.abs(endFor(best) - target)
    if (doseDistance < bestDistance - EPS) return dose
    if (Math.abs(doseDistance - bestDistance) <= EPS && dose < best) return dose
    return best
  })
}

function isFiniteNumber(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

export function calculate(input: {
  glucoseMmol: number
  carbsGrams: number
  fibreGrams?: number
  settings: Settings
  glucoseUnit?: GlucoseUnit
}): CalcResult {
  const { glucoseMmol, carbsGrams, settings } = input
  const fibreGrams = input.fibreGrams ?? 0
  const glucoseUnit = input.glucoseUnit ?? 'mmol'
  const {
    rangeLow,
    rangeHigh,
    targetMmol,
    mmolRisePer10g,
    mmolFallPerUnit,
    insulinStep,
  } = settings

  if (!isFiniteNumber(glucoseMmol) || glucoseMmol <= 0 || glucoseMmol > 40) {
    const limit = glucoseUnit === 'mgdl' ? '720 mg/dL' : '40 mmol/L'
    return { ok: false, message: `Enter a glucose reading above 0 and up to ${limit}.` }
  }
  if (!isFiniteNumber(carbsGrams) || carbsGrams < 0 || carbsGrams > 500) {
    return { ok: false, message: 'Enter carbohydrate from 0 to 500 grams.' }
  }
  if (!isFiniteNumber(fibreGrams) || fibreGrams < 0 || fibreGrams > 500) {
    return { ok: false, message: 'Enter fibre from 0 to 500 grams.' }
  }
  if (
    !isFiniteNumber(rangeLow) ||
    !isFiniteNumber(rangeHigh) ||
    rangeLow <= 0 ||
    rangeHigh <= rangeLow ||
    rangeHigh > 30
  ) {
    return { ok: false, message: 'Set a range where the low number is below the high number.' }
  }
  if (!isFiniteNumber(targetMmol) || targetMmol < rangeLow || targetMmol > rangeHigh) {
    return { ok: false, message: 'Keep the target inside your glucose range.' }
  }
  if (!isFiniteNumber(mmolRisePer10g) || mmolRisePer10g <= 0 || mmolRisePer10g > 30) {
    return { ok: false, message: 'Enter how much 10 grams of carbohydrate raises your glucose.' }
  }
  if (!isFiniteNumber(mmolFallPerUnit) || mmolFallPerUnit <= 0 || mmolFallPerUnit > 30) {
    return { ok: false, message: 'Enter how much 1 unit of insulin lowers your glucose.' }
  }
  if (!isFiniteNumber(insulinStep) || insulinStep <= 0 || insulinStep > 5) {
    return { ok: false, message: 'Choose an insulin increment greater than 0.' }
  }

  const mmolPerGram = mmolRisePer10g / 10
  const mmolPerUnit = mmolFallPerUnit
  const rawNetCarbs = Math.max(0, carbsGrams - fibreGrams)
  const netCarbGrams = rawNetCarbs <= EPS ? 0 : rawNetCarbs
  const mealRiseMmol = netCarbGrams * mmolPerGram
  const projectedFromMeal = glucoseMmol + mealRiseMmol
  const exactInsulinUnits = (projectedFromMeal - targetMmol) / mmolPerUnit

  let action: DoseAction = 'none'
  let insulinUnits = 0
  let carbGrams = 0
  let exactCarbGrams = 0

  if (netCarbGrams === 0) {
    if (glucoseMmol < rangeLow) {
      action = 'carbs'
      exactCarbGrams = (targetMmol - glucoseMmol) / mmolPerGram
    } else if (glucoseMmol > rangeHigh) {
      action = 'insulin'
    }
  } else if (exactInsulinUnits > EPS) {
    action = 'insulin'
  } else if (projectedFromMeal < rangeLow - EPS) {
    action = 'carbs'
    exactCarbGrams = (targetMmol - projectedFromMeal) / mmolPerGram
  }

  if (action === 'insulin') {
    const exact = Math.max(0, exactInsulinUnits)
    insulinUnits = pickDose(
      candidateDoses(exact, insulinStep),
      (dose) => projectedFromMeal - dose * mmolPerUnit,
      targetMmol,
      rangeLow,
      rangeHigh,
    )
    if (insulinUnits <= EPS) {
      action = 'none'
      insulinUnits = 0
    }
  }

  if (action === 'carbs') {
    carbGrams = pickDose(
      candidateDoses(Math.max(0, exactCarbGrams), 1),
      (dose) => projectedFromMeal + dose * mmolPerGram,
      targetMmol,
      rangeLow,
      rangeHigh,
    )
    if (carbGrams <= EPS) {
      action = 'none'
      carbGrams = 0
    }
  }

  const insulinFallMmol = insulinUnits * mmolPerUnit
  const carbRiseMmol = carbGrams * mmolPerGram
  const projectedMmol = projectedFromMeal + carbRiseMmol - insulinFallMmol

  return {
    ok: true,
    value: {
      action,
      insulinUnits,
      carbGrams,
      fibreGrams,
      netCarbGrams,
      projectedMmol,
      mealRiseMmol,
      insulinFallMmol,
      carbRiseMmol,
      mmolPerGram,
      mmolPerUnit,
      exactInsulinUnits,
      exactCarbGrams,
    },
  }
}
