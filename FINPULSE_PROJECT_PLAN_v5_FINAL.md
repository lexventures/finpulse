# FINPULSE — ELS FINANCIAL INTELLIGENCE DASHBOARD
## Complete Project Plan v5 (Final)
### Last Updated: April 11, 2026

---

## EXECUTIVE SUMMARY

FinPulse replaces a fractional CFO ($36-84K/year) and Triple Whale ($18-30K/year) with a single custom dashboard built on the approved ELS stack. Total incremental SaaS cost: ~$25/month.

**Core data source:** Finaloop Google Sheets auto-export (daily P&L, balance sheet, cash flow) — already broken out by channel/store, providing revenue, COGS, fees, and expenses at the segment level.

**Signal delivery:** Elevar (already running) handles all server-side conversion tracking to Meta CAPI, Google Ads Enhanced Conversions, GA4, and Klaviyo. No additional pixel or attribution tool needed.

**What FinPulse builds:** The reporting, forecasting, alerting, and scenario modeling layer that no existing tool provides — unified across all five ELS channels with segment-level P&L visibility.

**Tools eliminated:** Triple Whale (~$18-30K/year saved, scaling to $50K+ as revenue grows toward $100M).

---

## 1. ARCHITECTURE

### Data Flow

```
DAILY AUTOMATED SYNCS (Edge Functions → REST APIs):
┌─────────────────────────────────────────────────────────────┐
│ Finaloop → Google Sheets (Finaloop native daily auto-sync)  │
│   Sheets: P&L, Balance Sheet, Cash Flow                     │
│   Google Sheets API v4 → Supabase (Edge Function)           │
│   THE BACKBONE — covers revenue, margin, COGS, fees,        │
│   expenses, cash, AP, inventory value, ad spend, payroll    │
│                                                             │
│ Shopify emilylex store → Supabase (Edge Function, 6:30AM)  │
│   DTC only, aggregated in memory, no raw orders stored      │
│   Covers: daily revenue, order count, AOV, new/returning,   │
│   membership identification, incoming inventory value        │
│   (committed PO outflows for cash forecast)                  │
│                                                             │
│ Klaviyo REST API → Supabase (Edge Function)                 │
│   Revenue attribution only: email revenue + SMS revenue     │
│   One API call per day, two numbers                         │
└─────────────────────────────────────────────────────────────┘
                          ↓
              Supabase Postgres (FinPulse project)
                          ↓
              SQL computation functions (pg_cron):
              - Daily 13-week cash forecast
              - Daily alert engine
                          ↓
              Next.js App Router → Vercel
                          ↓
              Resend (alert digest + sync failure emails)

EXISTING (UNCHANGED):
- Elevar: Server-side CAPI to Meta, Google Ads, GA4, Klaviyo
- GA4: Attribution reporting (powered by Elevar)
- Meta/Google Ads Manager: Campaign/ad-level ROAS (in-platform)
- Forekast: SKU-level inventory (dead stock, stockout risk) — separate app
- Wholesale Outreach app: Account-level ops (reorder rate, pipeline) — separate app
```

### Stack (ELS Approved — Zero Exceptions)

**Runtime & Framework:**
- Next.js App Router `^16.2.3` (Turbopack default — no custom webpack config)
- React `^19.2.0` + React DOM `^19.2.0`
- TypeScript `^5.8` (strict mode)
- Tailwind CSS `^4.x`
- pnpm (package manager)

**Backend & Data:**
- Supabase (`@supabase/supabase-js ^2.x` + `@supabase/ssr ^0.10.x`), transaction-mode pooling
- Zod `^3.x` (runtime validation for all API responses, Finaloop sheet parsing, form inputs)
- Supabase CLI for migrations (`supabase migration new`, `supabase db push` — never manual SQL)
- Supabase type generation (`supabase gen types typescript`) for type-safe DB queries

**UI Component Library:**
- **shadcn/ui** — copy-paste React components built on Radix UI + Tailwind CSS
  - Install via CLI: `npx shadcn-ui@latest add [component]` — copies source into `components/ui/`
  - Zero runtime dependency lock-in — components are owned source code in your repo
  - Built-in Chart component wraps Recharts with automatic theme support (CSS variables, dark mode)
  - **Required components (install at project start):**
    - `card` — metric cards, KPI containers on every page
    - `chart` — Recharts wrapper with themed tooltips, legends, responsive containers
    - `table` — data tables (wholesale accounts, headcount, commitments, sync log)
    - `tabs` — channel segment toggle on wholesale, granularity toggle
    - `badge` — status indicators (alert severity, sync status, stale data warnings)
    - `button` — actions, toggles, filters
    - `input` + `select` — forms (scenarios, settings, headcount, commitments)
    - `dialog` — confirmation modals (delete, acknowledge)
    - `skeleton` — loading states on every page (mandatory)
    - `sidebar` — main navigation layout
    - `sheet` — mobile sidebar drawer
    - `tooltip` — hover context on metric cards
    - `toggle-group` — timeline filter presets (7D/30D/90D/YTD/12M/ALL)
    - `popover` — date range picker for custom timeline filter
    - `separator`, `scroll-area`, `dropdown-menu`
  - **No other UI library.** No Material UI, no Ant Design, no Chakra, no Tremor. shadcn/ui + Tailwind covers 100% of this app's UI needs.
  - Dark mode: supported by default via CSS variables. Ship light mode only for v1. Dark mode toggle deferred to Phase 5 (low effort with shadcn, but not a launch priority).

**Charting (via shadcn/ui Chart + Recharts):**
- Recharts `^2.x` — wrapped by shadcn/ui's `<ChartContainer>` component for automatic theming
  - **CEO approved April 10, 2026**
  - All charts use shadcn's `<ChartTooltip>` and `<ChartTooltipContent>` for consistent tooltip styling
  - Colors defined via CSS variables: `--chart-1` through `--chart-6` (set in `globals.css`)

**Utilities:**
- date-fns `^4.x` — date manipulation for forecast calculations, payout timing, trend analysis
  - **CEO approved April 10, 2026**
- Resend `^4.x` — alert digest emails
- Anthropic Claude API (Sonnet 4) — daily CEO briefing generation (see Section 6.11). ~$0.50/month. One API call per day.

**Infrastructure:**
- Vercel (hosting + error tracking via Vercel built-in monitoring)
- GitHub (repo + CI/CD via GitHub Actions)
- Env vars via Vercel only
- **New dedicated Supabase project** (separate from inventory-dashboard)
  - Follows standing rule: one repo = one app = one Supabase project
  - **Zero cross-project dependencies.** Forekast and Wholesale Outreach are separate apps — FinPulse does not read from their databases.

**Rejected (per standing rules):** Prisma, NextAuth, Express, Redux/Zustand, Axios, CSS-in-JS, moment.js, custom webpack configs

**No other dependencies without CEO approval.**

---

## 2. DATA SOURCES

### 2.1 Finaloop → Google Sheets → Supabase

**Confirmed Finaloop P&L structure (from actual export):**

Revenue lines broken out by source:
- `Sales - Shopify - emilylex` → **DTC**
- `Sales - Facebook (via Shopify)` → **DTC** (Meta shop)
- `Sales - Faire (via Shopify)` → **Wholesale: Faire**
- `Sales - Shopify - ca9d60-2` → **Wholesale: Direct**
- `Sales - Wholesale` → **Wholesale: Key Accounts** (PO/ACH)
- `Sales - Square` → **Retail**
- `Sales - unidentified payouts` → **Marketplaces** (Amazon — pending Finaloop connection)

Also broken out by source: shipping income, discounts, returns, COGS, processing fees, selling fees (Faire commission).

OpEx NOT channel-specific (as expected): payroll, rent, software, marketing, G&A.

**Google Sheets documents (3):**
1. P&L (daily auto-sync from Finaloop)
2. Balance Sheet (daily auto-sync)
3. Cash Flow Statement (daily auto-sync)

**Edge Function: `sync-finaloop-sheets`**
- Schedule: Daily 4:30 AM EST via pg_cron (see Section 5 for full schedule)
- Method: Google Sheets API v4 `batchGet` (single call, all tabs)
- Auth: Google service account (read-only), key in Vercel env vars
- Logic: Parse P&L rows by line-item name → map to channel/segment → upsert `fin_pnl_monthly`
- Error handling: 3 retries with exponential backoff → log to `fin_sync_log` → alert on persistent failure

**Historical backfill:** Request 24 months from Finaloop. Non-blocking — dashboard launches with whatever data is available. Charts show "Limited data" notice when <6 months exist.

**Fallback if Finaloop auto-sync isn't daily:** Heather exports on the 1st and 15th of each month. Dashboard shows "Last financial data: {date}" prominently.

### 2.2 Shopify → Supabase (DTC Only)

FinPulse syncs the **emilylex store only** for DTC order aggregation. Wholesale financial data comes entirely from Finaloop. No Shopify sync needed for ca9d60-2 or Faire orders.

**CRITICAL: The Shopify sync does NOT store individual orders.** It pulls orders via API, computes aggregates in memory, and writes only the results:
- DTC orders (non-Faire) → aggregate into `fin_revenue_daily` (daily totals, order count, AOV, new/returning split)
- Membership orders → aggregate into `fin_membership_snapshot` (daily member vs non-member metrics)

**Data used for:**
- Daily DTC revenue, order count, AOV
- New vs returning customer segmentation (customer.orders_count)
- Membership identification (Appstle tags — to be verified in Phase 1)
- Incoming inventory value (committed PO outflows for cash forecast)

**Order filtering:**
- Faire orders (`source_name = 'faire'`) are excluded — wholesale revenue comes from Finaloop
- Only emilylex store orders are synced — ca9d60-2 revenue comes from Finaloop

### 2.3 Klaviyo (REST API — Revenue Attribution Only)

- Edge Function: `sync-klaviyo-revenue` — daily 8:00 AM EST
- Data: **Two numbers only** — email attributed revenue and SMS attributed revenue
- One API call per day to Klaviyo's revenue endpoint
- Auth: Klaviyo private API key (Vercel env var)
- **Stripped to minimum.** No list size, no subscriber counts, no unsubscribe rates. Those are marketing ops metrics that belong in Klaviyo's native dashboard.
- Why keep this at all: Email/SMS revenue as % of DTC is a CFO-level retention health indicator. If this percentage drops, it signals increasing CAC dependency.

### 2.4 Data Sources NOT Used (And Why)

| Source | Why Not |
|---|---|
| Meta Ads API | Finaloop P&L already has monthly ad spend by platform (`Paid online ads - Facebook Advertising`, `Paid online ads - Google Advertising`). Daily granularity not needed for CFO-level CAC/MER. Campaign-level ROAS stays in Meta Ads Manager (enhanced by Elevar). |
| Google Ads API | Same as above. Finaloop monthly totals are sufficient. |
| Ramp API | Finaloop Balance Sheet has total AP ($375K vendor bills + credit card balances). Cash forecast uses trailing average outflows from Finaloop, not individual bill due dates. Large known outflows (inventory POs) are recorded in Shopify/Finaloop as COGS. **Ramp is planned as a future PO platform — API integration deferred to v2 when Ramp becomes the PO source of truth.** |
| Forekast Supabase | Finaloop Balance Sheet has total inventory value ($7.88M). Inventory turns and days on hand are computable from Finaloop data alone. SKU-level detail (dead stock, stockout risk) stays in Forekast. |
| Wholesale Outreach app | Wholesale financial data comes entirely from Finaloop P&L. Account-level operational metrics (reorder rate, pipeline, health scores) stay in the Wholesale Outreach app. |

### 2.5 Manual Data Sources

| Data | Entry Method | Frequency | Who |
|---|---|---|---|
| Headcount + comp | In-app form (/team page) | When changes occur | Ryan |
| COGS % for Key Accounts | Settings page config | When pricing changes | Ryan |
| Alert thresholds | Settings page config | As needed | Ryan |
| Faire commission rate | Settings page config | When Faire changes terms | Ryan |

---

## 3. FINALOOP LINE-ITEM → FINPULSE CHANNEL MAPPING

This is the core data transformation. Each Finaloop P&L line maps to a FinPulse channel and segment.

### Revenue Mapping

| Finaloop Line | FinPulse Channel | Segment |
|---|---|---|
| Sales - Shopify - emilylex | DTC | — |
| Sales - Facebook (via Shopify) | DTC | — |
| Shipping income - Shopify - emilylex | DTC | — |
| Shipping income - Facebook (via Shopify) | DTC | — |
| Sales - Faire (via Shopify) | Wholesale | Faire |
| Sales - Shopify - ca9d60-2 | Wholesale | Direct |
| Shipping income - Shopify - ca9d60-2 | Wholesale | Direct |
| Sales - Wholesale | Wholesale | Key Accounts |
| Sales - Square | Retail | — |
| Sales - unidentified payouts | Marketplaces | Amazon (pending) |
| Affiliate marketing income | DTC | — |

### Discounts & Returns Mapping

| Finaloop Line | FinPulse Channel | Segment |
|---|---|---|
| Discounts - Shopify - emilylex | DTC | — |
| Discounts - Facebook (via Shopify) | DTC | — |
| Discounts - Faire (via Shopify) | Wholesale | Faire |
| Discounts - Shopify - ca9d60-2 | Wholesale | Direct |
| Returns - Shopify - emilylex | DTC | — |
| Returns - Facebook (via Shopify) | DTC | — |
| Returns - Faire (via Shopify) | Wholesale | Faire |
| Returns - Shopify - ca9d60-2 | Wholesale | Direct |

### COGS Mapping

| Finaloop Line | FinPulse Channel | Segment |
|---|---|---|
| COGS - Shopify - emilylex | DTC | — |
| COGS - Facebook (via Shopify) | DTC | — |
| COGS - Faire (via Shopify) | Wholesale | Faire |
| COGS - Shopify - ca9d60-2 | Wholesale | Direct |
| COGS - Key Accounts | Wholesale | Key Accounts |

**Key Account COGS:** No dedicated Finaloop line. Calculated as: `Key Account Revenue × (1 - gross_margin_setting)` where `gross_margin_setting` is configured in Settings (default 77.5%, range 75-80%).

### Fees Mapping

| Finaloop Line | FinPulse Channel | Segment |
|---|---|---|
| Fees - Shopify - emilylex | DTC | — |
| Selling fees - Faire | Wholesale | Faire |
| Fees - Shopify - ca9d60-2 | Wholesale | Direct |

### Shipping & Fulfillment

| Finaloop Line | FinPulse Channel |
|---|---|
| Shipping & freight-out | Company-wide (allocated proportional to revenue by channel, or left as blended) |

### OpEx (NOT Channel-Allocated)

All operating expenses (payroll, G&A, S&M, R&D, depreciation) remain company-wide. They appear on the CEO Overview and are NOT allocated to individual channels. The exception:

- `Paid online ads - Facebook Advertising` → allocated to DTC
- `Paid online ads - Google Advertising` → allocated to DTC
- `Paid online ads - Faire` → allocated to Wholesale: Faire (currently $1.28 YTD due to miscategorization — once Ryan recategorizes Faire ACH charges in Finaloop, this will reflect actual ~$30K/month ad spend)
- `Email marketing` → allocated to DTC
- All other S&M → company-wide

**Note on Faire advertising (VERIFIED from Faire documentation + Faire dashboard, April 11, 2026):**

Faire Promoted Listings and Faire commissions are billed through SEPARATE mechanisms:
- **Faire commissions** (15% marketplace orders, 0% Faire Direct) → deducted from merchant payouts → appears in Finaloop as `Selling fees - Faire` ($780K YTD)
- **Faire Promoted Listings ad spend** ($30K/month budget, $206K lifetime) → billed directly to payment method on file (credit card) on a recurring monthly basis, NOT deducted from payouts

