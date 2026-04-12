'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from 'recharts'

interface BurnMonth {
  month: string
  amount: number
}

interface BurnRateChartProps {
  data: BurnMonth[]
}

const fmtK = (v: number) => '$' + Math.round(v / 1000) + 'k'
const fmtFull = (v: number) => '$' + v.toLocaleString()

function BurnTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{String(label)}</p>
      <p className="font-mono tabular-nums">{fmtFull(Number(payload[0]?.value))}</p>
    </div>
  )
}

export function BurnRateChart({ data }: BurnRateChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 24, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} />
        <Tooltip content={<BurnTooltip />} />

        <Bar dataKey="amount" fill="#ef4444" radius={[4, 4, 0, 0]}>
          <LabelList dataKey="amount" position="top" formatter={(v) => fmtK(Number(v))} className="fill-foreground text-[11px]" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
