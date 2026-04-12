'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'

interface RunwayMonth {
  month: string
  balance: number
}

interface RunwayAreaChartProps {
  data: RunwayMonth[]
  dangerWeeks?: number
}

const fmtK = (v: number) => '$' + Math.round(v / 1000) + 'k'
const fmtFull = (v: number) => '$' + v.toLocaleString()

function RunwayTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{String(label)}</p>
      <p className="font-mono tabular-nums">{fmtFull(Number(payload[0]?.value))}</p>
    </div>
  )
}

export function RunwayAreaChart({ data, dangerWeeks }: RunwayAreaChartProps) {
  const dangerBalance = dangerWeeks != null && data.length > 0
    ? data.reduce((min, d) => Math.min(min, d.balance), Infinity) +
      (dangerWeeks / 52) *
        (data.reduce((max, d) => Math.max(max, d.balance), -Infinity) -
          data.reduce((min, d) => Math.min(min, d.balance), Infinity))
    : undefined

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="runwayGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} />
        <Tooltip content={<RunwayTooltip />} />

        {dangerBalance != null && (
          <ReferenceLine
            y={dangerBalance}
            stroke="#ef4444"
            strokeDasharray="6 3"
            label={{
              value: `Danger Zone: ${dangerWeeks} weeks`,
              position: 'insideTopRight',
              fill: '#ef4444',
              fontSize: 11,
            }}
          />
        )}

        <Area
          type="monotone"
          dataKey="balance"
          stroke="#14b8a6"
          strokeWidth={2}
          fill="url(#runwayGradient)"
          dot={{ r: 3, fill: '#14b8a6' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
