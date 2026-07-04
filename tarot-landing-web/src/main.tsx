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
                  <App />
                  {/* Global "Incoming Reading" gate — the ONLY way to join/start billing */}
                  <IncomingReadingModal />
                </TopUpProvider>
              </ToastProvider>
            </AuthInitializer>
          </NotificationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
)