Faire's own documentation confirms: "Billing: We automatically charge your payment method on a recurring monthly basis." This means Promoted Listings spend enters Finaloop through the credit card transaction, not through the Faire payout deduction.

**⚠️ ACTION REQUIRED:** The ~$30K/month (~$90K+ YTD) Faire ad spend is NOT appearing in `Paid online ads - Faire` ($1.28 YTD) and is NOT inside `Selling fees - Faire`. **Confirmed April 11, 2026: Faire bills Promoted Listings via ACH transfer to Highbeam Primary checking account (Thread Bank, account 1706).** This ACH charge is almost certainly inside `Uncategorized transactions - money spent` (-$757K YTD) because Finaloop couldn't auto-categorize a generic ACH from Faire.

**Ryan must recategorize in Finaloop:** Find the recurring Faire ACH charges in the Highbeam Primary 1706 transaction history, recategorize them as `Paid online ads - Faire`. This will reduce uncategorized transactions by ~$90K and correctly surface Faire ad spend in the P&L. Once done, FinPulse picks it up automatically through the Finaloop sync — no special handling needed.

For FinPulse, this means:
- Once properly categorized in Finaloop, Faire ad spend should appear in `Paid online ads - Faire` or a similar line
- The Finaloop parser maps this to Wholesale: Faire as allocated ad spend
- Faire ad spend is NOT included in blended CAC (CAC = DTC only: Meta + Google)
- Total company marketing spend and MER calculations should include Faire ad spend for accuracy
- A Settings field `faire_monthly_ad_budget` ($30,000 default) provides a cross-reference until Finaloop categorization is corrected

