import { differenceInHours } from 'date-fns'
import { Badge } from '@/components/ui/badge'

interface PageHeaderProps {
  title: string
  description?: string
  lastSynced?: string | null
}

export function PageHeader({ title, description, lastSynced }: PageHeaderProps) {
  const isStale =
    lastSynced != null &&
    differenceInHours(new Date(), new Date(lastSynced)) > 24

  return (
    <div className="flex flex-col gap-1 px-6 pt-6 pb-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {isStale && (
          <Badge
            variant="outline"
            className="border-amber-300 bg-amber-50 text-amber-700"
          >
            Stale data
          </Badge>
        )}
      </div>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
      {lastSynced != null && (
        <p className="text-xs text-muted-foreground">
          Last synced: {lastSynced}
        </p>
      )}
    </div>
  )
}
