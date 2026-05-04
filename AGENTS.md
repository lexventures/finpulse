<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Learned User Preferences

## Learned Workspace Facts

- Dashboard-level AP/AR totals should come from Finaloop balance sheet totals; do not surface individual PO/invoice aging details in the app.
- Monthly CAC reporting should default to DTC-only: use Finaloop DTC allocated ad spend divided by Shopify Admin `customersCount` monthly `created_at` counts; upsert and preserve customer counts across Finaloop KPI rebuilds, exclude Faire/wholesale_faire, company-level spend, and broad sm_expense unless explicitly requested, and use `DELETE ... WHERE true` for `fin_kpi_monthly` rebuilds because the live database rejects DELETE without WHERE.
- Settings dashboard Sync All should run Shopify DTC, Shopify Wholesale, Shopify Analytics, then Finaloop; Finaloop already rebuilds KPI facts and cash forecast, so avoid separate KPI Facts/Cash Forecast calls.
- Top dashboard as-of/KPI labels should show year-only to avoid confusion with day-of-month dates; chart axes can keep month labels.
- Shopify embedded App Bridge CDN setup requires `<meta name="shopify-api-key" content={SHOPIFY_CLIENT_ID}>` in `app/layout.tsx`; sync/settings auth depends on `window.shopify.idToken` becoming available.
