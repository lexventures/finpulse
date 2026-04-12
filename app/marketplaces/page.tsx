import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'

export default function MarketplacesPage() {
  return (
    <>
      <PageHeader title="Marketplaces" />
      <div className="px-6 pb-6">
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              Marketplace analytics coming in Phase 4
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
