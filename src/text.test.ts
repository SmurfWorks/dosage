import { describe, expect, it } from 'vitest'
import { escapeHtml, parseDecimal } from './text'

describe('text helpers', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<b class="x">Tom & Jo's</b>`)).toBe('&lt;b class=&quot;x&quot;&gt;Tom &amp; Jo&#39;s&lt;/b&gt;')
  })

  it('reads decimals with a point or a comma', () => {
    expect(parseDecimal(' 12 ')).toBe(12)
    expect(parseDecimal('4.5')).toBe(4.5)
    expect(parseDecimal('4,5')).toBe(4.5)
    expect(parseDecimal('.5')).toBe(0.5)
    expect(parseDecimal('7.')).toBe(7)
  })

  it('refuses anything that is not a plain positive number', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('-1')).toBeNull()
    expect(parseDecimal('1e3')).toBeNull()
    expect(parseDecimal('12g')).toBeNull()
    expect(parseDecimal('1.2.3')).toBeNull()
  })
})
