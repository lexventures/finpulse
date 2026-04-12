export type AlertEvalMode = 'absolute' | 'trend_decline'

export interface AlertThreshold {
  metric_key: string
  eval_mode: AlertEvalMode
  green_above?: number | null
  yellow_above?: number | null
  red_below?: number | null
  green_below?: number | null
  yellow_below?: number | null
  red_above?: number | null
  trend_periods?: number | null
  higher_is_better: boolean
  enabled: boolean
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThreshold[] = [
  // 1. Gross margin %
  {
    metric_key: 'gross_margin_pct',
    eval_mode: 'absolute',
    green_above: 55,
    yellow_above: 45,
    red_below: 45,
    higher_is_better: true,
    enabled: true,
  },
  // 2. Gross margin trend
  {
    metric_key: 'gross_margin_trend',
    eval_mode: 'trend_decline',
    trend_periods: 3,
    higher_is_better: true,
    enabled: true,
  },
  // 3. Cash days on hand
  {
    metric_key: 'cash_days',
    eval_mode: 'absolute',
    green_above: 60,
    yellow_above: 30,
    red_below: 30,
    higher_is_better: true,
    enabled: true,
  },
  // 4. Cash forecast minimum
  {
    metric_key: 'cash_forecast_min',
    eval_mode: 'absolute',
    green_above: 45,
    yellow_above: 30,
    red_below: 30,
    higher_is_better: true,
    enabled: true,
  },
  // 5. Blended CAC
  {
    metric_key: 'blended_cac',
    eval_mode: 'absolute',
    green_below: 30,
    yellow_below: 45,
    red_above: 45,
    higher_is_better: false,
    enabled: true,
  },
  // 6. LTV:CAC ratio
  {
    metric_key: 'ltv_cac_ratio',
    eval_mode: 'absolute',
    green_above: 3.0,
    yellow_above: 2.0,
    red_below: 2.0,
    higher_is_better: true,
    enabled: true,
  },
  // 7. Channel concentration max %
  {
    metric_key: 'channel_max_pct',
    eval_mode: 'absolute',
    green_below: 40,
    yellow_below: 50,
    red_above: 50,
    higher_is_better: false,
    enabled: true,
  },
  // 8. DTC AOV trend
  {
    metric_key: 'dtc_aov_trend',
    eval_mode: 'trend_decline',
    trend_periods: 3,
    higher_is_better: true,
    enabled: true,
  },
  // 9. Wholesale revenue trend
  {
    metric_key: 'wholesale_revenue_trend',
    eval_mode: 'trend_decline',
    trend_periods: 3,
    higher_is_better: true,
    enabled: true,
  },
  // 10. Faire commission %
  {
    metric_key: 'faire_commission_pct',
    eval_mode: 'absolute',
    green_below: 18,
    yellow_below: 22,
    red_above: 22,
    higher_is_better: false,
    enabled: true,
  },
  // 11. Inventory turns
  {
    metric_key: 'inventory_turns',
    eval_mode: 'absolute',
    green_above: 6,
    yellow_above: 4,
    red_below: 4,
    higher_is_better: true,
    enabled: true,
  },
  // 12. Sales tax vs average
  {
    metric_key: 'sales_tax_vs_avg',
    eval_mode: 'absolute',
    green_below: 1.5,
    yellow_below: 2,
    red_above: 2,
    higher_is_better: false,
    enabled: true,
  },
  // 13. Incoming inventory %
  {
    metric_key: 'incoming_inventory_pct',
    eval_mode: 'absolute',
    green_below: 15,
    yellow_below: 25,
    red_above: 25,
    higher_is_better: false,
    enabled: true,
  },
  // 14. Labor %
  {
    metric_key: 'labor_pct',
    eval_mode: 'absolute',
    green_below: 20,
    yellow_below: 25,
    red_above: 25,
    higher_is_better: false,
    enabled: true,
  },
  // 15. Membership churn
  {
    metric_key: 'membership_churn',
    eval_mode: 'absolute',
    green_below: 3,
    yellow_below: 5,
    red_above: 5,
    higher_is_better: false,
    enabled: true,
  },
  // 16. Email attribution %
  {
    metric_key: 'email_pct',
    eval_mode: 'absolute',
    green_above: 25,
    yellow_above: 15,
    red_below: 15,
    higher_is_better: true,
    enabled: true,
  },
  // 17. Inventory value %
  {
    metric_key: 'inventory_value_pct',
    eval_mode: 'absolute',
    green_below: 30,
    yellow_below: 40,
    red_above: 40,
    higher_is_better: false,
    enabled: true,
  },
  // 18. Meta spend trend
  {
    metric_key: 'meta_spend_trend',
    eval_mode: 'trend_decline',
    trend_periods: 3,
    higher_is_better: true,
    enabled: true,
  },
  // 19. New customer trend
  {
    metric_key: 'new_customer_trend',
    eval_mode: 'trend_decline',
    trend_periods: 4,
    higher_is_better: true,
    enabled: true,
  },
  // 20. Revenue reconciliation variance
  {
    metric_key: 'revenue_recon',
    eval_mode: 'absolute',
    green_below: 3,
    yellow_below: 5,
    red_above: 5,
    higher_is_better: false,
    enabled: true,
  },
]
