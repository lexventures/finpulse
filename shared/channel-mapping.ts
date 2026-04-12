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
  type: LineItemType
}

export const CHANNEL_MAPPINGS: ChannelMapping[] = [
  // Revenue — Sales line items (Finaloop nests under "Sales" category)
  { pattern: 'Sales - Shopify - emilylex', channel: 'dtc', type: 'revenue' },
  { pattern: 'Sales - Facebook (via Shopify)', channel: 'dtc', type: 'revenue' },
  { pattern: 'Sales - Faire (via Shopify)', channel: 'wholesale_faire', type: 'revenue' },
  { pattern: 'Sales - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'revenue' },
  { pattern: 'Sales - Wholesale', channel: 'wholesale_key', type: 'revenue' },
  { pattern: 'Sales - Square', channel: 'retail', type: 'revenue' },
  { pattern: 'Sales - unidentified payouts', channel: 'marketplace', type: 'revenue' },
  { pattern: 'Affiliate marketing income', channel: 'dtc', type: 'revenue' },

  // Revenue — nested sub-items (Finaloop indents these under parent Sales lines)
  { pattern: 'Impact Radius', channel: 'dtc', type: 'revenue' },
  { pattern: 'Square', channel: 'retail', type: 'revenue' },
  { pattern: 'Amazon', channel: 'marketplace', type: 'revenue' },
  { pattern: 'Urban Outfitters', channel: 'wholesale_key', type: 'revenue' },
  { pattern: 'Magnolia', channel: 'wholesale_key', type: 'revenue' },

  // Shipping income
  { pattern: 'Shipping income - Shopify - emilylex', channel: 'dtc', type: 'shipping' },
  { pattern: 'Shipping income - Facebook (via Shopify)', channel: 'dtc', type: 'shipping' },
  { pattern: 'Shipping income - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'shipping' },

  // Discounts — both old and current Finaloop naming
  { pattern: 'Discounts - Shopify - emilylex', channel: 'dtc', type: 'discount' },
  { pattern: 'Discounts - Facebook (via Shopify)', channel: 'dtc', type: 'discount' },
  { pattern: 'Discounts - Faire (via Shopify)', channel: 'wholesale_faire', type: 'discount' },
  { pattern: 'Discounts - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'discount' },
  { pattern: 'Discounts & promotions - Shopify - emilylex', channel: 'dtc', type: 'discount' },
  { pattern: 'Discounts & promotions - Facebook (via Shopify)', channel: 'dtc', type: 'discount' },
  { pattern: 'Discounts & promotions - Faire (via Shopify)', channel: 'wholesale_faire', type: 'discount' },
  { pattern: 'Discounts & promotions - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'discount' },

  // Returns — both old and current Finaloop naming
  { pattern: 'Returns - Shopify - emilylex', channel: 'dtc', type: 'return' },
  { pattern: 'Returns - Facebook (via Shopify)', channel: 'dtc', type: 'return' },
  { pattern: 'Returns - Faire (via Shopify)', channel: 'wholesale_faire', type: 'return' },
  { pattern: 'Returns - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'return' },
  { pattern: 'Refunds & returns - Shopify - emilylex', channel: 'dtc', type: 'return' },
  { pattern: 'Refunds & returns - Facebook (via Shopify)', channel: 'dtc', type: 'return' },
  { pattern: 'Refunds & returns - Faire (via Shopify)', channel: 'wholesale_faire', type: 'return' },
  { pattern: 'Refunds & returns - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'return' },

  // COGS — both old and current Finaloop naming
  { pattern: 'COGS - Shopify - emilylex', channel: 'dtc', type: 'cogs' },
  { pattern: 'COGS - Facebook (via Shopify)', channel: 'dtc', type: 'cogs' },
  { pattern: 'COGS - Faire (via Shopify)', channel: 'wholesale_faire', type: 'cogs' },
  { pattern: 'COGS - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'cogs' },
  { pattern: 'Cost of goods sold - Shopify - emilylex', channel: 'dtc', type: 'cogs' },
  { pattern: 'Cost of goods sold - Facebook (via Shopify)', channel: 'dtc', type: 'cogs' },
  { pattern: 'Cost of goods sold - Faire (via Shopify)', channel: 'wholesale_faire', type: 'cogs' },
  { pattern: 'Cost of goods sold - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'cogs' },

  // Fees (type 'fee': sync splits selling_fees vs processing_fees from the row label)
  { pattern: 'Fees - Shopify - emilylex', channel: 'dtc', type: 'fee' },
  { pattern: 'Selling fees - Shopify - emilylex', channel: 'dtc', type: 'fee' },
  { pattern: 'Selling fees - Facebook (via Shopify)', channel: 'dtc', type: 'fee' },
  { pattern: 'Selling fees - Faire', channel: 'wholesale_faire', type: 'fee' },
  { pattern: 'Fees - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'fee' },
  { pattern: 'Selling fees - Shopify - ca9d60-2', channel: 'wholesale_direct', type: 'fee' },
  { pattern: 'Chargeback protection - Shopify - emilylex', channel: 'dtc', type: 'fee' },
  { pattern: 'Dispute fees - Shopify - emilylex', channel: 'dtc', type: 'fee' },
  { pattern: 'Disputes - Shopify - emilylex', channel: 'dtc', type: 'fee' },
  { pattern: 'Faire', channel: 'wholesale_faire', type: 'fee' },

  // Ad Spend (allocated to channels)
  { pattern: 'Paid online ads - Facebook Advertising', channel: 'dtc', type: 'ad_spend' },
  { pattern: 'Paid online ads - Google Advertising', channel: 'dtc', type: 'ad_spend' },
  { pattern: 'Paid online ads - Faire', channel: 'wholesale_faire', type: 'ad_spend' },
  { pattern: 'Paid online ads - Shopify - emilylex', channel: 'dtc', type: 'ad_spend' },
  { pattern: 'Facebook Advertising', channel: 'dtc', type: 'ad_spend' },
  { pattern: 'Google Advertising', channel: 'dtc', type: 'ad_spend' },

  // Email Marketing
  { pattern: 'Email marketing', channel: 'dtc', type: 'email_marketing' },
  { pattern: 'Klaviyo', channel: 'dtc', type: 'email_marketing' },
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

export const WHOLESALE_SUBCHANNELS = [
  'wholesale_faire',
  'wholesale_direct',
  'wholesale_key',
] as const
