export function formatAsOfYear(month: string | undefined): string {
  if (!month) return '—'
  return new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
  })
}
