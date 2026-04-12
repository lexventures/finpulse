'use client'

import { useState } from 'react'
import { Sparkles, RefreshCw, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface BriefingCardProps {
  text: string | null
  generatedAt: string | null
  valid: boolean
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function BriefingCard({ text, generatedAt, valid }: BriefingCardProps) {
  const [loading, setLoading] = useState(false)
  const [briefing, setBriefing] = useState(text)
  const [ts, setTs] = useState(generatedAt)
  const [isValid, setIsValid] = useState(valid)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/sync/briefing', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed (${res.status})`)
      }

      const settingsRes = await fetch('/api/settings/briefing')
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setBriefing(data.text ?? null)
        setTs(data.generated_at ?? null)
        setIsValid(data.valid ?? true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (!briefing) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <Sparkles className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No briefing yet. Generate one to get your daily financial summary.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <RefreshCw className="mr-2 size-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-3.5" />
            )}
            Generate Briefing
          </Button>
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Morning Briefing</CardTitle>
          {!isValid && (
            <AlertTriangle className="size-3.5 text-amber-500" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {ts && (
            <span className="text-[11px] text-muted-foreground">
              {formatRelativeTime(ts)}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleGenerate}
            disabled={loading}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground/90">
          {briefing.split('\n\n').map((paragraph, i) => (
            <p key={i} className={i > 0 ? 'mt-3' : undefined}>
              {paragraph}
            </p>
          ))}
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-600">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}
