import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderNode {
  id: string
  totalPriceSet: { shopMoney: { amount: string } }
  subtotalPriceSet: { shopMoney: { amount: string } }
  totalDiscountsSet: { shopMoney: { amount: string } }
  sourceName: string
  tags: string[]
  customer: { numberOfOrders: number } | null
}

interface OrderEdge {
  node: OrderNode
  cursor: string
}

interface InventoryItemNode {
  unitCost: { amount: string } | null
  inventoryLevels: {
    edges: Array<{
      node: {
        quantities: Array<{ quantity: number }>
      }
    }>
  }
}

interface InventoryEdge {
  node: InventoryItemNode
  cursor: string
}

interface Aggregation {
  gross_revenue: number
  net_revenue: number
  order_count: number
  new_customer_orders: number
  returning_customer_orders: number
  member_order_count: number
  member_revenue: number
  non_member_order_count: number
  non_member_revenue: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_VERSION = '2025-04'
const RETRY_DELAYS = [1000, 4000, 16000]
const MAX_ATTEMPTS = 4
const MAX_PAGES = 50

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function todayEastern(): { date: string; nextDate: string } {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d)
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 86_400_000)
  return { date: fmt(now), nextDate: fmt(tomorrow) }
}

// ---------------------------------------------------------------------------
// Shopify GraphQL client
// ---------------------------------------------------------------------------

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
    const text = await res.text()
    throw new Error(`Shopify API ${res.status}: ${text}`)
  }
  const body = await res.json()
  if (body.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(body.errors)}`)
  }
  return body.data as T
}

// ---------------------------------------------------------------------------
// Paginated order fetcher
// ---------------------------------------------------------------------------

const ORDERS_QUERY = `
  query OrdersPage($query: String!, $cursor: String) {
    orders(first: 250, query: $query, after: $cursor) {
      edges {
        node {
          id
          totalPriceSet { shopMoney { amount } }
          subtotalPriceSet { shopMoney { amount } }
          totalDiscountsSet { shopMoney { amount } }
          sourceName
          tags
          customer {
            numberOfOrders
          }
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }
`

async function fetchAllOrders(
  shop: string,
  accessToken: string,
  dateFilter: string,
): Promise<OrderNode[]> {
  const orders: OrderNode[] = []
  let cursor: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await shopifyGraphQL<{
      orders: { edges: OrderEdge[]; pageInfo: { hasNextPage: boolean } }
    }>(shop, accessToken, ORDERS_QUERY, { query: dateFilter, cursor })

    for (const edge of data.orders.edges) {
      orders.push(edge.node)
      cursor = edge.cursor
    }
    if (!data.orders.pageInfo.hasNextPage) break
  }
  return orders
}

// ---------------------------------------------------------------------------
// Paginated inventory items fetcher
// ---------------------------------------------------------------------------

const INVENTORY_QUERY = `
  query InventoryPage($cursor: String) {
    inventoryItems(first: 250, after: $cursor) {
      edges {
        node {
          unitCost { amount }
          inventoryLevels(first: 5) {
            edges {
              node {
                quantities(names: ["incoming"]) {
                  quantity
                }
              }
            }
          }
        }
        cursor
      }
      pageInfo { hasNextPage }
    }
  }
`

interface InventoryResult {
  incoming_inventory_value: number
  incoming_inventory_sku_count: number
}

async function fetchIncomingInventory(
  shop: string,
  accessToken: string,
): Promise<InventoryResult> {
  let totalValue = 0
  let skuCount = 0
  let cursor: string | null = null

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await shopifyGraphQL<{
      inventoryItems: { edges: InventoryEdge[]; pageInfo: { hasNextPage: boolean } }
    }>(shop, accessToken, INVENTORY_QUERY, { cursor })

    for (const edge of data.inventoryItems.edges) {
      const item = edge.node
      cursor = edge.cursor

      const unitCost = parseFloat(item.unitCost?.amount ?? '0')
      if (!unitCost || unitCost === 0) continue

      let incomingQty = 0
      for (const level of item.inventoryLevels.edges) {
        for (const q of level.node.quantities) {
          incomingQty += q.quantity
        }
      }
      if (incomingQty > 0) {
        totalValue += unitCost * incomingQty
        skuCount++
      }
    }
    if (!data.inventoryItems.pageInfo.hasNextPage) break
  }

  return {
    incoming_inventory_value: round2(totalValue),
    incoming_inventory_sku_count: skuCount,
  }
}

// ---------------------------------------------------------------------------
// Order aggregation (in-memory, no raw order storage)
// ---------------------------------------------------------------------------

function aggregateOrders(orders: OrderNode[]): Aggregation {
  const agg: Aggregation = {
    gross_revenue: 0,
    net_revenue: 0,
    order_count: 0,
    new_customer_orders: 0,
    returning_customer_orders: 0,
    member_order_count: 0,
    member_revenue: 0,
    non_member_order_count: 0,
    non_member_revenue: 0,
  }

  for (const order of orders) {
    if (order.sourceName === 'faire') continue

    const totalPrice = parseFloat(order.totalPriceSet.shopMoney.amount)
    const discounts = parseFloat(order.totalDiscountsSet.shopMoney.amount)

    agg.gross_revenue += totalPrice + discounts
    agg.net_revenue += totalPrice
    agg.order_count++

    const customerOrders = order.customer?.numberOfOrders ?? 0
    if (customerOrders <= 1) {
      agg.new_customer_orders++
    } else {
      agg.returning_customer_orders++
    }

    const tags = order.tags ?? []
    const isMember = tags.some(
      (t) => t.toLowerCase().includes('appstle'),
    )
    if (isMember) {
      agg.member_order_count++
      agg.member_revenue += totalPrice
    } else {
      agg.non_member_order_count++
      agg.non_member_revenue += totalPrice
    }
  }

  return agg
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

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
    .insert({ source: 'shopify_dtc', status: 'running', rows_synced: 0 })
    .select()
    .single()

  const syncId: string = syncLog?.id ?? ''

  // Load offline session
  const { data: session, error: sessionError } = await supabase
    .from('shopify_sessions')
    .select('access_token, shop')
    .eq('is_online', false)
    .limit(1)
    .single()

  if (sessionError || !session?.access_token) {
    const msg = sessionError
      ? `Failed to load Shopify session: ${sessionError.message}`
      : 'No offline Shopify session found'
    await supabase.from('fin_sync_log').update({
      status: 'error', completed_at: new Date().toISOString(), error_message: msg,
    }).eq('id', syncId)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const { access_token: accessToken, shop } = session

  // Determine date range (allow override via ?date=YYYY-MM-DD)
  const url = new URL(req.url)
  const overrideDate = url.searchParams.get('date')
  let targetDate: string
  let nextDate: string

  if (overrideDate && /^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) {
    targetDate = overrideDate
    const d = new Date(overrideDate + 'T12:00:00Z')
    d.setDate(d.getDate() + 1)
    nextDate = d.toISOString().slice(0, 10)
  } else {
    const today = todayEastern()
    targetDate = today.date
    nextDate = today.nextDate
  }

  const dateFilter = `created_at:>='${targetDate}T00:00:00-05:00' created_at:<'${nextDate}T00:00:00-05:00'`

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1) {
        await supabase.from('fin_sync_log').update({
          status: `retry_${attempt - 1}`,
          attempt,
        }).eq('id', syncId)
        await sleep(RETRY_DELAYS[attempt - 2])
      }

      // 1. Fetch and aggregate orders
      const orders = await fetchAllOrders(shop, accessToken, dateFilter)
      const agg = aggregateOrders(orders)
      const avgOrderValue = agg.order_count > 0
        ? round2(agg.gross_revenue / agg.order_count)
        : 0

      // 2. Upsert fin_revenue_daily
      const { error: revError } = await supabase
        .from('fin_revenue_daily')
        .upsert(
          {
            date: targetDate,
            channel: 'dtc',
            gross_revenue: round2(agg.gross_revenue),
            net_revenue: round2(agg.net_revenue),
            order_count: agg.order_count,
            avg_order_value: avgOrderValue,
            new_customer_orders: agg.new_customer_orders,
            returning_customer_orders: agg.returning_customer_orders,
          },
          { onConflict: 'date,channel' },
        )
      if (revError) throw new Error(`fin_revenue_daily upsert failed: ${revError.message}`)

      // 3. Upsert fin_membership_snapshot
      const memberAov = agg.member_order_count > 0
        ? round2(agg.member_revenue / agg.member_order_count)
        : 0
      const nonMemberAov = agg.non_member_order_count > 0
        ? round2(agg.non_member_revenue / agg.non_member_order_count)
        : 0

      const { error: memError } = await supabase
        .from('fin_membership_snapshot')
        .upsert(
          {
            date: targetDate,
            member_order_count: agg.member_order_count,
            member_revenue: round2(agg.member_revenue),
            member_avg_order_value: memberAov,
            non_member_order_count: agg.non_member_order_count,
            non_member_revenue: round2(agg.non_member_revenue),
            non_member_avg_order_value: nonMemberAov,
          },
          { onConflict: 'date' },
        )
      if (memError) throw new Error(`fin_membership_snapshot upsert failed: ${memError.message}`)

      // 4. Fetch incoming inventory and upsert fin_shopify_daily
      const inventory = await fetchIncomingInventory(shop, accessToken)

      const { error: invError } = await supabase
        .from('fin_shopify_daily')
        .upsert(
          {
            date: targetDate,
            incoming_inventory_value: inventory.incoming_inventory_value,
            incoming_inventory_sku_count: inventory.incoming_inventory_sku_count,
          },
          { onConflict: 'date' },
        )
      if (invError) throw new Error(`fin_shopify_daily upsert failed: ${invError.message}`)

      // 5. Log success
      const totalRows = 3
      await supabase.from('fin_sync_log').update({
        status: 'success',
        completed_at: new Date().toISOString(),
        rows_synced: totalRows,
      }).eq('id', syncId)

      return new Response(
        JSON.stringify({
          success: true,
          date: targetDate,
          orders_processed: orders.length,
          orders_aggregated: agg.order_count,
          skipped_faire: orders.length - agg.order_count,
          gross_revenue: round2(agg.gross_revenue),
          net_revenue: round2(agg.net_revenue),
          incoming_inventory_value: inventory.incoming_inventory_value,
          incoming_inventory_sku_count: inventory.incoming_inventory_sku_count,
        }),
        { headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === MAX_ATTEMPTS) {
        await supabase.from('fin_sync_log').update({
          status: 'error',
          completed_at: new Date().toISOString(),
          error_message: message,
        }).eq('id', syncId)
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }
    }
  }

  return new Response(JSON.stringify({ error: 'Unreachable' }), {
    status: 500,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
