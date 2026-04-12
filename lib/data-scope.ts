/**
 * Financial aggregates in `fin_*` tables are single-tenant for this deployment:
 * one Finaloop workbook and configured Shopify shops (see SHOPIFY_DTC_SHOP / WHOLESALE).
 * API routes enforce Shopify session tokens (`withAuth`); embedded admin supplies `shop`.
 * If you add multiple merchants per deployment, introduce tenant/shop_id on rows and filter queries.
 */
export const FINANCIAL_DATA_SINGLE_TENANT = true as const
