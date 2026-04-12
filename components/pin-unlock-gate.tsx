'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getShopifySessionToken } from '@/lib/shopify/client-token'

export function PinUnlockGate({ hint }: { hint: string | null }) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const token = await getShopifySessionToken()
    if (!token) {
      setError('Open this app inside Shopify admin to verify your session.')
      return
    }
    if (pin.trim().length !== 8) {
      setError('PIN must be exactly 8 characters.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pin: pin.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Verification failed')
        return
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Enter PIN</h1>
        <p className="text-sm text-muted-foreground mt-1">
          This page is PIN-protected. Enter your 8-character PIN to continue.
        </p>
        {hint ? (
          <p className="text-sm text-muted-foreground mt-2">
            Hint: <span className="font-medium text-foreground">{hint}</span>
          </p>
        ) : null}
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Input
            type="password"
            inputMode="text"
            autoComplete="one-time-code"
            maxLength={8}
            placeholder="8-character PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\s/g, ''))}
            className="font-mono tracking-widest"
            aria-label="PIN"
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Checking…' : 'Unlock'}
          </Button>
        </form>
      </div>
    </div>
  )
}
