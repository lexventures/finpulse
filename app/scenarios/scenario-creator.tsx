'use client'

import { useState, useMemo, type FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface Baselines {
  revenue: number
  grossMarginPct: number
  cogs: number
  adSpend: number
  payroll: number
  headcount: number
  contributionMarginPct: number
  netProfit: number
  totalOpex: number
}

interface ScenarioCreatorProps {
  baselines: Baselines
}

type ScenarioType =
  | 'ad_spend'
  | 'wholesale_growth'
  | 'cogs_change'
  | 'new_hire'
  | 'price_change'

interface AdSpendInputs {
  platform: string
  monthlyChange: number
  efficiencyPct: number
}

interface WholesaleInputs {
  newAccounts: number
  avgFirstOrder: number
  reorderRatePct: number
  avgReorder: number
}

interface CogsInputs {
  changePct: number
  channels: string[]
}

interface NewHireInputs {
  salary: number
  benefitsPct: number
  role: string
}

interface PriceChangeInputs {
  changePct: number
  channels: string[]
  volumeChangePct: number
}

type ScenarioInputs =
  | AdSpendInputs
  | WholesaleInputs
  | CogsInputs
  | NewHireInputs
  | PriceChangeInputs

interface OutputMetric {
  label: string
  current: number
  projected: number
  format: 'currency' | 'percent'
}

const CHANNELS = ['DTC', 'Wholesale Faire', 'Wholesale Direct', 'Wholesale Key', 'Retail']
const PLATFORMS = ['Meta', 'Google', 'TikTok', 'Pinterest', 'Other']

function fmtCurrency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

function Delta({ current, projected }: { current: number; projected: number }) {
  const diff = projected - current
  const isPositive = diff > 0
  const isNeutral = diff === 0
  return (
    <span
      className={cn(
        'text-xs font-medium',
        isNeutral && 'text-muted-foreground',
        isPositive && 'text-emerald-600 dark:text-emerald-400',
        !isPositive && !isNeutral && 'text-red-600 dark:text-red-400',
      )}
    >
      {isPositive ? '+' : ''}
      {fmtCurrency(diff)}
    </span>
  )
}

function computeOutputs(
  type: ScenarioType,
  inputs: ScenarioInputs,
  b: Baselines,
): OutputMetric[] {
  switch (type) {
    case 'ad_spend': {
      const i = inputs as AdSpendInputs
      const newAdSpend = b.adSpend + i.monthlyChange
      const revenueGain = i.monthlyChange * (i.efficiencyPct / 100)
      const projRevenue = b.revenue + revenueGain
      const projNetProfit = b.netProfit + revenueGain * (b.grossMarginPct / 100) - i.monthlyChange
      return [
        { label: 'Monthly Revenue', current: b.revenue, projected: projRevenue, format: 'currency' },
        { label: 'Ad Spend', current: b.adSpend, projected: newAdSpend, format: 'currency' },
        { label: 'Net Profit', current: b.netProfit, projected: projNetProfit, format: 'currency' },
      ]
    }
    case 'wholesale_growth': {
      const i = inputs as WholesaleInputs
      const firstOrderRev = i.newAccounts * i.avgFirstOrder
      const monthlyReorders = i.newAccounts * (i.reorderRatePct / 100) * i.avgReorder
      const totalNew = firstOrderRev + monthlyReorders * 11
      const annualizedMonthly = totalNew / 12
      const projRevenue = b.revenue + annualizedMonthly
      const projNetProfit = b.netProfit + annualizedMonthly * (b.grossMarginPct / 100)
      return [
        { label: 'Monthly Revenue', current: b.revenue, projected: projRevenue, format: 'currency' },
        { label: 'First Year Revenue', current: 0, projected: totalNew, format: 'currency' },
        { label: 'Net Profit', current: b.netProfit, projected: projNetProfit, format: 'currency' },
      ]
    }
    case 'cogs_change': {
      const i = inputs as CogsInputs
      const channelFraction = i.channels.length / CHANNELS.length || 1
      const cogsChange = Math.abs(b.cogs) * (i.changePct / 100) * channelFraction
      const projCogs = b.cogs + cogsChange
      const projGrossProfit = b.revenue + projCogs
      const projMargin = b.revenue > 0 ? (projGrossProfit / b.revenue) * 100 : 0
      const profitImpact = -cogsChange
      return [
        { label: 'COGS', current: Math.abs(b.cogs), projected: Math.abs(projCogs), format: 'currency' },
        { label: 'Gross Margin %', current: b.grossMarginPct, projected: projMargin, format: 'percent' },
        { label: 'Net Profit', current: b.netProfit, projected: b.netProfit + profitImpact, format: 'currency' },
      ]
    }
    case 'new_hire': {
      const i = inputs as NewHireInputs
      const annualCost = i.salary * (1 + i.benefitsPct / 100)
      const monthlyCost = annualCost / 12
      const projPayroll = b.payroll + monthlyCost
      const projOpex = b.totalOpex + monthlyCost
      const projNetProfit = b.netProfit - monthlyCost
      return [
        { label: 'Monthly Payroll', current: b.payroll, projected: projPayroll, format: 'currency' },
        { label: 'Total OpEx', current: b.totalOpex, projected: projOpex, format: 'currency' },
        { label: 'Net Profit', current: b.netProfit, projected: projNetProfit, format: 'currency' },
      ]
    }
    case 'price_change': {
      const i = inputs as PriceChangeInputs
      const channelFraction = i.channels.length / CHANNELS.length || 1
      const affectedRevenue = b.revenue * channelFraction
      const priceEffect = affectedRevenue * (i.changePct / 100)
      const volumeEffect = (affectedRevenue + priceEffect) * (i.volumeChangePct / 100)
      const netRevenueChange = priceEffect + volumeEffect
      const projRevenue = b.revenue + netRevenueChange
      const projNetProfit = b.netProfit + netRevenueChange * (b.grossMarginPct / 100)
      return [
        { label: 'Monthly Revenue', current: b.revenue, projected: projRevenue, format: 'currency' },
        { label: 'Revenue Change', current: 0, projected: netRevenueChange, format: 'currency' },
        { label: 'Net Profit', current: b.netProfit, projected: projNetProfit, format: 'currency' },
      ]
    }
  }
}

export function ScenarioCreator({ baselines }: ScenarioCreatorProps) {
  const [type, setType] = useState<ScenarioType>('ad_spend')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [adSpend, setAdSpend] = useState<AdSpendInputs>({
    platform: 'Meta',
    monthlyChange: 0,
    efficiencyPct: 300,
  })
  const [wholesale, setWholesale] = useState<WholesaleInputs>({
    newAccounts: 0,
    avgFirstOrder: 500,
    reorderRatePct: 60,
    avgReorder: 350,
  })
  const [cogs, setCogs] = useState<CogsInputs>({
    changePct: 0,
    channels: [],
  })
  const [newHire, setNewHire] = useState<NewHireInputs>({
    salary: 0,
    benefitsPct: 25,
    role: '',
  })
  const [priceChange, setPriceChange] = useState<PriceChangeInputs>({
    changePct: 0,
    channels: [],
    volumeChangePct: 0,
  })

  function currentInputs(): ScenarioInputs {
    switch (type) {
      case 'ad_spend': return adSpend
      case 'wholesale_growth': return wholesale
      case 'cogs_change': return cogs
      case 'new_hire': return newHire
      case 'price_change': return priceChange
    }
  }

  const outputs = useMemo(
    () => computeOutputs(type, currentInputs(), baselines),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, adSpend, wholesale, cogs, newHire, priceChange, baselines],
  )

  function toggleChannel(
    channels: string[],
    channel: string,
    setter: (channels: string[]) => void,
  ) {
    setter(
      channels.includes(channel)
        ? channels.filter((c) => c !== channel)
        : [...channels, channel],
    )
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setSaved(false)

    const outputMap: Record<string, number> = {}
    for (const o of outputs) {
      outputMap[o.label.toLowerCase().replace(/\s+/g, '_')] = Math.round(o.projected)
    }

    try {
      await fetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          scenario_type: type,
          inputs: currentInputs(),
          outputs: outputMap,
        }),
      })
      setSaved(true)
      setName('')
    } catch {
      // silently fail for now
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Scenario</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-6">
          <Tabs
            value={type}
            onValueChange={(v) => setType(v as ScenarioType)}
          >
            <TabsList className="flex-wrap">
              <TabsTrigger value="ad_spend">Ad Spend</TabsTrigger>
              <TabsTrigger value="wholesale_growth">Wholesale Growth</TabsTrigger>
              <TabsTrigger value="cogs_change">COGS Change</TabsTrigger>
              <TabsTrigger value="new_hire">New Hire</TabsTrigger>
              <TabsTrigger value="price_change">Price Change</TabsTrigger>
            </TabsList>

            <TabsContent value="ad_spend">
              <div className="grid gap-4 pt-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Platform</label>
                  <Select
                    value={adSpend.platform}
                    onValueChange={(v) =>
                      setAdSpend((p) => ({ ...p, platform: v ?? p.platform }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Monthly Change ($)
                  </label>
                  <Input
                    type="number"
                    value={adSpend.monthlyChange || ''}
                    onChange={(e) =>
                      setAdSpend((p) => ({
                        ...p,
                        monthlyChange: Number(e.target.value),
                      }))
                    }
                    placeholder="e.g. 2000"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Efficiency Assumption (%)
                  </label>
                  <Input
                    type="number"
                    value={adSpend.efficiencyPct || ''}
                    onChange={(e) =>
                      setAdSpend((p) => ({
                        ...p,
                        efficiencyPct: Number(e.target.value),
                      }))
                    }
                    placeholder="e.g. 300 = 3x ROAS"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="wholesale_growth">
              <div className="grid gap-4 pt-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">New Accounts</label>
                  <Input
                    type="number"
                    value={wholesale.newAccounts || ''}
                    onChange={(e) =>
                      setWholesale((p) => ({
                        ...p,
                        newAccounts: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Avg First Order ($)
                  </label>
                  <Input
                    type="number"
                    value={wholesale.avgFirstOrder || ''}
                    onChange={(e) =>
                      setWholesale((p) => ({
                        ...p,
                        avgFirstOrder: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Reorder Rate (%)
                  </label>
                  <Input
                    type="number"
                    value={wholesale.reorderRatePct || ''}
                    onChange={(e) =>
                      setWholesale((p) => ({
                        ...p,
                        reorderRatePct: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Avg Reorder ($)
                  </label>
                  <Input
                    type="number"
                    value={wholesale.avgReorder || ''}
                    onChange={(e) =>
                      setWholesale((p) => ({
                        ...p,
                        avgReorder: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="cogs_change">
              <div className="space-y-4 pt-4">
                <div className="max-w-xs space-y-1.5">
                  <label className="text-sm font-medium">% Change</label>
                  <Input
                    type="number"
                    value={cogs.changePct || ''}
                    onChange={(e) =>
                      setCogs((p) => ({
                        ...p,
                        changePct: Number(e.target.value),
                      }))
                    }
                    placeholder="e.g. 5 for +5%"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Affected Channels
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CHANNELS.map((ch) => (
                      <Button
                        key={ch}
                        type="button"
                        variant={cogs.channels.includes(ch) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() =>
                          toggleChannel(cogs.channels, ch, (channels) =>
                            setCogs((p) => ({ ...p, channels })),
                          )
                        }
                      >
                        {ch}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="new_hire">
              <div className="grid gap-4 pt-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Annual Salary ($)
                  </label>
                  <Input
                    type="number"
                    value={newHire.salary || ''}
                    onChange={(e) =>
                      setNewHire((p) => ({
                        ...p,
                        salary: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Benefits (%)</label>
                  <Input
                    type="number"
                    value={newHire.benefitsPct || ''}
                    onChange={(e) =>
                      setNewHire((p) => ({
                        ...p,
                        benefitsPct: Number(e.target.value),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role</label>
                  <Input
                    value={newHire.role}
                    onChange={(e) =>
                      setNewHire((p) => ({ ...p, role: e.target.value }))
                    }
                    placeholder="e.g. Marketing Manager"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="price_change">
              <div className="space-y-4 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Price Change (%)
                    </label>
                    <Input
                      type="number"
                      value={priceChange.changePct || ''}
                      onChange={(e) =>
                        setPriceChange((p) => ({
                          ...p,
                          changePct: Number(e.target.value),
                        }))
                      }
                      placeholder="e.g. 10 for +10%"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Volume Change (%)
                    </label>
                    <Input
                      type="number"
                      value={priceChange.volumeChangePct || ''}
                      onChange={(e) =>
                        setPriceChange((p) => ({
                          ...p,
                          volumeChangePct: Number(e.target.value),
                        }))
                      }
                      placeholder="e.g. -5 for -5%"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Channels</label>
                  <div className="flex flex-wrap gap-2">
                    {CHANNELS.map((ch) => (
                      <Button
                        key={ch}
                        type="button"
                        variant={
                          priceChange.channels.includes(ch) ? 'default' : 'outline'
                        }
                        size="sm"
                        onClick={() =>
                          toggleChannel(
                            priceChange.channels,
                            ch,
                            (channels) =>
                              setPriceChange((p) => ({ ...p, channels })),
                          )
                        }
                      >
                        {ch}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Outputs */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Projected Impact</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {outputs.map((o) => (
                <div
                  key={o.label}
                  className="rounded-lg border p-3 space-y-1"
                >
                  <p className="text-xs text-muted-foreground">{o.label}</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-muted-foreground line-through">
                      {o.format === 'currency'
                        ? fmtCurrency(o.current)
                        : fmtPercent(o.current)}
                    </span>
                    <span className="text-base font-semibold">
                      {o.format === 'currency'
                        ? fmtCurrency(o.projected)
                        : fmtPercent(o.projected)}
                    </span>
                  </div>
                  <Delta current={o.current} projected={o.projected} />
                </div>
              ))}
            </div>
          </div>

          {/* Save */}
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">Scenario Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Q3 Ad Spend Increase"
              />
            </div>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? 'Saving...' : 'Save Scenario'}
            </Button>
          </div>
          {saved && (
            <p className="text-sm text-emerald-600">
              Scenario saved. Refresh to see it above.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
