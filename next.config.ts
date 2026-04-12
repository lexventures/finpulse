import type { NextConfig } from 'next'

import { validateEnvOrThrow } from './lib/env'

validateEnvOrThrow()

const nextConfig: NextConfig = {}

export default nextConfig
