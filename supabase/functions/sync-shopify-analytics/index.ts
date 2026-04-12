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
  query ShopifyQLAnalytics($query: String!) {
    shopifyqlQuery(query: $query) {
      ... on ShopifyqlResponse {
        tableData {
          columns { name dataType }
          rows
        }
        parseErrors { message }
      }
    }
  }
`

interface ShopifyQLResult {
  shopifyqlQuery: {
    tableData?: {
      columns: Array<{ name: string; dataType: string }>
      rows: string[][]
    }
    parseErrors?: Array<{ message: string }>
  }
}

interface DayRow {
  date: string
  net_sales: number
  gross_sales: number
  total_sales: number
  discounts: number
  returns: number
  shipping: number
  taxes: number
  orders: number
  sessions: number
  conversion_rate: number
  cart_abandonment_rate: number
}

function parseShopifyQLRows(
  columns: Array<{ name: string }>,
  rows: string[][],
): DayRow[] {
  const colIndex = Object.fromEntries(columns.map((c, i) => [c.name, i]))

  return rows.map((row) => ({
    date: row[colIndex['day']] || row[colIndex['date']] || '',
    net_sales: parseFloat(row[colIndex['net_sales']] ?? '0'),
    gross_sales: parseFloat(row[colIndex['gross_sales']] ?? '0'),
    total_sales: parseFloat(row[colIndex['total_sales']] ?? '0'),
    discounts: parseFloat(row[colIndex['discounts']] ?? '0'),
    returns: parseFloat(row[colIndex['sales_reversals']] ?? row[colIndex['returns']] ?? '0'),
    shipping: parseFloat(row[colIndex['shipping']] ?? '0'),
    taxes: parseFloat(row[colIndex['taxes']] ?? '0'),
    orders: parseInt(row[colIndex['orders']] ?? '0', 10),
    sessions: parseInt(row[colIndex['sessions']] ?? '0', 10),
    conversion_rate: parseFloat(row[colIndex['conversion_rate']] ?? '0'),
    cart_abandonment_rate: parseFloat(row[colIndex['cart_abandonment_rate']] ?? '0'),
  }))
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

  const { data: syncLog } = await supabase
    .from('fin_sync_log')
    .insert({ source: 'shopify_analytics', status: 'running', rows_synced: 0 })
    .select()
    .single()
  const syncId = syncLog?.id ?? ''

  const shop = Deno.env.get('SHOPIFY_DTC_SHOP') || 'emilylex.myshopify.com'
  const clientId = Deno.env.get('SHOPIFY_CLIENT_ID')
  const clientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    const msg = 'SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET must be set'
    await supabase.from('fin_sync_log').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: msg,
    }).eq('id', syncId)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  let accessToken: string
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    })
    if (!tokenRes.ok) throw new Error(`Token request failed: ${await tokenRes.text()}`)
    const tokenData = await tokenRes.json()
    accessToken = tokenData.access_token
    if (!accessToken) throw new Error('No access_token in response')
  } catch (err) {
    const msg = `Shopify auth failed for ${shop}: ${err instanceof Error ? err.message : err}`
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

      const salesQL = `FROM sales, sessions SHOW day, net_sales, gross_sales, total_sales, discounts, sales_reversals, shipping, taxes, orders, sessions, conversion_rate, cart_abandonment_rate TIMESERIES day SINCE -${days}d UNTIL today`

      const result = await shopifyGraphQL<ShopifyQLResult>(
        shop, accessToken, SHOPIFYQL_QUERY, { query: salesQL },
      )

      if (result.shopifyqlQuery.parseErrors?.length) {
        throw new Error(`ShopifyQL parse errors: ${JSON.stringify(result.shopifyqlQuery.parseErrors)}`)
      }

      const tableData = result.shopifyqlQuery.tableData
      if (!tableData?.rows?.length) {
        await supabase.from('fin_sync_log').update({
          status: 'success', completed_at: new Date().toISOString(), rows_synced: 0,
        }).eq('id', syncId)
        return new Response(JSON.stringify({ success: true, rows: 0 }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }

      const dayRows = parseShopifyQLRows(tableData.columns, tableData.rows)

      const upsertData = dayRows
        .filter((r) => r.date)
        .map((r) => ({
          date: r.date,
          store: 'emilylex',
          net_sales: round(r.net_sales),
          gross_sales: round(r.gross_sales),
          total_sales: round(r.total_sales),
          discounts: round(r.discounts),
          returns: round(r.returns),
          shipping: round(r.shipping),
          taxes: round(r.taxes),
          orders: r.orders,
          sessions: r.sessions,
          conversion_rate: round(r.conversion_rate, 4),
          cart_abandonment_rate: round(r.cart_abandonment_rate, 4),
          synced_at: new Date().toISOString(),
        }))

      for (let i = 0; i < upsertData.length; i += 500) {
        const chunk = upsertData.slice(i, i + 500)
        const { error } = await supabase
          .from('fin_shopify_analytics')
          .upsert(chunk, { onConflict: 'date,store' })
        if (error) throw new Error(`Upsert failed: ${error.message}`)
      }

      await supabase.from('fin_sync_log').update({
        status: 'success',
        completed_at: new Date().toISOString(),
        rows_synced: upsertData.length,
      }).eq('id', syncId)

      return new Response(JSON.stringify({
        success: true,
        rows: upsertData.length,
        date_range: { from: dayRows[0]?.date, to: dayRows.at(-1)?.date },
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
