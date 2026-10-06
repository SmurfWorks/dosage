export type GlucoseUnit = 'mmol' | 'mgdl'

/** Clinical conversion used by glucose meters: 1 mmol/L = 18 mg/dL. */
export const MGDL_PER_MMOL = 18

export function glucoseUnitLabel(unit: GlucoseUnit): string {
  return unit === 'mgdl' ? 'mg/dL' : 'mmol/L'
}

export function formatGlucose(mmolValue: number, unit: GlucoseUnit): string {
  if (unit === 'mmol') return mmolValue.toFixed(1)
  const mg = Math.round(mmolValue * MGDL_PER_MMOL * 10) / 10
  return Number.isInteger(mg) ? String(mg) : mg.toFixed(1)
}
