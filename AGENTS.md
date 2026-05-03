<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Learned User Preferences

## Learned Workspace Facts

- Dashboard-level AP/AR totals should come from Finaloop balance sheet totals; do not surface individual PO/invoice aging details in the app.
- Monthly CAC reporting should default to DTC-only: use Finaloop DTC allocated ad spend divided by DTC new_customer_orders, excluding Faire/wholesale_faire, company-level spend, and broad sm_expense unless explicitly requested.
- Settings dashboard Sync All should run Shopify DTC, Shopify Wholesale, Shopify Analytics, then Finaloop; Finaloop already rebuilds KPI facts and cash forecast, so avoid separate KPI Facts/Cash Forecast calls.
- Top dashboard as-of/KPI labels should show year-only to avoid confusion with day-of-month dates; chart axes can keep month labels.
