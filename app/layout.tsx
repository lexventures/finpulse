import '@/app/globals.css'
import { Inter } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
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
            <SidebarProvider>
              <AppSidebar />
              <main className="flex-1 overflow-auto">
                {children}
              </main>
            </SidebarProvider>
          </TooltipProvider>
        </ShopifyAuthProvider>
      </body>
    </html>
  )
}
