import { cn } from '@/lib/utils'

interface HeroRunwayCardProps {
  runwayWeeks: number
  startingCash: number
  weeklyBurnRate: number
  asOfLabel: string
  forecastNote: string
}

type Tier = 'healthy' | 'watch' | 'critical'

function tierFromWeeks(weeks: number): Tier {
  if (weeks > 12) return 'healthy'
  if (weeks > 8) return 'watch'
  return 'critical'
}

const TIER_LABELS: Record<Tier, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  critical: 'Critical',
}

const TIER_PILL: Record<Tier, string> = {
  healthy:
    'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400',
  watch:
    'bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400',
  critical:
    'bg-red-500/10 text-red-700 ring-1 ring-red-500/30 dark:text-red-400',
}

const TIER_ACCENT: Record<Tier, string> = {
  healthy: 'before:bg-emerald-500',
  watch: 'before:bg-amber-500',
  critical: 'before:bg-red-500',
}

const TIER_NUMBER: Record<Tier, string> = {
  healthy: 'text-emerald-700 dark:text-emerald-400',
  watch: 'text-amber-700 dark:text-amber-400',
  critical: 'text-red-700 dark:text-red-400',
}

function fmtCurrency(n: number): string {
  if (!Number.isFinite(n)) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) {
    const m = n / 1_000_000
    return `${m < 0 ? '-' : ''}$${Math.abs(m).toFixed(m >= 10 || m <= -10 ? 1 : 2)}M`
  }
  if (abs >= 1_000) {
    return `${n < 0 ? '-' : ''}$${Math.round(abs / 1_000).toLocaleString()}k`
  }
  return `${n < 0 ? '-' : ''}$${Math.round(abs).toLocaleString()}`
}

export function HeroRunwayCard({
  runwayWeeks,
  startingCash,
  weeklyBurnRate,
  asOfLabel,
  forecastNote,
}: HeroRunwayCardProps) {
  const tier = tierFromWeeks(runwayWeeks)
  const tierLabel = TIER_LABELS[tier]

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 px-6 py-5 sm:px-8 sm:py-6',
        'before:absolute before:inset-y-0 before:left-0 before:w-1.5',
        TIER_ACCENT[tier],
      )}
      data-tier={tier}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Runway
            </p>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                TIER_PILL[tier],
              )}
            >
              {tierLabel}
            </span>
          </div>
          <p
            className={cn(
              'mt-2 font-bold tabular-nums text-4xl sm:text-5xl tracking-tight leading-none',
              TIER_NUMBER[tier],
            )}
          >
            {runwayWeeks} <span className="text-2xl sm:text-3xl font-semibold">weeks</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {fmtCurrency(startingCash)} starting cash · {fmtCurrency(weeklyBurnRate)}/wk burn
          </p>
        </div>
        <div className="text-xs text-muted-foreground sm:text-right sm:max-w-[260px] tabular-nums">
          <p>As of {asOfLabel}</p>
          <p className="mt-1 leading-snug">{forecastNote}</p>
        </div>
      </div>
    </div>
  )
}
