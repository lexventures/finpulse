export function calcBlendedCac(
  adSpend: number,
  newCustomers: number
): number | null {
  if (newCustomers <= 0) return null
  return adSpend / newCustomers
}
