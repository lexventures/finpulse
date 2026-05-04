import { createClient } from 'jsr:@supabase/supabase-js@2'

const API_VERSION = '2026-04'
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

const CUSTOMERS_COUNT_QUERY = `
  query CustomersCount($query: String!) {
    customersCount(query: $query, limit: null) {
      count
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

interface CustomersCountResult {
  customersCount: {
    count: number
  }
}

function monthStartDate(monthOffset: number): string {
  const now = new Date()
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1))
  return month.toISOString().slice(0, 10)
}

async function fetchCustomerCohortSpend(
  shop: string,
  accessToken: string,
  monthDate: string,
  nextMonthDate: string,
): Promise<number | null> {
  const cohortSpendQL = `
    FROM customers
      SHOW total_amount_spent
      WHERE customer_added_date >= ${monthDate}
        AND customer_added_date < ${nextMonthDate}
  `
  const result = await shopifyGraphQL<ShopifyQLResult>(
    shop,
    accessToken,
    SHOPIFYQL_QUERY,
    { query: cohortSpendQL },
  )

  if (result.shopifyqlQuery.parseErrors?.length) {
    throw new Error(`ShopifyQL customer LTV parse errors: ${JSON.stringify(result.shopifyqlQuery.parseErrors)}`)
  }

  const row = result.shopifyqlQuery.tableData?.rows?.[0]
  if (!row) return null
  const spend = Number(row.total_amount_spent ?? 0)
  return Number.isFinite(spend) ? round(spend) : null
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
  const customerMonths = parseInt(url.searchParams.get('customer_months') ?? '18', 10)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        await supabase.from('fin_sync_log').update({
          status: `retry_${attempt - 1}`, attempt,
        }).eq('id', syncId)
        await sleep(RETRY_DELAYS[attempt - 2])
      }

      // 1. Sales + sessions analytics (existing)
      const salesQL = `FROM sales, sessions SHOW day, net_sales, gross_sales, orders, sessions, conversion_rate TIMESERIES day SINCE -${days}d UNTIL today`

      const result = await shopifyGraphQL<ShopifyQLResult>(
        shop, accessToken, SHOPIFYQL_QUERY, { query: salesQL },
      )

      if (result.shopifyqlQuery.parseErrors?.length) {
        throw new Error(`ShopifyQL parse errors: ${JSON.stringify(result.shopifyqlQuery.parseErrors)}`)
      }

      let analyticsRows = 0
      const tableData = result.shopifyqlQuery.tableData
      if (tableData?.rows?.length) {
        const upsertData = tableData.rows
          .filter((row) => row.day)
          .map((row) => ({
            date: row.day,
            store: 'emilylex',
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

        for (let i = 0; i < upsertData.length; i += 500) {
          const chunk = upsertData.slice(i, i + 500)
          const { error } = await supabase
            .from('fin_shopify_analytics')
            .upsert(chunk, { onConflict: 'date,store' })
          if (error) throw new Error(`Upsert failed: ${error.message}`)
        }
        analyticsRows = upsertData.length
      }

      // 2. New customer counts via Admin customersCount (DTC store)
      let customerRows = 0
      let customerError: string | null = null
      try {
        for (let i = customerMonths - 1; i >= 0; i--) {
          const monthDate = monthStartDate(-i)
          const nextMonthDate = monthStartDate(-i + 1)
          const query = `created_at:>=${monthDate} created_at:<${nextMonthDate}`
          const countResult = await shopifyGraphQL<CustomersCountResult>(
            shop,
            accessToken,
            CUSTOMERS_COUNT_QUERY,
            { query },
          )
          const newCusts = Number(countResult.customersCount?.count) || 0
          const cohortSpend = await fetchCustomerCohortSpend(
            shop,
            accessToken,
            monthDate,
            nextMonthDate,
          )
          const shopifyLtv = cohortSpend == null || newCusts <= 0
            ? null
            : round(cohortSpend / newCusts)
          const { data: existingKpi } = await supabase
            .from('fin_kpi_monthly')
            .select('gross_margin_pct')
            .eq('month', monthDate)
            .eq('channel', 'dtc')
            .maybeSingle()
          const grossMarginPct = Number(existingKpi?.gross_margin_pct) || 0
          const grossMarginLtv = shopifyLtv == null || grossMarginPct <= 0
            ? null
            : round(shopifyLtv * (grossMarginPct / 100))

          const { error } = await supabase
            .from('fin_kpi_monthly')
            .upsert({
              month: monthDate,
              channel: 'dtc',
              new_customer_orders: newCusts,
              returning_customer_orders: 0,
              shopify_ltv_to_date: shopifyLtv,
              shopify_gross_margin_ltv_to_date: grossMarginLtv,
            }, { onConflict: 'month,channel' })
          if (!error) customerRows++
        }
      } catch (error: unknown) {
        customerError = error instanceof Error ? error.message : String(error)
      }

      // 3. Wholesale store customer counts (if configured)
      const wholesaleShop = Deno.env.get('SHOPIFY_WHOLESALE_SHOP') || 'elsw.myshopify.com'
      let wholesaleToken: string | null = null
      if (wholesaleShop !== shop) {
        const { data: wsSession } = await supabase
          .from('shopify_sessions')
          .select('access_token')
          .eq('id', `offline_${wholesaleShop}`)
          .eq('shop', wholesaleShop)
          .maybeSingle()
        wholesaleToken = wsSession?.access_token ?? null

        if (!wholesaleToken) {
          const clientId = Deno.env.get('SHOPIFY_CLIENT_ID')
          const clientSecret = Deno.env.get('SHOPIFY_CLIENT_SECRET')
          if (clientId && clientSecret) {
            try {
              const tokenRes = await fetch(`https://${wholesaleShop}/admin/oauth/access_token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
              })
              if (tokenRes.ok) {
                const tokenData = await tokenRes.json()
                wholesaleToken = tokenData.access_token ?? null
              }
            } catch { /* non-fatal */ }
          }
        }
      }

      if (wholesaleToken) {
        try {
          for (let i = customerMonths - 1; i >= 0; i--) {
            const monthDate = monthStartDate(-i)
            const nextMonthDate = monthStartDate(-i + 1)
            const query = `created_at:>=${monthDate} created_at:<${nextMonthDate}`
            const countResult = await shopifyGraphQL<CustomersCountResult>(
              wholesaleShop,
              wholesaleToken,
              CUSTOMERS_COUNT_QUERY,
              { query },
            )
            const newCusts = Number(countResult.customersCount?.count) || 0

            const { error } = await supabase
              .from('fin_kpi_monthly')
              .upsert({
                month: monthDate,
                channel: 'wholesale',
                new_customer_orders: newCusts,
                returning_customer_orders: 0,
              }, { onConflict: 'month,channel' })
            if (!error) customerRows++
          }
        } catch (error: unknown) {
          customerError = error instanceof Error ? error.message : String(error)
        }
      }

      const totalRows = analyticsRows + customerRows
      await supabase.from('fin_sync_log').update({
        status: 'success',
        completed_at: new Date().toISOString(),
        rows_synced: totalRows,
      }).eq('id', syncId)

      return new Response(JSON.stringify({
        success: true,
        analytics_rows: analyticsRows,
        customer_rows: customerRows,
        customer_error: customerError,
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
