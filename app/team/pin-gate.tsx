'use client'

import { useState, type FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface PinGateProps {
  children?: React.ReactNode
  /** When true, PIN was already verified (server saw httpOnly cookie). */
  initialUnlocked?: boolean
}

export function PinGate({ children, initialUnlocked = false }: PinGateProps) {
  const [unlocked, setUnlocked] = useState(initialUnlocked)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (res.ok) {
        if (children) {
          setUnlocked(true)
        } else {
          window.location.reload()
        }
        return
      }

      if (res.status === 429) {
        setError('Too many attempts. Please try again in 15 minutes.')
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Incorrect PIN')
      }
    } catch {
      setError('Failed to verify PIN')
    } finally {
      setLoading(false)
    }
  }

  if (children && unlocked) return <>{children}</>

  if (children && !unlocked) {
    return (
      <div className="flex items-center justify-center px-6 py-24">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Enter PIN</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                minLength={4}
                maxLength={6}
                placeholder="4\u20136 digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={loading || pin.length < 4}
              >
                {loading ? 'Verifying\u2026' : 'Unlock'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center px-6 py-24">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Enter PIN</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,6}"
              minLength={4}
              maxLength={6}
              placeholder="4\u20136 digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={loading || pin.length < 4}
            >
              {loading ? 'Verifying\u2026' : 'Unlock'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
