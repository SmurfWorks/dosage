import { isBasalPeriod, periodLabel } from './basal'
import { formatCarbs, formatInsulin, insulinStepFor, logMinutesOfDay, type LogEntry } from './log'
import { formatGlucose, glucoseUnitLabel, type GlucoseUnit } from './units'

const WIDTH = 360
const HEIGHT = 168
const LEFT = 42
const RIGHT = 12
const TOP = 16
const BOTTOM = 28
const PLOT_WIDTH = WIDTH - LEFT - RIGHT
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM

export function dayGraphSvg(entries: LogEntry[], unit: GlucoseUnit): string {
  const points = [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const target = points[points.length - 1]?.targetMmol
  const bounds = axisBounds(points.map((entry) => entry.glucoseMmol), target, unit)
  const placed = points.map((entry) => ({
    entry,
    x: xFor(logMinutesOfDay(entry.at, entry.timeZone)),
    y: yFor(entry.glucoseMmol, bounds),
  }))
  const unitLabel = glucoseUnitLabel(unit)
  const yLabels = [bounds.max, (bounds.min + bounds.max) / 2, bounds.min]
  const grid = [0, 6, 12, 18, 24]
    .map((hour) => {
      const x = xFor(hour * 60)
      return `<line class="grid" x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + PLOT_HEIGHT}"></line>`
    })
    .join('')
  const horizontals = yLabels
    .map((value) => {
      const y = yFor(value, bounds)
      return `<line class="grid" x1="${LEFT}" y1="${y}" x2="${LEFT + PLOT_WIDTH}" y2="${y}"></line>`
    })
    .join('')
  const targetLine =
    target === undefined
      ? ''
      : `<line class="target" x1="${LEFT}" y1="${yFor(target, bounds)}" x2="${LEFT + PLOT_WIDTH}" y2="${yFor(target, bounds)}"></line>`
  const trace =
    placed.length > 1
      ? `<polyline class="trace" points="${placed.map((point) => `${point.x},${point.y}`).join(' ')}"></polyline>`
      : ''
  const dots = placed
    .map((point) => {
      const reading = `${formatGlucose(point.entry.glucoseMmol, unit)} ${unitLabel}`
      const carbs = point.entry.carbsGrams === null ? '' : `, ${formatCarbs(point.entry.carbsGrams)}`
      const note = point.entry.note ? `. ${point.entry.note}` : ''
      const period = isBasalPeriod(point.entry.basalPeriod) ? `, ${periodLabel(point.entry.basalPeriod)}` : ''
      const basal =
        point.entry.basalUnits == null
          ? ''
          : `, with ${formatInsulin(point.entry.basalUnits, insulinStepFor(point.entry.basalUnits))} basal${period}`
      const title = `${formatClock(point.entry)}, ${reading}${carbs}${basal}${note}`
      return `<circle class="point" cx="${point.x}" cy="${point.y}" r="4"><title>${escapeXml(title)}</title></circle>`
    })
    .join('')
  const xText = gridLabels()
  const yText = yLabels
    .map((value) => {
      const y = yFor(value, bounds)
      return `<text class="ylabel" x="${LEFT - 8}" y="${y + 4}" text-anchor="end">${escapeXml(formatGlucose(value, unit))}</text>`
    })
    .join('')
  const label =
    placed.length === 0
      ? '24-hour glucose graph, no readings'
      : `24-hour glucose graph, ${placed.length} ${placed.length === 1 ? 'reading' : 'readings'}`

  return `<svg class="day-graph" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(label)}">${grid}${horizontals}${targetLine}${trace}${dots}${xText}${yText}</svg>`
}

function axisBounds(
  readings: number[],
  target: number | undefined,
  unit: GlucoseUnit,
): { min: number; max: number } {
  if (readings.length === 0 && target === undefined) {
    return unit === 'mgdl' ? { min: 40 / 18, max: 220 / 18 } : { min: 2, max: 12 }
  }
  const values = target === undefined ? readings : [...readings, target]
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (max - min < 4) {
    const mid = (min + max) / 2
    min = mid - 2
    max = mid + 2
  }
  const pad = (max - min) * 0.08
  min = Math.max(0, min - pad)
  max += pad
  if (unit === 'mgdl') {
    const minMg = Math.floor((min * 18) / 10) * 10
    const maxMg = Math.max(minMg + 20, Math.ceil((max * 18) / 10) * 10)
    return { min: minMg / 18, max: maxMg / 18 }
  }
  min = Math.max(0, Math.floor(min))
  max = Math.max(min + 2, Math.ceil(max))
  return { min, max }
}

function xFor(minutes: number): number {
  return round(LEFT + (minutes / 1440) * PLOT_WIDTH)
}

function yFor(mmol: number, bounds: { min: number; max: number }): number {
  const span = bounds.max - bounds.min || 1
  return round(TOP + (1 - (mmol - bounds.min) / span) * PLOT_HEIGHT)
}

function gridLabels(): string {
  return [0, 6, 12, 18, 24]
    .map((hour) => {
      const x = xFor(hour * 60)
      const anchor = hour === 0 ? 'start' : hour === 24 ? 'end' : 'middle'
      return `<text class="xlabel" x="${x}" y="${HEIGHT - 8}" text-anchor="${anchor}">${hourLabel(hour)}</text>`
    })
    .join('')
}

function hourLabel(hour: number): string {
  const normalized = hour % 24
  const suffix = normalized < 12 ? 'am' : 'pm'
  const hour12 = normalized % 12 === 0 ? 12 : normalized % 12
  return `${hour12}${suffix}`
}

function formatClock(entry: LogEntry): string {
  const date = new Date(entry.at)
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: entry.timeZone,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return map[char] ?? char
  })
}
