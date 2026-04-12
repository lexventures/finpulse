'use client'

import { useCallback, useState } from 'react'
import { AlertFeed, type AlertItem } from '@/components/alerts/alert-feed'

export function AlertFeedWrapper({
  alerts: initialAlerts,
}: {
  alerts: AlertItem[]
}) {
  const [alerts, setAlerts] = useState(initialAlerts)

  const handleAcknowledge = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== id))
      }
    } catch {
      // User can retry on next click
    }
  }, [])

  return <AlertFeed alerts={alerts} onAcknowledge={handleAcknowledge} />
}
