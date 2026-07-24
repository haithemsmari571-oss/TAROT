import { createRoot } from 'react-dom/client'
import './index.css'
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
import { CelebrationProvider } from './features/celebrations/CelebrationProvider'
import { initVulcanEmbed } from './lib/vulcanEmbed'

// Activates only when embedded in the CRM's Vulcan room (handshake-gated);
// a harmless no-op in the standalone panel.
initVulcanEmbed()

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
        <AuthProvider>
          <NotificationProvider>
            <AuthInitializer>
              <ToastProvider>
                <TopUpProvider>
                  <CelebrationProvider>
                    <App />
                    {/* Global "Incoming Reading" gate — the ONLY way to join/start billing */}
                    <IncomingReadingModal />
                  </CelebrationProvider>
                </TopUpProvider>
              </ToastProvider>
            </AuthInitializer>
          </NotificationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)
