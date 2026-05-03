'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface MonthlyCacChartPoint {
  month: string
  cac: number | null
  adSpend: number
  newCustomers: number
}

interface MonthlyCacChartProps {
  data: MonthlyCacChartPoint[]
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v)

function MonthlyCacTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null

  const point = payload[0]?.payload as MonthlyCacChartPoint | undefined
  if (!point) return null

  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1.5 font-medium">{String(label)}</p>
      <div className="space-y-1 font-mono tabular-nums">
        <p>CAC: {point.cac == null ? '—' : fmtCurrency(point.cac)}</p>
        <p>Ad spend: {fmtCurrency(point.adSpend)}</p>
        <p>New customers: {point.newCustomers.toLocaleString()}</p>
      </div>
    </div>
  )
}

export function MonthlyCacChart({ data }: MonthlyCacChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 12 }} width={64} />
        <Tooltip content={<MonthlyCacTooltip />} />
        <Line
          type="monotone"
          dataKey="cac"
          stroke="#7c3aed"
          strokeWidth={2.5}
          dot={{ r: 3, fill: '#7c3aed' }}
          connectNulls
          name="DTC CAC"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
