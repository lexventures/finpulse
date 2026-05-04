'use client'

import { useMemo, useState } from 'react'

import {
  BridgeTrendChart,
  type BridgeTrendAreaSpec,
  type BridgeTrendLineSpec,
} from '@/components/charts/bridge-trend-chart'
import { WaterfallChart } from '@/components/charts/waterfall-chart'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  buildContributionSnapshot,
  buildContributionVariance,
  buildNetSalesSnapshot,
  buildNetSalesVariance,
  computeContributionRates,
  computeNetSalesRates,
  lookupPriorPeriod,
  topVarianceDrivers,
  type BridgeKind,
  type PeriodKind,
  type PnlRow,
  type VarianceDriver,
} from '@/lib/calculations/bridge'

export type ChannelKey = 'company' | 'dtc' | 'wholesale'

export interface BridgeCardData {
  company: PnlRow[]
  dtc: PnlRow[]
  wholesale: PnlRow[]
}

interface BridgeCardProps {
  bridge: BridgeKind
  title: string
  description: string
  data: BridgeCardData
  defaultChannel?: ChannelKey
  defaultPeriod?: PeriodKind
}

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  company: 'Company',
  dtc: 'DTC',
  wholesale: 'Wholesale',
}

const PERIOD_LABELS: Record<PeriodKind, string> = {
  mom: 'MoM',
  yoy: 'YoY',
  snapshot: 'Snapshot',
}

