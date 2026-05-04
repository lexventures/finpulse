ALTER TABLE fin_kpi_monthly
  ADD COLUMN IF NOT EXISTS shopify_ltv_to_date NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS shopify_gross_margin_ltv_to_date NUMERIC(12,2);

CREATE OR REPLACE FUNCTION rebuild_fin_kpi_monthly()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_rows INTEGER := 0;
BEGIN
  CREATE TEMP TABLE existing_shopify_kpis ON COMMIT DROP AS
  SELECT
    month,
    channel,
    COALESCE(new_customer_orders, 0) AS new_customer_orders,
    COALESCE(returning_customer_orders, 0) AS returning_customer_orders,
    shopify_ltv_to_date,
    shopify_gross_margin_ltv_to_date
  FROM fin_kpi_monthly;

  DELETE FROM fin_kpi_monthly WHERE true;

  INSERT INTO fin_kpi_monthly (
    month,
    channel,
    net_revenue,
    gross_margin_pct,
    contribution_margin,
    contribution_margin_pct,
    allocated_ad_spend,
    cogs,
    payroll,
    total_opex,
    net_profit,
    is_partial,
    source_synced_at,
    updated_at,
    new_customer_orders,
    returning_customer_orders,
    shopify_ltv_to_date,
    shopify_gross_margin_ltv_to_date
  )
  SELECT
    pnl.month,
    pnl.channel,
    COALESCE(pnl.net_revenue, 0),
    COALESCE(pnl.gross_margin_pct, 0),
    COALESCE(pnl.contribution_margin, 0),
    COALESCE(pnl.contribution_margin_pct, 0),
    COALESCE(pnl.allocated_ad_spend, 0),
    COALESCE(pnl.cogs, 0),
    COALESCE(pnl.payroll, 0),
    COALESCE(pnl.total_opex, 0),
    COALESCE(pnl.net_profit, 0),
    COALESCE(pnl.is_partial, false),
    pnl.synced_at,
    now(),
    COALESCE(esk.new_customer_orders, 0),
    COALESCE(esk.returning_customer_orders, 0),
    esk.shopify_ltv_to_date,
    esk.shopify_gross_margin_ltv_to_date
  FROM fin_pnl_monthly pnl
  LEFT JOIN existing_shopify_kpis esk
    ON esk.month = pnl.month
    AND esk.channel = pnl.channel;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;

  DROP TABLE IF EXISTS existing_shopify_kpis;

  RETURN jsonb_build_object('rows', inserted_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION rebuild_fin_kpi_monthly() TO service_role;
