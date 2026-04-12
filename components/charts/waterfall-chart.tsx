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

export function WaterfallChart({ data }: WaterfallChartProps) {
  const transformed = useMemo(() => {
    let running = 0
    return data.map((item): TransformedItem => {
      if (item.isTotal) {
        const anchor =
          typeof item.value === 'number' && !Number.isNaN(item.value) ? item.value : running
        const result: TransformedItem = {
          name: item.name,
          invisible: 0,
          positive: 0,
          negative: 0,
          total: anchor,
          rawValue: anchor,
          isTotal: true,
        }
        return result
      }

      const base = running
      running += item.value

      if (item.value >= 0) {
        return {
          name: item.name,
          invisible: base,
          positive: item.value,
          negative: 0,
          total: 0,
          rawValue: item.value,
          isTotal: false,
        }
      }

      return {
        name: item.name,
        invisible: base + item.value,
        positive: 0,
        negative: Math.abs(item.value),
        total: 0,
        rawValue: item.value,
        isTotal: false,
      }
    })
  }, [data])

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={transformed} margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} />
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
