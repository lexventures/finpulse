'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'

interface CashRunwayDatum {
  week: string
  cash: number
}

interface CashRunwayChartProps {
  data: CashRunwayDatum[]
}

function compactTick(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) {
    const k = abs / 1_000
    return `${sign}$${k >= 100 ? Math.round(k) : k.toFixed(0)}K`
  }
  return `${sign}$${Math.round(abs)}`
}

const config: ChartConfig = {
  cash: { label: 'Projected Cash', color: 'hsl(var(--chart-1))' },
}

function TooltipContent({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const val = payload[0]!.value
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{compactTick(val)}</p>
    </div>
  )
}

export function CashRunwayChart({ data }: CashRunwayChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        Run forecast to populate
      </div>
    )
  }

  const startCash = data[0]?.cash ?? 0
  const endCash = data[data.length - 1]?.cash ?? 0
  const minCash = Math.min(...data.map((d) => d.cash))
  const maxCash = Math.max(...data.map((d) => d.cash))
  const burnRate = data.length > 1 ? (startCash - endCash) / (data.length - 1) : 0
  const changePct = startCash > 0 ? ((endCash - startCash) / startCash) * 100 : 0

  const dangerThreshold = startCash * 0.25

  function barFill(cash: number): string {
    if (cash < 0) return 'hsl(0 72% 51%)'
    if (cash < dangerThreshold) return 'hsl(48 96% 53%)'
    const ratio = maxCash > minCash ? (cash - minCash) / (maxCash - minCash) : 1
    const lightness = 45 + ratio * 15
    return `hsl(221 83% ${lightness}%)`
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
        <span className="text-muted-foreground">
          Start: <span className="font-semibold text-foreground">{compactTick(startCash)}</span>
        </span>
        <span className="text-muted-foreground">
          End: <span className="font-semibold text-foreground">{compactTick(endCash)}</span>
        </span>
        <span className={`font-semibold ${changePct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {changePct >= 0 ? '+' : ''}{changePct.toFixed(0)}%
        </span>
        {burnRate > 0 && (
          <span className="ml-auto text-muted-foreground">
            Burn: <span className="font-semibold text-red-600">{compactTick(burnRate)}/wk</span>
          </span>
        )}
      </div>

      <ChartContainer config={config} className="h-[240px] w-full">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/50" />
          <XAxis
            dataKey="week"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            fontSize={11}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            fontSize={11}
            width={52}
            tickFormatter={compactTick}
          />
          <ChartTooltip content={<TooltipContent />} />
          <Bar dataKey="cash" radius={[3, 3, 0, 0]} maxBarSize={36}>
            {data.map((d, i) => (
              <Cell key={i} fill={barFill(d.cash)} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
