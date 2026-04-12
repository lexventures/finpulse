import { createServiceClient } from '@/lib/supabase/server'

const ALL_PROTECTABLE_PAGES = [
  { path: '/team', label: 'Team (Headcount & Labor)' },
  { path: '/scenarios', label: 'Scenarios' },
  { path: '/cash', label: 'Cash Flow' },
  { path: '/settings', label: 'Settings' },
  { path: '/', label: 'CEO Overview' },
  { path: '/dtc', label: 'DTC' },
  { path: '/wholesale', label: 'Wholesale' },
  { path: '/marketplaces', label: 'Marketplaces' },
  { path: '/retail', label: 'Retail' },
  { path: '/inventory', label: 'Inventory' },
] as const

export type ProtectablePage = (typeof ALL_PROTECTABLE_PAGES)[number]

export const PROTECTABLE_PAGES = ALL_PROTECTABLE_PAGES

const DEFAULT_PROTECTED = ['/team', '/scenarios']

export async function getProtectedPages(): Promise<string[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('fin_settings')
    .select('value')
    .eq('key', 'pin_protected_pages')
    .single()

  if (data?.value && Array.isArray(data.value)) {
    return data.value as string[]
  }

  return DEFAULT_PROTECTED
}

export async function isPageProtected(path: string): Promise<boolean> {
  const pages = await getProtectedPages()
  return pages.includes(path)
}
