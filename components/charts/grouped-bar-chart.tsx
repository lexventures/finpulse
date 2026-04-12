'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts'

interface ChannelRevenue {
  channel: string
  grossRevenue: number
  netRevenue: number
  retentionPct: number
}

interface GroupedBarChartProps {
  data: ChannelRevenue[]
}

const fmtK = (v: number) => '$' + Math.round(v / 1000) + 'k'
const fmtFull = (v: number) => '$' + v.toLocaleString()

function GroupedTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !Array.isArray(payload) || payload.length === 0) return null
  const item = payload[0]?.payload as ChannelRevenue | undefined
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
      {item && (
        <p className="mt-1 border-t border-border/50 pt-1 text-muted-foreground">
          Retention: {item.retentionPct}%
        </p>
      )}
    </div>
  )
}

function RetentionLabel(props: Record<string, unknown>) {
  const { x, y, width, value } = props as {
    x: number
    y: number
    width: number
    value: number
  }
  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      className="fill-muted-foreground text-[11px]"
    >
      {Number(value).toFixed(1)}%
    </text>
  )
}

export function GroupedBarChart({ data }: GroupedBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 24, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
        <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} />
        <Tooltip content={<GroupedTooltip />} />
        <Legend verticalAlign="top" height={36} />

        <Bar dataKey="grossRevenue" fill="#93c5fd" name="Gross Revenue" />
        <Bar dataKey="netRevenue" fill="#2563eb" name="Net Revenue">
          <LabelList dataKey="retentionPct" content={<RetentionLabel />} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
