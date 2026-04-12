import { z } from 'zod'

/**
 * Build-time / server boot validation for required secrets.
 * Skipped in Vitest unless CI forces validation.
 */
const serverEnvSchema = z.object({
  SHOPIFY_CLIENT_ID: z.string().min(1, 'SHOPIFY_CLIENT_ID is required'),
  SHOPIFY_CLIENT_SECRET: z.string().min(1, 'SHOPIFY_CLIENT_SECRET is required'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

export function validateEnvOrThrow(): ServerEnv {
  if (process.env.NODE_ENV === 'test' && process.env.CI !== 'true') {
    return serverEnvSchema.parse({
      SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID ?? 'test',
      SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET ?? 'test',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test',
    })
  }

  const parsed = serverEnvSchema.safeParse({
    SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID,
    SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })

  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment: ${msg}`)
  }

  return parsed.data
}
