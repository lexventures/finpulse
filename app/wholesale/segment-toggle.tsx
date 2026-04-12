'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function SegmentToggle() {
  const router = useRouter()
  const params = useSearchParams()
  const current = params.get('segment') || 'all'

  function onChange(value: string | number) {
    const sp = new URLSearchParams(params.toString())
    if (value === 'all') sp.delete('segment')
    else sp.set('segment', String(value))
    router.push(`/wholesale?${sp.toString()}`)
  }

  return (
    <div className="px-6 pb-4">
      <Tabs value={current} onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="all">All Wholesale</TabsTrigger>
          <TabsTrigger value="faire">Faire</TabsTrigger>
          <TabsTrigger value="direct">Direct</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
}
