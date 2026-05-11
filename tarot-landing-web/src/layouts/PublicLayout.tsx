// src/layouts/PublicLayout.tsx
import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { COLORS } from "../theme";
import { useAuth } from "../features/auth/hooks";

export default function PublicLayout() {
  const { isAuthenticated } = useAuth();
  
  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: COLORS.dark }}>
      <Navbar />
      <main className="pt-20">
        <Outlet />
      </main>
      {!isAuthenticated && <Footer />}
    </div>
  );
}
