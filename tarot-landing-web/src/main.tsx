import { createRoot } from 'react-dom/client'
import './index.css'
// The site's faces, Fraunces and Inter, from the site itself (not Google Fonts)
import './styles/fonts.css'
import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './features/auth/context'
import { AuthInitializer } from './features/auth/components'
import { ToastProvider } from './components/Toast'
import { NotificationProvider } from './features/notifications/context/NotificationContext'
import IncomingReadingModal from './features/chat/components/IncomingReadingModal'
import { TopUpProvider } from './features/payment/context/TopUpContext'
import { BillingModeProvider } from './features/billing-mode/BillingModeContext'
import { CelebrationProvider } from './features/celebrations/CelebrationProvider'
import { SanctuaryPlayerProvider } from './features/sanctuary/SanctuaryPlayerProvider'
// Holds the browser's install offer from the first moment, for the app's
// home-screen row: it fires before the lazy app shell has loaded.
import { runsStandalone } from './features/client-app/useInstallPrompt'
import { endRefusedStoredSession } from './features/auth/websiteSignIn'
import { startAnalytics } from './features/analytics/analytics'

// A reader's or admin's stored session ends here, before any route renders,
// and the page opens on /login with the sign-in page's refusal.
endRefusedStoredSession()

// Visitor statistics, cookie-free (ROUND61): before the router reads the
// address, which may carry a top-up's band back from Stripe.
startAnalytics(runsStandalone())

const queryClient = new QueryClient(
  {defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 0
    },
  },}
)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {/* the billing mode, fetched once for every screen that draws a price */}
        <BillingModeProvider>
        <AuthProvider>
          <NotificationProvider>
            <AuthInitializer>
              <ToastProvider>
                <TopUpProvider>
                  <CelebrationProvider>
                    <SanctuaryPlayerProvider>
                      <App />
                      {/* Global "Incoming Reading" gate — the ONLY way to join/start billing */}
                      <IncomingReadingModal />
                    </SanctuaryPlayerProvider>
                  </CelebrationProvider>
                </TopUpProvider>
              </ToastProvider>
            </AuthInitializer>
          </NotificationProvider>
        </AuthProvider>
        </BillingModeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)
