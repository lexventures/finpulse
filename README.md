# FinPulse

FinPulse is a Shopify-embedded CFO dashboard for Emily Lex Studio.  
It combines Finaloop financial statements (Google Sheets exports), Shopify operational data, and deterministic KPI calculations for daily decision support.

## Stack

- Next.js App Router + TypeScript
- Supabase Postgres + Supabase Edge Functions (Deno)
- Shopify Admin API / ShopifyQL
- Google Sheets API (service-account auth)
- Tailwind + shadcn/ui

## Core Data Model

### Raw Financial Tables

- `fin_pnl_monthly`
- `fin_balance_sheet_monthly`
- `fin_cashflow_monthly`

### KPI Fact Layer

- `fin_kpi_monthly` (canonical monthly KPI facts used by app consumers)

### Other Supporting Tables

- `fin_revenue_daily`
- `fin_wholesale_daily`
- `fin_shopify_daily`
- `fin_shopify_analytics`
- `fin_cash_forecast`
- `fin_alert_thresholds`
- `fin_alerts`
- `fin_settings`
- `fin_sync_log`

## Finaloop Sync Rules (Current)

`sync-finaloop-sheets` now enforces:

1. **All 3 sheets are required** (P&L, Balance Sheet, Cash Flow)
2. **No `Sheet1` fallback**
3. **Parse/validate before write**
4. **Atomic apply** to raw finance tables via `apply_finaloop_sync(...)`
5. **Hybrid strictness**:
   - Structural parse failures -> `error`
   - Reconciliation or unmapped line-item drift -> `partial`

Unmapped rows are no longer auto-booked into `other_income_expenses`.

## Sync Orchestration

Manual `finaloop` sync from the app issues **one** request to `sync-finaloop-sheets`, which then runs in order:

1. `sync-finaloop-sheets` (Sheets → `fin_pnl_monthly`, balance sheet, cash flow)
2. `run-kpi-facts` (`rebuild_fin_kpi_monthly`)
3. `run-cash-forecast`

That keeps KPI facts and the cash forecast aligned whenever Finaloop data is refreshed—including direct or cron invocations of the Edge function (not only the Next.js API).

Manual `kpi_facts` sync runs:

1. `run-kpi-facts`
2. `run-cash-forecast`

The sync dashboard surfaces `success`, `partial`, and `error` with warning context.

## Settings Keys

Google Sheet IDs/URLs:

- `finaloop_pnl_sheet_id`
- `finaloop_balance_sheet_id`
- `finaloop_cashflow_sheet_id`

Optional tab names:

- `finaloop_pnl_tab`
- `finaloop_balance_sheet_tab`
- `finaloop_cashflow_tab`

## Local Development

Install deps and start app:

```bash
npm install
npm run dev
```

## Required Environment Variables

### Next.js (Vercel)

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_APP_URL`

### Supabase Edge Functions

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `SHOPIFY_DTC_SHOP`
- `SHOPIFY_WHOLESALE_SHOP`
- `SUPABASE_URL` (injected by Supabase)
- `SUPABASE_SERVICE_ROLE_KEY` (injected by Supabase)

## Migrations and Functions

Run local migrations:

```bash
supabase db push
```

Deploy functions: **`supabase/config.toml` sets `verify_jwt = false`** for every function the Next.js sync route and pg_cron call. Without it, the Edge gateway tries to parse `Authorization: Bearer <service_role>` as a legacy JWT; **new secret keys (`sb_secret_…`) or rotated signing keys** then fail with `401 Invalid Token or Protected Header formatting` before your handler runs. Redeploy after changing `config.toml`.

```bash
supabase functions deploy sync-finaloop-sheets
supabase functions deploy run-kpi-facts
supabase functions deploy run-cash-forecast
supabase functions deploy sync-shopify-dtc
supabase functions deploy sync-shopify-wholesale
supabase functions deploy sync-shopify-analytics
supabase functions deploy run-alert-engine
supabase functions deploy generate-briefing
supabase functions deploy send-alert-digest
```

Or deploy all: `supabase functions deploy` (uses `config.toml` per function).

## Notes

- `fin_kpi_monthly` is rebuilt from raw P&L rows by `rebuild_fin_kpi_monthly()`.
- Dashboard and Edge Function KPI consumers now read `fin_kpi_monthly` instead of broad `fin_pnl_monthly` reads.
- Forecast logic now reads `payroll` correctly (not `total_payroll`).
