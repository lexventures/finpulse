'use client'

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

/** Weekly forecast row: grouped inflow/outflow bars (left axis) + balance lines (right axis). */
export interface ForecastChartWeek {
  label: string
  weeklyInflow: number
  weeklyOutflow: number
  startingBalance: number
  projectedEndingCash: number
}

interface ForecastComboChartProps {
  data: ForecastChartWeek[]
}

const fmtK = (v: number) => '$' + Math.round(v / 1000) + 'k'
const fmtFull = (v: number) => '$' + Math.round(v).toLocaleString()

function ForecastTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-medium">{String(label)}</p>
      {payload.map((entry: Record<string, unknown>, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block size-2.5 rounded-sm"
            style={{ backgroundColor: String(entry.color ?? '') }}
          />
          <span className="text-muted-foreground">{String(entry.name)}</span>
          <span className="ml-auto font-mono tabular-nums">
            {fmtFull(Number(entry.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ForecastComboChart({ data }: ForecastComboChartProps) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis
          yAxisId="flow"
          tickFormatter={fmtK}
          tick={{ fontSize: 11 }}
          width={56}
          label={{ value: 'Weekly $', angle: -90, position: 'insideLeft', fontSize: 10 }}
        />
        <YAxis
          yAxisId="bal"
          orientation="right"
          tickFormatter={fmtK}
          tick={{ fontSize: 11 }}
          width={56}
          label={{ value: 'Balance $', angle: 90, position: 'insideRight', fontSize: 10 }}
        />
        <Tooltip content={<ForecastTooltip />} />
        <Legend verticalAlign="top" height={36} />

        <Bar yAxisId="flow" dataKey="weeklyInflow" fill="#22c55e" name="Weekly inflows" />
        <Bar yAxisId="flow" dataKey="weeklyOutflow" fill="#ef4444" name="Weekly outflows" />

        <Line
          yAxisId="bal"
          type="monotone"
          dataKey="startingBalance"
          stroke="#64748b"
          strokeDasharray="5 3"
          dot={false}
          name="Week start balance"
        />
        <Line
          yAxisId="bal"
          type="monotone"
          dataKey="projectedEndingCash"
          stroke="#14b8a6"
          strokeWidth={2}
          dot={{ r: 3, fill: '#14b8a6' }}
          name="Week end balance"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
