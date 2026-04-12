'use client'

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const currencyFmt = (v: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v)

const fmtK = (v: number) => {
  const sign = v < 0 ? '-' : ''
  return `${sign}$${Math.round(Math.abs(v) / 1000)}k`
}

export interface BridgeTrendLineSpec {
  dataKey: string
  name: string
  stroke: string
  strokeWidth?: number
}

export function BridgeTrendChart({
  data,
  lines,
  caption,
}: {
  data: Array<Record<string, string | number>>
  lines: BridgeTrendLineSpec[]
  caption?: string
}) {
  if (data.length < 2) return null

  return (
    <div className="mt-4 pt-4 border-t border-border/60">
      {caption ? (
        <p className="text-xs text-muted-foreground mb-2">{caption}</p>
      ) : null}
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={48} />
          <Tooltip
            formatter={(v) =>
              typeof v === 'number' && Number.isFinite(v) ? currencyFmt(v) : String(v ?? '')
            }
            labelStyle={{ fontWeight: 600 }}
            contentStyle={{ fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {lines.map((l) => (
            <Line
              key={l.dataKey}
              type="monotone"
              dataKey={l.dataKey}
              name={l.name}
              stroke={l.stroke}
              strokeWidth={l.strokeWidth ?? 1.5}
              dot={{ r: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
