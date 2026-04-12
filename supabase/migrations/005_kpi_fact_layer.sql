CREATE TABLE fin_kpi_monthly (
  month DATE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN (
    'company', 'dtc', 'wholesale', 'wholesale_faire',
    'wholesale_direct', 'wholesale_key', 'retail', 'marketplace'
  )),
  net_revenue NUMERIC(12,2) DEFAULT 0,
  gross_margin_pct NUMERIC(5,2) DEFAULT 0,
  contribution_margin NUMERIC(12,2) DEFAULT 0,
  contribution_margin_pct NUMERIC(5,2) DEFAULT 0,
  allocated_ad_spend NUMERIC(12,2) DEFAULT 0,
  cogs NUMERIC(12,2) DEFAULT 0,
  payroll NUMERIC(12,2) DEFAULT 0,
  total_opex NUMERIC(12,2) DEFAULT 0,
  net_profit NUMERIC(12,2) DEFAULT 0,
  is_partial BOOLEAN DEFAULT false,
  source_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (month, channel)
);

CREATE INDEX idx_fin_kpi_monthly_month ON fin_kpi_monthly(month DESC);
CREATE INDEX idx_fin_kpi_monthly_channel_month ON fin_kpi_monthly(channel, month DESC);

ALTER TABLE fin_kpi_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY fin_kpi_monthly_service_role_all
  ON fin_kpi_monthly FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION rebuild_fin_kpi_monthly()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_rows INTEGER := 0;