function fmtCurrency(v: number): string {
  const sign = v < 0 ? '-' : '+'
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1_000)}k`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

function fmtMonth(month: string): string {
  return new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

function fmtPp(pp: number): string {
  const sign = pp >= 0 ? '+' : '−'
  return `${sign}${Math.abs(pp).toFixed(1)}pp`
}

function describeDriver(d: VarianceDriver): string {
  const dollars = fmtCurrency(d.delta)
  const stem = `${d.name.replace(/^Δ\s*/, '')} ${dollars}`
  if (d.rateNow != null && d.ratePoints != null) {
    return `${stem} (rate ${d.rateNow.toFixed(1)}%, ${fmtPp(d.ratePoints)} vs trailing 3mo)`
  }
  if (d.rateNow != null) {
    return `${stem} (rate ${d.rateNow.toFixed(1)}%)`
  }
  return stem
}

function selectSeries(data: BridgeCardData, channel: ChannelKey): PnlRow[] {
  return data[channel]
}

const NET_SALES_AREAS: BridgeTrendAreaSpec[] = [
  { dataKey: 'returns_rate', name: 'Returns', fill: '#fb923c' },
  { dataKey: 'discounts_rate', name: 'Discounts', fill: '#facc15' },
  { dataKey: 'net_layer', name: 'Kept of gross', fill: '#bfdbfe' },
]

const NET_SALES_LINES: BridgeTrendLineSpec[] = [
  { dataKey: 'net_revenue_rate', name: 'NR % of gross', stroke: '#1d4ed8', strokeWidth: 2.5 },
]

const CONTRIBUTION_AREAS: BridgeTrendAreaSpec[] = [
  { dataKey: 'cogs_rate', name: 'COGS', fill: '#fca5a5' },
  { dataKey: 'fees_rate', name: 'Fees', fill: '#fdba74' },
  { dataKey: 'ad_spend_rate', name: 'Paid ads', fill: '#c4b5fd' },
  { dataKey: 'email_rate', name: 'Email', fill: '#a5b4fc' },
  { dataKey: 'contribution_margin_rate', name: 'CM', fill: '#86efac' },
]

const CONTRIBUTION_LINES: BridgeTrendLineSpec[] = [
  { dataKey: 'contribution_margin_rate_line', name: 'CM % of NR', stroke: '#047857', strokeWidth: 2.5 },
]

function buildRateTrend(rows: PnlRow[], bridge: BridgeKind) {
  const sorted = [...rows]
    .filter((r) => !r.is_partial)
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12)
  if (bridge === 'net_sales') {
    return sorted
      .map((r) => {
        const rates = computeNetSalesRates(r)
        if (!rates) return null
        return {
          month: fmtMonth(r.month),
          returns_rate: rates.returns_rate,
          discounts_rate: rates.discounts_rate,
          net_layer: rates.net_layer,
          net_revenue_rate: rates.net_revenue_rate,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }
  return sorted
    .map((r) => {
      const rates = computeContributionRates(r)
      if (!rates) return null
      return {
        month: fmtMonth(r.month),
        cogs_rate: rates.cogs_rate,
        fees_rate: rates.fees_rate,
        ad_spend_rate: rates.ad_spend_rate,
        email_rate: rates.email_rate,
        contribution_margin_rate: rates.contribution_margin_rate,
        contribution_margin_rate_line: rates.contribution_margin_rate,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
}

interface ToggleGroupProps<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<{ id: T; label: string; disabled?: boolean }>
  onChange: (next: T) => void
}

function ToggleGroup<T extends string>({ label, value, options, onChange }: ToggleGroupProps<T>) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="inline-flex rounded-md border border-border/60 bg-background p-0.5">
        {options.map((opt) => {
          const active = opt.id === value
          return (
            <button
              key={opt.id}
              type="button"
              disabled={opt.disabled}
              onClick={() => onChange(opt.id)}
              className={
                'px-2 py-0.5 rounded text-xs transition-colors ' +
                (active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground') +
                (opt.disabled ? ' opacity-50 cursor-not-allowed' : '')
              }
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function BridgeCard({
  bridge,
  title,
  description,
  data,
  defaultChannel = 'company',
  defaultPeriod = 'mom',
}: BridgeCardProps) {
  const [channel, setChannel] = useState<ChannelKey>(defaultChannel)
  const [period, setPeriod] = useState<PeriodKind>(defaultPeriod)

  const series = useMemo(() => selectSeries(data, channel), [data, channel])
  const completed = useMemo(
    () =>
      [...series]
        .filter((r) => !r.is_partial)
        .sort((a, b) => b.month.localeCompare(a.month)),
    [series],
  )
  const current = completed[0]

  const variance = useMemo(() => {
    if (!current || period === 'snapshot') return null
    const prior = lookupPriorPeriod(series, current.month, period)
    if (!prior.row) return { error: prior.missingReason } as const
    if (bridge === 'net_sales') {
      return { walk: buildNetSalesVariance(current, prior.row) } as const
    }
    return { walk: buildContributionVariance(current, prior.row) } as const
  }, [bridge, current, period, series])

  const drivers = useMemo<VarianceDriver[]>(() => {
    if (!variance || 'error' in variance || !variance.walk) return []
    return topVarianceDrivers(variance.walk, series, bridge, 2)
  }, [bridge, series, variance])

  const snapshotSteps = useMemo(() => {
    if (!current) return []
    return bridge === 'net_sales'
      ? buildNetSalesSnapshot(current)
      : buildContributionSnapshot(current)
  }, [bridge, current])

  const rateTrend = useMemo(() => buildRateTrend(series, bridge), [bridge, series])

  const showingVariance = variance && 'walk' in variance && variance.walk
  const denominatorLabel = bridge === 'net_sales' ? 'gross revenue' : 'net revenue'
  const totalLabel = bridge === 'net_sales' ? 'NR' : 'CM'

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <ToggleGroup
            label="Channel"
            value={channel}
            options={[
              { id: 'company', label: CHANNEL_LABELS.company },
              { id: 'dtc', label: CHANNEL_LABELS.dtc },
              { id: 'wholesale', label: CHANNEL_LABELS.wholesale },
            ]}
            onChange={setChannel}
          />
          <ToggleGroup
            label="View"
            value={period}
            options={[
              { id: 'mom', label: PERIOD_LABELS.mom },
              { id: 'yoy', label: PERIOD_LABELS.yoy },
              { id: 'snapshot', label: PERIOD_LABELS.snapshot },
            ]}
            onChange={setPeriod}
          />
          <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#22c55e]" />
              Helped {totalLabel}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#ef4444]" />
              Hurt {totalLabel}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!current ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No P&amp;L data for {CHANNEL_LABELS[channel]}. Run a Finaloop sync.
          </p>
        ) : showingVariance ? (
          <>
            <p className="text-[11px] text-muted-foreground mb-1 tabular-nums">
              {period === 'mom' ? 'Month over month' : 'Year over year'} ·{' '}
              {fmtMonth(variance!.walk!.prior.month)} → {fmtMonth(current.month)} ·{' '}
              {CHANNEL_LABELS[channel]}
            </p>
            <WaterfallChart
              data={variance!.walk!.steps}
              yDomain={variance!.walk!.yDomain}
            />
            {drivers.length > 0 ? (
              <ul className="mt-3 space-y-1 text-[11px]">
                {drivers.map((d, i) => (
                  <li key={d.name} className="flex items-start gap-2">
                    <span
                      className={
                        'inline-block h-2 w-2 mt-1 rounded-full ' +
                        (d.isNegativeImpact ? 'bg-[#ef4444]' : 'bg-[#22c55e]')
                      }
                    />
                    <span className="text-muted-foreground">
                      <strong className="text-foreground">
                        {i === 0 ? 'Top driver: ' : 'Next: '}
                      </strong>
                      {describeDriver(d)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : variance && 'error' in variance ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              {period === 'yoy' ? 'YoY' : 'MoM'} unavailable — prior period{' '}
              {variance.error === 'partial' ? 'is partial' : 'missing'}.
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Snapshot of {fmtMonth(current.month)} shown below.
            </p>
            <div className="mt-4">
              <WaterfallChart data={snapshotSteps} />
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground mb-1 tabular-nums">
              Snapshot · {fmtMonth(current.month)} · {CHANNEL_LABELS[channel]}
            </p>
            <WaterfallChart data={snapshotSteps} />
          </>
        )}

        {rateTrend.length >= 2 ? (
          <BridgeTrendChart
            mode="rate-stacked"
            data={rateTrend}
            areas={bridge === 'net_sales' ? NET_SALES_AREAS : CONTRIBUTION_AREAS}
            lines={bridge === 'net_sales' ? NET_SALES_LINES : CONTRIBUTION_LINES}
            caption={`Rate trend (last 12mo, % of ${denominatorLabel}) — ${CHANNEL_LABELS[channel]}`}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
