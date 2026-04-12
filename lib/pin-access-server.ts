import { cookies } from 'next/headers'

import { createServiceClient } from '@/lib/supabase/server'

export type PinGateResult = {
  showGate: boolean
  hint: string | null
}

function normalizePathname(pathname: string): string {
  const base = pathname.split('?')[0] || '/'
  if (!base.startsWith('/')) return `/${base}`
  return base === '' ? '/' : base
}

/**
 * If a PIN is configured and the path is in pin_protected_pages, require httpOnly
 * cookie `pin_verified=true` (set by POST /api/pin after successful verify).
 */
export async function getPinGateForPath(pathname: string): Promise<PinGateResult> {
  const supabase = createServiceClient()
  const { data: rows } = await supabase
    .from('fin_settings')
    .select('key, value')
    .in('key', ['pin_hash', 'pin_protected_pages', 'pin_hint'])

  const byKey: Record<string, unknown> = Object.fromEntries(
    (rows ?? []).map((r) => [r.key as string, r.value]),
  )

  const pinHash = byKey.pin_hash
  const pinConfigured = typeof pinHash === 'string' && pinHash.length > 0
  if (!pinConfigured) {
    return { showGate: false, hint: null }
  }

  const rawPages = byKey.pin_protected_pages
  const pages: string[] = Array.isArray(rawPages)
    ? rawPages.filter((p): p is string => typeof p === 'string')
    : ['/settings']

  const path = normalizePathname(pathname)
  const pathRequiresPin = pages.includes(path)

  if (!pathRequiresPin) {
    return { showGate: false, hint: null }
  }

  const cookieStore = await cookies()
  if (cookieStore.get('pin_verified')?.value === 'true') {
    return { showGate: false, hint: null }
  }

  const hintVal = byKey.pin_hint
  const hint = typeof hintVal === 'string' && hintVal.length > 0 ? hintVal : null

  return { showGate: true, hint }
}
