interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  stroke?: string
  fill?: string
  targetBand?: [number, number]
  className?: string
}

export function Sparkline({
  data,
  width = 120,
  height = 28,
  stroke = 'currentColor',
  fill = 'none',
  targetBand,
  className,
}: SparklineProps) {
  if (data.length < 2) return null

  const padX = 1
  const padY = 2
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const min = Math.min(...data, ...(targetBand ?? []))
  const max = Math.max(...data, ...(targetBand ?? []))
  const span = max - min || 1

  const xAt = (i: number) => padX + (i / (data.length - 1)) * innerW
  const yAt = (v: number) => padY + (1 - (v - min) / span) * innerH

  const points = data.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ')

  const lastIdx = data.length - 1
  const lastX = xAt(lastIdx)
  const lastY = yAt(data[lastIdx])

  let bandRect: { y: number; height: number } | null = null
  if (targetBand) {
    const [lo, hi] = targetBand
    const yLo = yAt(Math.min(lo, hi))
    const yHi = yAt(Math.max(lo, hi))
    bandRect = { y: yHi, height: Math.max(yLo - yHi, 1) }
  }

  return (
    <svg
      role="img"
      aria-label="Sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
    >
      {bandRect ? (
        <rect
          x={0}
          y={bandRect.y}
          width={width}
          height={bandRect.height}
          fill={stroke}
          fillOpacity={0.08}
        />
      ) : null}
      <polyline
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={1.75} fill={stroke} />
    </svg>
  )
}
