/* EVIDENCE HARNESS — dev server only, never part of the build (vite build
   compiles index.html alone). The app sends every /admin/* URL to the CRM
   (src/App.tsx, AdminCrmRedirect), so the old admin screens kept in source
   have no route of their own any more. This mounts them directly, under the
   providers they use, so scripts/per-message-evidence.mjs can photograph the
   practitioner modal, the practitioners list and the reader profile with
   their "Price per message (£)" field.

     /scripts/harness/admin.html?screen=practitioners   (default)
     /scripts/harness/admin.html?screen=my-profile

   Nothing here is stubbed: the screens make their real API calls, which the
   evidence script answers by route interception. */
import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import { AuthProvider } from "@/features/auth/context";
import { ToastProvider } from "@/components/Toast";
import { BillingModeProvider } from "@/features/billing-mode/BillingModeContext";
import { useAuth } from "@/features/auth/hooks";
import { PractitionersPage } from "@/features/psychics/views";
import { MyProfilePage } from "@/features/psychic-profile/views";

const screen = new URLSearchParams(window.location.search).get("screen") ?? "practitioners";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

/* The app's ProtectedRoute mounts a screen only once the stored session has
   been restored; MyProfile fetches on mount from useAuth().user, so the same
   wait is kept here. */
function Screen() {
  const { isLoading } = useAuth();
  if (isLoading) return null;
  return screen === "my-profile" ? <MyProfilePage /> : <PractitionersPage />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <BillingModeProvider>
          <AuthProvider>
            <ToastProvider>
              <div data-harness={screen} style={{ minHeight: "100vh", background: "#0b0b0f", padding: 16 }}>
                <Screen />
              </div>
            </ToastProvider>
          </AuthProvider>
        </BillingModeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
