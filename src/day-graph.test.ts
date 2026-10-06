import { describe, expect, it } from 'vitest'
import { dayGraphSvg } from './day-graph'
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

  it('draws the 24-hour axis when the day has no readings', () => {
    const svg = dayGraphSvg([], 'mmol')
    expect(svg).toContain('>12am<')
    expect(svg).toContain('>12pm<')
    expect(svg).not.toContain('<circle')
    expect(svg).toContain('aria-label="24-hour glucose graph, no readings"')
  })
})
