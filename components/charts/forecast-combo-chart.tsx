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
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

interface ForecastWeek {
  label: string
  grossInflow: number
  openingBalance: number
  cashInflows: number
  operatingOutflows: number
  poPayments: number
  taxReserves: number
  projectedBalance: number
}

interface ForecastComboChartProps {
  data: ForecastWeek[]
}

const fmtK = (v: number) => '$' + Math.round(v / 1000) + 'k'
const fmtFull = (v: number) => '$' + v.toLocaleString()

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
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} />
        <Tooltip content={<ForecastTooltip />} />
        <Legend verticalAlign="top" height={36} />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" label="Break-even" />

        <Bar dataKey="cashInflows" stackId="stack" fill="#22c55e" name="Cash Inflows" />
        <Bar dataKey="operatingOutflows" stackId="stack" fill="#ef4444" name="Operating Outflows" />
        <Bar dataKey="poPayments" stackId="stack" fill="#f97316" name="PO Payments" />
        <Bar dataKey="taxReserves" stackId="stack" fill="#eab308" name="Tax Reserves" />

        <Line
          type="monotone"
          dataKey="grossInflow"
          stroke="#3b82f6"
          strokeDasharray="6 3"
          dot={false}
          name="Gross Inflow"
        />
        <Line
          type="monotone"
          dataKey="openingBalance"
          stroke="#1e293b"
          dot={false}
          name="Opening Balance"
        />
        <Line
          type="monotone"
          dataKey="projectedBalance"
          stroke="#14b8a6"
          strokeWidth={2}
          dot={false}
          name="Projected Balance"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
