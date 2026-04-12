-- FinPulse initial schema: Shopify sessions, financial aggregates, alerts, sync, and audit.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE shopify_sessions (
  id TEXT PRIMARY KEY,
  shop TEXT NOT NULL,
  state TEXT,
  is_online BOOLEAN DEFAULT false,
  scope TEXT,
  expires TIMESTAMPTZ,
  access_token TEXT,
  online_access_info JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fin_pnl_monthly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN (
    'company', 'dtc', 'wholesale', 'wholesale_faire',
    'wholesale_direct', 'wholesale_key', 'retail', 'marketplace'
  )),
  gross_revenue NUMERIC(12,2) DEFAULT 0,
  shipping_income NUMERIC(12,2) DEFAULT 0,
  discounts NUMERIC(12,2) DEFAULT 0,
  returns NUMERIC(12,2) DEFAULT 0,
  net_revenue NUMERIC(12,2) DEFAULT 0,
  cogs NUMERIC(12,2) DEFAULT 0,
  gross_profit NUMERIC(12,2) DEFAULT 0,
  gross_margin_pct NUMERIC(5,2) DEFAULT 0,
  processing_fees NUMERIC(12,2) DEFAULT 0,
  selling_fees NUMERIC(12,2) DEFAULT 0,
  total_fees NUMERIC(12,2) DEFAULT 0,
  allocated_ad_spend NUMERIC(12,2) DEFAULT 0,
  allocated_email_marketing NUMERIC(12,2) DEFAULT 0,
  contribution_margin NUMERIC(12,2) DEFAULT 0,
  contribution_margin_pct NUMERIC(5,2) DEFAULT 0,
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
  is_partial BOOLEAN DEFAULT false,
  synced_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month, channel)
);

CREATE TABLE fin_cashflow_monthly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL UNIQUE,
  cash_from_operations NUMERIC(12,2),
  cash_from_investing NUMERIC(12,2),
  cash_from_financing NUMERIC(12,2),
  net_cash_flow NUMERIC(12,2),
  inventory_purchases NUMERIC(12,2),
  owner_distributions NUMERIC(12,2),
  sales_tax_payments NUMERIC(12,2),
  starting_cash NUMERIC(12,2),
  ending_cash NUMERIC(12,2),
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fin_balance_sheet_monthly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month DATE NOT NULL UNIQUE,
  bank_accounts_total NUMERIC(12,2),
  undeposited_funds_total NUMERIC(12,2),
  cash_and_equivalents NUMERIC(12,2),
  inventory_value NUMERIC(12,2),
  accounts_receivable NUMERIC(12,2),
  loans_to_related_party NUMERIC(12,2),
  unidentified_payouts NUMERIC(12,2),
  total_current_assets NUMERIC(12,2),
  net_fixed_assets NUMERIC(12,2),
  total_assets NUMERIC(12,2),
  credit_card_balances NUMERIC(12,2),
  accounts_payable NUMERIC(12,2),
  sales_tax_liability NUMERIC(12,2),
  total_current_liabilities NUMERIC(12,2),
  total_liabilities NUMERIC(12,2),
  total_equity NUMERIC(12,2),
  current_year_net_profit NUMERIC(12,2),
  synced_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fin_revenue_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'dtc' CHECK (channel IN ('dtc')),
  gross_revenue NUMERIC(12,2),
  net_revenue NUMERIC(12,2),
  order_count INTEGER,
  avg_order_value NUMERIC(10,2),
  new_customer_orders INTEGER,
  returning_customer_orders INTEGER,
  UNIQUE(date, channel)
);

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

CREATE TABLE fin_shopify_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  incoming_inventory_value NUMERIC(12,2) DEFAULT 0,
  incoming_inventory_sku_count INTEGER DEFAULT 0
);

CREATE TABLE fin_klaviyo_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  email_revenue NUMERIC(12,2),
  sms_revenue NUMERIC(12,2)
);

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
  source_data_stale BOOLEAN DEFAULT false,
  UNIQUE(forecast_run_date, week_number)
);

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

CREATE TABLE fin_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'error', 'partial', 'retry_1', 'retry_2', 'retry_3')),
  rows_synced INTEGER DEFAULT 0,
  error_message TEXT,
  attempt INTEGER DEFAULT 1,
  failure_notified BOOLEAN DEFAULT false
);

CREATE TABLE fin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fin_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE fin_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  metric_name TEXT NOT NULL UNIQUE,
  healthy_range TEXT NOT NULL,
  warning_threshold TEXT NOT NULL,
  context_note TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes: required names + channel-only paths. month, date, and forecast_run_date
-- are also indexed via UNIQUE constraints on the tables above (and fin_pnl_monthly
-- UNIQUE(month, channel) supports month and (month, channel) lookups).
-- ---------------------------------------------------------------------------

CREATE INDEX idx_shopify_sessions_shop ON shopify_sessions(shop);

CREATE INDEX idx_fin_pnl_monthly_channel ON fin_pnl_monthly(channel);

CREATE INDEX idx_fin_revenue_daily_channel ON fin_revenue_daily(channel);

CREATE INDEX idx_fin_alerts_unack ON fin_alerts(acknowledged, triggered_at DESC);

CREATE INDEX idx_fin_sync_log_source ON fin_sync_log(source, started_at DESC);

CREATE INDEX idx_fin_audit_log_table ON fin_audit_log(table_name, changed_at DESC);

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled on all tables; only service_role policies
-- (Next.js backend uses service_role; anon/authenticated have no policies.)
-- ---------------------------------------------------------------------------

ALTER TABLE shopify_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY shopify_sessions_service_role_all
  ON shopify_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_pnl_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_pnl_monthly_service_role_all
  ON fin_pnl_monthly
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_cashflow_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_cashflow_monthly_service_role_all
  ON fin_cashflow_monthly
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_balance_sheet_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_balance_sheet_monthly_service_role_all
  ON fin_balance_sheet_monthly
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_revenue_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_revenue_daily_service_role_all
  ON fin_revenue_daily
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_membership_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_membership_snapshot_service_role_all
  ON fin_membership_snapshot
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_shopify_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_shopify_daily_service_role_all
  ON fin_shopify_daily
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_klaviyo_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_klaviyo_daily_service_role_all
  ON fin_klaviyo_daily
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_cash_forecast ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_cash_forecast_service_role_all
  ON fin_cash_forecast
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_alert_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_alert_thresholds_service_role_all
  ON fin_alert_thresholds
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_alerts_service_role_all
  ON fin_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_headcount ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_headcount_service_role_all
  ON fin_headcount
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_scenarios_service_role_all
  ON fin_scenarios
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_sync_log_service_role_all
  ON fin_sync_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_settings_service_role_all
  ON fin_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_audit_log_service_role_all
  ON fin_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE fin_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY fin_benchmarks_service_role_all
  ON fin_benchmarks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
