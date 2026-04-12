import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabase: SupabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: syncLog } = await supabase
    .from('fin_sync_log')
    .insert({ source: 'kpi_facts', status: 'running', rows_synced: 0 })
    .select()
    .single()

  const syncId: string = syncLog?.id ?? ''

  try {
    const { data, error } = await supabase.rpc('rebuild_fin_kpi_monthly')
    if (error) throw new Error(`rebuild_fin_kpi_monthly failed: ${error.message}`)

    const rows = Number((data as { rows?: number } | null)?.rows) || 0

    await supabase.from('fin_sync_log').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      rows_synced: rows,
    }).eq('id', syncId)

    return new Response(
      JSON.stringify({ success: true, rows }),
      { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase.from('fin_sync_log').update({
      status: 'error',
      completed_at: new Date().toISOString(),
      error_message: message,
    }).eq('id', syncId)

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    )
  }
})
