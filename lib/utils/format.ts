const EM_DASH = '\u2014'

function isBadNumber(value: unknown): value is null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value !== 'number' ||
    !Number.isFinite(value)
  )
}

const currencyWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const currencyDecimal = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const countFmt = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

export function formatCurrency(value: number | null): string {
  if (isBadNumber(value)) return EM_DASH
  return Math.abs(value) >= 1000
    ? currencyWhole.format(value)
    : currencyDecimal.format(value)
}

export function formatPercent(value: number | null): string {
  if (isBadNumber(value)) return EM_DASH
  return `${percentFmt.format(value)}%`
}

export function formatCount(value: number | null): string {
  if (isBadNumber(value)) return EM_DASH
  return countFmt.format(value)
}

export interface DeltaResult {
  text: string
  direction: 'positive' | 'negative' | 'neutral'
}

export function formatDelta(
  value: number | null,
  type: 'currency' | 'percent'
): DeltaResult {
  if (isBadNumber(value)) {
    return { text: EM_DASH, direction: 'neutral' }
  }

  const sign = value > 0 ? '+' : ''
  let text: string

  if (type === 'currency') {
    const abs = Math.abs(value)
    const formatted =
      abs >= 1000
        ? currencyWhole.format(abs)
        : currencyDecimal.format(abs)
    text = value < 0 ? `-${formatted}` : `+${formatted}`
  } else {
    text = `${sign}${percentFmt.format(value)}%`
  }

  const direction: DeltaResult['direction'] =
    value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'

  return { text, direction }
}

export function formatCompact(value: number | null): string {
  if (isBadNumber(value)) return EM_DASH

  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000
    return `${sign}$${millions.toFixed(1)}M`
  }
  if (abs >= 1_000) {
    const thousands = abs / 1_000
    return `${sign}$${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1)}K`
  }
  return `${sign}$${Math.round(abs)}`
}
