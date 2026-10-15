import '@fontsource/fira-code/400.css'
import '@fontsource/fira-code/500.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'

import '@/styles/index.css'
import '@/styles/initial.scss'
import '@/styles/theme.scss'
import '@uigraph/lens/ui/styles.css'

import { apolloClientGQL } from '@/api/client'
import { GlobalLoader } from '@/components/loader/global-loader'
import { AppRoutes } from '@/router'
import { bootstrapSession } from '@/store/auth-store'
import { ApolloProvider } from '@apollo/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/react-router/v7'
import { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'

await bootstrapSession()

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <ApolloProvider client={apolloClientGQL}>
          <Suspense fallback={<GlobalLoader />}>
            <AppRoutes />
          </Suspense>
        </ApolloProvider>
      </QueryClientProvider>
    </NuqsAdapter>

    <Toaster
      richColors
      theme="dark"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
    />
  </BrowserRouter>
)
