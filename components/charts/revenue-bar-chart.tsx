'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'

interface RevenueBarDatum {
  month: string
  revenue: number
  priorYear: number
  yoyPct: number | null
}

interface RevenueBarChartProps {
  data: RevenueBarDatum[]
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
  revenue: { label: 'This Year', color: 'hsl(var(--chart-1))' },
  priorYear: { label: 'Prior Year', color: 'hsl(var(--muted))' },
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const cy = payload.find((p) => p.dataKey === 'revenue')
  const py = payload.find((p) => p.dataKey === 'priorYear')
  const yoy = cy && py && py.value > 0
    ? ((cy.value - py.value) / py.value) * 100
    : null
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {cy && (
        <p className="text-sm font-semibold">{compactTick(cy.value)}</p>
      )}
      {py && py.value > 0 && (
        <p className="text-xs text-muted-foreground">
          vs {compactTick(py.value)} PY
        </p>
      )}
      {yoy !== null && (
        <p className={`text-xs font-medium ${yoy >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {yoy >= 0 ? '+' : ''}{yoy.toFixed(0)}% YoY
        </p>
      )}
    </div>
  )
}

export function RevenueBarChart({ data }: RevenueBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No data yet
      </div>
    )
  }

  return (
    <ChartContainer config={config} className="h-[280px] w-full">
      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
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
        <Bar dataKey="priorYear" radius={[3, 3, 0, 0]} maxBarSize={24} fill="hsl(var(--muted))" />
        <Bar dataKey="revenue" radius={[3, 3, 0, 0]} maxBarSize={24}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={
                d.yoyPct !== null && d.yoyPct < 0
                  ? 'hsl(0 72% 65%)'
                  : 'hsl(var(--chart-1))'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
