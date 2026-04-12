import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent } from '@/components/ui/card'

export default function ScenariosPage() {
  return (
    <>
      <PageHeader title="Scenarios" />
      <div className="px-6 pb-6">
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              What-if scenario modeling coming in Phase 5
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
