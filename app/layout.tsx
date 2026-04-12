import '@/app/globals.css'
import { Inter } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ShopifyAuthProvider } from '@/components/shopify-auth-provider'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script
          src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
          data-api-key={process.env.SHOPIFY_CLIENT_ID || ''}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ShopifyAuthProvider>
          <TooltipProvider>
            <main className="min-h-screen">
              {children}
            </main>
          </TooltipProvider>
        </ShopifyAuthProvider>
      </body>
    </html>
  )
}
