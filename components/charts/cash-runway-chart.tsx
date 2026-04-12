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

function barColor(cash: number): string {
  if (cash < 0) return 'hsl(0 72% 51%)'
  if (cash < 50_000) return 'hsl(48 96% 53%)'
  if (cash < 200_000) return 'hsl(48 96% 63%)'
  return 'hsl(var(--chart-1))'
}

const config: ChartConfig = {
  cash: { label: 'Projected Cash', color: 'hsl(var(--chart-1))' },
}

function CustomTooltip({ active, payload, label }: {
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
      {val < 50_000 && val >= 0 && (
        <p className="text-xs font-medium text-amber-600">Low cash warning</p>
      )}
      {val < 0 && (
        <p className="text-xs font-medium text-red-600">Cash negative</p>
      )}
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

  const minCash = Math.min(...data.map((d) => d.cash))
  const startCash = data[0]?.cash ?? 0
  const endCash = data[data.length - 1]?.cash ?? 0
  const burnRate = data.length > 1 ? (startCash - endCash) / (data.length - 1) : 0
  const weeksUntilZero = burnRate > 0 ? Math.ceil(endCash / burnRate) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            Start: <span className="font-medium text-foreground">{compactTick(startCash)}</span>
          </span>
          <span className="text-muted-foreground">
            End: <span className="font-medium text-foreground">{compactTick(endCash)}</span>
          </span>
        </div>
        <div className="flex items-center gap-4">
          {burnRate > 0 && (
            <span className="text-muted-foreground">
              Burn: <span className="font-medium text-red-600">{compactTick(burnRate)}/wk</span>
            </span>
          )}
          {minCash < 0 && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
              Goes negative
            </span>
          )}
          {minCash >= 0 && weeksUntilZero !== null && weeksUntilZero <= 26 && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              ~{weeksUntilZero}wk runway
            </span>
          )}
        </div>
      </div>

      <ChartContainer config={config} className="h-[240px] w-full">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
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
          <ChartTooltip content={<CustomTooltip />} />
          <Bar dataKey="cash" radius={[3, 3, 0, 0]} maxBarSize={32}>
            {data.map((d, i) => (
              <Cell key={i} fill={barColor(d.cash)} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
