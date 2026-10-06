import { formatBasalUnits, formatCarbs, hasTarget, logMinutesOfDay, type LogEntry } from './log'
import { formatGlucose, glucoseUnitLabel, type GlucoseUnit } from './units'

const WIDTH = 360
const HEIGHT = 168
const LEFT = 42
const RIGHT = 12
const TOP = 16
const BOTTOM = 28
const PLOT_WIDTH = WIDTH - LEFT - RIGHT
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM

export type GraphNeighbours = { before?: LogEntry; after?: LogEntry }
export type GraphRange = { low: number; high: number }

export function dayGraphSvg(
  entries: LogEntry[],
  unit: GlucoseUnit,
  neighbours: GraphNeighbours = {},
  range?: GraphRange,
): string {
  const points = [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const first = points[0]
  const last = points[points.length - 1]
  const startEdge =
    first && neighbours.before
      ? edgeReading(first, neighbours.before, logMinutesOfDay(first.at, first.timeZone))
      : undefined
  const endEdge =
    last && neighbours.after
      ? edgeReading(last, neighbours.after, 1440 - logMinutesOfDay(last.at, last.timeZone))
      : undefined
  const edges = [startEdge, endEdge].filter((value) => value !== undefined)
  const bounds = axisBounds([...points.map((entry) => entry.glucoseMmol), ...edges], range, unit)
  const placed = points.map((entry) => ({
    entry,
    x: xFor(logMinutesOfDay(entry.at, entry.timeZone)),
    y: yFor(entry.glucoseMmol, bounds),
  }))
  const unitLabel = glucoseUnitLabel(unit)
  const neighbourTitle = (entry: LogEntry, day: string) =>
    `${day} ${formatClock(entry)}, ${formatGlucose(entry.glucoseMmol, unit)} ${unitLabel}`
  const trend = (x: number, edge: number, point: { x: number; y: number }, title: string) =>
    `<line class="trend" x1="${x}" y1="${yFor(edge, bounds)}" x2="${point.x}" y2="${point.y}"><title>${escapeXml(title)}</title></line>`
  const trends =
    (startEdge === undefined || !neighbours.before
      ? ''
      : trend(LEFT, startEdge, placed[0], neighbourTitle(neighbours.before, 'Day before,'))) +
    (endEdge === undefined || !neighbours.after
      ? ''
      : trend(LEFT + PLOT_WIDTH, endEdge, placed[placed.length - 1], neighbourTitle(neighbours.after, 'Day after,')))
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
  const rangeBand =
    range === undefined
      ? ''
      : `<rect class="range" x="${LEFT}" y="${yFor(range.high, bounds)}" width="${PLOT_WIDTH}" height="${round(yFor(range.low, bounds) - yFor(range.high, bounds))}"><title>${escapeXml(`Target range ${formatGlucose(range.low, unit)} to ${formatGlucose(range.high, unit)} ${unitLabel}`)}</title></rect>`
  const trace =
    placed.length > 1
      ? `<polyline class="trace" points="${placed.map((point) => `${point.x},${point.y}`).join(' ')}"></polyline>`
      : ''
  const dots = placed
    .map((point) => {
      const reading = `${formatGlucose(point.entry.glucoseMmol, unit)} ${unitLabel}`
      const target = hasTarget(point.entry)
        ? `, aiming for ${formatGlucose(point.entry.targetMmol, unit)} ${unitLabel}`
        : ''
      const carbs =
        point.entry.carbsGrams == null || point.entry.carbsGrams <= 0
          ? ''
          : `, ${formatCarbs(point.entry.carbsGrams)}`
      const note = point.entry.note ? `. ${point.entry.note}` : ''
      const basal =
        point.entry.basalUnits == null || point.entry.basalUnits <= 0
          ? ''
          : `, ${formatBasalUnits(point.entry.basalUnits)}`
      const title = `${formatClock(point.entry)}, ${reading}${target}${carbs}${basal}${note}`
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
  const trendLabel = [
    startEdge === undefined ? '' : 'trend from the day before',
    endEdge === undefined ? '' : 'trend into the day after',
  ]
    .filter(Boolean)
    .join(' and ')
  const label =
    placed.length === 0
      ? '24-hour glucose graph, no readings'
      : `24-hour glucose graph, ${placed.length} ${placed.length === 1 ? 'reading' : 'readings'}${trendLabel ? `, with ${trendLabel}` : ''}`

  return `<svg class="day-graph" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(label)}">${rangeBand}${grid}${horizontals}${trends}${trace}${dots}${xText}${yText}</svg>`
}

function edgeReading(entry: LogEntry, neighbour: LogEntry, minutesToEdge: number): number {
  const gap = Math.abs(Date.parse(entry.at) - Date.parse(neighbour.at)) / 60000
  const share = gap > 0 ? Math.min(1, minutesToEdge / gap) : 1
  return entry.glucoseMmol + (neighbour.glucoseMmol - entry.glucoseMmol) * share
}

function axisBounds(
  readings: number[],
  range: GraphRange | undefined,
  unit: GlucoseUnit,
): { min: number; max: number } {
  if (readings.length === 0 && range === undefined) {
    return unit === 'mgdl' ? { min: 40 / 18, max: 220 / 18 } : { min: 2, max: 12 }
  }
  const values = range === undefined ? readings : [...readings, range.low, range.high]
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
