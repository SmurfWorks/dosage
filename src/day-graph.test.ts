import { describe, expect, it } from 'vitest'
import { curvePath, dayGraphSvg, stepPath } from './day-graph'
import type { LogEntry } from './log'

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: '1',
    at: '2026-10-05T12:00:00.000Z',
    timeZone: 'UTC',
    glucoseMmol: 6,
    insulinUnits: 0,
    insulinStep: 0.1,
    targetMmol: 6,
    carbsGrams: 0,
    note: '',
    basalUnits: null,
    basalPeriod: null,
    ...overrides,
  }
}

function point(svg: string, index: number): { x: number; y: number } {
  const circles = [...svg.matchAll(/cx="([\d.]+)" cy="([\d.]+)"/g)]
  const match = circles[index]
  if (!match) throw new Error(`missing point ${index}`)
  return { x: Number(match[1]), y: Number(match[2]) }
}

describe('24-hour log graph', () => {
  it('puts midnight at the left and the next midnight at the right', () => {
    const svg = dayGraphSvg(
      [
        entry({ id: 'start', at: '2026-10-05T00:00:00.000Z' }),
        entry({ id: 'end', at: '2026-10-05T23:59:00.000Z', glucoseMmol: 8 }),
      ],
      'mmol',
    )
    expect(svg).toContain('>12am<')
    expect(svg).toContain('>6pm<')
    expect(svg).not.toContain('>0<')
    expect(svg).not.toContain('>24<')
    expect(point(svg, 0).x).toBeLessThan(50)
    expect(point(svg, 1).x).toBeGreaterThan(330)
  })

  it('draws a higher glucose further up the day', () => {
    const svg = dayGraphSvg(
      [
        entry({ id: 'low', at: '2026-10-05T08:00:00.000Z', glucoseMmol: 4 }),
        entry({ id: 'high', at: '2026-10-05T20:00:00.000Z', glucoseMmol: 14 }),
      ],
      'mmol',
    )
    expect(point(svg, 1).y).toBeLessThan(point(svg, 0).y)
    expect(point(svg, 1).x).toBeGreaterThan(point(svg, 0).x)
  })

  it('keeps an evening reading on the local afternoon-to-night side', () => {
    const svg = dayGraphSvg(
      [entry({ at: '2026-10-06T06:30:00.000Z', timeZone: 'America/Los_Angeles', glucoseMmol: 12 })],
      'mmol',
    )
    expect(point(svg, 0).x).toBeGreaterThan(280)
    expect(svg).toContain('aria-label="24-hour glucose graph, 1 reading"')
  })

  it('keeps glucose labels fully left of the plot', () => {
    const svg = dayGraphSvg([entry()], 'mmol')
    const plotLeft = Number(svg.match(/<line class="grid" x1="([\d.]+)"/)?.[1])
    const labels = [...svg.matchAll(/class="ylabel" x="([\d.]+)"[^>]*text-anchor="end"/g)]
    expect(labels.length).toBe(3)
    for (const label of labels) expect(Number(label[1])).toBeLessThan(plotLeft)
  })

  it('draws trend lines from the day before and into the day after', () => {
    const svg = dayGraphSvg(
      [
        entry({ id: 'first', at: '2026-10-05T06:00:00.000Z', glucoseMmol: 6 }),
        entry({ id: 'last', at: '2026-10-05T18:00:00.000Z', glucoseMmol: 8 }),
      ],
      'mmol',
      {
        before: entry({ id: 'before', at: '2026-10-04T18:00:00.000Z', glucoseMmol: 10 }),
        after: entry({ id: 'after', at: '2026-10-06T06:00:00.000Z', glucoseMmol: 4 }),
      },
    )
    const trends = [...svg.matchAll(/<line class="trend" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)]
    expect(trends.length).toBe(2)
    const [start, end] = trends.map((match) => match.slice(1).map(Number))
    expect(start[0]).toBe(42)
    expect(start[2]).toBe(point(svg, 0).x)
    expect(start[1]).toBeLessThan(point(svg, 0).y)
    expect(end[0]).toBe(348)
    expect(end[2]).toBe(point(svg, 1).x)
    expect(end[1]).toBeGreaterThan(point(svg, 1).y)
    expect(svg).toContain('Day before,')
    expect(svg).toContain('with trend from the day before and trend into the day after')
  })

  it('shades the target range behind the readings', () => {
    const svg = dayGraphSvg([entry({ glucoseMmol: 10 })], 'mmol', {}, { low: 4, high: 8 })
    const band = svg.match(/<rect class="range" x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/)
    expect(band).not.toBeNull()
    const top = Number(band![1])
    expect(top).toBeGreaterThan(point(svg, 0).y)
    expect(svg).toContain('Target range 4.0 to 8.0 mmol/L')
    expect(svg).not.toContain('class="target"')
  })

  it('draws no trend lines without neighbouring days', () => {
    expect(dayGraphSvg([entry()], 'mmol')).not.toContain('class="trend"')
  })

  it('draws the 24-hour axis when the day has no readings', () => {
    const svg = dayGraphSvg([], 'mmol')
    expect(svg).toContain('>12am<')
    expect(svg).toContain('>12pm<')
    expect(svg).not.toContain('<circle')
    expect(svg).toContain('aria-label="24-hour glucose graph, no readings"')
  })

  it('draws the readings as a curve through each point', () => {
    const svg = dayGraphSvg(
      [
        entry({ id: 'a', at: '2026-10-05T06:00:00.000Z', glucoseMmol: 5 }),
        entry({ id: 'b', at: '2026-10-05T12:00:00.000Z', glucoseMmol: 9 }),
        entry({ id: 'c', at: '2026-10-05T18:00:00.000Z', glucoseMmol: 7 }),
      ],
      'mmol',
    )
    const trace = svg.match(/<path class="trace" d="([^"]+)"/)
    expect(trace).not.toBeNull()
    expect(trace![1]).toContain(' C')
    for (const index of [0, 1, 2]) {
      const { x, y } = point(svg, index)
      expect(trace![1]).toContain(`${x},${y}`)
    }
  })

  it('draws a dotted step line through the target of each entry, carrying a maintained target', () => {
    const svg = dayGraphSvg(
      [
        entry({ id: 'a', at: '2026-10-05T01:00:00.000Z', targetMmol: null }),
        entry({ id: 'b', at: '2026-10-05T06:00:00.000Z', glucoseMmol: 9, insulinUnits: 1, targetMmol: 6 }),
        entry({ id: 'c', at: '2026-10-05T12:00:00.000Z', glucoseMmol: 7, targetMmol: null }),
        entry({ id: 'd', at: '2026-10-05T18:00:00.000Z', glucoseMmol: 5, carbsGrams: 40, targetMmol: 11 }),
      ],
      'mmol',
    )
    const line = svg.match(/<path class="target-line" d="([^"]+)"/)
    expect(line).not.toBeNull()
    const b = point(svg, 1)
    const c = point(svg, 2)
    const d = point(svg, 3)
    // Starts at the first entry with a target, holds it level through the maintained entry, then steps up.
    const level = Number(line![1].match(/^M[\d.]+,([\d.]+)/)![1])
    expect(line![1]).toBe(`M${b.x},${level} H${c.x} V${level} H${d.x} V${line![1].split(' V').pop()}`)
    const top = Number(line![1].split(' V').pop())
    // The 11 mmol/L target sits above every reading, so the axis grows to fit it.
    expect(top).toBeLessThan(b.y)
    expect(svg).toContain('with a dotted target line')
  })

  it('draws no target line with fewer than two targets', () => {
    expect(dayGraphSvg([entry()], 'mmol')).not.toContain('target-line')
    expect(dayGraphSvg([entry({ targetMmol: null }), entry({ id: '2', at: '2026-10-05T13:00:00.000Z', targetMmol: null })], 'mmol')).not.toContain('target-line')
  })

  it('steps the target straight from one level to the next', () => {
    expect(
      stepPath([
        { x: 10, y: 50 },
        { x: 40, y: 30 },
        { x: 70, y: 30 },
      ]),
    ).toBe('M10,50 H40 V30 H70 V30')
  })

  it('curves without overshooting the points either side', () => {
    const path = curvePath([
      { x: 0, y: 100 },
      { x: 10, y: 20 },
      { x: 20, y: 20 },
      { x: 40, y: 80 },
    ])
    const ys = [...path.matchAll(/,(-?[\d.]+)/g)].map((match) => Number(match[1]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(20)
    expect(Math.max(...ys)).toBeLessThanOrEqual(100)
    expect(curvePath([{ x: 0, y: 1 }, { x: 5, y: 2 }])).toBe('M0,1 L5,2')
  })
})
