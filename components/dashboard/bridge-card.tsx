'use client'

import { useMemo, useState } from 'react'

import {
  BridgeTrendChart,
  type BridgeTrendAreaSpec,
  type BridgeTrendLineSpec,
} from '@/components/charts/bridge-trend-chart'
import { Sparkline } from '@/components/charts/sparkline'
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
import {
  composeBridgeHeadline,
  type BridgeHeadline,
} from '@/lib/calculations/bridge-headline'

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

function fmtAmount(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 10_000) return `$${Math.round(abs / 1_000)}k`
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(1)}k`
  return `$${abs.toFixed(0)}`
}

function fmtMonth(month: string): string {
  return new Date(month + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

const ADDITION_KINDS = new Set(['gross', 'nr', 'shipping'])
const DENOMINATOR_KINDS = new Set(['gross', 'nr'])

function lineItemDirection(d: VarianceDriver): 'up' | 'down' | 'flat' {
  if (d.delta === 0) return 'flat'
  const helped = d.delta > 0
  // additions move with the delta sign; deductions move opposite
  // (a more-positive stored value = less negative = lower expense line)
  if (ADDITION_KINDS.has(d.kind)) return helped ? 'up' : 'down'
  return helped ? 'down' : 'up'
}

function describeDriver(d: VarianceDriver, totalLabel: string, isTop: boolean): string {
  const verb = d.delta < 0 ? 'Hurt' : 'Helped'
  const rank = isTop ? `${verb} ${totalLabel} most` : `Also ${verb.toLowerCase()} ${totalLabel}`
  const direction = lineItemDirection(d)
  const arrow = direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'flat'
  const stem = `${d.name} ${arrow} ${fmtAmount(d.delta)} MoM`
  // Suppress rate parenthetical for gross/nr drivers — their rate is the
  // denominator (always 100%), so "rate 100%, +0.0pp" is noise.
  if (DENOMINATOR_KINDS.has(d.kind)) {
    return `${rank}: ${stem}`
  }
  if (d.rateNow != null && d.ratePoints != null) {
    const pp = Math.abs(d.ratePoints)
    const ppDirection = d.ratePoints >= 0 ? 'above' : 'below'
    return `${rank}: ${stem} (${d.rateNow.toFixed(1)}% rate, ${pp.toFixed(1)}pp ${ppDirection} trailing 3mo)`
  }
  if (d.rateNow != null) {
    return `${rank}: ${stem} (${d.rateNow.toFixed(1)}% rate)`
  }
  return `${rank}: ${stem}`
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

function HeadlineBlock({
  headline,
  totalLabel,
}: {
  headline: BridgeHeadline
  totalLabel: string
}) {
  const { primary, badgeLabel: badgeText, insight, action } = headline
  const deltaSign = primary.delta == null ? 0 : Math.sign(primary.delta)
  const deltaColor =
    deltaSign === 0
      ? 'text-muted-foreground'
      : deltaSign > 0
      ? 'text-[#15803d]'
      : 'text-[#b91c1c]'

  return (
    <div className="space-y-2">
      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1">
        <span className="font-heading text-2xl font-semibold tabular-nums leading-none">
          {primary.totalLabel}
        </span>
        {primary.deltaLabel ? (
          <span className={`text-sm font-medium tabular-nums ${deltaColor}`}>
            {primary.deltaLabel}
          </span>
        ) : null}
        {primary.deltaPctLabel ? (
          <span className={`text-xs tabular-nums ${deltaColor}`}>
            {primary.deltaPctLabel}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground tabular-nums">
          {primary.rateLabel}
        </span>
        {badgeText ? (
          <span
            className={
              'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide tabular-nums ' +
              (headline.badge === 'best_12mo'
                ? 'border-[#15803d]/30 bg-[#dcfce7] text-[#166534]'
                : 'border-[#b91c1c]/30 bg-[#fee2e2] text-[#991b1b]')
            }
          >
            {badgeText}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Sparkline
          data={primary.sparkline}
          width={140}
          height={28}
          stroke={
            headline.badge === 'worst_12mo'
              ? '#b91c1c'
              : headline.badge === 'best_12mo'
              ? '#15803d'
              : '#475569'
          }
          className="text-muted-foreground"
        />
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {primary.periodPhrase
            ? `${primary.periodPhrase} · ${primary.priorMonthLabel} → ${primary.monthLabel}`
            : `${primary.monthLabel} snapshot`}
        </span>
      </div>
      {insight ? (
        <p className="text-sm text-foreground leading-snug">{insight}</p>
      ) : null}
      {action ? (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-2 italic">
          Investigate: {action}
        </p>
      ) : (
        <p className="sr-only">No action recommended for {totalLabel}.</p>
      )}
    </div>
  )
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
    // Pull more drivers than we surface in the supporting detail; the
    // headline composer applies its own threshold filtering.
    return topVarianceDrivers(variance.walk, series, bridge, 8)
  }, [bridge, series, variance])

  const topDrivers = useMemo<VarianceDriver[]>(
    () => drivers.slice(0, 2),
    [drivers],
  )

  const snapshotSteps = useMemo(() => {
    if (!current) return []
    return bridge === 'net_sales'
      ? buildNetSalesSnapshot(current)
      : buildContributionSnapshot(current)
  }, [bridge, current])

  const rateTrend = useMemo(() => buildRateTrend(series, bridge), [bridge, series])

  const headline = useMemo<BridgeHeadline | null>(() => {
    if (!current) return null
    const priorRow =
      variance && 'walk' in variance && variance.walk ? variance.walk.prior : null
    return composeBridgeHeadline({
      bridge,
      current,
      prior: priorRow,
      series,
      drivers,
      periodKind: period,
    })
  }, [bridge, current, drivers, period, series, variance])

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
        ) : (
          <>
            {headline ? (
              <HeadlineBlock headline={headline} totalLabel={totalLabel} />
            ) : null}

            <div className="mt-5 pt-4 border-t border-border/60">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
                Supporting detail
              </p>

              {showingVariance ? (
                <>
                  <WaterfallChart
                    data={variance!.walk!.steps}
                    yDomain={variance!.walk!.yDomain}
                  />
                  {topDrivers.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-[11px]">
                      {topDrivers.map((d, i) => (
                        <li key={d.name} className="flex items-start gap-2">
                          <span
                            className={
                              'inline-block h-2 w-2 mt-1 rounded-full ' +
                              (d.isNegativeImpact ? 'bg-[#ef4444]' : 'bg-[#22c55e]')
                            }
                          />
                          <span className="text-foreground">
                            {describeDriver(d, totalLabel, i === 0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : variance && 'error' in variance ? (
                <div className="py-4 text-center">
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
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
