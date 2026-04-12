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

  -- P&L: delete matching rows first, then insert
  DELETE FROM fin_pnl_monthly t
  USING jsonb_to_recordset(p_pnl_rows) AS i(month DATE, channel TEXT)
  WHERE t.month = i.month AND t.channel = i.channel;

  INSERT INTO fin_pnl_monthly (
    month, channel, gross_revenue, shipping_income, discounts, returns,
    net_revenue, cogs, gross_profit, gross_margin_pct,
    processing_fees, selling_fees, total_fees,
    allocated_ad_spend, allocated_email_marketing,
    contribution_margin, contribution_margin_pct,
    shipping_fulfillment, payroll, ga_expense, sm_expense, rd_expense, depreciation,
    total_opex, ebitda, net_operating_profit,
    interest_financing, other_income_expenses, net_profit,
    is_partial, synced_at
  )
  SELECT
    month, channel, gross_revenue, shipping_income, discounts, returns,
    net_revenue, cogs, gross_profit, gross_margin_pct,
    processing_fees, selling_fees, total_fees,
    allocated_ad_spend, allocated_email_marketing,
    contribution_margin, contribution_margin_pct,
    shipping_fulfillment, payroll, ga_expense, sm_expense, rd_expense, depreciation,
    total_opex, ebitda, net_operating_profit,
    interest_financing, other_income_expenses, net_profit,
    is_partial, synced_at
  FROM jsonb_to_recordset(p_pnl_rows) AS x(
    month DATE, channel TEXT,
    gross_revenue NUMERIC, shipping_income NUMERIC, discounts NUMERIC, returns NUMERIC,
    net_revenue NUMERIC, cogs NUMERIC, gross_profit NUMERIC, gross_margin_pct NUMERIC,
    processing_fees NUMERIC, selling_fees NUMERIC, total_fees NUMERIC,
    allocated_ad_spend NUMERIC, allocated_email_marketing NUMERIC,
    contribution_margin NUMERIC, contribution_margin_pct NUMERIC,
    shipping_fulfillment NUMERIC, payroll NUMERIC, ga_expense NUMERIC,
    sm_expense NUMERIC, rd_expense NUMERIC, depreciation NUMERIC,
    total_opex NUMERIC, ebitda NUMERIC, net_operating_profit NUMERIC,
    interest_financing NUMERIC, other_income_expenses NUMERIC, net_profit NUMERIC,
    is_partial BOOLEAN, synced_at TIMESTAMPTZ
  );
  GET DIAGNOSTICS pnl_rows_count = ROW_COUNT;

  -- Balance Sheet: delete then insert
  DELETE FROM fin_balance_sheet_monthly t
  USING jsonb_to_recordset(p_bs_rows) AS i(month DATE)
  WHERE t.month = i.month;

  INSERT INTO fin_balance_sheet_monthly (
    month, bank_accounts_total, undeposited_funds_total, cash_and_equivalents,
    inventory_value, accounts_receivable, loans_to_related_party, unidentified_payouts,
    total_current_assets, net_fixed_assets, total_assets,
    credit_card_balances, accounts_payable, sales_tax_liability,
    total_current_liabilities, total_liabilities, total_equity,
    current_year_net_profit, synced_at
  )
  SELECT
    month, bank_accounts_total, undeposited_funds_total, cash_and_equivalents,
    inventory_value, accounts_receivable, loans_to_related_party, unidentified_payouts,
    total_current_assets, net_fixed_assets, total_assets,
    credit_card_balances, accounts_payable, sales_tax_liability,
    total_current_liabilities, total_liabilities, total_equity,
    current_year_net_profit, synced_at
  FROM jsonb_to_recordset(p_bs_rows) AS x(
    month DATE, bank_accounts_total NUMERIC, undeposited_funds_total NUMERIC,
    cash_and_equivalents NUMERIC, inventory_value NUMERIC, accounts_receivable NUMERIC,
    loans_to_related_party NUMERIC, unidentified_payouts NUMERIC,
    total_current_assets NUMERIC, net_fixed_assets NUMERIC, total_assets NUMERIC,
    credit_card_balances NUMERIC, accounts_payable NUMERIC, sales_tax_liability NUMERIC,
    total_current_liabilities NUMERIC, total_liabilities NUMERIC, total_equity NUMERIC,
    current_year_net_profit NUMERIC, synced_at TIMESTAMPTZ
  );
  GET DIAGNOSTICS bs_rows_count = ROW_COUNT;

  -- Cash Flow: delete then insert
  DELETE FROM fin_cashflow_monthly t
  USING jsonb_to_recordset(p_cf_rows) AS i(month DATE)
  WHERE t.month = i.month;

  INSERT INTO fin_cashflow_monthly (
    month, cash_from_operations, cash_from_investing, cash_from_financing,
    net_cash_flow, inventory_purchases, owner_distributions,
    sales_tax_payments, starting_cash, ending_cash, synced_at
  )
  SELECT
    month, cash_from_operations, cash_from_investing, cash_from_financing,
    net_cash_flow, inventory_purchases, owner_distributions,
    sales_tax_payments, starting_cash, ending_cash, synced_at
  FROM jsonb_to_recordset(p_cf_rows) AS x(
    month DATE, cash_from_operations NUMERIC, cash_from_investing NUMERIC,
    cash_from_financing NUMERIC, net_cash_flow NUMERIC, inventory_purchases NUMERIC,
    owner_distributions NUMERIC, sales_tax_payments NUMERIC,
    starting_cash NUMERIC, ending_cash NUMERIC, synced_at TIMESTAMPTZ
  );
  GET DIAGNOSTICS cf_rows_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'pnl_rows', pnl_rows_count,
    'bs_rows', bs_rows_count,
    'cf_rows', cf_rows_count,
    'total_rows', pnl_rows_count + bs_rows_count + cf_rows_count
  );
END;
$$;
