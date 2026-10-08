export function escapeHtml(value: string): string {
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

/** Reads a typed number, accepting a comma as the decimal point. */
export function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}
