import { createClient } from 'jsr:@supabase/supabase-js@2'

const API_VERSION = '2025-10'
const RETRY_DELAYS = [1000, 4000, 16000]
const MAX_ATTEMPTS = 4

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function round(n: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}

async function shopifyGraphQL<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  )
  if (!res.ok) {
    throw new Error(`Shopify API ${res.status}: ${await res.text()}`)
  }
  const body = await res.json()
  if (body.errors?.length) {
    throw new Error(`Shopify GraphQL: ${JSON.stringify(body.errors)}`)
  }
  return body.data as T
}

const SHOPIFYQL_QUERY = `
  query ShopifyQLQuery($query: String!) {
    shopifyqlQuery(query: $query) {
      ... on ShopifyqlQueryResponse {
        tableData {
          columns { name dataType }
          rows
        }
        parseErrors
      }
    }
  }
`

interface ShopifyQLResult {
  shopifyqlQuery: {
    tableData?: {
      columns: Array<{ name: string; dataType: string }>
      rows: Array<Record<string, string>>
    }
    parseErrors?: string[]
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const shop = Deno.env.get('SHOPIFY_WHOLESALE_SHOP') || 'elsw.myshopify.com'

  const { data: syncLog } = await supabase
    .from('fin_sync_log')
    .insert({ source: 'shopify_wholesale', status: 'running', rows_synced: 0 })
    .select()
    .single()
  const syncId = syncLog?.id ?? ''

  let accessToken: string | null = null

  const { data: storedSession } = await supabase
    .from('shopify_sessions')
    .select('access_token')
    .eq('id', `offline_${shop}`)
    .eq('shop', shop)
    .maybeSingle()
  accessToken = storedSession?.access_token ?? null

  if (!accessToken) {
    const clientId = Deno.env.get('SHOPIFY_CLIENT_ID')
    const clientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')
    if (clientId && clientSecret) {
      try {
        const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
        })
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json()
          accessToken = tokenData.access_token ?? null
        }
      } catch { /* fallthrough to error */ }
    }
  }

  if (!accessToken) {
    const msg = `No Shopify access token for ${shop}. Set SHOPIFY_CLIENT_ID/SECRET or open the embedded app in that store.`
    await supabase.from('fin_sync_log').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: msg,
    }).eq('id', syncId)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') ?? '90', 10)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        await supabase.from('fin_sync_log').update({
          status: `retry_${attempt - 1}`, attempt,
        }).eq('id', syncId)
        await sleep(RETRY_DELAYS[attempt - 2])
      }

      // 1. Sales by source_name (Faire vs Direct segmentation)
      // ShopifyQL doesn't support source_name as a dimension, so we can't split
      // Faire vs Direct at this level. All wholesale store sales go to wholesale_direct.
      // Faire-specific revenue comes from Finaloop P&L (which is authoritative for financials).
      const salesQL = `FROM sales SHOW day, net_sales, gross_sales, orders, average_order_value TIMESERIES day SINCE -${days}d UNTIL today`

      const salesResult = await shopifyGraphQL<ShopifyQLResult>(
        shop, accessToken, SHOPIFYQL_QUERY, { query: salesQL },
      )

      if (salesResult.shopifyqlQuery.parseErrors?.length) {
        throw new Error(`ShopifyQL parse errors: ${JSON.stringify(salesResult.shopifyqlQuery.parseErrors)}`)
      }

      let wholesaleRows = 0
      const salesData = salesResult.shopifyqlQuery.tableData
      if (salesData?.rows?.length) {
        const upsertData = salesData.rows
          .filter((row) => row.day)
          .map((row) => ({
            date: row.day,
            segment: 'wholesale_direct' as const,
            gross_revenue: round(parseFloat(row.gross_sales ?? '0')),
            net_revenue: round(parseFloat(row.net_sales ?? '0')),
            order_count: parseInt(row.orders ?? '0', 10),
            avg_order_value: round(parseFloat(row.average_order_value ?? '0')),
            synced_at: new Date().toISOString(),
          }))

        for (let i = 0; i < upsertData.length; i += 500) {
          const chunk = upsertData.slice(i, i + 500)
          const { error } = await supabase
            .from('fin_wholesale_daily')
            .upsert(chunk, { onConflict: 'date,segment' })
          if (error) throw new Error(`fin_wholesale_daily upsert failed: ${error.message}`)
        }
        wholesaleRows = upsertData.length
      }

      // 2. Sessions/conversion for the wholesale storefront
      const analyticsQL = `FROM sales, sessions SHOW day, net_sales, gross_sales, orders, sessions, conversion_rate TIMESERIES day SINCE -${days}d UNTIL today`

      const analyticsResult = await shopifyGraphQL<ShopifyQLResult>(
        shop, accessToken, SHOPIFYQL_QUERY, { query: analyticsQL },
      )

      let analyticsRows = 0
      if (!analyticsResult.shopifyqlQuery.parseErrors?.length) {
        const aData = analyticsResult.shopifyqlQuery.tableData
        if (aData?.rows?.length) {
          const upsertAnalytics = aData.rows
            .filter((row) => row.day)
            .map((row) => ({
              date: row.day,
              store: 'elsw',
              net_sales: round(parseFloat(row.net_sales ?? '0')),
              gross_sales: round(parseFloat(row.gross_sales ?? '0')),
              total_sales: round(parseFloat(row.net_sales ?? '0')),
              discounts: 0,
              returns: 0,
              shipping: 0,
              taxes: 0,
              orders: parseInt(row.orders ?? '0', 10),
              sessions: parseInt(row.sessions ?? '0', 10),
              conversion_rate: round(parseFloat(row.conversion_rate ?? '0'), 4),
              cart_abandonment_rate: 0,
              synced_at: new Date().toISOString(),
            }))

          for (let i = 0; i < upsertAnalytics.length; i += 500) {
            const chunk = upsertAnalytics.slice(i, i + 500)
            const { error } = await supabase
              .from('fin_shopify_analytics')
              .upsert(chunk, { onConflict: 'date,store' })
            if (error) throw new Error(`fin_shopify_analytics upsert failed: ${error.message}`)
          }
          analyticsRows = upsertAnalytics.length
        }
      }

      const totalRows = wholesaleRows + analyticsRows
      await supabase.from('fin_sync_log').update({
        status: 'success',
        completed_at: new Date().toISOString(),
        rows_synced: totalRows,
      }).eq('id', syncId)

      return new Response(JSON.stringify({
        success: true,
        wholesale_daily_rows: wholesaleRows,
        analytics_rows: analyticsRows,
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === MAX_ATTEMPTS) {
        await supabase.from('fin_sync_log').update({
          status: 'error', completed_at: new Date().toISOString(), error_message: message,
        }).eq('id', syncId)
        return new Response(JSON.stringify({ error: message }), {
          status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }
    }
  }

  return new Response(JSON.stringify({ error: 'Unreachable' }), {
    status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
