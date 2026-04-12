-- FinPulse configuration defaults (no mock financial data).
-- Run after migrations; intended for a fresh database or manual re-seed.

INSERT INTO fin_alert_thresholds (metric_key, metric_label, category, green_above, yellow_above, red_below, comparison_type, trend_periods, higher_is_better, is_active, notify_on_red, notify_on_yellow) VALUES
('gross_margin_pct', 'Gross Margin %', 'Margin', 55, 45, 45, 'absolute', NULL, true, true, true, false),
('gross_margin_trend', 'Gross Margin Trend', 'Margin', NULL, NULL, NULL, 'trend_decline', 3, true, true, true, false),
('cash_days', 'Days of Cash', 'Cash', 60, 30, 30, 'absolute', NULL, true, true, true, false),
('cash_forecast_min', '13wk Forecast Min', 'Cash', 45, 30, 30, 'absolute', NULL, true, true, true, false),
('blended_cac', 'Blended CAC ($)', 'Acquisition', 30, 45, 45, 'absolute', NULL, false, true, true, false),
('ltv_cac_ratio', 'LTV:CAC Ratio', 'Acquisition', 3.0, 2.0, 2.0, 'absolute', NULL, true, true, true, false),
('channel_max_pct', 'Largest Channel % Rev', 'Revenue', 40, 50, 50, 'absolute', NULL, false, true, true, false),
('dtc_aov_trend', 'DTC AOV Trend', 'Revenue', NULL, NULL, NULL, 'trend_decline', 3, true, true, true, false),
('wholesale_revenue_trend', 'Wholesale Revenue Trend', 'Wholesale', NULL, NULL, NULL, 'trend_decline', 3, true, true, true, false),
('faire_commission_pct', 'Faire Commission %', 'Wholesale', 18, 22, 22, 'absolute', NULL, false, true, true, false),
('inventory_turns', 'Inventory Turns', 'Inventory', 6, 4, 4, 'absolute', NULL, true, true, true, false),
('sales_tax_vs_avg', 'Sales Tax Liability vs Avg', 'Cash', 1.5, 2, 2, 'absolute', NULL, false, true, true, false),
('incoming_inventory_pct', 'Incoming Inventory % Cash', 'Cash', 15, 25, 25, 'absolute', NULL, false, true, true, false),
('labor_pct', 'Labor % of Revenue', 'Headcount', 20, 25, 25, 'absolute', NULL, false, true, true, false),
('membership_churn', 'Member Monthly Churn', 'Membership', 3, 5, 5, 'absolute', NULL, false, true, true, false),
('email_pct', 'Email/SMS % of DTC', 'Acquisition', 25, 15, 15, 'absolute', NULL, true, true, true, false),
('inventory_value_pct', 'Inventory % of Revenue', 'Inventory', 30, 40, 40, 'absolute', NULL, false, true, true, false),
('meta_spend_trend', 'Meta Ad Spend Trend', 'Acquisition', NULL, NULL, NULL, 'trend_decline', 3, false, true, true, false),
('new_customer_trend', 'New Customer Trend', 'Acquisition', NULL, NULL, NULL, 'trend_decline', 4, true, true, true, false),
('revenue_recon', 'Finaloop vs Shopify Δ%', 'Revenue', 3, 5, 5, 'absolute', NULL, false, true, true, false);

INSERT INTO fin_settings (key, value) VALUES
('key_account_gross_margin', '0.775'),
('faire_commission_rate', '0.15'),
('faire_monthly_ad_budget', '30000'),
('shipping_allocation_method', '"proportional_to_revenue"'),
('backfill_mode', 'false'),
('daily_briefing_include_in_email', 'false'),
('notification_email', '""'),
('sync_failure_email', '""'),
('seasonality_overrides', '{"jan":1.0,"feb":1.0,"mar":1.0,"apr":1.0,"may":1.0,"jun":1.0,"jul":1.0,"aug":1.0,"sep":1.0,"oct":1.0,"nov":1.0,"dec":1.0}');

INSERT INTO fin_benchmarks (category, metric_name, healthy_range, warning_threshold, context_note) VALUES
('Margin', 'Gross Margin %', '50-65%', '<45%', 'Physical goods ecommerce at $20-50M revenue'),
('Acquisition', 'Blended CAC', '<$35', '>$50', 'Sub-$50 AOV DTC brands'),
('Acquisition', 'LTV:CAC Ratio', '>3:1', '<2:1', NULL),
('Retention', 'Email/SMS % of DTC', '25-40%', '<15%', 'Brands with active email programs'),
('Inventory', 'Inventory Turns', '4-8x', '<4x', 'Physical goods'),
('Headcount', 'Labor % of Revenue', '<20%', '>25%', 'Scaling ecommerce brands'),
('Cash', 'Days of Cash', '>45 days', '<30 days', NULL),
('Revenue', 'Channel Concentration', '--', '>50% single channel', NULL),
('Growth', 'Revenue per Employee', '$800K-$1.2M', '<$600K', 'At current scale. Target: $3-4M at $100M');
