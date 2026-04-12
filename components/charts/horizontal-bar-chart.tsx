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

interface AgingBucket {
  bucket: string
  amount: number
}

interface HorizontalBarChartProps {
  data: AgingBucket[]
  color?: string
}

const fmtK = (v: number) => '$' + Math.round(v / 1000) + 'k'
const fmtFull = (v: number) => '$' + v.toLocaleString()

function HorizontalTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{String(label)}</p>
      <p className="font-mono tabular-nums">{fmtFull(Number(payload[0]?.value))}</p>
    </div>
  )
}

export function HorizontalBarChart({ data, color = '#3b82f6' }: HorizontalBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 40, bottom: 4, left: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
        <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="bucket" tick={{ fontSize: 12 }} width={80} />
        <Tooltip content={<HorizontalTooltip />} />

        <Bar dataKey="amount" fill={color} radius={[0, 4, 4, 0]}>
          <LabelList dataKey="amount" position="right" formatter={(v) => fmtK(Number(v))} className="fill-foreground text-[11px]" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