This means **contribution margin by channel** = Revenue − COGS − Channel Fees − Allocated Ad Spend. **NOT** fully loaded with payroll/rent/software (that's the company-wide EBITDA calculation).

---

## 4. DATABASE SCHEMA

### New Supabase Project: `finpulse`

```sql
-- ============================================================
-- FINANCIAL STATEMENTS (from Finaloop via Google Sheets)
-- ============================================================

CREATE TABLE fin_pnl_monthly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN (
    'company', 'dtc', 'wholesale', 'wholesale_faire',
    'wholesale_direct', 'wholesale_key', 'retail', 'marketplace'
  )),
  -- Revenue
  gross_revenue NUMERIC(12,2) DEFAULT 0,
  shipping_income NUMERIC(12,2) DEFAULT 0,
  discounts NUMERIC(12,2) DEFAULT 0,
  returns NUMERIC(12,2) DEFAULT 0,
  net_revenue NUMERIC(12,2) DEFAULT 0,
  -- Cost
  cogs NUMERIC(12,2) DEFAULT 0,
  gross_profit NUMERIC(12,2) DEFAULT 0,
  gross_margin_pct NUMERIC(5,2) DEFAULT 0,
  -- Fees
  processing_fees NUMERIC(12,2) DEFAULT 0,
  selling_fees NUMERIC(12,2) DEFAULT 0, -- Faire commission
  total_fees NUMERIC(12,2) DEFAULT 0,
  -- Channel-allocated marketing
  allocated_ad_spend NUMERIC(12,2) DEFAULT 0,
  allocated_email_marketing NUMERIC(12,2) DEFAULT 0,
  -- Contribution margin
  contribution_margin NUMERIC(12,2) DEFAULT 0,
  contribution_margin_pct NUMERIC(5,2) DEFAULT 0,
  -- Company-wide only (channel rows = 0):
  shipping_fulfillment NUMERIC(12,2) DEFAULT 0,
  payroll NUMERIC(12,2) DEFAULT 0,
  ga_expense NUMERIC(12,2) DEFAULT 0,
  sm_expense NUMERIC(12,2) DEFAULT 0,
  rd_expense NUMERIC(12,2) DEFAULT 0,
  depreciation NUMERIC(12,2) DEFAULT 0,
  total_opex NUMERIC(12,2) DEFAULT 0,
  ebitda NUMERIC(12,2) DEFAULT 0,
  net_operating_profit NUMERIC(12,2) DEFAULT 0,
  interest_financing NUMERIC(12,2) DEFAULT 0,
  other_income_expenses NUMERIC(12,2) DEFAULT 0,
  net_profit NUMERIC(12,2) DEFAULT 0,
  -- Meta
  is_partial BOOLEAN DEFAULT false, -- True for current/incomplete month
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month, channel)
);

CREATE TABLE fin_cashflow_monthly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL UNIQUE,
  -- Summary flows
  cash_from_operations NUMERIC(12,2),
  cash_from_investing NUMERIC(12,2),
  cash_from_financing NUMERIC(12,2),
  net_cash_flow NUMERIC(12,2),
  -- Key line items used by cash forecast
  inventory_purchases NUMERIC(12,2), -- Cash Flow: 'Inventory purchases, net'
  owner_distributions NUMERIC(12,2), -- Cash Flow: 'Distributions - Ryan Lex'
  sales_tax_payments NUMERIC(12,2), -- Cash Flow: 'Sales tax liability' net
  -- Cash reconciliation (most accurate current cash)
  starting_cash NUMERIC(12,2), -- Total Cash-on-hand at period start
  ending_cash NUMERIC(12,2), -- Total Cash-on-hand at period end
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fin_balance_sheet_monthly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL UNIQUE,
  -- Cash & equivalents (sum of bank accounts + UDF)
  bank_accounts_total NUMERIC(12,2),
  undeposited_funds_total NUMERIC(12,2),
  cash_and_equivalents NUMERIC(12,2), -- computed: bank_accounts + UDF
  -- Other current assets
  inventory_value NUMERIC(12,2),
  accounts_receivable NUMERIC(12,2),
  loans_to_related_party NUMERIC(12,2),
  unidentified_payouts NUMERIC(12,2), -- Amazon gap — large negative number
  total_current_assets NUMERIC(12,2),
  -- Fixed assets
  net_fixed_assets NUMERIC(12,2),
  total_assets NUMERIC(12,2),
  -- Liabilities
  credit_card_balances NUMERIC(12,2),
  accounts_payable NUMERIC(12,2), -- inventory vendor bills
  sales_tax_liability NUMERIC(12,2),
  total_current_liabilities NUMERIC(12,2),
  total_liabilities NUMERIC(12,2),
  -- Equity
  total_equity NUMERIC(12,2),
  current_year_net_profit NUMERIC(12,2),
  synced_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SHOPIFY DATA (computed during sync — NO raw orders stored)
-- ============================================================
-- The Shopify sync Edge Function pulls DTC orders via API, computes
-- aggregates IN MEMORY during the sync, and writes ONLY the results.
-- Individual order rows are NOT persisted.
-- Wholesale financial data comes entirely from Finaloop P&L.
-- Wholesale operational metrics (account health, reorder rate, pipeline)
-- live in the Wholesale Outreach app — NOT duplicated here.

-- DTC daily aggregates (computed from emilylex store non-Faire orders during sync)
-- Already defined: fin_revenue_daily table above

-- Membership daily snapshot (computed during DTC Shopify sync)
CREATE TABLE fin_membership_snapshot (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  active_members INTEGER DEFAULT 0,
  member_order_count INTEGER DEFAULT 0,
  member_revenue NUMERIC(12,2) DEFAULT 0,
  member_avg_order_value NUMERIC(10,2) DEFAULT 0,
  non_member_order_count INTEGER DEFAULT 0,
  non_member_revenue NUMERIC(12,2) DEFAULT 0,
  non_member_avg_order_value NUMERIC(10,2) DEFAULT 0
);

-- ============================================================
-- OPERATIONAL METRICS (from Shopify order-level data)
-- ============================================================

CREATE TABLE fin_revenue_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'dtc' CHECK (channel IN ('dtc')),
  -- Only DTC daily data from Shopify. Wholesale/Retail/Marketplace = Finaloop monthly only.
  gross_revenue NUMERIC(12,2),
  net_revenue NUMERIC(12,2),
  order_count INTEGER,
  avg_order_value NUMERIC(10,2),
  new_customer_orders INTEGER,
  returning_customer_orders INTEGER,
  UNIQUE(date, channel)
);

-- Daily Shopify operational snapshot (computed during DTC sync)
CREATE TABLE fin_shopify_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  incoming_inventory_value NUMERIC(12,2) DEFAULT 0, -- SUM(incoming_qty × unit_cost) across all SKUs
  incoming_inventory_sku_count INTEGER DEFAULT 0     -- count of SKUs with incoming > 0
);
-- One row per day. Computed via Shopify GraphQL inventoryItems query.
-- Used by cash forecast: committed inventory outflows for weeks 1-4.

-- Note: Ad spend by platform comes from Finaloop P&L (monthly).
-- No separate ad metrics table needed. CAC/MER calculations use
-- Finaloop's monthly ad spend totals directly from fin_pnl_monthly.

CREATE TABLE fin_klaviyo_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  email_revenue NUMERIC(12,2),
  sms_revenue NUMERIC(12,2)
);

-- ============================================================
-- WHOLESALE (financial data only — from Finaloop P&L)
-- ============================================================
-- All wholesale financial metrics (revenue, margin, fees by segment)
-- come from fin_pnl_monthly with channel = 'wholesale_faire',
-- 'wholesale_direct', or 'wholesale_key'. No separate wholesale tables needed.
-- The parser also constructs a 'wholesale' aggregate row = SUM of all three segments.
-- The "All Wholesale" view queries WHERE channel = 'wholesale' (pre-aggregated).
-- Individual segment views query WHERE channel = 'wholesale_faire' etc.
-- Account-level operational data (reorder rate, pipeline, enrichment)
-- lives in the Wholesale Outreach app and is NOT duplicated here.

-- ============================================================
-- MEMBERSHIP
-- ============================================================
-- Membership data comes from fin_membership_snapshot (daily, computed during Shopify DTC sync).
-- Weekly/monthly aggregation happens at query time via timeline filter, not a separate table.
-- No fin_membership_weekly table needed.

-- ============================================================
-- HEADCOUNT
-- ============================================================

CREATE TABLE fin_headcount (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_name TEXT NOT NULL,
  role TEXT NOT NULL,
  annual_salary NUMERIC(10,2),
  benefits_annual NUMERIC(10,2),
  fully_loaded_annual NUMERIC(10,2),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- INVENTORY (financial view — from Finaloop Balance Sheet)
-- ============================================================
-- Total inventory value comes from fin_balance_sheet_monthly.inventory_value
-- Inventory turns = annualized COGS / avg inventory value (both from Finaloop)
-- Days of inventory = inventory value / (COGS / 365)
-- No separate inventory table needed. No Forekast dependency.
-- SKU-level detail (dead stock, stockout risk) stays in Forekast app.

-- ============================================================
-- CASH FORECAST
-- ============================================================

CREATE TABLE fin_cash_forecast (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  forecast_run_date DATE NOT NULL,
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 13),
  week_start DATE NOT NULL,
  starting_cash NUMERIC(12,2),
  projected_inflows NUMERIC(12,2),
  projected_outflows NUMERIC(12,2),
  projected_ending_cash NUMERIC(12,2),
  inflow_dtc NUMERIC(12,2),
  inflow_wholesale_faire NUMERIC(12,2),
  inflow_wholesale_direct NUMERIC(12,2),
  inflow_wholesale_key NUMERIC(12,2),
  inflow_retail NUMERIC(12,2),
  inflow_marketplace NUMERIC(12,2),
  inflow_other NUMERIC(12,2),
  outflow_payroll NUMERIC(12,2),
  outflow_inventory_pos NUMERIC(12,2),
  outflow_ad_spend NUMERIC(12,2),
  outflow_software NUMERIC(12,2),
  outflow_rent NUMERIC(12,2),
  outflow_sales_tax NUMERIC(12,2),
  outflow_owner_distributions NUMERIC(12,2),
  outflow_other NUMERIC(12,2),
  source_data_stale BOOLEAN DEFAULT false, -- True if upstream sync >24h old at forecast time
  UNIQUE(forecast_run_date, week_number)
);

-- Cash forecast uses trailing average outflows from Finaloop P&L/Cash Flow.
-- No manual commitments table — major outflows (inventory POs, payroll, ad spend)
-- are already in Finaloop. Ramp API deferred to v2 for individual PO tracking.

-- ============================================================
-- ALERT SYSTEM
-- ============================================================

CREATE TABLE fin_alert_thresholds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_key TEXT NOT NULL UNIQUE,
  metric_label TEXT NOT NULL,
  category TEXT NOT NULL,
  green_above NUMERIC(12,2),
  yellow_above NUMERIC(12,2),
  red_below NUMERIC(12,2),
  comparison_type TEXT NOT NULL DEFAULT 'absolute'
    CHECK (comparison_type IN ('absolute', 'trend_decline')),
  trend_periods INTEGER DEFAULT 3,
  higher_is_better BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  notify_on_red BOOLEAN DEFAULT true,
  notify_on_yellow BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fin_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  threshold_id UUID REFERENCES fin_alert_thresholds(id),
  triggered_at TIMESTAMPTZ DEFAULT now(),
  severity TEXT NOT NULL CHECK (severity IN ('red', 'yellow')),
  metric_key TEXT NOT NULL,
  metric_label TEXT NOT NULL,
  current_value NUMERIC(12,2),
  threshold_value NUMERIC(12,2),
  message TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  suppressed_until TIMESTAMPTZ
);
-- Dedup: same metric+severity within 7 days and unacknowledged = skip
-- Escalation: yellow→red always creates new alert
-- Retention: auto-delete acknowledged alerts >90 days (weekly pg_cron)

-- ============================================================
-- SCENARIOS
-- ============================================================

CREATE TABLE fin_scenarios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN (
    'ad_spend', 'wholesale_growth', 'cogs_change', 'new_hire', 'price_change'
  )),
  created_at TIMESTAMPTZ DEFAULT now(),
  inputs JSONB NOT NULL,
  outputs JSONB,
  notes TEXT
);

-- ============================================================
-- SYSTEM
-- ============================================================

CREATE TABLE fin_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error', 'partial', 'retry_1', 'retry_2', 'retry_3')),
  rows_synced INTEGER DEFAULT 0,
  error_message TEXT,
  attempt INTEGER DEFAULT 1,
  failure_notified BOOLEAN DEFAULT false -- prevents duplicate failure emails
);

CREATE TABLE fin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Keys: pin_hash, notification_email, sync_failure_email,
-- key_account_gross_margin (default 0.775),
-- faire_commission_rate (default 0.15),
-- faire_monthly_ad_budget (default 30000),
-- daily_briefing (Claude-generated CEO briefing, updated daily),
-- daily_briefing_include_in_email (default false),
-- seasonality_overrides (JSON: {jan: 1.0, feb: 1.0, ...} — manual monthly multipliers, populated from YoY data but editable),
-- shipping_allocation_method (default 'proportional_to_revenue'),
-- backfill_mode (default false)

-- ============================================================
-- AUDIT LOG (for manual changes)
-- ============================================================

CREATE TABLE fin_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT NOT NULL, -- user email from auth
  changed_at TIMESTAMPTZ DEFAULT now()
);
-- Every manual change to fin_settings, fin_headcount, fin_alert_thresholds,
-- fin_scenarios, or fin_benchmarks writes a row here. Viewable in Settings → Change Log.
-- Retention: keep indefinitely.

-- ============================================================
-- FINANCIAL BENCHMARKS (for AI briefing + chart reference lines)
-- ============================================================

CREATE TABLE fin_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  metric_name TEXT NOT NULL UNIQUE,
  healthy_range TEXT NOT NULL,
  warning_threshold TEXT NOT NULL,
  context_note TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Seeded with industry defaults. Editable by Ryan in Settings → Financial Benchmarks.
-- Used by: (a) AI CEO briefing for comparison context, (b) chart reference lines,
-- (c) scenario engine for sanity-checking outputs.
-- All changes logged to fin_audit_log.
```

---

## 5. EDGE FUNCTIONS — EXECUTION SCHEDULE

**All syncs complete before 6:00 AM EST.** Ryan sees fresh data the moment he opens the app. No waiting for syncs to finish.

| Order | Time (EST) | Function | Frequency | Source | Target |
|---|---|---|---|---|---|
| 1 | 4:00 AM | sync-shopify-dtc | Daily | Shopify API (emilylex store) | fin_revenue_daily + fin_membership_snapshot + fin_shopify_daily (incoming inventory) |

**Note:** FinPulse Shopify sync runs at 4:00 AM, well before Forekast's sync at 6:00 AM. No rate limit conflict — they're 2 hours apart.

| 2 | 4:30 AM | sync-finaloop-sheets | Daily | Google Sheets API v4 | fin_pnl_monthly, fin_cashflow_monthly, fin_balance_sheet_monthly |
| 3 | 4:45 AM | sync-klaviyo-revenue | Daily | Klaviyo REST API | fin_klaviyo_daily (email + SMS revenue only) |
| 4 | 5:00 AM | compute-cash-forecast | Daily | Finaloop + Shopify data | fin_cash_forecast |
| 5 | 5:15 AM | run-alert-engine | Daily | All tables | fin_alerts |
| 6 | 5:30 AM | generate-briefing | Daily | All tables → Claude API | fin_settings (daily_briefing) |
| 7 | 5:45 AM | send-alert-digest | Daily (conditional) | fin_alerts + daily_briefing | Resend email (alert digest, optionally includes AI briefing) |
| 8 | Sunday 2AM | cleanup-old-data | Weekly | fin_alerts + fin_sync_log | Purge acknowledged alerts >90d + old sync logs |

**All 7 daily functions complete by ~5:50 AM EST.** Total chain: ~110 minutes with buffer. Each function targets <60 seconds execution.

**Note on Finaloop data freshness:** Finaloop processes transactions with approximately a 1-day lag. The 4:30 AM sync pulls the most current data available in the Google Sheets — typically through yesterday's close. If Finaloop hasn't updated overnight, the stale data indicator (Section 16-K) flags this on the dashboard.

**Dependency handling:** Each function checks `fin_sync_log` for upstream completion. If upstream failed → proceed with yesterday's data + log warning. Never block.

---

## 6. FRONTEND — PAGES & METRICS

### Navigation

```
/ ..................... CEO Overview (blended, morning check)
/dtc .................. DTC Deep Dive
/wholesale ............ Wholesale Deep Dive
                         [All] [Faire] [Direct] [Key Accounts]
/marketplaces ......... Marketplace Deep Dive (Amazon)
/retail ............... Retail Locations
                         [All Locations] [Studio Store]
/cash ................. Cash Flow & 13-Week Forecast
/inventory ............ Inventory Health
/team ................. Headcount & Labor (PIN-protected)
/scenarios ............ Scenario Modeling (PIN-protected)
/settings ............. Configuration & Data Status
```

### 6.1 CEO Overview (/)

Mobile-first. The morning check. Everything company-wide. **Default view: YTD with YoY comparison active.**

**AI-Generated Morning Briefing (top of page):**
- 3-paragraph CEO briefing generated daily via Claude API after all syncs complete (~5:30 AM EST)
- Covers: revenue pace and YoY trajectory, margin health and what's driving changes, cash position and upcoming risks
- Generated from a structured "facts packet" (pre-computed server-side from dashboard data), NOT open-ended analysis
- Claude is constrained to ONLY reference data in the facts packet — see Section 6.11 for full implementation spec
- Stored in `fin_settings` key `daily_briefing` — generated once per day, not on every page load
- Fallback: if Claude API fails or validation rejects the output, show "AI summary unavailable — review metrics below"

**Metric cards (2×4 grid desktop, stack on mobile):**

| Card | Primary | Secondary | Source |
|---|---|---|---|
| Run Rate | Annualized revenue pace | vs same period last year % | fin_pnl_monthly (trailing 3mo × 4, adjusted for seasonality + growth/decline trend) |
| Cash | Ending cash balance | Days of cash on hand | fin_balance_sheet + forecast |
| Revenue | MTD net revenue (all channels) | vs same month last year % (YoY) | fin_pnl_monthly (company) |
| Margin | Company gross margin % | Trend arrow vs 3-month avg | fin_pnl_monthly (company) |
| CAC | Blended 30-day CAC | LTV:CAC ratio (12mo) | Finaloop ad spend + Shopify new customers |
| Forecast | 13-week minimum cash | Red/yellow/green indicator | fin_cash_forecast |
| Committed POs | Incoming inventory value | as % of current cash | fin_shopify_daily |
| Alerts | Unresolved red/yellow count | Top alert message | fin_alerts |

**Below cards:**
- Channel revenue mix donut chart (DTC, Wholesale, Marketplace, Retail)
- 13-week cash forecast sparkline
- Revenue per employee (single number + trend)
- MER (total revenue / total ad spend)
- Alert feed (last 10 alerts, acknowledge button)
- Last synced timestamps

### 6.2 DTC Deep Dive (/dtc)

**Revenue & Growth:**
- DTC revenue trend (daily/weekly/monthly toggle)
- DTC AOV trend
- Order count trend
- New vs returning customer revenue (stacked bar)
- New customer revenue as % of DTC

**Profitability:**
- DTC gross margin (revenue − COGS − Shopify fees)
- DTC contribution margin (gross margin − ad spend − email marketing)
- DTC contribution margin % trend

**Acquisition & Unit Economics:**
- Blended CAC (total DTC ad spend from Finaloop P&L / new customers from Shopify, trailing 30d)
- MER (DTC revenue / DTC ad spend, both from Finaloop)
- New customer ROAS (new customer revenue / ad spend)
- **LTV (3 time horizons for trend detection):**
  - 12-month LTV = trailing 12mo DTC revenue / trailing 12mo new customers × gross margin %
  - 6-month LTV = trailing 6mo / trailing 6mo new customers × gross margin %
  - 3-month LTV = trailing 3mo / trailing 3mo new customers × gross margin %
  - Trend: if 3mo > 12mo → LTV trending up (green arrow). If 3mo < 12mo → trending down (red arrow).
  - Label: "LTV (simplified — not cohorted)"
- LTV:CAC ratio (gauge, target >3:1 — uses 12-month LTV)
- Payback period (days)
- Ad spend by platform trend (monthly, from Finaloop P&L: `Paid online ads - Facebook Advertising` + `Paid online ads - Google Advertising`)

**Email/SMS (Klaviyo — revenue attribution only):**
- Email + SMS revenue total and as % of DTC
- Email/SMS revenue trend (is retention channel growing or shrinking?)
- Note: "For list health, engagement rates, and campaign performance, see Klaviyo."

**Membership (Studio Insider):**
- Active members + trend
- New/churned members per period
- Monthly churn rate %
- Member vs non-member AOV
- Member purchase frequency vs non-member
- Membership revenue as % of DTC

**Inline alerts:** Yellow/red badges next to any metric with an active alert.

### 6.3 Wholesale Deep Dive (/wholesale)

**Segment toggle:** `[All Wholesale] [Faire] [Direct] [Key Accounts]`

Every metric below recalculates when segment is toggled. **All data sourced from Finaloop P&L — no Shopify order data, no Wholesale Outreach app dependency.**

**Revenue & Profitability:**
- Wholesale revenue trend (monthly, from Finaloop)
- Gross margin (revenue − COGS − channel fees)
- Contribution margin (gross margin − Faire commission if Faire segment)
- Faire commission as % of Faire revenue (Faire segment only)
- Faire commission trend (monthly — track if Faire is taking more over time)
- Faire total cost breakdown: `Selling fees - Faire` (commission only — does NOT include Promoted Listings ad spend, which is billed separately via ACH) and `Paid online ads - Faire` (once recategorized in Finaloop). Note on page: "For advertising-specific performance (ROAS, CPA), see the Faire merchant dashboard."
- Segment mix trend (Faire vs Direct vs Key as % of wholesale)
- Wholesale revenue as % of total company revenue

**Key Accounts (Finaloop `Sales - Wholesale` line):**
- Total key account revenue trend
- Key account revenue as % of total revenue (company-wide dependency flag)
- Key account gross margin (using configurable margin setting from Settings)

**Cash Cycle:**
- Estimated outstanding wholesale AR (from Finaloop Balance Sheet: `Undeposited funds - Faire` + proportional AR)

**Cross-reference to Wholesale Outreach app:**
- Bottom of page shows a note: "For account-level details (reorder rates, pipeline, account health), see the Wholesale Outreach app."
- No link, no integration, no data dependency — just a contextual reference.

### 6.4 Marketplace Deep Dive (/marketplaces)

**Monthly granularity** (Finaloop data only until Amazon API connected).

- Marketplace revenue trend
- Marketplace gross margin (revenue − estimated COGS − platform fees)
- Order count (if available)
- Platform fee breakdown (if Finaloop details available)
- Marketplace contribution margin
- Marketplace revenue as % of total company revenue

**Note:** This page launches thin. Data enriches as Amazon is connected to Finaloop and potentially gets its own API integration later.

### 6.5 Retail (/retail)

**Simple page, designed to scale:**

Segment toggle: `[All Locations] [Studio Store]` (second location slots in later)

- Retail revenue trend (monthly)
- Retail gross margin
- Retail contribution margin
- Revenue as % of total company revenue
- Average transaction value (if Square data allows)

### 6.6 Cash Flow & 13-Week Forecast (/cash)

**Primary chart:** 13-week forecast (bar chart with color zones)
- Green: >45 days of operating expenses
- Yellow: 30-45 days
- Red: <30 days

**Details:**
- Current cash balance + days of cash on hand
- **Committed inventory outflows** (from Shopify incoming inventory × COGS — shows how much cash is committed to POs not yet paid)
- Inflow breakdown by channel per week (stacked bar — shows WHERE cash comes from)
- Outflow breakdown per week (payroll, inventory, ad spend, software, rent, sales tax, owner distributions, other)
- Cash conversion cycle (DIO + DSO − DPO)
- Cash from operations / investing / financing (monthly, from Finaloop)

**Interactive:**
- "Quick what-if" toggle: add hypothetical outflow → forecast recalculates in browser (client-side only)

### 6.7 Inventory Health (/inventory)

Financial view of inventory — all data from Finaloop Balance Sheet and P&L. SKU-level detail stays in Forekast.

- Total inventory value (from Finaloop Balance Sheet)
- Inventory value trend (monthly)
- Inventory value as % of monthly revenue
- Inventory turns (annualized: COGS from P&L / avg inventory value from Balance Sheet)
- Days of inventory on hand (inventory value / daily COGS)
- Inventory purchases cash outflow (from Finaloop Cash Flow: `Inventory purchases, net`)
- Cross-reference note: "For SKU-level inventory (dead stock, stockout risk, reorder points), see Forekast."

### 6.8 Headcount & Labor (/team — PIN Protected)

- Revenue per employee (trend)
- Labor cost as % of revenue (trend)
- Headcount over time
- Employee table (name, role, fully loaded cost — sortable)
- Benchmark: current rev/employee vs $100M at 25-30 heads target
- Add/edit employee form

### 6.9 Scenario Modeling (/scenarios — PIN Protected)

Five scenario types, form + real-time output:

**CRITICAL: Scenarios are "living" projections.** The `fin_scenarios` table stores the user's INPUTS only. Outputs are RECOMPUTED on every page load using current data + saved inputs. This means if margins shifted since the scenario was created, the projected impact updates automatically. The `outputs` JSONB field is used as a cache for the last computed result (for display in the scenario list), but the detail view always recomputes.

| Scenario | Key Inputs | Key Outputs |
|---|---|---|
| Ad Spend Change | Platform, monthly Δ$, efficiency assumption | Projected new customers, revenue impact, new CAC, cash impact |
| Wholesale Growth | New accounts, avg first order, reorder rate, avg reorder | Revenue increase, inventory investment, cash cycle impact |
| COGS Change | % unit cost change, affected channels | New gross margin by channel, profit impact, break-even price increase |
| New Hire | Salary, benefits %, role | Fully loaded cost, cash impact, new rev/employee, revenue to maintain ratio |
| Price Change | % change, channels, manual volume Δ% | Revenue at constant volume, revenue at adjusted volume, new margin, new AOV |

Save & compare up to 3 scenarios side by side.

### 6.10 Settings (/settings)

**Tabbed layout — 7 tabs:**

**Tab 1: Dashboard**
- Data connection status summary (last successful sync per source, health badge, time since last sync)
- "Re-run sync" button per source (Finaloop, Shopify DTC, Klaviyo)
- Today's AI briefing status (generated / failed / pending)
- Quick system health: database size, Edge Function execution times, last cleanup run

**Tab 2: Alert Thresholds**
- Full CRUD for 20+ alert thresholds
- Columns: metric name, green/yellow/red values, active toggle, notification toggle, `higher_is_better` toggle
- "Test alert" button per threshold (evaluates against current data without creating a persistent alert)
- "Reset to defaults" button

**Tab 3: Financial Benchmarks**
- Editable benchmark values used by the AI CEO briefing for context and by the dashboard for reference lines
- Table with columns: Category, Metric, Healthy Range, Warning Threshold, Context Note
- Default values (editable by Ryan):

| Category | Metric | Healthy | Warning | Context |
|---|---|---|---|---|
| Margin | Gross Margin % | 50-65% | <45% | Physical goods ecommerce at $20-50M revenue |
| Acquisition | Blended CAC | <$35 | >$50 | Sub-$50 AOV DTC brands |
| Acquisition | LTV:CAC Ratio | >3:1 | <2:1 | — |
| Retention | Email/SMS % of DTC | 25-40% | <15% | Brands with active email programs |
| Inventory | Inventory Turns | 4-8x | <4x | Physical goods |
| Headcount | Labor % of Revenue | <20% | >25% | Scaling ecommerce brands |
| Cash | Days of Cash | >45 days | <30 days | — |
| Revenue | Channel Concentration | — | >50% single channel | — |
| Growth | Revenue per Employee | $800K-$1.2M | <$600K | At current scale. Target: $3-4M at $100M |

- These values feed into: (a) the AI briefing prompt as benchmark context, (b) alert reference lines on charts, (c) the scenario engine for comparison
- "Reset to industry defaults" button
- All changes logged to `fin_audit_log`

**Tab 4: Channel & Wholesale Config**
- Faire commission rate % (default 15%)
- Faire monthly ad budget (default $30,000 — cross-reference for Promoted Listings spend)
- Key Account gross margin % (default 77.5%, range 70-85%)
- Shipping & fulfillment allocation method: `proportional_to_revenue` (default) or `blended_company_wide`
- Seasonality overrides: manual multipliers per month if the automatic YoY-derived index isn't accurate enough. Table with 12 rows (Jan-Dec), each with a multiplier field (default 1.0). Populated automatically from YoY data but editable.

**Tab 5: Notifications**
- Alert digest email address
- Sync failure email address (can be same or different)
- AI briefing delivery: on-page only (default) or also include in alert digest email
- Slack integration: deferred to v2 (placeholder with "Coming soon" badge)

**Tab 6: Sync Log**
- Full table of `fin_sync_log` entries (last 30 days)
- Columns: Source, Started, Completed, Duration, Status (color-coded badge), Rows Synced, Attempt #, Error Message (expandable)
- Filter by: source, status, date range
- Auto-refresh every 60 seconds
- Expandable rows for full error detail

**Tab 7: Change Log**
- Full table of `fin_audit_log` entries
- Columns: Date, Table, Field, Old Value, New Value, Changed By
- Filter by: table, date range
- Shows every manual change to Settings, headcount, alert thresholds, scenarios, and benchmarks

**Tab 8: PIN Management**
- Set/change PIN for /team and /scenarios
- Current PIN status (set / not set)

### 6.11 AI-Generated CEO Briefing (Claude API)

**What it is:** A 3-paragraph morning briefing generated daily by Claude Sonnet, displayed at the top of the CEO Overview. Not a chatbot — a structured, pre-computed financial summary that reads like a CFO's morning email.

**Architecture — ensuring factual accuracy:**

The briefing is NOT generated by asking Claude to "analyze the business." It's generated by:
1. Pre-computing a structured "facts packet" server-side from FinPulse data
2. Passing the facts packet + a curated benchmarks file to Claude
3. Constraining Claude to ONLY reference data in the facts packet
4. Validating the output before displaying

**Step 1: Facts Packet (computed in `lib/briefing/build-facts-packet.ts`)**

A JSON object containing every metric, comparison, and delta the briefing might reference. All numbers are computed using the same calculation functions the dashboard uses — no AI involvement in the math.

```typescript
interface FactsPacket {
  period: string; // "April 2026"
  // Revenue
  revenue_mtd: number;
  revenue_full_month_projected: number;
  revenue_same_month_last_year: number;
  revenue_yoy_pct: number;
  run_rate_annualized: number;
  run_rate_yoy_growth_pct: number;
  // By channel
  revenue_by_channel: { channel: string; mtd: number; yoy_pct: number }[];
  biggest_growth_channel: string;
  biggest_decline_channel: string | null;
  // Margin
  gross_margin_pct: number;
  gross_margin_3mo_avg: number;
  gross_margin_yoy_delta: number;
  margin_driver: string | null; // pre-computed: which channel's COGS change drove the margin shift
  // Acquisition
  blended_cac: number;
  cac_3mo_avg: number;
  ltv_12mo: number;
  ltv_3mo: number;
  ltv_cac_ratio: number;
  email_sms_pct_of_dtc: number;
  // Cash
  cash_balance: number;
  cash_days: number;
  cash_forecast_min_amount: number;
  cash_forecast_min_week: number;
  incoming_inventory_committed: number;
  // Alerts
  active_red_alerts: { metric: string; value: string }[];
  active_yellow_alerts: { metric: string; value: string }[];
  // Wholesale
  faire_commission_pct: number;
  wholesale_pct_of_total: number;
}
```

**Step 2: Financial Benchmarks (from `fin_benchmarks` table — editable in Settings → Financial Benchmarks)**

Industry benchmarks stored in the database, seeded with defaults, editable by Ryan. The `generate-briefing` Edge Function reads these at runtime so changes take effect the next morning. Claude references them for context.

```typescript
export const FINANCIAL_BENCHMARKS = {
  gross_margin: { healthy: "50-65%", warning: "<45%", context: "for physical goods ecommerce at $20-50M revenue" },
  cac: { healthy: "<$35", warning: ">$50", context: "for sub-$50 AOV DTC brands" },
  ltv_cac_ratio: { target: ">3:1", warning: "<2:1" },
  email_sms_pct: { healthy: "25-40%", warning: "<15%", context: "of DTC revenue for brands with active email programs" },
  inventory_turns: { healthy: "4-8x", warning: "<4x", context: "for physical goods" },
  labor_pct: { healthy: "<20%", warning: ">25%", context: "for scaling ecommerce brands" },
  cash_days: { healthy: ">45 days", warning: "<30 days" },
  channel_concentration: { warning: ">50% single channel" },
  run_rate_context: "ELS target: $100M. Current team: ~25 headcount."
}
```

**Step 3: Claude API Call**

System prompt:
```
You are a CFO analyst for Emily Lex Studio, a $26M multi-channel ecommerce brand (DTC, wholesale, marketplace, retail). Generate a 3-paragraph morning briefing.

RULES:
- Use ONLY the data in the facts packet below. Do not infer, assume, or reference any information not provided.
- Every number you mention must appear in the facts packet exactly.
- Reference benchmarks for context (e.g., "Your gross margin of 48.2% is below the healthy range of 50-65% for ecommerce brands at your scale").
- If a metric is null or missing, skip it — do not estimate.
- Paragraph 1: Revenue pace and trajectory (run rate, YoY growth, channel mix shifts)
- Paragraph 2: Margin and unit economics health (gross margin trend, CAC, LTV direction, email/SMS contribution)
- Paragraph 3: Cash position and risks (forecast, committed POs, any red/yellow alerts requiring attention)
- Tone: Direct, concise, CEO-to-CEO. No filler. No "great news" or "concerning." Just facts and what they mean.
- Maximum 250 words total.
```

Model: `claude-sonnet-4-20250514` (fastest, cheapest, sufficient for structured summarization)
Max tokens: 500

**Step 4: Output Validation (`lib/briefing/validate-briefing.ts`)**

Before displaying, the validation function:
1. Extracts all dollar amounts and percentages from Claude's output
2. Checks each against the facts packet — every number must have a matching source
3. If any number appears that isn't in the facts packet → reject, use fallback
4. If output exceeds 300 words → reject, use fallback
5. Fallback: "AI summary unavailable. Review the metrics below."

**Execution:**
- Runs as its own Edge Function `generate-briefing` at 5:30 AM EST (after all syncs + alert engine complete)
- Facts packet is built, Claude API is called, output is validated, stored in `fin_settings` key `daily_briefing`
- CEO Overview reads from `fin_settings` — no API call on page load
- Cost: ~$0.01-0.02 per day (one Sonnet call with ~2K input tokens, ~500 output tokens) = ~$0.50/month
- If Claude API is down or validation fails, the briefing section shows "AI summary unavailable — review metrics below" and the sync log records the failure

**Phase:** Build in Phase 5 (requires all data sources and calculations to be working first)

---

## 7. ALERT ENGINE — 20 DEFAULT THRESHOLDS

| # | metric_key | Label | Category | Green | Yellow | Red | Type |
|---|---|---|---|---|---|---|---|
| 1 | gross_margin_pct | Gross Margin % | Margin | >55% | >45% | <45% | absolute |
| 2 | gross_margin_trend | Gross Margin Trend | Margin | — | — | 3 monthly declines | trend |
| 3 | cash_days | Days of Cash | Cash | >60 | >30 | <30 | absolute |
| 4 | cash_forecast_min | 13wk Forecast Min | Cash | >45d opex | >30d | <30d | absolute |
| 5 | blended_cac | Blended CAC ($) | Acquisition | <30 | <45 | >45 | absolute |
| 6 | ltv_cac_ratio | LTV:CAC Ratio | Acquisition | >3.0 | >2.0 | <2.0 | absolute |
| 7 | channel_max_pct | Largest Channel % Rev | Revenue | <40% | <50% | >50% | absolute |
| 8 | dtc_aov_trend | DTC AOV Trend | Revenue | — | — | 3 weekly declines | trend |
| 9 | wholesale_revenue_trend | Wholesale Revenue Trend | Wholesale | — | — | 3 monthly declines | trend |
| 10 | faire_commission_pct | Faire Commission % | Wholesale | <18% | <22% | >22% | absolute |
| 11 | inventory_turns | Inventory Turns | Inventory | >6 | >4 | <4 | absolute |
| 12 | sales_tax_vs_avg | Sales Tax Liability vs Avg Payment | Cash | <1.5× | <2× | >2× avg monthly payment | absolute |
| 13 | incoming_inventory_pct | Incoming Inventory as % of Cash | Cash | <15% | <25% | >25% | absolute |
| 14 | labor_pct | Labor % of Revenue | Headcount | <20% | <25% | >25% | absolute |
| 15 | membership_churn | Member Monthly Churn | Membership | <3% | <5% | >5% | absolute |
| 16 | email_pct | Email/SMS % of DTC | Acquisition | >25% | >15% | <15% | absolute |
| 17 | inventory_value_pct | Inventory as % of Revenue | Inventory | <30% | <40% | >40% | absolute |
| 18 | meta_spend_trend | Meta Ad Spend Trend | Acquisition | — | — | 3 monthly increases >15% | trend |
| 19 | new_customer_trend | New Customer Trend | Acquisition | — | — | 4 weekly declines | trend |
| 20 | revenue_recon | Finaloop vs Shopify Δ% | Revenue | <3% | <5% | >5% | absolute |

All editable in Settings. Trend alerts require N+1 periods minimum data. Revenue reconciliation compares DTC+wholesale only (excludes key accounts, marketplace, retail).

**Developer note on threshold evaluation:** The `higher_is_better` BOOLEAN on `fin_alert_thresholds` controls evaluation direction. When `higher_is_better = true` (e.g., gross margin): value > green_above = green, value > yellow_above = yellow, value < red_below = red. When `higher_is_better = false` (e.g., CAC, churn, labor %): the comparison is INVERTED — value < green_above = green, value > red_below = red. The column names `green_above` and `red_below` are semantically correct for "higher is better" metrics — for inverted metrics, read them as "green when below this" and "red when above this." Unit test every threshold with both passing and failing values.

---

## 7.5 VISUALIZATION MAP — EVERY METRIC'S CHART TYPE

Build every visualization using shadcn/ui `<ChartContainer>` + Recharts components. All charts are Client Components (`'use client'`). Load via `next/dynamic` with `{ ssr: false }` to prevent hydration mismatches.

**Channel color palette (define in `globals.css` as CSS variables):**
- `--chart-dtc`: Blue (`#2563eb`)
- `--chart-faire`: Green (`#16a34a`)
- `--chart-direct`: Amber (`#d97706`)
- `--chart-key`: Purple (`#7c3aed`)
- `--chart-retail`: Slate (`#475569`)
- `--chart-marketplace`: Orange (`#ea580c`)
- `--chart-comparison`: Dashed gray (`#9ca3af`) — for "previous period" / "same period last year" overlays

### CEO Overview (/)

| Metric | Visualization | Notes |
|---|---|---|
| AI Morning Briefing | Styled text block (card with subtle background) | 3 paragraphs, generated daily at 5:30 AM. Fallback: "AI summary unavailable" |
| Run rate | shadcn `Card` with large number + YoY % | "Annualized: $XX.XM" with sub-text: "+X% YoY, seasonality applied/not applied" |
| Cash balance | shadcn `Card` with large number | Green/yellow/red background based on days-of-cash threshold |
| MTD revenue | shadcn `Card` with number + YoY Δ% badge | **YoY comparison by default** — badge shows vs same month last year |
| Gross margin % | shadcn `Card` with number + trend arrow | Arrow up/down/flat based on 3-month avg |
| Blended CAC | shadcn `Card` with number + LTV:CAC sub-text | — |
| 13-week min cash | shadcn `Card` with green/yellow/red indicator | — |
| Committed POs | shadcn `Card` with number | Incoming inventory value as % of current cash |
| Alert count | shadcn `Card` with badge count | Click navigates to alert feed |
| Channel revenue mix | **Donut/Pie chart** (`PieChart` + `Pie`) | 4 segments: DTC, Wholesale, Marketplace, Retail. Inner label = total revenue |
| 13-week cash forecast | **Area chart** (`AreaChart` + `Area`) | Green/yellow/red fill zones based on cash-days thresholds. X = week, Y = ending cash |
| Revenue trend | **Line chart** (`LineChart` + `Line`) | Monthly line, last 12 months. **YoY comparison line active by default** (dashed gray) |
| Alert feed | shadcn `Table` (compact) | Last 10 alerts, severity badge, acknowledge button |

### DTC (/dtc)

| Metric | Visualization | Notes |
|---|---|---|
| Revenue trend | **Area chart** with gradient fill | Daily/weekly/monthly toggle via `<TimelineFilter>`. Comparison line if active |
| AOV trend | **Line chart** | Same time range as revenue. Thin line, no fill |
| Order count | **Bar chart** (`BarChart` + `Bar`) | Vertical bars, same time range |
| New vs returning revenue | **Stacked bar chart** | Two colors stacked: new (dark blue) + returning (light blue) |
| New customer % | **Line chart** (percentage Y-axis) | Single line, 0-100% scale |
| Gross margin % trend | **Line chart** | With horizontal reference line at alert threshold (45%) |
| Contribution margin trend | **Area chart** with gradient | Positive = green gradient, negative = red gradient |
| CAC trend | **Line chart** | Blended DTC CAC only. With horizontal reference lines at $30 (yellow) and $45 (red) |
| MER trend | **Line chart** | — |
| LTV (3 horizons) | shadcn `Card` with 3 numbers | 12mo / 6mo / 3mo side by side. Trend arrow comparing 3mo vs 12mo. Green = improving, red = declining |
| LTV:CAC gauge | **Radial/gauge chart** (`RadialBarChart`) | Uses 12mo LTV. Target: 3:1 center label. Green >3, yellow 2-3, red <2 |
| Payback period | shadcn `Card` with number | "X days" with trend arrow |
| Email/SMS revenue | **Stacked area chart** | Email + SMS stacked, same time range |
| Membership metrics | **Multi-line chart** | Active members (solid), new (dashed green), churned (dashed red) |
| Member vs non-member AOV | **Grouped bar chart** | Side-by-side bars per period |

### Wholesale (/wholesale)

| Metric | Visualization | Notes |
|---|---|---|
| Revenue trend | **Area chart** | Segment toggle changes data. "All" shows stacked area (Faire + Direct + Key) |
| Gross margin % | **Line chart** | Per-segment line when viewing "All" |
| Contribution margin | **Area chart** with gradient | Positive = green, shows profitability after all costs |
| Segment mix trend | **Stacked area chart** (100%) | Shows Faire/Direct/Key as % of wholesale over time |
| Faire commission % | **Line chart** | Faire segment only. Single percentage line trending over time |
| Faire commission trend | **Bar chart** | Monthly commission $ amount — is it growing? |
| Wholesale as % of total | **Line chart** | Shows channel dependency trend |
| Key account revenue | shadcn `Card` with number + trend | Total from `Sales - Wholesale` line |
| Cash cycle / AR | shadcn `Card` with number | Estimated from Finaloop Balance Sheet undeposited funds |

### Cash (/cash)

| Metric | Visualization | Notes |
|---|---|---|
| 13-week forecast | **Bar chart** (primary visualization) | Stacked bars: inflows (green, above axis) + outflows (red, below axis). Ending cash line overlaid. Color zones: green/yellow/red based on days-of-cash |
| Committed PO outflows | shadcn `Card` with large number | From Shopify incoming inventory × COGS. Yellow/red badge if >20% of current cash. Tooltip: "Inventory on order not yet paid — will reduce cash within 60-90 days. Subtracted from forecast ending cash as a lump adjustment." |
| Inflow breakdown by channel | **Stacked bar chart** | 6 channel colors per week |
| Outflow breakdown | **Stacked bar chart** | Categories: payroll, inventory, ad spend, software, rent, sales tax, owner distributions, other. Weeks 1-4 use committed data, weeks 5-13 use projected |
| Cash balance trend | **Area chart** | Historical cash from Finaloop balance sheet (monthly) + forecast (weekly, dashed) |
| Cash conversion cycle | shadcn `Card` with number | DIO + DSO − DPO, trend arrow |

### Inventory (/inventory)

| Metric | Visualization | Notes |
|---|---|---|
| Inventory value trend | **Area chart** | Monthly from Finaloop Balance Sheet |
| Inventory turns | shadcn `Card` with number | Annualized, trend arrow |
| Days of inventory | shadcn `Card` with number | Trend arrow |
| Inventory as % of revenue | **Line chart** | Monthly, with alert reference line |
| Inventory purchases | **Bar chart** | Monthly cash outflow from Finaloop Cash Flow |

### Retail (/retail)

| Metric | Visualization | Notes |
|---|---|---|
| Revenue trend | **Area chart** | Monthly |
| Contribution margin | **Line chart** | — |
| Revenue as % of total | shadcn `Card` with number + trend | — |

### Team (/team)

| Metric | Visualization | Notes |
|---|---|---|
| Revenue per employee | **Line chart** | Monthly, with benchmark reference line ($100M/25 heads = $4M/head) |
| Labor % of revenue | **Line chart** | With reference lines at 20% (yellow) and 25% (red) |
| Headcount over time | **Step chart** (`LineChart` with `type="stepAfter"`) | Shows headcount changes as steps, not gradual lines |
| Employee table | shadcn `Table` | Name, role, fully loaded cost, start date. Add/edit form |

### Scenarios (/scenarios)

| Element | Visualization | Notes |
|---|---|---|
| Input form | shadcn form components | Dynamic fields based on scenario type |
| Output metrics | shadcn `Card` grid | **Every output card shows CURRENT → PROJECTED** (e.g., "Rev/employee: $3.2M → $2.9M") with Δ% badge in green or red |
| Revenue/margin impact | **Bar chart** (before vs after) | Grouped bars: current (gray) vs projected (blue/green/red based on direction) |
| Cash impact | **Line chart** | Current forecast (solid) vs modified forecast (dashed) overlay |
| Side-by-side compare | **Grouped bar chart** | Up to 3 scenarios as grouped bars per metric |

### Shared Chart Patterns (Developer Rules)

1. **Every chart has a tooltip.** Use shadcn's `<ChartTooltip content={<ChartTooltipContent />} />`. Format numbers with `Intl.NumberFormat` (currency for dollars, percentage for %, plain for counts).
2. **Every chart has a Y-axis label.** Revenue charts show "$", margin charts show "%", count charts show no unit.
3. **Every chart is responsive.** Recharts `<ResponsiveContainer>` handles this. shadcn's `<ChartContainer>` wraps it automatically. Set `className="h-[300px]"` on desktop, `h-[200px]` on mobile.
4. **Comparison data renders as dashed lines.** When the timeline comparison toggle is active, the current period is a solid line/fill and the comparison period is a dashed gray line with reduced opacity.
5. **Alert reference lines.** Any metric with an alert threshold shows horizontal dashed lines at the yellow and red threshold values (e.g., gross margin chart has dashed lines at 55% and 45%).
6. **Empty state.** If a chart has no data (new install, missing source), show the shadcn `<Skeleton>` component at the chart's height, with a centered message: "No data yet" or "Connect {source} in Settings."
7. **Loading state.** While data is fetching, show `<Skeleton>` at chart height. Never show a chart with stale/wrong data that then jumps to correct data (no flash of incorrect content).
8. **Number formatting consistency:**
   - Revenue/cash: `$1,234,567` (no decimals for >$1K, two decimals for <$1K)
   - Percentages: `45.2%` (one decimal)
   - Counts: `1,234` (comma-separated, no decimals)
   - Currency changes (Δ): `+$12,345` or `-$12,345` (green/red color)
   - Percentage changes (Δ): `+5.2%` or `-3.1%` (green/red color)

---

## 8. KEY CALCULATIONS

**Revenue Run Rate (Annualized Pace):**
- Base calculation: trailing 3-month average monthly revenue × 12
- **Growth/decline adjustment:** Calculate trailing 3-month MoM growth rate. Apply this compounding rate to the remaining months in the year. Example: if trailing 3mo avg is $2.2M/month with +3% MoM growth and it's April, project May-Dec with 3% monthly compounding applied to each future month, then sum Jan-Apr actuals + May-Dec projected.
- **Seasonality adjustment:** Apply a seasonality index derived from YoY data (if available). The index is computed as: `seasonality_index[month] = last_year_month_revenue / last_year_annual_revenue × 12`. This produces a multiplier for each month (e.g., December = 1.6 means Dec is 60% above average). Known seasonal events for ELS:
  - **January:** Faire market (wholesale spike)
  - **July:** Faire market (wholesale spike)
  - **October-December:** Q4 DTC holiday season (major DTC spike)
  - If no YoY data exists, use growth-adjusted run rate without seasonality and label as "seasonality not applied — insufficient historical data"
- Display: "Annualized Run Rate: $XX.XM" with sub-text showing the growth rate and whether seasonality is applied
- This is the FIRST card on the CEO Overview — the most important number for a growth-stage CEO

**Blended CAC** = SUM(Finaloop P&L DTC ad spend lines, current month) / COUNT(new customer orders from Shopify DTC, current month)
- Monthly granularity (Finaloop provides monthly ad spend, not daily)
- Trailing 30-day CAC uses current month's ad spend prorated if mid-month
- **No platform-level CAC.** Platform-specific cost-per-acquisition stays in Meta Ads Manager and Google Ads (enhanced by Elevar). FinPulse only tracks blended DTC CAC.

**MER** = total revenue / total ad spend (both from Finaloop P&L)

**12-Month LTV (simplified, 3 horizons):**
- 12mo LTV = trailing 12mo DTC revenue / trailing 12mo new customers × gross margin %
- 6mo LTV = trailing 6mo DTC revenue / trailing 6mo new customers × gross margin %
- 3mo LTV = trailing 3mo DTC revenue / trailing 3mo new customers × gross margin %
- All inputs come from `fin_pnl_monthly` (DTC revenue, gross margin) and `fin_revenue_daily` (new_customer_orders summed over window). No per-customer data needed.
- This is NOT a cohorted LTV. It's a channel-level proxy: "average revenue per new customer acquired." The 3-horizon comparison shows whether customer quality is improving or declining.
- Label: "LTV (simplified — not cohorted)"

**LTV:CAC Ratio** = LTV / Blended CAC

**Payback Period** = CAC / (avg daily revenue per customer × gross margin %)

**Cash Forecast Starting Balance** = most recent Finaloop Balance Sheet `Total Cash-on-hand` (from Cash Flow reconciliation section — most accurate current cash number: bank accounts + undeposited funds - credit card balances)

**Cash Forecast Weekly Projections:**
- Inflows: For ALL channels, use Finaloop trailing 3-month average monthly revenue / 4.33 to get weekly baseline. Then apply two adjustments:
  1. **Growth/decline trend:** Calculate trailing 3-month MoM growth rate. Apply this rate to each projected week (compounding). If revenue has been growing 3% MoM, each future week is 3%/4.33 higher than the last.
  2. **Seasonality index:** If YoY data exists, compute `seasonality_index[month] = last_year_month_revenue / last_year_monthly_average`. Apply this multiplier to each projected month's weeks. Known ELS seasonal events: January Faire market (wholesale spike), July Faire market (wholesale spike), Q4 DTC holiday season (Oct-Dec). If no YoY data, multiplier = 1.0.
  - Final weekly inflow = baseline_weekly × growth_adjustment × seasonality_index
- Outflows: Finaloop trailing 3-month averages for ALL categories, divided by 4.33 for weekly:
    - Inventory purchases (Cash Flow: `Inventory purchases, net`)
    - Payroll (P&L: `Total Payroll`)
    - Ad spend (P&L: `Total Paid online ads`)
    - Shipping (P&L: `Shipping & freight-out`)
    - Software + G&A (P&L: `Total G&A` + `Total S&M` - ad spend)
    - Sales tax (Cash Flow: sales tax payments)
    - Owner distributions (Cash Flow: `Distributions - Ryan Lex`) — if regular
- **Committed inventory adjustment:** Shopify `incoming_inventory_value` from `fin_shopify_daily` is subtracted from the final week-13 ending cash as a single lump-sum adjustment. This represents POs already placed but not yet paid — cash that will leave the bank within 60-90 days but isn't yet in Finaloop's trailing averages. Displayed on the /cash page as a separate card: "Committed PO Outflows: ${X} (not yet reflected in Finaloop)." The forecast ending cash line shows two values: "Projected: ${Y}" and "After committed POs: ${Y - X}."

**Faire Commission Impact** = `Selling fees - Faire` / `Sales - Faire (via Shopify)` — displayed on Faire segment view

**Key Account COGS** = Key Account Revenue × (1 − Settings.key_account_gross_margin)

**Contribution Margin** = Net Revenue − COGS − Channel Fees − Allocated Ad Spend (per channel)

---

## 9. SECURITY & ACCESS

| User | Role | Access |
|---|---|---|
| Ryan | admin | All pages, all settings, PIN-protected pages |

Single-user app for v1. No role-based navigation filtering needed. If additional users are added later, the `app_role` metadata on `auth.users` and the existing RLS policies support it without schema changes.

- Supabase Auth (email/password)
- RLS on all `fin_` tables — explicit policies:
  - All `fin_` tables: `authenticated` role can SELECT
  - Config tables (thresholds, settings, headcount, scenarios): only `admin` role can INSERT/UPDATE/DELETE
  - RLS enforced via Supabase auth.users metadata `app_role` field
- PIN stored hashed (bcrypt) in `fin_settings`
  - Lockout after 10 consecutive failures for 15 minutes (return HTTP 429). See Section 16-F for implementation details.
- All API keys in Vercel env vars, never in code
  - Google Sheets service account JSON (Finaloop sheets access)
  - Shopify emilylex store API access token
  - Klaviyo private API key
  - Resend API key (restrict to verified sender domain)
  - Anthropic API key (for Claude Sonnet daily briefing)
  - Key rotation: document rotation schedule, set calendar reminders for annual review
- Supabase service_role key: ONLY in Edge Functions (server-side). Never in client-side code. Client uses anon key.
- CORS: Next.js API routes restricted to production domain only
- Input sanitization: All user inputs validated via Zod schemas before DB write
- Finaloop sheet parsing: Validate sheet structure (expected columns/rows) before ingestion. If format doesn't match, log error + alert, don't corrupt data.
- Finaloop: read-only Google Sheets access via service account

---

## 10. TESTING, CI/CD & MONITORING

### Testing Strategy

**Unit Tests (Vitest ^3.x):**
- All calculation functions: CAC, LTV, MER, contribution margin, cash forecast projections
- Finaloop sheet parser: validate correct line-item → channel mapping
- Alert engine: threshold evaluation, deduplication logic, trend detection
- Zod schema validation for all data inputs
- Target: 100% coverage on calculation functions, 80%+ on parsers and business logic

**End-to-End Tests (Playwright ^1.x):**
- Auth flow: login, role-based page access, PIN protection
- CEO Overview loads with data
- Channel toggle on wholesale page filters correctly
- Alert acknowledgment flow
- Cash forecast what-if interaction
- Scenario save/compare flow
- Target: Critical happy paths for all 10 pages

**Data Validation Tests:**
- Finaloop sheet schema validation (column headers, row structure match expected format)
- Cross-source reconciliation check (Finaloop vs Shopify revenue within 5%)
- Edge Function sync log verification (all syncs completed, no persistent errors)
- Alert threshold smoke test (verify all 20 thresholds trigger correctly with test data)

### CI/CD Pipeline (GitHub Actions)

```
On Pull Request:
  1. pnpm install
  2. TypeScript type-check (tsc --noEmit)
  3. ESLint
  4. Vitest unit tests
  5. Supabase type generation check (types match schema)
  6. Build check (next build)
  → PR blocked if any step fails

On Merge to main:
  1. All PR checks pass
  2. Auto-deploy to Vercel (production)
  3. Playwright E2E smoke test against preview URL (optional, can be manual gate)

On Merge to develop (if using branch strategy):
  1. Auto-deploy to Vercel preview
  2. Manual QA checkpoint
```

### Database Migrations

- All schema changes via Supabase CLI: `supabase migration new <name>`
- Migrations version-controlled in repo under `supabase/migrations/`
- Apply via `supabase db push` (development) or automatic on deploy (production)
- **Never manual SQL in production dashboard.** All changes through migration files.
- Type generation runs post-migration: `supabase gen types typescript --project-id <id> > src/lib/database.types.ts`

### Error Monitoring & Observability

- **Vercel built-in error tracking** — runtime errors, Edge Function failures, build errors
- **Supabase Dashboard** — Edge Function logs, database performance, connection pooling metrics
- **Custom observability via `fin_sync_log`:**
  - Every Edge Function logs start time, completion time, status, rows synced, errors
  - Settings page shows sync health dashboard (last sync per source, success/error badge)
  - Alert engine monitors sync health: if any source hasn't synced in >36 hours → yellow alert
- **Edge Function performance:** Monitor execution time. Alert if any function exceeds 30 seconds (Supabase timeout is 150s default).

---

## 11. BUILD PHASES

### Phase 1: Foundation (Weeks 1-3)
**Build:**
- Supabase project creation + full schema deployment via migrations
- Supabase type generation setup
- GitHub repo + CI/CD pipeline (GitHub Actions: lint, type-check, test, build)
- Google Sheets service account + `sync-finaloop-sheets` Edge Function (P&L + Balance Sheet + Cash Flow parsers)
- Finaloop line-item → channel mapping logic (the core transformation)
- Finaloop sheet schema validation (Zod — reject malformed data)
- `sync-shopify-dtc` Edge Function (DTC orders only, aggregate in memory, write to fin_revenue_daily + fin_membership_snapshot)
- Historical backfill — Finaloop: 24 months. Shopify: 24 months DTC orders aggregated.
- CEO Overview page (/)
- DTC page (/dtc) — revenue, margin, new/returning (no Klaviyo yet)
- Auth + login + role-based proxy.ts
- Settings — sync health + data connection status

**Test:**
- Unit tests for Finaloop parser and channel mapping logic
- Unit tests for revenue daily computation
- E2E: login flow, CEO Overview renders with data
- Verify Supabase RLS policies block unauthorized access

**Validate:**
- Finaloop data matches source (spot-check 3 months against actual Finaloop dashboard)
- Shopify revenue daily matches Shopify admin reports
- **Validation task:** Check Appstle tags in Shopify order data

### Phase 2: Cash & Alerts (Weeks 4-5)
**Build:**
- `compute-cash-forecast` Edge Function (uses Finaloop trailing averages for projections)
- `run-alert-engine` + `send-alert-digest` Edge Functions
- Cash page (/cash) — 13-week forecast, outflow breakdown, what-if toggle
- Alert threshold Settings (full CRUD for 20 thresholds)
- Notification config (Resend integration — alert digests + sync failure emails)
- Inventory page (/inventory) — financial metrics from Finaloop Balance Sheet only

**Test:**
- Unit tests for cash forecast calculation (known inputs → expected outputs)
- Unit tests for alert engine (threshold evaluation, deduplication, trend detection)
- Unit tests for all 20 default alert thresholds with synthetic data
- E2E: acknowledge alert → suppression works

**Validate:**
- Cash forecast starting balance matches Finaloop Cash Flow reconciliation section
- Alert email delivery (send test digest, verify format)
- Inventory value matches Finaloop Balance Sheet

### Phase 3: Acquisition & Klaviyo (Weeks 6-7)
**Build:**
- `sync-klaviyo-revenue` Edge Function (email + SMS revenue only — one API call/day)
- DTC page completion — CAC (Finaloop ad spend / Shopify new customers), LTV, MER, email/SMS %, membership metrics
- Ad spend trend chart (from Finaloop P&L, monthly granularity)

**Test:**
- Unit tests for CAC, LTV, MER, payback period calculations
- Unit tests for Klaviyo revenue parsing
- E2E: DTC page renders all acquisition metrics

**Validate:**
- Blended CAC sanity check against known ad spend / new customer count
- Email/SMS revenue % is plausible (industry benchmark: 20-35% of DTC for healthy brands)
- Ad spend totals match Finaloop P&L `Paid online ads` lines

### Phase 4: Wholesale & Channels (Weeks 8-10)
**Build:**
- Wholesale page (/wholesale) — segment toggle, all financial metrics from Finaloop P&L
- Faire commission trend analysis
- Marketplace page (/marketplaces) — thin, Finaloop monthly data
- Retail page (/retail)
- Team page (/team) — PIN protection, headcount form, rate limiting

**Test:**
- Unit tests for wholesale margin/contribution margin calculations by segment
- E2E: wholesale segment toggle filters all metrics; PIN protection blocks/allows correctly
- E2E: PIN brute-force lockout works after 10 attempts

**Validate:**
- Wholesale revenue by segment matches Finaloop P&L line items exactly
- Faire commission % matches Finaloop `Selling fees - Faire` / `Sales - Faire`
- Key account revenue matches Finaloop `Sales - Wholesale` line

### Phase 5: Scenarios, AI Briefing, Security & Polish (Weeks 11-12)
**Build:**
- Scenarios page (/scenarios) — all 5 types, save/compare, living recomputation on load
- **AI CEO Briefing** — facts packet builder, Claude API integration, output validation, daily_briefing storage, CEO Overview display (see Section 6.11)
- Financial benchmarks config file (`constants/financial-benchmarks.ts`)
- Full Settings page completion (all sections + Change Log tab)
- Revenue reconciliation automation (Finaloop vs Shopify DTC monthly check)
- Mobile responsive pass (CEO Overview must be excellent on phone)

**Test:**
- Unit tests for all 5 scenario calculation types
- Unit tests for facts packet builder (verify every field is computed correctly from test data)
- Unit tests for briefing validation (verify it catches hallucinated numbers, rejects oversized outputs)
- Unit test for run rate calculation with and without seasonality data
- Full Playwright E2E suite across all 10 pages
- Security audit: verify RLS blocks unauthorized writes, PIN lockout works, no API keys in client bundle
- Load test: simulate all 8 Edge Functions running in sequence, verify no timeouts

**Validate:**
- All 20 alert thresholds smoke-tested with realistic data
- Scenario outputs sanity-checked against manual calculations
- Cross-source reconciliation: Finaloop total revenue ≈ sum of channel revenues (within 1%)
- Mobile usability review on iPhone and Android

**Documentation:**
- Threshold tuning guide (for Ryan)
- Data source map (which metric comes from where)
- Runbook: what to do when a sync fails, how to re-run, how to backfill
- Developer onboarding doc: repo setup, env vars, local dev, migration workflow

---

## 12. COST

| Item | One-Time | Monthly |
|---|---|---|
| Developer (12 weeks) | TBD | — |
| Supabase Pro (new project) | $0 | $25 |
| Vercel | $0 | $0 (free tier) |
| Resend | $0 | $0 (free tier) |
| Google Sheets API | $0 | $0 |
| Klaviyo API | $0 | $0 (included) |
| Claude API (Sonnet 4) | $0 | ~$0.50 |
| **Total incremental SaaS** | **$0** | **~$26/month** |

**Savings from Triple Whale cancellation: $18,000-30,000/year** (scaling higher as GMV grows).

---

## 13. EXIT CRITERIA

| Item | Detail |
|---|---|
| Exit trigger | Finaloop or competitor releases native configurable alerts + cash forecasting + multi-channel contribution margin |
| Data portability | All data in Supabase Postgres → pg_dump. Google Sheets persists independently. |
| Switching cost | 1-2 weeks. Frontend disposable. Schema documented. Edge Functions self-contained. |
| Ongoing maintenance | ~2-4 hours/month (threshold tuning, dependency bumps) |

---

## 14. UX RULES (FOR DEVELOPER BRIEF)

**States:**
- Every page handles three states: Loading (skeleton), Empty (message + action), Error (retry + last-known-good data)
- Charts with <6 months data show "Limited data" notice
- Cash balance between monthly closes shows "Estimated ±5%" badge

**Data freshness:**
- Every page displays a "Last updated" timestamp in the header, pulled from `fin_sync_log` for the most relevant data source on that page
- If any data source hasn't synced in >24 hours, show a yellow "Stale data" badge next to affected metrics
- If a source hasn't synced in >72 hours, show a red "Sync failed" badge with a link to Settings

**Graceful degradation:**
- If Finaloop data is missing: CEO Overview shows "Connect Finaloop" prompt. DTC/Wholesale pages show Shopify-only data (order counts, AOV) without margin or P&L metrics.
- If ad spend data is missing: DTC page shows all metrics EXCEPT CAC, MER, LTV:CAC, payback period. Those sections show "Add ad spend in Settings →" prompt.
- If Klaviyo data is missing: email/SMS section shows "Connect Klaviyo" prompt. Rest of DTC page works normally.
- **No page should ever be completely blank due to a single data source failure.**

**Finaloop Reconciliation Timing Annotations:**
Finaloop processes transactions asynchronously — some line items (Faire commissions, payroll, uncategorized transactions) lag behind actual sales dates. This means month-to-month comparisons may appear distorted, especially for:
- **Faire selling fees** — allocated quarterly/evenly rather than matched to monthly revenue
- **Payroll** — may show $0 for the current month until payroll is processed
- **Uncategorized transactions** — large amounts ($757K YTD in expenses) that haven't been categorized yet

**Implementation:**
- Any metric that uses a Finaloop line known to have reconciliation lag gets a small `*` indicator next to the value
- Clicking the `*` or hovering shows a tooltip: "This value may be affected by Finaloop reconciliation timing. Final numbers are typically accurate within 30 days of month-end."
- Create a `constants/reconciliation-lagged-lines.ts` config listing which Finaloop line items are known to lag:
  ```typescript
  export const RECONCILIATION_LAGGED = [
    'Selling fees - Faire',        // Quarterly allocation
    'Salaries & wages',            // Payroll processing delay
    'Employer taxes',              // Payroll processing delay
    'Employee benefit programs',   // Payroll processing delay
    'Uncategorized transactions - money received',
    'Uncategorized transactions - money spent',
  ]
  ```
- On any page showing metrics derived from lagged lines, add a footer note: "* Values marked with an asterisk may be affected by Finaloop reconciliation timing."
- The `is_partial` flag on `fin_pnl_monthly` already handles current-month incompleteness. The reconciliation annotation handles COMPLETED months that may still have timing discrepancies.

**Client-Side Alert Evaluation (Real-Time):**
- The alert engine Edge Function runs at 5:15 AM and writes alerts to `fin_alerts`. But the CEO Overview page should NOT wait for the alert engine to evaluate thresholds.
- The CEO Overview Server Component loads the current metric values AND the alert thresholds, then evaluates thresholds at page-load time. This means Ryan sees current alert states the moment he opens the dashboard, even at 7 AM before the alert engine runs.
- The alert engine's job is: persistent storage (fin_alerts table), email notifications, and deduplication logic. The CEO Overview's job is: real-time visual indicators.
- Implementation: `lib/calculations/evaluate-thresholds.ts` — a shared function that takes a metric value + threshold config and returns 'green' | 'yellow' | 'red'. Used both by the alert engine Edge Function AND the CEO Overview page component.

**Export & Share (Deferred to Phase 5+):**
- v1 has no export/PDF functionality.
- Future consideration: "Copy as image" button on each chart (using html2canvas or similar), and "Share link" button that copies the current URL (with timeline filter state encoded in query params) to clipboard.
- URL-based sharing already works because timeline filters are URL-persisted — copying the URL gives someone the exact same view.

**Alert engine rules:**
- Trend alerts require N+1 periods minimum data; silently skip if insufficient
- Revenue reconciliation compares DTC+wholesale only (excludes key accounts, marketplace, retail)
- Historical backfill is non-blocking; dashboard launches with whatever data exists

**Timeline Filter System (GLOBAL — applies to every data page):**

Every page with time-series data (CEO Overview, DTC, Wholesale, Marketplaces, Retail, Cash, Inventory) must include a standardized date range control built as a single reusable `<TimelineFilter />` component.

Preset ranges (buttons, not dropdown):
- `7D` | `30D` | `90D` | `YTD` | `12M` | `ALL` | `Custom`

Custom range: calendar date picker for start and end date. Max range = all available data (up to 24 months).

Defaults by page:
| Page | Default Range | Granularity Options |
|---|---|---|
| CEO Overview | YTD | Monthly only — **YoY comparison ON by default** |
| DTC | 90D | Daily / Weekly / Monthly toggle |
| Wholesale | 12M | Weekly / Monthly toggle |
| Marketplaces | 12M | Monthly only |
| Retail | 12M | Monthly only |
| Cash (/cash) | 13 weeks forward | N/A (forecast is always 13 weeks) |
| Inventory | 90D | Daily / Monthly toggle |

Comparison toggle (all pages except Cash):
- `Off` (default) | `Previous Period` | `Same Period Last Year`
- When "Previous Period" is active: if viewing Jan 1 – Mar 31, comparison is Oct 1 – Dec 31
- When "Same Period Last Year" is active: if viewing Jan 1 – Mar 31 2026, comparison is Jan 1 – Mar 31 2025
- Comparison data renders as a dashed/lighter line on the same chart, with a Δ% annotation on metric cards
- If comparison data doesn't exist (not enough history), comparison toggle is disabled with tooltip "Insufficient historical data"

URL persistence: Timeline filter state is stored in URL query params (`?range=90d&granularity=weekly&compare=yoy`). This makes filters bookmarkable and shareable. Refreshing the page preserves the current filter.

Implementation: Build `<TimelineFilter />` as a single Client Component in `components/filters/timeline-filter.tsx`. All pages import and use the same component. Date range logic lives in `lib/utils/date-ranges.ts` using date-fns. The component pushes filter params to the URL via `useSearchParams()`. Server Components read the params and pass them to data-fetching queries.

**Error Notification & Logging System:**

The plan already has `fin_sync_log` for tracking sync runs and the alert digest for threshold-based alerts. What's missing is **real-time failure notifications** and an **in-app error log viewer.**

Edge Function failure notifications:
- Every Edge Function wraps its entire body in a try/catch. On unhandled failure:
  1. Log full error to `fin_sync_log` with `status = 'error'` and `error_message` containing the stack trace
  2. Immediately send a failure notification email via Resend (separate from the daily alert digest)
  3. Email subject: `[FinPulse] Sync Failed: {function_name}`
  4. Email body: function name, timestamp, error message (first 500 chars), link to Settings page
- This means Ryan knows within minutes if a sync breaks, not 2.5 hours later when the alert engine runs.
- Rate limit failure emails: max 1 per function per day. If the same function fails on retry, don't spam.

Retry behavior:
- All sync Edge Functions retry 3x with exponential backoff (1s, 4s, 16s) + jitter before writing an error to `fin_sync_log`
- If all 3 retries fail, that's when the failure email fires
- `fin_sync_log` records each attempt: `status = 'retry_1'`, `'retry_2'`, `'retry_3'`, `'error'`

In-app error log viewer (Settings → Sync Health):
- Table showing all entries from `fin_sync_log` for the last 30 days
- Columns: Source, Started, Completed, Duration, Status (color-coded badge), Rows Synced, Error Message
- Filter by: source, status, date range
- Expandable rows to show full error message
- "Re-run sync" button per source (triggers manual Edge Function invocation via API route)
- Auto-refresh every 60 seconds while on the page (or Supabase real-time subscription on `fin_sync_log`)

Schema addition for retry tracking:

```sql
ALTER TABLE fin_sync_log ADD COLUMN attempt INTEGER DEFAULT 1;
ALTER TABLE fin_sync_log ADD COLUMN failure_notified BOOLEAN DEFAULT false;
```

The `failure_notified` flag prevents duplicate failure emails on the same error (if the alert engine also picks it up later).

**Performance targets:**
- CEO Overview page: <2 second initial load (server-rendered)
- All other pages: <3 second initial load
- Chart rendering: <500ms after data arrives
- Edge Function execution: <60 seconds each, <5 minutes total daily chain
- Alert digest email: sent within 5 minutes of alert engine completion

---

## 15. DEVELOPER BUILD INSTRUCTIONS

### READ THIS FIRST

This is a 12-week build for a financial intelligence dashboard. The CEO (Ryan) scopes architecture and reviews decisions — he does not write code. You build in Cursor with Claude Opus 4.6 selected for complex debugging. Follow the `.cursor/rules/` stack lockdown files in the repo. Every PR goes through a code reviewer subagent before Ryan reviews architecture.

### Critical Build-Order Rules

**1. Schema first, UI last.** Deploy all Supabase tables and RLS policies before writing a single React component. Run `supabase gen types` and commit the generated types. Every query in the app must be type-safe from day one. Do not create tables manually in the Supabase dashboard — use migration files only.

**2. Sync functions are the foundation.** The entire app is only as good as its data. Build and validate `sync-finaloop-sheets` FIRST. If this function doesn't correctly parse Finaloop's P&L into channel-segmented rows, everything downstream is wrong. The Finaloop line-item → channel mapping in Section 3 of this plan is the single most important logic in the app. Build it as a pure function, unit test it exhaustively with the actual Finaloop export structure (sample provided in the repo), then wrap it in the Edge Function.

**3. One Edge Function at a time.** Build each sync function, deploy it, verify data lands correctly in the target table, then move on. Do NOT build all 8 Edge Functions in parallel. The dependency chain matters — downstream functions depend on upstream data.

**4. Charts come after data.** Build each page's data fetching and business logic first with raw numbers in the UI. Add Recharts visualizations after the numbers are verified correct. A beautiful chart showing wrong data is worse than ugly text showing right data.

### Architecture Decisions (Do Not Deviate)

**CRITICAL: Next.js 16 Breaking Changes the Developer MUST Know:**

1. **`middleware.ts` is renamed to `proxy.ts`.** This is NOT optional. The file must be named `proxy.ts` and export a function named `proxy`. The old `middleware.ts` convention is deprecated and will be removed. Use the codemod: `npx @next/codemod@canary upgrade latest` or manually rename. If you use `middleware.ts`, you'll get deprecation warnings and it may break in 16.3+.

2. **`proxy.ts` runs on Node.js runtime by default** in Next.js 16 (NOT Edge runtime like the old middleware). This is actually better for Supabase cookie handling since `@supabase/ssr` works with Node.js APIs.

3. **Turbopack is the default bundler.** Do not add any webpack configuration. If a dependency requires webpack config, find an alternative or use `--webpack` flag explicitly (not recommended).

4. **Async params/searchParams are required.** All `params` and `searchParams` in page.tsx must be awaited: `const { slug } = await props.params`. Synchronous access is fully removed in Next.js 16.

5. **React Compiler is available but NOT enabled by default.** Do not enable it for this project unless explicitly tested. It adds build time via Babel and FinPulse doesn't have the re-render-heavy patterns that benefit from it.

**Next.js App Router patterns:**
- Server Components for all data-fetching pages (CEO Overview, DTC, Wholesale, etc.). Data fetches happen server-side via Supabase service role client. No client-side API calls for read-only data.
- Client Components only for interactive elements: segment toggles, chart tooltips, scenario form inputs, alert acknowledgment buttons, what-if sliders.
- **`proxy.ts` (NOT middleware.ts)** handles auth session refresh + role-based routing. If user's `app_role` metadata doesn't match the page requirement, redirect to `/`. Do NOT rely solely on proxy for security — it's a convenience layer, not a security boundary.
- **Defense-in-depth auth pattern (MANDATORY):**
  1. `proxy.ts`: Refresh Supabase session cookie on every request. Redirect unauthenticated users to `/login`. This is the "bouncer at the door."
  2. Data Access Layer (`lib/dal.ts`): Every server-side data fetch calls `verifySession()` which checks `getUser()` (not `getSession()` — `getSession()` reads from cookies and can be spoofed). This is the "gate agent checking your boarding pass."
  3. RLS policies: Even if the DAL is misconfigured, Supabase RLS prevents data leakage at the database level. This is the "last line of defense."
  - Never trust `getSession()` alone for authorization. Always use `getUser()` which makes a server call to verify the token.
- API Routes (`/api/*`) only for: manual re-sync triggers, PIN verification, alert acknowledgment POST, commitment CRUD, headcount CRUD, scenario save. These are thin wrappers around Supabase mutations with Zod input validation. Every API route MUST call `verifySession()` before performing any mutation.

**Supabase patterns:**
- Server-side: use `createServerClient` from `@supabase/ssr` with `cookies()` from Next.js. Follow the exact pattern from Supabase docs for App Router.
- Client-side: use `createBrowserClient` from `@supabase/ssr` only in Client Components that need real-time subscriptions (alert feed).
- Edge Functions: use Deno runtime. Import via `import { createClient } from 'jsr:@supabase/supabase-js@2'` (use JSR registry, not esm.sh — JSR is the current Supabase recommendation). Use `Deno.env.get()` for env vars.
- **Supabase Vault for Edge Function secrets:** Store the Google Sheets service account key, Shopify API token, and Klaviyo API key in Supabase Vault (encrypted secrets). Edge Functions read them via `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'key_name'`. Do NOT pass API keys as Edge Function invocation parameters.
- Transaction-mode pooling required for all connections. Set in the Supabase project connection string.
- RLS must be enabled on every `fin_` table. Test by attempting unauthorized operations in Supabase SQL editor with the anon key.

**pg_cron constraints (from Supabase docs):**
- Maximum 8 concurrent cron jobs recommended. Our schedule runs sequentially (4:00 AM → 5:45 AM, one function at a time with 15-30 min gaps). This is well within limits.
- Each job should run no more than 10 minutes. Monitor execution times. The cash forecast and alert engine are the heaviest — target <60 seconds each.
- pg_cron uses `pg_net` extension to invoke Edge Functions via HTTP. Both `pg_cron` and `pg_net` must be enabled in the Supabase dashboard under Database → Extensions.
- Store the Edge Function invocation URL and service_role key in Supabase Vault, not hardcoded in the cron SQL.

**File structure:**
```
src/
  app/
    layout.tsx              # Root layout, auth provider
    page.tsx                # CEO Overview (/)
    login/page.tsx          # Login page
    dtc/page.tsx            # DTC deep dive
    wholesale/page.tsx      # Wholesale + segment toggle
    marketplaces/page.tsx
    retail/page.tsx
    cash/page.tsx
    inventory/page.tsx
    team/page.tsx           # PIN-protected
    scenarios/page.tsx      # PIN-protected
    settings/page.tsx
    api/
      sync/[source]/route.ts  # Manual re-sync trigger
      alerts/route.ts          # Acknowledge, list
      headcount/route.ts       # CRUD
      scenarios/route.ts       # CRUD
      pin/route.ts             # Verify, set
  lib/
    supabase/
      server.ts             # createServerClient utility
      client.ts             # createBrowserClient utility
    dal.ts                   # Data Access Layer — verifySession(), getUser(), role check
                             # EVERY server-side data fetch goes through here
    database.types.ts        # Generated from supabase gen types
    calculations/
      cac.ts                 # Blended CAC, per-platform CAC
      ltv.ts                 # 12-month simplified LTV
      mer.ts                 # Marketing efficiency ratio
      contribution-margin.ts # Per-channel contribution margin
      cash-forecast.ts       # 13-week forecast projection logic
    parsers/
      finaloop-pnl.ts        # Parse Finaloop sheet → channel-segmented data
      finaloop-balance.ts    # Parse balance sheet
      finaloop-cashflow.ts   # Parse cash flow statement
    schemas/
      finaloop.ts            # Zod schemas for Finaloop sheet validation
      forms.ts               # Zod schemas for all form inputs
      api.ts                 # Zod schemas for API route inputs
    constants/
      channel-mapping.ts     # Finaloop line-item → FinPulse channel map (CONFIGURATION, not code)
      alert-defaults.ts      # 20 default threshold configurations
      payout-config.ts       # Default channel payout timing
  components/
    charts/                  # Recharts wrapper components (all 'use client')
    cards/                   # Metric card components
    tables/                  # Data table components
    alerts/                  # Alert feed, badge components
    layout/                  # Navigation, sidebar, header
  proxy.ts                   # Next.js 16 proxy (replaces middleware.ts)
                             # Auth session refresh + role-based redirect
supabase/
  functions/                 # Edge Functions (Deno runtime)
    sync-shopify-dtc/
      index.ts
    sync-finaloop-sheets/
      index.ts
    sync-klaviyo-revenue/
      index.ts
    compute-cash-forecast/
      index.ts
    run-alert-engine/
      index.ts
    generate-briefing/
      index.ts
    send-alert-digest/
      index.ts
  migrations/                # All schema migrations (numbered sequentially)
  seed.sql                   # Default data (alert thresholds, settings defaults, channel mapping)
  config.toml
.github/
  workflows/
    ci.yml                   # GitHub Actions CI pipeline
tests/
  unit/                      # Vitest unit tests
    calculations/            # One test file per calculation module
    parsers/                 # Finaloop parser tests with fixture data
  e2e/                       # Playwright E2E tests
    auth.spec.ts
    ceo-overview.spec.ts
    wholesale.spec.ts
    pin-protection.spec.ts
  fixtures/                  # Test data
    finaloop-pnl-sample.json # Parsed from actual Finaloop export
```

### Specific Gotchas and Notes for the Developer

**Finaloop parsing (the hardest part of the build):**
- The P&L export has 197 rows with inconsistent nesting. Row names contain the channel identifier (e.g., "Sales - Shopify - emilylex", "COGS - Faire (via Shopify)"). You must match on these exact strings.
- Row 3 contains month column headers: "January", "February", etc. plus "April (partial)" for the current month and "Total" for YTD. Parse column headers dynamically — don't hardcode column positions.
- Numeric values may be strings, nulls, or "NaN" in the export. Coerce all to numbers with fallback to 0.
- The P&L is cumulative by month but the column for the current month is labeled "(partial)". Handle this — it's valid data, just incomplete for the month.
- Finaloop may add new line items in the future (new sales channels, new expense categories). The parser should log unrecognized lines as warnings, not fail. Unknown revenue lines should be flagged for manual mapping.
- Build the Finaloop line-item → channel mapping as a configuration object (in `constants/channel-mapping.ts`), not hardcoded if/else chains. This makes it easy to add new mappings without changing parser logic.

**CRITICAL: The P&L parser CONSTRUCTS multiple rows per month, not one.**
Finaloop exports a single P&L — one column per month, no channel segmentation. The parser reads each line item, looks up its channel mapping (Section 3), and accumulates values into 8 separate `fin_pnl_monthly` rows per month: `company`, `dtc`, `wholesale`, `wholesale_faire`, `wholesale_direct`, `wholesale_key`, `retail`, `marketplace`. The `company` row = straight Finaloop totals (sum of all lines in each section). Each channel row = the subset of lines mapped to that channel. OpEx fields (payroll, rent, software, etc.) are populated ONLY on the `company` row — channel rows have these set to 0. After all lines are processed, compute derived fields (gross_profit, contribution_margin, etc.) on each row before upserting.

**Cash Flow parsing:**
The Cash Flow export has 174 rows in a flat two-column structure: line-item name and YTD value (inflow as positive, outflow as negative). Unlike the P&L, it does NOT have monthly columns — it's YTD only. To get monthly values, the parser must:
1. Store the current YTD values from each sync
2. Calculate monthly delta: `this_month = current_YTD - previous_month_YTD`
3. For the first sync (no previous data), store YTD values and note that monthly breakdowns will be available starting next month
The Cash Flow does NOT have pre-computed "Cash from Operations / Investing / Financing" summary lines. The developer must sum the relevant line items into these categories:
- **Operations:** Net income + non-cash adjustments (depreciation, inventory changes, AP/AR changes, sales tax changes)
- **Investing:** Fixed asset purchases, loans to related parties
- **Financing:** Owner distributions, loan repayments
Map specific line items to the `fin_cashflow_monthly` key fields: `inventory_purchases` ← "Inventory purchases, net", `owner_distributions` ← "Distributions - Ryan Lex", `sales_tax_payments` ← net of "Sales tax liability" changes. `ending_cash` ← "Total Cash-on-hand" from the reconciliation section at the bottom of the Cash Flow export.

**Shopify sync (DTC only, aggregate-only):**
- FinPulse syncs the **emilylex store only** (DTC orders). Wholesale revenue/margin comes entirely from Finaloop P&L. Wholesale operational metrics live in the Wholesale Outreach app.
- Ryan is creating a new Shopify custom app for the emilylex store and providing the API access token.
- **DO NOT store individual order rows.** The sync function pulls today's orders via API, aggregates in memory, and writes computed results only:
  - **DTC revenue:** Loop through today's non-Faire orders. Accumulate: total revenue, order count, discount total, new customer count (customer.orders_count = 1), returning customer count. Upsert one row into `fin_revenue_daily` for channel = 'dtc'.
  - **Membership:** During the same loop, check order tags for Appstle membership tags. Split into member vs non-member buckets. Upsert into `fin_membership_snapshot`.
  - **Incoming inventory (outstanding POs):** Separate GraphQL query against `inventoryItems`. For each item with `incoming` quantity > 0, multiply `incoming_quantity × unitCost`. Sum across all SKUs. Write total to `fin_shopify_daily.incoming_inventory_value`. This represents committed PO outflows not yet in Finaloop.
    ```graphql
    query {
      inventoryItems(first: 250) {
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
        }
      }
    }
    ```
    Paginate through all inventory items. Sum: `incoming_qty × unit_cost` per item. If unit_cost is null/0, skip that item (COGS not set). This query runs once per sync, not per order.
- Filter out Faire orders (source_name = 'faire') — those are wholesale, handled entirely by Finaloop.
- Shopify API pagination: cursor-based (`page_info` for REST, `after` cursor for GraphQL). Max 250 items per request. 100ms delay between requests.
- **Note:** The incoming inventory query uses the GraphQL Admin API. DTC order aggregation can use either REST or GraphQL. Using GraphQL for both is preferred (single API style, better rate efficiency — 50 cost points/second vs 40 req/second for REST).
- **Historical backfill:** Sync last 24 months of DTC orders. Process one month at a time, writing aggregates after each month. Incoming inventory is current-state only (no historical backfill needed — it's a point-in-time snapshot).

**Edge Function deployment:**
- Each Edge Function is deployed individually via Supabase CLI: `supabase functions deploy <function-name>`
- pg_cron schedules are set via SQL migration using `pg_net` to invoke Edge Functions via HTTP POST
- Both `pg_cron` and `pg_net` extensions must be enabled in Supabase Dashboard → Database → Extensions
- Store Edge Function URL and service_role key in **Supabase Vault** (not hardcoded in cron SQL):
  ```sql
  -- Store secrets in Vault (run once)
  SELECT vault.create_secret('https://PROJECT.supabase.co', 'project_url');
  SELECT vault.create_secret('your-service-role-key', 'service_role_key');
  
  -- Cron job reads from Vault
  SELECT cron.schedule('sync-finaloop', '30 7 * * *',
  $$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/sync-finaloop-sheets',
      headers := jsonb_build_object('Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')),
      body := '{}'::jsonb
    );
  $$);
  ```
- Edge Functions use **Deno runtime, not Node.js.** Import pattern:
  ```typescript
  import { createClient } from 'jsr:@supabase/supabase-js@2'
  
  Deno.serve(async (req) => {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    // ... function logic
  })
  ```
- Edge Functions have a 150-second timeout by default. The cash forecast computation is the most complex — if it exceeds 30 seconds, optimize the SQL queries or break into smaller steps.
- **Maximum 8 concurrent cron jobs recommended.** Our schedule never exceeds 5 concurrent. If you add more functions, stagger them.
- Each cron job should complete within 10 minutes. Target <60 seconds for all FinPulse functions.

**Recharts patterns:**
- Wrap Recharts components in a Client Component (add `'use client'` directive). Recharts uses browser APIs for tooltips and interactions.
- For SSR compatibility: use dynamic imports with `next/dynamic` and `{ ssr: false }` for chart components to avoid hydration mismatches.
- Create reusable chart wrapper components in `components/charts/` that accept data props and handle loading/empty states.
- Color scheme: use CSS variables from Tailwind theme. Define a consistent chart color palette for channels (e.g., DTC = blue, Faire = green, Direct = amber, Key = purple, Retail = slate, Marketplace = orange).

**Cash forecast (the second-hardest part):**
- The forecast is a 13-row projection, not a statistical model. It's arithmetic: starting cash + projected inflows − projected outflows per week.
- ALL projected inflows use Finaloop trailing 3-month average monthly revenue per channel, divided by 4.33 for weekly baseline. Apply growth trend (trailing 3-month MoM compounding rate) and seasonality index (YoY monthly multiplier if data exists). Known ELS seasonal events: Jan Faire market, July Faire market, Q4 DTC holiday. If no YoY data, seasonality = 1.0.
- ALL projected outflows use Finaloop trailing 3-month averages per category, divided by 4.33 for weekly.
- **Committed inventory adjustment:** After computing all 13 weeks, subtract the Shopify incoming inventory value (`fin_shopify_daily.incoming_inventory_value`) from the week-13 ending cash as a lump sum. This is cash committed to POs that hasn't left the bank yet. Don't try to distribute it across specific weeks — you don't know payment timing.
- The forecast table stores this as: `projected_ending_cash` = pure forecast, and the UI shows both "Projected: ${X}" and "After committed POs: ${X - incoming_inventory_value}" on the final week.
- Between monthly Finaloop closes, the starting cash is an estimate. Document this in the UI with the "±5%" badge.
- The what-if toggle on /cash is CLIENT-SIDE ONLY. It takes the current forecast data and overlays a user-entered hypothetical outflow. No server call — just recalculate in the browser.

**Alert engine:**
- The engine is a single Edge Function that loops through all active thresholds in `fin_alert_thresholds`, computes each metric's current value from the relevant table, and compares to thresholds.
- For `trend_decline` type: query the last N+1 periods of the metric and check if values are strictly declining. If fewer periods exist than required, skip silently.
- Deduplication check happens BEFORE insert: query `fin_alerts` for same `metric_key` + same `severity` + `acknowledged = false` + `triggered_at > now() - 7 days`. If found, skip.
- The alert digest email is a separate Edge Function triggered 5 minutes after the alert engine. It queries new unacknowledged alerts from the last run and formats a single email via Resend.

**Wholesale segment toggle:**
- The toggle is a URL query parameter (`?segment=faire`), not client-side state. This makes segments bookmarkable and shareable.
- All metrics on the wholesale page are computed via SQL queries with a `WHERE segment = $1` filter. The page's Server Component reads the query param and passes it to the data-fetching layer.
- The "All Wholesale" view aggregates all three segments. Don't query all three separately and sum — write a single query that sums across segments.

**PIN protection:**
- Store PIN hash in `fin_settings` table under key `pin_hash`.
- PIN verification goes through `/api/pin/route.ts` which compares bcrypt hash and returns a short-lived session cookie (httpOnly, 24-hour expiry).
- Protected pages check for this cookie in the Server Component. If missing, render the PIN prompt instead of the page content.
- Rate limiting: use a `fin_pin_attempts` table or in-memory counter. After 10 failures, return 429 for 15 minutes.

**What NOT to build:**
- No campaign-level or ad-level attribution. That stays in Meta Ads Manager and Google Ads.
- No custom attribution pixel. Elevar handles all conversion signal delivery.
- No real-time WebSocket updates. All data refreshes on page load. Real-time is only for the alert feed (Supabase real-time subscription on `fin_alerts`).
- No export/PDF generation. If Ryan wants to export data, he queries Supabase directly or uses the Settings page to view raw sync data.
- No multi-tenant architecture. This is a single-company app with 2-3 users.

### Definition of Done (Per Phase)

Each phase is done when:
1. All listed features are deployed to production on Vercel
2. All unit tests pass in CI
3. All E2E tests pass for the phase's pages
4. Data validation confirms accuracy against source systems
5. Ryan has reviewed the live pages and confirmed they show correct data
6. No TypeScript errors, no ESLint warnings, no console errors in production

---

## 16. PRODUCTION HARDENING (MANDATORY — DO NOT SKIP)

These rules come from a full production deployment audit. Every item is essential. Skipping any of these will cause data corruption, security vulnerabilities, or silent failures in production.

**A. Edge Function CPU Time Limit**
- Supabase Edge Functions have a **2-second CPU time limit** per request. Wall clock is 400s, idle timeout is 150s, but actual compute is capped at 2s.
- The Shopify sync is the highest risk — syncing thousands of orders with JSON parsing could exceed 2s CPU.
- **Rule:** Paginate all Shopify API calls (250 orders max per request). Process and write each page to the database immediately. Do NOT accumulate all orders in memory and process at the end. Keep CPU-heavy operations (parsing, transformation) per-page, not per-sync.
- All other Edge Functions (Finaloop ~200 rows, Klaviyo 2 numbers, cash forecast ~13 rows output) are well within 2s CPU.

**B. Finaloop Parser Total-Row Validation**
- After parsing all revenue line items into channel-segmented data, the parser MUST compare the sum of all parsed channel net revenues to the `Total Net Sales` row (row 33 in the current export, value $6,230,988.86 YTD).
- If the parsed sum differs from the total by more than 5%, the sync MUST:
  1. Log the discrepancy with exact numbers to `fin_sync_log`
  2. Still write the data (don't lose what was parsed)
  3. Create an immediate red alert: "Finaloop revenue parsing discrepancy: parsed ${X} vs reported ${Y} (Δ{Z}%)"

**B2. Finaloop Format Change Detection**
- The parser MUST validate the sheet structure before processing:
  1. Check that expected column headers exist (month names in row 3)
  2. Check that key line items exist (at minimum: `Total Net Sales`, `Total COGS`, `Total Gross Profit`)
  3. Track unrecognized line items: any line in the revenue section that doesn't match `constants/channel-mapping.ts`
- **If expected columns are missing or structure doesn't match → RED alert + immediate failure notification email.** Do not attempt to parse — the format has changed and the parser will produce garbage.
- **If unrecognized revenue line items exceed 5% of total revenue → RED alert:** "Finaloop has new revenue lines totaling ${X} (${Y}% of total) that are not mapped to any channel. These need to be added to the channel mapping config."
- **If unrecognized revenue line items are <5% → YELLOW alert** logged to `fin_alerts` with the specific line item names for Ryan to review.
- This is the single biggest operational risk in FinPulse. Finaloop may add new sales channels, rename existing ones, or restructure the export at any time. The parser must fail loudly, not silently miscategorize.
- This catches: renamed line items, new line items not in the mapping, structural changes to the export.

**C. Timezone Convention**
- **All DATE columns** store dates in UTC (no timezone offset).
- **All date comparisons** for business logic use `America/New_York` (EST/EDT):
  ```sql
  WHERE created_at AT TIME ZONE 'America/New_York' >= '2026-04-01'
  ```
- Finaloop months map to calendar months in Eastern time.
- Shopify order `created_at` is UTC — convert to ET before extracting the date for daily aggregation.
- Cash forecast week boundaries start on Monday, computed in Eastern time.
- **Document this in a `TIMEZONE_CONVENTION.md` file in the repo root.** Every developer touching date logic reads this first.

**D. Partial Month Handling**
- `fin_pnl_monthly.is_partial = true` for the current (incomplete) month.
- The Finaloop parser detects partial months by checking if the column header contains "(partial)".
- **UI rules for partial months:**
  - Display with a dashed border or "partial" badge
  - MoM growth: exclude partial month from trend calculations, OR compare to same partial period last year
  - Alert engine: skip threshold checks on partial month data (don't alert on low revenue mid-month)

**E. Supabase Vault for Edge Function Secrets**
- Store Google Sheets service account key, Shopify API token, Klaviyo API key, Anthropic API key, and Resend API key in Supabase Vault
- Edge Functions read via `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'key_name'`
- Do NOT pass API keys as Edge Function invocation parameters or hardcode in cron SQL

**F. PIN Security**
- PIN verification: POST request only. PIN in the request body as JSON, never in URL params.
- Response: httpOnly cookie with 24-hour expiry. No PIN echo in the response.
- Rate limiting: Track attempts in `fin_settings` (key: `pin_attempts`, value: `{count, last_attempt_at}`). After 10 failures, return 429 for 15 minutes.
- bcrypt hash stored in `fin_settings` (key: `pin_hash`).

**G. Backfill Alert Suppression**
- When loading historical data (24 months), the alert engine MUST NOT create alerts for data older than 30 days.
- Implementation: Add a `suppress_before DATE` parameter to the alert engine Edge Function. During initial backfill, set this to `now() - 30 days`. During normal operation, set to null (no suppression).
- Alternative: Add a `backfill_mode BOOLEAN DEFAULT false` to `fin_settings`. Alert engine checks this flag and skips all alert creation when true. Ryan toggles it off after backfill is complete.

**H. Sign Convention**
- Revenue lines from Finaloop are **positive** numbers.
- Costs, expenses, COGS, fees, discounts, and returns from Finaloop are **negative** numbers.
- Store them as-is (matching Finaloop).
- All calculations use these conventions:
  - `gross_profit = net_revenue + cogs` (where cogs is negative, so this subtracts)
  - `contribution_margin = net_revenue + cogs + total_fees + allocated_ad_spend` (all cost terms are negative)
  - `gross_margin_pct = gross_profit / net_revenue * 100`
- **Unit test requirement:** Create a test with actual Finaloop numbers (January 2026: Net Sales $2,275,332, COGS -$1,112,607, Gross Profit $1,162,725). Verify the parser produces these exact numbers and the calculation module produces the correct margin (51.1%).

**I. Zero-Division Safety**
- Every calculation function MUST handle zero denominators:
  - CAC: if new_customers = 0, return null
  - Margin %: if net_revenue = 0, return null
  - LTV:CAC: if CAC = 0 or null, return null
  - Revenue per employee: if headcount = 0, return null
  - Inventory turns: if avg_inventory = 0, return null
- UI displays `—` (em dash) for null values, not "0%" or "Infinity" or "NaN".
- Zod output schemas enforce: `z.number().finite().nullable()` for all calculated metrics.

**J. Data Retention**
- `fin_revenue_daily`: keep all (small table, ~730 rows/year for DTC)
- `fin_shopify_daily`: keep all (small table, ~365 rows/year — one row per day)
- `fin_klaviyo_daily`: keep all (small table, ~365 rows/year)
- `fin_membership_snapshot`: keep all (small table, ~365 rows/year)
- `fin_pnl_monthly`: keep all (~96 rows/year across 8 channels × 12 months)
- `fin_sync_log`: keep last 90 days of entries, purge older weekly
- `fin_alerts`: auto-delete acknowledged alerts >90 days weekly
- **Total database size estimate: <10MB.** No retention concerns at this scale.

**K. Cash Forecast Stale Data Indicator**
- The `compute-cash-forecast` Edge Function checks `fin_sync_log` for the most recent successful Finaloop sync.
- If the last successful Finaloop sync is >24 hours old: set `source_data_stale = true` on all 13 forecast rows.
- UI: When `source_data_stale = true`, show a yellow banner on the /cash page: "Cash forecast is based on financial data from {X days ago}. Accuracy may be reduced."
- If >7 days stale: red banner with "Financial data is significantly outdated. Forecast should not be used for decisions."

**L. RLS Penetration Test (Phase 1)**
- Before any page goes live, execute this test:
  1. Open browser dev console on the deployed app
  2. Using only the anon key (visible in client-side code), attempt direct Supabase queries:
     ```javascript
     const { data } = await supabase.from('fin_pnl_monthly').select('*')
     // Should return empty array (not authenticated)
     ```
  3. Using the anon key, attempt to INSERT into `fin_settings`:
     ```javascript
     const { error } = await supabase.from('fin_settings').insert({key:'test', value:{}})
     // Should return RLS policy error (anon key cannot write)
     ```
  4. Log in as admin, verify all operations succeed.
- Document results in a `security-test-results.md` file in the repo.

**M. Shopify API Version Pinning**
- Pin Shopify API version explicitly in the sync Edge Function: `2025-01` (or the latest stable version at build time).
- Add to the maintenance runbook: "Every quarter, check Shopify's API version timeline at https://shopify.dev/docs/api/usage/versioning. If current pinned version is within 6 months of deprecation, upgrade."
- Do NOT use `unstable` or unversioned endpoints.

**N. Daily Chart Default to 90 Days**
- All daily-granularity charts default to showing the last 90 days.
- User can expand to "6 months", "12 months", or "All" via a toggle.
- Weekly/monthly charts show all available data by default (max 24 months = 24 data points for monthly).

**O. Parallel Query Pattern for CEO Overview**
- The CEO Overview page fetches from 5+ tables. Do NOT query sequentially.
- Use `Promise.all()` in the Server Component:
  ```typescript
  const [pnl, forecast, alerts, revDaily, balance] = await Promise.all([
    supabase.from('fin_pnl_monthly').select('*').eq('channel', 'company').order('month', { ascending: false }).limit(12),
    supabase.from('fin_cash_forecast').select('*').eq('forecast_run_date', today).order('week_number'),
    supabase.from('fin_alerts').select('*').eq('acknowledged', false).order('triggered_at', { ascending: false }).limit(10),
    supabase.from('fin_revenue_daily').select('*').gte('date', mtdStart),
    supabase.from('fin_balance_sheet_monthly').select('*').order('month', { ascending: false }).limit(1),
  ])
  ```
- Target: all 5 queries resolve in <500ms total (parallel via connection pooling).

**P. Edge Function Idempotency**
- Every sync Edge Function MUST be safe to run multiple times. If triggered manually after the scheduled run, or if pg_cron fires twice due to a clock skew, the result should be identical.
- Implementation: All inserts use `ON CONFLICT DO UPDATE` (upsert). Computed metrics overwrite, not append.
- The alert engine deduplicates before insert (check for existing unacknowledged alert with same metric_key + severity within 7 days).
- `fin_sync_log` records every run — multiple runs on the same day are visible in the log for debugging.

**Q. Accounting Compliance & Audit Readiness**

FinPulse is a management reporting dashboard, not a GAAP financial statement generator. Finaloop is the accounting system of record. However, the dashboard must not misrepresent financial data in ways an auditor would flag.

**Source of truth labeling:**
- Every metric must indicate its source. Finaloop-sourced metrics are authoritative for financial reporting. Shopify-sourced metrics are operational (directional, same-day visibility).
- When Finaloop monthly revenue and Shopify daily revenue diverge for the same period, Finaloop is correct. The divergence is expected due to: accrual vs cash timing, return processing delays, and period cutoff differences.
- The reconciliation alert (threshold #20) catches sync/parsing problems, not accounting differences.

**Non-GAAP metric labeling:**
- Contribution margin is labeled "Contribution Margin (non-GAAP)" in the UI
- Info tooltip explains: "Revenue minus COGS, channel fees, and allocated ad spend. Does not include payroll, rent, software, or other operating expenses. Ad spend allocation methodology configurable in Settings."
- EBITDA is labeled "EBITDA (non-GAAP)" — standard practice

**Uncategorized transactions handling:**
- Finaloop P&L has material uncategorized amounts ($148K received, -$757K spent YTD). The parser MUST capture these in the `other_income_expenses` column on the `company` channel row.
- Add an alert: if uncategorized transaction absolute value exceeds $50K in any month, trigger a yellow alert: "Finaloop has ${X} in uncategorized transactions for {month}. These may need manual categorization."
- Net profit in FinPulse must match Finaloop's reported net profit. If the parser only captures through operating profit and skips below-the-line items, the numbers won't match.

**Sales tax in cash forecast:**
- Sales tax payments are a material cash outflow ($114K paid YTD, $296K liability outstanding). The cash forecast must include sales tax as a separate outflow category.
- Alert: if `fin_balance_sheet_monthly.sales_tax_liability` exceeds 2× the trailing monthly average payment, trigger a yellow alert (potential upcoming large quarterly payment).

**Owner distributions in cash forecast:**
- Owner distributions (-$1.52M YTD) are irregular, large cash outflows. Do NOT average these with operating expenses — they'll distort the forecast.
- Show distributions as a separate line in the cash forecast outflow breakdown: "Owner Distributions" with its own row in the `fin_cash_forecast` table.
- Use trailing pattern from Finaloop Cash Flow, but label as "based on historical pattern — actual distributions at CEO discretion."

**Audit trail for manual changes:**
- Add to schema:
  ```sql
  CREATE TABLE fin_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    field_changed TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT NOT NULL, -- user email from auth
    changed_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- Every manual change to `fin_settings`, `fin_headcount`, `fin_alert_thresholds`, or `fin_scenarios` writes a row to this table.
- Viewable in Settings under a new "Change Log" tab.
- Retention: keep indefinitely (tiny table, audit value outweighs storage cost).

---

## 17. PLAN STATUS

**⚠️ THIS IS THE PLAN, NOT THE COMMITMENT.**

Per standing rule: "Never commit to a build plan in the same session it was proposed."

### Pre-Development Checklist

**BLOCKERS (developer cannot start without these):**
- [ ] Ryan approves plan
- [x] Ryan approves new dependencies: Recharts ^2.x, date-fns ^4.x — **approved April 10, 2026**
- [x] Ryan exports Finaloop Balance Sheet and Cash Flow samples — **provided April 11, 2026**
- [ ] **Ryan provides the 3 Finaloop Google Sheet document IDs/URLs** (P&L, Balance Sheet, Cash Flow)
- [ ] **Ryan creates new Shopify custom app** for emilylex store and provides API access token
- [ ] Verify Finaloop Google Sheets auto-sync is daily (not one-time export)
- [ ] Verify Google Sheets service account has Viewer-only access (not Editor)

**PRE-LAUNCH (required before Phase 1 completes):**
- [ ] Connect Amazon to Finaloop to resolve "unidentified payouts" ($290K YTD)
- [ ] Developer validates Appstle tag/metafield availability in Shopify data
- [ ] Developer creates Ryan user account in Supabase dashboard (email/password, no signup page)
- [ ] Developer sets `app_role` metadata: Ryan = 'admin'
- [ ] Ryan reviews and adjusts 20 default alert thresholds for ELS actuals
- [ ] Ryan confirms notification channel preference (email vs Slack vs both)
- [ ] Developer estimates hours and cost for build
- [ ] Set up Vercel error tracking for production monitoring
- [ ] Pin Shopify API version (check latest stable at https://shopify.dev/docs/api/usage/versioning)
- [ ] Ryan verifies Faire selling fee allocation timing with Finaloop (quarterly vs monthly matching)
- [ ] **CRITICAL: Ryan recategorizes Faire Promoted Listings charges in Finaloop** — Confirmed: Faire bills via ACH to Highbeam Primary 1706 (Thread Bank). These charges (~$30K/month, ~$90K+ YTD) are likely in `Uncategorized transactions - money spent`. Recategorize to `Paid online ads - Faire` in Finaloop. Once done, FinPulse picks it up automatically.
