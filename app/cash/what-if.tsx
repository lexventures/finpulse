'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils/format'

interface WhatIfProps {
  forecastEndingCash: number | null
}

export function CashWhatIf({ forecastEndingCash }: WhatIfProps) {
  const [outflow, setOutflow] = useState('')

  const outflowNum = parseFloat(outflow.replace(/[^0-9.-]/g, '')) || 0
  const adjusted =
    forecastEndingCash !== null ? forecastEndingCash - outflowNum : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick What-If</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="what-if-outflow"
            className="text-sm font-medium text-muted-foreground"
          >
            Hypothetical outflow ($)
          </label>
          <Input
            id="what-if-outflow"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 25000"
            value={outflow}
            onChange={(e) => setOutflow(e.target.value)}
            className="w-48"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            Forecast ending cash
          </span>
          <span className="text-xl font-bold">
            {adjusted !== null ? formatCurrency(adjusted) : '\u2014'}
          </span>
          {adjusted !== null && adjusted < 0 && (
            <span className="text-xs font-medium text-red-600">
              Cash goes negative
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
