'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts'

interface WaterfallItem {
  name: string
  value: number
  isTotal?: boolean
}

interface WaterfallChartProps {
  data: WaterfallItem[]
  /**
   * Optional zoomed Y-axis domain. Variance bridges should pass a domain
   * computed from the running totals; snapshot bridges omit it so the axis
   * defaults to [0, auto].
   */
  yDomain?: [number, number]
}

interface TransformedItem {
  name: string
  invisible: number
  positive: number
  negative: number
  total: number
  rawValue: number
  isTotal: boolean
}

const fmtK = (v: number) => '$' + Math.round(v / 1000) + 'k'
const fmtFull = (v: number) => '$' + v.toLocaleString()

export function transformWaterfallData(data: WaterfallItem[]): TransformedItem[] {
  return data.reduce<{
    running: number
    items: TransformedItem[]
  }>(
    (acc, item) => {
      if (item.isTotal) {
        const anchor =
          typeof item.value === 'number' && !Number.isNaN(item.value) ? item.value : acc.running

        return {
          running: anchor,
          items: [
            ...acc.items,
            {
              name: item.name,
              invisible: 0,
              positive: 0,
              negative: 0,
              total: anchor,
              rawValue: anchor,
              isTotal: true,
            },
          ],
        }
      }

      const base = acc.running
      const nextRunning = acc.running + item.value
      const transformed =
        item.value >= 0
          ? {
              name: item.name,
              invisible: base,
              positive: item.value,
              negative: 0,
              total: 0,
              rawValue: item.value,
              isTotal: false,
            }
          : {
              name: item.name,
              invisible: base + item.value,
              positive: 0,
              negative: Math.abs(item.value),
              total: 0,
              rawValue: item.value,
              isTotal: false,
            }

      return {
        running: nextRunning,
        items: [...acc.items, transformed],
      }
    },
    { running: 0, items: [] },
  ).items
}

function WaterfallTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  const item = payload[0]?.payload as TransformedItem | undefined
  if (!item) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium">{String(label)}</p>
      <p className="font-mono tabular-nums">{fmtFull(item.rawValue)}</p>
    </div>
  )
}

export function WaterfallChart({ data, yDomain }: WaterfallChartProps) {
  const transformed = useMemo(() => transformWaterfallData(data), [data])

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={transformed} margin={{ top: 8, right: 12, bottom: 48, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11 }}
          angle={-35}
          textAnchor="end"
          interval={0}
          height={60}
        />
        <YAxis
          tickFormatter={fmtK}
          tick={{ fontSize: 12 }}
          domain={yDomain ?? undefined}
          allowDataOverflow={yDomain !== undefined}
        />
        <Tooltip content={<WaterfallTooltip />} />

        <Bar dataKey="invisible" stackId="waterfall" fill="transparent" />
        <Bar dataKey="positive" stackId="waterfall" fill="#22c55e" />
        <Bar dataKey="negative" stackId="waterfall" fill="#ef4444" />
        <Bar dataKey="total" stackId="waterfall">
          {transformed.map((entry, idx) => (
            <Cell key={idx} fill={entry.isTotal ? '#3b82f6' : 'transparent'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
