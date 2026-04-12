import {
  CHANNEL_MAPPINGS,
  CHANNELS,
  type ChannelMapping,
  type FinPulseChannel,
  type LineItemType,
} from '@/shared/channel-mapping'

export { CHANNEL_MAPPINGS, CHANNELS }
export type { ChannelMapping, FinPulseChannel, LineItemType }

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
