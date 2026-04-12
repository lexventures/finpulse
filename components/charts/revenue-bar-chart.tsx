'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
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
  momPct: number | null
  isPartial?: boolean
}

interface RevenueBarChartProps {
  data: RevenueBarDatum[]
  hasPriorYear: boolean
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

const configWithPY: ChartConfig = {
  revenue: { label: 'This Year', color: 'hsl(221 83% 53%)' },
  priorYear: { label: 'Prior Year', color: 'hsl(var(--muted))' },
}

const configNoPY: ChartConfig = {
  revenue: { label: 'Revenue', color: 'hsl(221 83% 53%)' },
}

function TooltipContent({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number }>
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
      {cy && <p className="text-sm font-semibold">{compactTick(cy.value)}</p>}
      {py && py.value > 0 && (
        <p className="text-xs text-muted-foreground">Prior year: {compactTick(py.value)}</p>
      )}
      {yoy !== null && (
        <p className={`text-xs font-medium ${yoy >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {yoy >= 0 ? '+' : ''}{yoy.toFixed(0)}% YoY
        </p>
      )}
    </div>
  )
}

function ChangeLabelRenderer(
  props: Record<string, unknown> & { data: RevenueBarDatum[] },
) {
  const x = Number(props.x ?? 0)
  const y = Number(props.y ?? 0)
  const width = Number(props.width ?? 0)
  const index = Number(props.index ?? 0)
  const d = props.data[index]
  if (!d) return null
  const pct = d.yoyPct ?? d.momPct
  if (pct === null) return null
  const color = pct >= 0 ? '#059669' : '#dc2626'
  const text = `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      fontSize={10}
      fontWeight={600}
      fill={color}
    >
      {text}
    </text>
  )
}

export function RevenueBarChart({ data, hasPriorYear }: RevenueBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No data yet
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm bg-[hsl(221_83%_53%)]" />
          {hasPriorYear ? 'This Year' : 'Revenue'}
        </span>
        {hasPriorYear && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-5 rounded-sm bg-muted" />
            Prior Year
          </span>
        )}
        <span className="ml-auto">
          <span className="text-emerald-600">+N%</span> / <span className="text-red-600">-N%</span>
          {' '}{hasPriorYear ? 'YoY' : 'MoM'}
        </span>
      </div>

      <ChartContainer config={hasPriorYear ? configWithPY : configNoPY} className="h-[260px] w-full">
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 0 }} barGap={1} barCategoryGap="20%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/50" />
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
          <ChartTooltip content={<TooltipContent />} />
          {hasPriorYear && (
            <Bar dataKey="priorYear" radius={[3, 3, 0, 0]} maxBarSize={28} fill="hsl(var(--muted))" />
          )}
          <Bar dataKey="revenue" radius={[3, 3, 0, 0]} maxBarSize={hasPriorYear ? 28 : 40}>
            {data.map((d, i) => {
              const pct = d.yoyPct ?? d.momPct
              return (
                <Cell
                  key={i}
                  fill={
                    d.isPartial
                      ? 'hsl(221 83% 53% / 0.4)'
                      : pct !== null && pct < -10
                        ? 'hsl(0 72% 55%)'
                        : pct !== null && pct > 10
                          ? 'hsl(152 60% 42%)'
                          : 'hsl(221 83% 53%)'
                  }
                />
              )
            })}
            <LabelList
              content={(props) => <ChangeLabelRenderer {...props} data={data} />}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  )
}
