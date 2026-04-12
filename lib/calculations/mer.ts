export function calcMer(
  revenue: number,
  adSpend: number
): number | null {
  if (adSpend === 0) return null
  return revenue / adSpend
}
