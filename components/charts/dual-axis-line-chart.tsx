'use client'

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface TrendPoint {
  month: string
  netRetentionPct: number
  totalLeakage: number
}

interface DualAxisLineChartProps {
  data: TrendPoint[]
}

const fmtK = (v: number) => '$' + Math.round(v / 1000) + 'k'
const fmtPct = (v: number) => v + '%'
const fmtFull = (v: number) => '$' + v.toLocaleString()

function DualAxisTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-medium">{String(label)}</p>
      {payload.map((entry: Record<string, unknown>, i: number) => {
        const key = String(entry.dataKey ?? '')
        const val = Number(entry.value)
        return (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: String(entry.color ?? '') }}
            />
            <span className="text-muted-foreground">{String(entry.name)}</span>
            <span className="ml-auto font-mono tabular-nums">
              {key === 'netRetentionPct' ? val + '%' : fmtFull(val)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function DualAxisLineChart({ data }: DualAxisLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="leakageFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis yAxisId="left" tickFormatter={fmtPct} tick={{ fontSize: 12 }} />
        <YAxis yAxisId="right" orientation="right" tickFormatter={fmtK} tick={{ fontSize: 12 }} />
        <Tooltip content={<DualAxisTooltip />} />
        <Legend verticalAlign="top" height={36} />

        <Area
          yAxisId="right"
          type="monotone"
          dataKey="totalLeakage"
          fill="url(#leakageFill)"
          stroke="transparent"
          name="Total Leakage"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="totalLeakage"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ r: 3, fill: '#ef4444' }}
          name="Total Leakage"
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="netRetentionPct"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ r: 3, fill: '#22c55e' }}
          name="Net Retention %"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