BEGIN
  TRUNCATE TABLE fin_kpi_monthly;

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
    updated_at
  )
  SELECT
    month,
    channel,
    COALESCE(net_revenue, 0),
    COALESCE(gross_margin_pct, 0),
    COALESCE(contribution_margin, 0),
    COALESCE(contribution_margin_pct, 0),
    COALESCE(allocated_ad_spend, 0),
    COALESCE(cogs, 0),
    COALESCE(payroll, 0),
    COALESCE(total_opex, 0),
    COALESCE(net_profit, 0),
    COALESCE(is_partial, false),
    synced_at,
    now()
  FROM fin_pnl_monthly;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;

  RETURN jsonb_build_object('rows', inserted_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION rebuild_fin_kpi_monthly() TO service_role;

CREATE OR REPLACE FUNCTION apply_finaloop_sync(
  p_pnl_rows JSONB,
  p_bs_rows JSONB,
  p_cf_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pnl_rows_count INTEGER := 0;
  bs_rows_count INTEGER := 0;
  cf_rows_count INTEGER := 0;
BEGIN
  IF p_pnl_rows IS NULL OR jsonb_typeof(p_pnl_rows) <> 'array' OR jsonb_array_length(p_pnl_rows) = 0 THEN
    RAISE EXCEPTION 'apply_finaloop_sync requires non-empty p_pnl_rows array';
  END IF;
  IF p_bs_rows IS NULL OR jsonb_typeof(p_bs_rows) <> 'array' OR jsonb_array_length(p_bs_rows) = 0 THEN
    RAISE EXCEPTION 'apply_finaloop_sync requires non-empty p_bs_rows array';
  END IF;
  IF p_cf_rows IS NULL OR jsonb_typeof(p_cf_rows) <> 'array' OR jsonb_array_length(p_cf_rows) = 0 THEN
    RAISE EXCEPTION 'apply_finaloop_sync requires non-empty p_cf_rows array';
  END IF;

  WITH pnl_input AS (
    SELECT *
    FROM jsonb_to_recordset(p_pnl_rows) AS x(
      month DATE,
      channel TEXT,
      gross_revenue NUMERIC,
      shipping_income NUMERIC,
      discounts NUMERIC,
      returns NUMERIC,
      net_revenue NUMERIC,
      cogs NUMERIC,
      gross_profit NUMERIC,
      gross_margin_pct NUMERIC,
      processing_fees NUMERIC,
      selling_fees NUMERIC,
      total_fees NUMERIC,
      allocated_ad_spend NUMERIC,
      allocated_email_marketing NUMERIC,
      contribution_margin NUMERIC,
      contribution_margin_pct NUMERIC,
      shipping_fulfillment NUMERIC,
      payroll NUMERIC,
      ga_expense NUMERIC,
      sm_expense NUMERIC,
      rd_expense NUMERIC,
      depreciation NUMERIC,
      total_opex NUMERIC,
      ebitda NUMERIC,
      net_operating_profit NUMERIC,
      interest_financing NUMERIC,
      other_income_expenses NUMERIC,
      net_profit NUMERIC,
      is_partial BOOLEAN,
      synced_at TIMESTAMPTZ
    )
  ),
  deleted AS (
    DELETE FROM fin_pnl_monthly t
    USING pnl_input i
    WHERE t.month = i.month
      AND t.channel = i.channel
  )
  INSERT INTO fin_pnl_monthly (
    month,
    channel,
    gross_revenue,
    shipping_income,
    discounts,
    returns,
    net_revenue,
    cogs,
    gross_profit,
    gross_margin_pct,
    processing_fees,
    selling_fees,
    total_fees,
    allocated_ad_spend,
    allocated_email_marketing,
    contribution_margin,
    contribution_margin_pct,
    shipping_fulfillment,
    payroll,
    ga_expense,
    sm_expense,
    rd_expense,
    depreciation,
    total_opex,
    ebitda,
    net_operating_profit,
    interest_financing,
    other_income_expenses,
    net_profit,
    is_partial,
    synced_at
  )
  SELECT
    month,
    channel,
    gross_revenue,
    shipping_income,
    discounts,
    returns,
    net_revenue,
    cogs,
    gross_profit,
    gross_margin_pct,
    processing_fees,
    selling_fees,
    total_fees,
    allocated_ad_spend,
    allocated_email_marketing,
    contribution_margin,
    contribution_margin_pct,
    shipping_fulfillment,
    payroll,
    ga_expense,
    sm_expense,
    rd_expense,
    depreciation,
    total_opex,
    ebitda,
    net_operating_profit,
    interest_financing,
    other_income_expenses,
    net_profit,
    is_partial,
    synced_at
  FROM pnl_input;

  GET DIAGNOSTICS pnl_rows_count = ROW_COUNT;

  WITH bs_input AS (
    SELECT *
    FROM jsonb_to_recordset(p_bs_rows) AS x(
      month DATE,
      bank_accounts_total NUMERIC,
      undeposited_funds_total NUMERIC,
      cash_and_equivalents NUMERIC,
      inventory_value NUMERIC,
      accounts_receivable NUMERIC,
      loans_to_related_party NUMERIC,
      unidentified_payouts NUMERIC,
      total_current_assets NUMERIC,
      net_fixed_assets NUMERIC,
      total_assets NUMERIC,
      credit_card_balances NUMERIC,
      accounts_payable NUMERIC,
      sales_tax_liability NUMERIC,
      total_current_liabilities NUMERIC,
      total_liabilities NUMERIC,
      total_equity NUMERIC,
      current_year_net_profit NUMERIC,
      synced_at TIMESTAMPTZ
    )
  ),
  bs_deleted AS (
    DELETE FROM fin_balance_sheet_monthly t
    USING bs_input i
    WHERE t.month = i.month
  )
  INSERT INTO fin_balance_sheet_monthly (
    month,
    bank_accounts_total,
    undeposited_funds_total,
    cash_and_equivalents,
    inventory_value,
    accounts_receivable,
    loans_to_related_party,
    unidentified_payouts,
    total_current_assets,
    net_fixed_assets,
    total_assets,
    credit_card_balances,
    accounts_payable,
    sales_tax_liability,
    total_current_liabilities,
    total_liabilities,
    total_equity,
    current_year_net_profit,
    synced_at
  )
  SELECT
    month,
    bank_accounts_total,
    undeposited_funds_total,
    cash_and_equivalents,
    inventory_value,
    accounts_receivable,
    loans_to_related_party,
    unidentified_payouts,
    total_current_assets,
    net_fixed_assets,
    total_assets,
    credit_card_balances,
    accounts_payable,
    sales_tax_liability,
    total_current_liabilities,
    total_liabilities,
    total_equity,
    current_year_net_profit,
    synced_at
  FROM bs_input;

  GET DIAGNOSTICS bs_rows_count = ROW_COUNT;

  WITH cf_input AS (
    SELECT *
    FROM jsonb_to_recordset(p_cf_rows) AS x(
      month DATE,
      cash_from_operations NUMERIC,
      cash_from_investing NUMERIC,
      cash_from_financing NUMERIC,
      net_cash_flow NUMERIC,
      inventory_purchases NUMERIC,
      owner_distributions NUMERIC,
      sales_tax_payments NUMERIC,
      starting_cash NUMERIC,
      ending_cash NUMERIC,
      synced_at TIMESTAMPTZ
    )
  ),
  cf_deleted AS (
    DELETE FROM fin_cashflow_monthly t
    USING cf_input i
    WHERE t.month = i.month
  )
  INSERT INTO fin_cashflow_monthly (
    month,
    cash_from_operations,
    cash_from_investing,
    cash_from_financing,
    net_cash_flow,
    inventory_purchases,
    owner_distributions,
    sales_tax_payments,
    starting_cash,
    ending_cash,
    synced_at
  )
  SELECT
    month,
    cash_from_operations,
    cash_from_investing,
    cash_from_financing,
    net_cash_flow,
    inventory_purchases,
    owner_distributions,
    sales_tax_payments,
    starting_cash,
    ending_cash,
    synced_at
  FROM cf_input;

  GET DIAGNOSTICS cf_rows_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'pnl_rows', pnl_rows_count,
    'bs_rows', bs_rows_count,
    'cf_rows', cf_rows_count,
    'total_rows', pnl_rows_count + bs_rows_count + cf_rows_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_finaloop_sync(JSONB, JSONB, JSONB) TO service_role;
