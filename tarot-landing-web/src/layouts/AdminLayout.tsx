import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import Sidebar from "./Sidebar"; 
import Navbar from "./Navbar";
import { COLORS } from "../theme";

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  
  // Show sidebar for all /admin routes
  const showSidebar = location.pathname.startsWith('/admin');

  return (
    <div 
      className="flex h-screen w-full overflow-hidden" 
      style={{ backgroundColor: COLORS.dark }}
    >
      {/* Show Navbar for non-admin routes */}
      {!showSidebar && <Navbar />}
      
      {/* 1. SIDEBAR: Fixed width on desktop, drawer on mobile - Only show for admin routes */}
      {showSidebar && (
        <>
          <div 
            className={`
              fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 lg:relative lg:translate-x-0
              ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}
            `}
          >
            <Sidebar />
          </div>

          {/* 2. MOBILE OVERLAY: Closes sidebar when clicking outside */}
          {mobileNavOpen && (
            <div 
              className="fixed inset-0 z-40 bg-black/60 lg:hidden backdrop-blur-sm" 
              onClick={() => setMobileNavOpen(false)}
            />
          )}
        </>
      )}

      {/* 3. MAIN CONTENT: Scrollable area for Admin Pages */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        
        {/* Mobile Toggle Button (Floating) - Only show for admin routes */}
        {showSidebar && (
          <button 
            onClick={() => setMobileNavOpen(true)}
            className="lg:hidden absolute top-4 left-4 z-30 p-2 rounded-xl border shadow-2xl transition-transform active:scale-90"
            style={{ 
              backgroundColor: COLORS.surface, 
              borderColor: COLORS.neutralDarkGray,
              color: COLORS.primary 
            }}
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* The Page Content (Outlet) */}
        <div className={`flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 custom-scrollbar ${!showSidebar ? 'pt-20' : ''}`}>
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}