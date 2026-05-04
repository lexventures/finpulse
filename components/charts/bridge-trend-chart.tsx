'use client'

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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

const fmtPct = (v: number) => `${Math.round(v)}%`

export interface BridgeTrendLineSpec {
  dataKey: string
  name: string
  stroke: string
  strokeWidth?: number
}

export interface BridgeTrendAreaSpec {
  dataKey: string
  name: string
  fill: string
  stroke?: string
  stackId?: string
}

interface BaseProps {
  data: Array<Record<string, string | number>>
  caption?: string
  height?: number
}

interface AbsoluteProps extends BaseProps {
  mode?: 'absolute'
  lines: BridgeTrendLineSpec[]
  areas?: never
}

interface RateStackedProps extends BaseProps {
  mode: 'rate-stacked'
  areas: BridgeTrendAreaSpec[]
  lines: BridgeTrendLineSpec[]
}

export type BridgeTrendChartProps = AbsoluteProps | RateStackedProps

export function BridgeTrendChart(props: BridgeTrendChartProps) {
  const { data, caption, height = 200 } = props

  if (data.length < 2) return null

  const isRate = props.mode === 'rate-stacked'
  const areas = isRate ? props.areas : []
  const yFormatter = isRate ? fmtPct : fmtK
  const tooltipFormatter = (v: unknown) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '')
    return isRate ? `${v.toFixed(1)}%` : currencyFmt(v)
  }

  return (
    <div className="mt-4 pt-4 border-t border-border/60">
      {caption ? (
        <p className="text-xs text-muted-foreground mb-2">{caption}</p>
      ) : null}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis
            tickFormatter={yFormatter}
            tick={{ fontSize: 10 }}
            width={48}
            domain={isRate ? [0, 100] : undefined}
          />
          <Tooltip
            formatter={tooltipFormatter}
            labelStyle={{ fontWeight: 600 }}
            contentStyle={{ fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {areas.map((a) => (
            <Area
              key={a.dataKey}
              type="monotone"
              dataKey={a.dataKey}
              name={a.name}
              fill={a.fill}
              stroke={a.stroke ?? a.fill}
              stackId={a.stackId ?? 'rate'}
              fillOpacity={0.7}
            />
          ))}
          {props.lines.map((l) => (
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
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
