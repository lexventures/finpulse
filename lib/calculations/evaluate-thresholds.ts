export type AlertSeverity = 'green' | 'yellow' | 'red'

export function evaluateThreshold(
  value: number | null,
  threshold: {
    green_above: number | null
    yellow_above: number | null
    red_below: number | null
    higher_is_better: boolean
    comparison_type: string
  }
): AlertSeverity | null {
  if (value === null || !Number.isFinite(value)) return null
  if (threshold.comparison_type !== 'absolute') return null

  const { green_above, yellow_above, red_below, higher_is_better } = threshold

  if (higher_is_better) {
    if (green_above !== null && value >= green_above) return 'green'
    if (yellow_above !== null && value >= yellow_above) return 'yellow'
    return 'red'
  }

  // Lower is better — invert the logic:
  // green when value is below the green threshold,
  // red when value is above the red threshold
  if (red_below !== null && value >= red_below) return 'red'
  if (yellow_above !== null && value >= yellow_above) return 'yellow'
  if (green_above !== null && value < green_above) return 'green'
  return 'green'
}
