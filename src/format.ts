import { type Calculation, type Settings } from './calculator'
import { formatGlucose, glucoseUnitLabel, type GlucoseUnit } from './units'

export type DoseCopy = {
  kicker: string
  figure: string
  unit: string
  carbCallout: string | null
  after: string
  working: string[]
}

function trim(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function units(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)))
  return value.toFixed(decimals)
}

export function describeDose(
  calc: Calculation,
  input: { glucoseMmol: number; carbsGrams: number; settings: Settings; glucoseUnit?: GlucoseUnit },
): DoseCopy {
  const { glucoseMmol, carbsGrams, settings } = input
  const { fibreGrams, netCarbGrams } = calc
  const glucoseUnit = input.glucoseUnit ?? 'mmol'
  const unitName = glucoseUnitLabel(glucoseUnit)
  const shown = (value: number) => formatGlucose(value, glucoseUnit)
  const { mmolRisePer10g, insulinStep } = settings
  const projectedMeal = glucoseMmol + calc.mealRiseMmol

  const zeroInsulin = units(0, insulinStep)
  let figure = zeroInsulin
  let unit = 'units'
  let carbCallout: string | null = null

  if (calc.action === 'insulin') {
    figure = units(calc.insulinUnits, insulinStep)
    unit = calc.insulinUnits === 1 ? 'unit' : 'units'
  } else if (calc.action === 'carbs') {
    carbCallout = netCarbGrams > 0 ? `Eat another ${trim(calc.carbGrams)} g` : `Eat ${trim(calc.carbGrams)} g`
  }

  const working = [
    `10 g of carbohydrate raises glucose by ${shown(mmolRisePer10g)} ${unitName} (${shown(calc.mmolPerGram)} ${unitName} per gram).`,
    `1 unit of insulin lowers glucose by ${shown(calc.mmolPerUnit)} ${unitName}.`,
  ]

  if (fibreGrams > 0 && netCarbGrams > 0) {
    working.push(
      `Fibre removed: ${trim(carbsGrams)} g − ${trim(fibreGrams)} g = ${trim(netCarbGrams)} g counted toward the dose.`,
    )
  } else if (fibreGrams > 0) {
    working.push(
      `Fibre removed: ${trim(fibreGrams)} g covers the ${trim(carbsGrams)} g of carbohydrate, so none of it is counted.`,
    )
  }

  if (netCarbGrams > 0) {
    working.push(
      `Meal rise: ${trim(netCarbGrams)} g × ${shown(calc.mmolPerGram)} = ${shown(calc.mealRiseMmol)} ${unitName}, so ${shown(glucoseMmol)} becomes ${shown(projectedMeal)} before insulin.`,
    )
  }

  if (calc.action === 'insulin' && Math.abs(calc.exactInsulinUnits - calc.insulinUnits) > 0.001) {
    working.push(
      `Exact insulin is ${calc.exactInsulinUnits.toFixed(2)} units before the ${trim(insulinStep)} unit increment.`,
    )
  } else if (calc.action === 'carbs' && Math.abs(calc.exactCarbGrams - calc.carbGrams) > 0.05) {
    working.push(`Exact carbohydrate is ${calc.exactCarbGrams.toFixed(1)} g before rounding to the nearest gram.`)
  }

  return {
    kicker: 'Insulin',
    figure,
    unit,
    carbCallout,
    after: `${shown(calc.projectedMmol)} ${unitName}`,
    working,
  }
}
