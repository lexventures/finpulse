'use client'

import { useEffect } from 'react'
import Link from 'next/link'

import { Button, buttonVariants } from '@/components/ui/button'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-muted/30">
      <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mt-2">
          The dashboard hit an unexpected error. You can retry or return home.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}
