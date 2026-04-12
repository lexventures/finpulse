'use client'

interface ChannelDatum {
  label: string
  value: number
  color: string
  yoyPct: number | null
}

interface ChannelMixChartProps {
  data: ChannelDatum[]
  total: number
}

function compactVal(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) {
    const k = abs / 1_000
    return `${sign}$${k >= 100 ? Math.round(k) : k.toFixed(0)}K`
  }
  return `${sign}$${Math.round(abs)}`
}

export function ChannelMixChart({ data, total }: ChannelMixChartProps) {
  if (data.length === 0 || total === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        No data yet
      </div>
    )
  }

  const sorted = [...data].sort((a, b) => b.value - a.value)
  const maxVal = sorted[0]?.value ?? 1

  return (
    <div className="space-y-3">
      <div className="flex h-5 w-full overflow-hidden rounded-full">
        {sorted.map((ch) => (
          <div
            key={ch.label}
            className="h-full transition-all"
            style={{
              width: `${(ch.value / total) * 100}%`,
              backgroundColor: ch.color,
              minWidth: ch.value > 0 ? 4 : 0,
            }}
          />
        ))}
      </div>

      <div className="space-y-2.5">
        {sorted.map((ch) => {
          const pct = ((ch.value / total) * 100).toFixed(0)
          const barWidth = maxVal > 0 ? (ch.value / maxVal) * 100 : 0
          return (
            <div key={ch.label}>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: ch.color }}
                  />
                  <span className="text-sm font-medium">{ch.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  {ch.yoyPct !== null && (
                    <span
                      className={`text-xs font-medium ${
                        ch.yoyPct >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {ch.yoyPct >= 0 ? '+' : ''}{ch.yoyPct.toFixed(0)}% YoY
                    </span>
                  )}
                  <span className="min-w-[60px] text-right text-sm font-semibold tabular-nums">
                    {compactVal(ch.value)}
                  </span>
                  <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                    {pct}%
                  </span>
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: ch.color,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-right text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{compactVal(total)}</span>
      </p>
    </div>
  )
}
