export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { format } from 'date-fns'
import { createServiceClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/layout/page-header'
import { PinGate } from '@/app/team/pin-gate'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScenarioCreator } from './scenario-creator'
import { isPageProtected } from '@/lib/pin-protection'

const TYPE_LABELS: Record<string, string> = {
  ad_spend: 'Ad Spend',
  wholesale_growth: 'Wholesale Growth',
  cogs_change: 'COGS Change',
  new_hire: 'New Hire',
  price_change: 'Price Change',
}

export default async function ScenariosPage() {
  const cookieStore = await cookies()
  const needsPin = await isPageProtected('/scenarios')
  const pinVerified = needsPin ? Boolean(cookieStore.get('pin_verified')) : true
  const supabase = createServiceClient()

  const [scenariosResult, pnlResult] = await Promise.all([
    supabase
      .from('fin_scenarios')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('fin_kpi_monthly')
      .select('month, net_revenue, gross_margin_pct, cogs, allocated_ad_spend, payroll, contribution_margin_pct, net_profit, total_opex, is_partial')
      .eq('channel', 'company')
      .order('month', { ascending: false })
      .limit(1),
  ])

  const scenarios = scenariosResult.data ?? []
  const latestPnl = pnlResult.data?.[0] ?? null

  const baselines = {
    revenue: Number(latestPnl?.net_revenue) || 0,
    grossMarginPct: Number(latestPnl?.gross_margin_pct) || 0,
    cogs: Number(latestPnl?.cogs) || 0,
    adSpend: Number(latestPnl?.allocated_ad_spend) || 0,
    payroll: Number(latestPnl?.payroll) || 0,
    headcount: 0,
    contributionMarginPct: Number(latestPnl?.contribution_margin_pct) || 0,
    netProfit: Number(latestPnl?.net_profit) || 0,
    totalOpex: Number(latestPnl?.total_opex) || 0,
  }

  return (
    <PinGate initialUnlocked={pinVerified}>
      <PageHeader
        title="Scenario Modeling"
        description="What-if analysis for revenue, costs &amp; headcount"
      />
      <div className="space-y-6 px-6 pb-6">
        {scenarios.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Saved Scenarios</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {scenarios.map((s) => {
                const outputs = s.outputs as Record<string, number> | null
                return (
                  <Card key={s.id}>
                    <CardHeader className="flex flex-row items-start justify-between gap-2">
                      <CardTitle className="text-base">{s.name}</CardTitle>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {TYPE_LABELS[s.scenario_type] ?? s.scenario_type}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="text-muted-foreground">
                        Created{' '}
                        {format(new Date(s.created_at), 'MMM d, yyyy')}
                      </p>
                      {outputs && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          {Object.entries(outputs)
                            .slice(0, 4)
                            .map(([key, val]) => (
                              <div key={key}>
                                <span className="text-muted-foreground">
                                  {key.replace(/_/g, ' ')}:
                                </span>{' '}
                                <span className="font-medium">
                                  {typeof val === 'number'
                                    ? val.toLocaleString('en-US', {
                                        maximumFractionDigits: 1,
                                      })
                                    : String(val)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        <ScenarioCreator baselines={baselines} />
      </div>
    </PinGate>
  )
}
