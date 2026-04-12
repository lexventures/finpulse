import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'

export default function InventoryPage() {
  return (
    <>
      <PageHeader title="Inventory" />
      <div className="px-6 pb-6">
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              Inventory tracking coming in Phase 2
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
