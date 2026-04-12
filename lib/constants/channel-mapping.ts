export type FinPulseChannel =
  | 'company'
  | 'dtc'
  | 'wholesale'
  | 'wholesale_faire'
  | 'wholesale_direct'
  | 'wholesale_key'
  | 'retail'
  | 'marketplace'

export type LineItemType =
  | 'revenue'
  | 'discount'
  | 'return'
  | 'cogs'
  | 'fee'
  | 'shipping'
  | 'ad_spend'
  | 'email_marketing'

export interface ChannelMapping {
  pattern: string
  channel: FinPulseChannel
  segment?: string
  type: LineItemType
}

export const CHANNEL_MAPPINGS: ChannelMapping[] = [
  // Revenue
  { pattern: 'Sales - Shopify - emilylex', channel: 'dtc', type: 'revenue' },
  { pattern: 'Sales - Facebook (via Shopify)', channel: 'dtc', type: 'revenue' },
  { pattern: 'Sales - Faire (via Shopify)', channel: 'wholesale_faire', type: 'revenue' },
  { pattern: 'Sales - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'revenue' },
  { pattern: 'Sales - Wholesale', channel: 'wholesale_key', type: 'revenue' },
  { pattern: 'Sales - Square', channel: 'retail', type: 'revenue' },
  { pattern: 'Sales - unidentified payouts', channel: 'marketplace', type: 'revenue' },
  { pattern: 'Affiliate marketing income', channel: 'dtc', type: 'revenue' },

  // Shipping Income
  { pattern: 'Shipping income - Shopify - emilylex', channel: 'dtc', type: 'shipping' },
  { pattern: 'Shipping income - Facebook (via Shopify)', channel: 'dtc', type: 'shipping' },
  { pattern: 'Shipping income - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'shipping' },

  // Discounts
  { pattern: 'Discounts - Shopify - emilylex', channel: 'dtc', type: 'discount' },
  { pattern: 'Discounts - Facebook (via Shopify)', channel: 'dtc', type: 'discount' },
  { pattern: 'Discounts - Faire (via Shopify)', channel: 'wholesale_faire', type: 'discount' },
  { pattern: 'Discounts - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'discount' },

  // Returns
  { pattern: 'Returns - Shopify - emilylex', channel: 'dtc', type: 'return' },
  { pattern: 'Returns - Facebook (via Shopify)', channel: 'dtc', type: 'return' },
  { pattern: 'Returns - Faire (via Shopify)', channel: 'wholesale_faire', type: 'return' },
  { pattern: 'Returns - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'return' },

  // COGS
  { pattern: 'COGS - Shopify - emilylex', channel: 'dtc', type: 'cogs' },
  { pattern: 'COGS - Facebook (via Shopify)', channel: 'dtc', type: 'cogs' },
  { pattern: 'COGS - Faire (via Shopify)', channel: 'wholesale_faire', type: 'cogs' },
  { pattern: 'COGS - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'cogs' },

  // Fees
  { pattern: 'Fees - Shopify - emilylex', channel: 'dtc', type: 'fee' },
  { pattern: 'Selling fees - Faire', channel: 'wholesale_faire', type: 'fee' },
  { pattern: 'Fees - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'fee' },

  // Ad Spend (allocated)
  { pattern: 'Paid online ads - Facebook Advertising', channel: 'dtc', type: 'ad_spend' },
  { pattern: 'Paid online ads - Google Advertising', channel: 'dtc', type: 'ad_spend' },
  { pattern: 'Paid online ads - Faire', channel: 'wholesale_faire', type: 'ad_spend' },

  // Email Marketing
  { pattern: 'Email marketing', channel: 'dtc', type: 'email_marketing' },
]

export const CHANNELS = [
  'company',
  'dtc',
  'wholesale',
  'wholesale_faire',
  'wholesale_direct',
  'wholesale_key',
  'retail',
  'marketplace',
] as const

export const CHANNEL_LABELS: Record<FinPulseChannel, string> = {
  company: 'Company',
  dtc: 'DTC',
  wholesale: 'All Wholesale',
  wholesale_faire: 'Faire',
  wholesale_direct: 'Direct',
  wholesale_key: 'Key Accounts',
  retail: 'Retail',
  marketplace: 'Marketplaces',
}

export const CHANNEL_COLORS: Record<FinPulseChannel, string> = {
  company: '#1e293b',
  dtc: 'var(--chart-dtc)',
  wholesale: '#16a34a',
  wholesale_faire: 'var(--chart-faire)',
  wholesale_direct: 'var(--chart-direct)',
  wholesale_key: 'var(--chart-key)',
  retail: 'var(--chart-retail)',
  marketplace: 'var(--chart-marketplace)',
}

export const RECONCILIATION_LAGGED = [
  'Selling fees - Faire',
  'Salaries & wages',
  'Employer taxes',
  'Employee benefit programs',
  'Uncategorized transactions - money received',
  'Uncategorized transactions - money spent',
]
