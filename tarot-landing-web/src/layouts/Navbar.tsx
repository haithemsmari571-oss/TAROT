import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { TYPOGRAPHY, COLORS } from "../theme";
import { useAuth } from "../features/auth/hooks";
import { paymentApi } from "../features/payment/api/paymentApi";
import { NotificationBell } from "../features/notifications/components/NotificationBell";
import "../styles/starfield.css";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [isCurrencyModalOpen, setIsCurrencyModalOpen] = useState(false);
  const [buyOptions, setBuyOptions] = useState<{ amount: number; label: string }[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Fetch balance when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      paymentApi.getMyBalance()
        .then(data => setBalance(data.balance))
        .catch(() => setBalance(null));
      paymentApi.getBuyOptions()
        .then(data => setBuyOptions(data.map(o => ({ amount: o.points, label: o.label }))))
        .catch(() => {});
    }
  }, [isAuthenticated, location.pathname]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = isAuthenticated
    ? [
        { name: "Psychics", path: "/psychics-browse" },
        { name: "Chats", path: "/chats" },
        { name: "Life Path & Zodiac", path: "/oracle" },
        { name: "Billing", path: "/billing" },
      ]
    : [
        { name: "Sanctuary", path: "/home" },
        { name: "Psychics", path: "/psychics-browse" },
        { name: "Life Path & Zodiac", path: "/oracle" },
      ];

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 overflow-hidden ${
          scrolled ? "py-3" : "py-5"
        }`}
        style={{ 
          borderBottom: `1px solid ${scrolled ? "rgba(255,255,255,0.05)" : "transparent"}`,
          backgroundColor: scrolled ? `${COLORS.dark}F2` : "transparent",
          backdropFilter: scrolled ? "blur(20px)" : "none"
        }}
      >
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="starfield"></div>
          <div className="starfield-dense"></div>
        </div>

         <div className="max-w-[1440px] mx-auto px-4 md:px-6 flex items-center justify-between relative z-10">
           
           <div onClick={() => navigate("/home")} className="cursor-pointer group relative flex items-center justify-center w-10 h-10 md:w-12 md:h-12">
             <Icon icon="ph:eye-duotone" className="text-3xl md:text-4xl transition-all duration-500 group-hover:text-white" style={{ color: COLORS.primary }} />
             <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full -z-10 opacity-50 group-hover:opacity-100 transition-opacity" />
           </div>

           <nav className="hidden lg:flex items-center bg-white/[0.03] backdrop-blur-md rounded-full px-1.5 py-1 border border-white/5">
             {navItems.map((item) => {
               const isActive = location.pathname === item.path;
               return (
                 <button
                   key={item.name}
                   onClick={() => navigate(item.path)}
                   className="px-5 py-2 transition-all relative group"
                   style={{
                     fontFamily: TYPOGRAPHY.fontFamily.heading,
                     fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.1em",
                     color: isActive ? COLORS.primary : "rgba(255,255,255,0.4)",
                   }}
                 >
                   <span className="relative z-10 group-hover:text-white transition-colors uppercase">{item.name}</span>
                   {isActive && <div className="absolute inset-0 bg-white/5 rounded-full" />}
                 </button>
               );
             })}
           </nav>

           <div className="hidden lg:flex items-center gap-4">
             {isAuthenticated ? (
               <>
                 <div 
                   onClick={() => setIsCurrencyModalOpen(true)}
                   style={{ backgroundColor: COLORS.primary }}
                   className="flex items-center gap-2 px-4 py-2 rounded-full cursor-pointer shadow-[0_0_20px_rgba(0,0,0,0.3)] transition-all hover:shadow-[0_0_30px_rgba(0,0,0,0.4)] hover:scale-105 group"
                 >
                   <Icon icon="ph:sparkle-fill" className="text-black text-sm" />
                   <span className="text-[11px] font-black text-black tracking-widest uppercase">
                     {balance !== null ? balance.toLocaleString() : '...'}
                   </span>
                   <Icon icon="ph:plus-circle-bold" className="text-black/40 text-xs group-hover:text-black transition-colors" />
                 </div>

                 <button 
                   onClick={() => navigate("/profile")}
                   className="flex items-center gap-3 p-1 pr-4 rounded-full bg-white/[0.03] border border-white/5 hover:bg-white/10 transition-all hover:scale-105 group"
                 >
                   <div className="w-8 h-8 rounded-full border border-primary/30 overflow-hidden relative">
                     {user?.profile_picture ? (
                       <img src={user.profile_picture} alt="Profile" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" />
                     ) : (
                       <div className="w-full h-full flex items-center justify-center bg-primary/20">
                         <Icon icon="ph:user-fill" style={{ color: COLORS.neutralWhite }} />
                       </div>
                     )}
                     <div className="absolute inset-0 bg-primary/10 group-hover:opacity-0 transition-opacity" />
                   </div>
                   <div className="flex flex-col items-start leading-none">
                     <span className="text-[9px] font-black text-white/80 uppercase tracking-widest group-hover:text-primary transition-colors">
                       {user?.username || 'User'}
                     </span>
                     <span className="text-[7px] font-bold text-white/20 uppercase tracking-tighter">View Identity</span>
                   </div>
                 </button>

                 <NotificationBell variant="navbar" />
               </>
             ) : (
               <>
                 <button
                   onClick={() => navigate("/login")}
                   className="px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all hover:scale-105"
                   style={{
                     color: COLORS.neutralWhite,
                     border: `1px solid ${COLORS.neutralWhite}20`,
                     backgroundColor: "transparent",
                   }}
                 >
                   Login
                 </button>

                 <button
                   onClick={() => navigate("/register")}
                   className="px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all hover:scale-105"
                   style={{
                     color: COLORS.dark,
                     backgroundColor: COLORS.primary,
                     boxShadow: `0 10px 30px ${COLORS.primary}40`,
                   }}
                 >
                   Get Started
                 </button>
               </>
             )}
           </div>

           <button
             onClick={() => setMobileNavOpen(true)}
             className="lg:hidden flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.03] border border-white/5 hover:bg-white/10 transition-all"
           >
             <Icon icon="ph:list-bold" className="text-xl" style={{ color: COLORS.primary }} />
           </button>
         </div>
       </header>

       {mobileNavOpen && (
         <div 
           className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md lg:hidden"
           onClick={() => setMobileNavOpen(false)}
         />
       )}

       <div 
         className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] z-[70] transform transition-transform duration-300 lg:hidden ${
           mobileNavOpen ? "translate-x-0" : "translate-x-full"
         }`}
         style={{ backgroundColor: COLORS.surface }}
       >
         <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
           <div className="starfield-dense"></div>
         </div>

         <div className="relative z-10 h-full flex flex-col">
           <div className="flex items-center justify-between p-4 border-b border-white/5">
             <div onClick={() => { navigate("/home"); setMobileNavOpen(false); }} className="cursor-pointer group flex items-center gap-2">
               <Icon icon="ph:eye-duotone" className="text-2xl" style={{ color: COLORS.primary }} />
               <span 
                 className="font-black text-sm uppercase tracking-wider"
                 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }}
               >
                 Tarot
               </span>
             </div>
             <button
               onClick={() => setMobileNavOpen(false)}
               className="flex items-center justify-center w-9 h-9 rounded-full bg-white/[0.03] border border-white/5 hover:bg-white/10 transition-all"
             >
               <Icon icon="ph:x-bold" className="text-lg text-white/60" />
             </button>
           </div>

           <div className="flex-1 overflow-y-auto p-4">
             <div className="space-y-1">
               {navItems.map((item) => {
                 const isActive = location.pathname === item.path;
                 return (
                   <button
                     key={item.name}
                     onClick={() => { navigate(item.path); setMobileNavOpen(false); }}
                     className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-white/5"
                     style={{
                       fontFamily: TYPOGRAPHY.fontFamily.heading,
                       backgroundColor: isActive ? "rgba(210, 185, 255, 0.08)" : "transparent",
                     }}
                   >
                      <Icon 
                        icon={item.name === "Sanctuary" ? "ph:house-duotone" : 
                              item.name === "Psychics" ? "ph:sparkle-duotone" :
                              item.name === "Chats" ? "ph:chat-circle-duotone" :
                              item.name === "Billing" ? "ph:credit-card-duotone" :
                              item.name === "Life Path & Zodiac" ? "ph:compass-duotone" :
                              "ph:stars-duotone"} 
                       className="text-xl"
                       style={{ color: isActive ? COLORS.primary : "rgba(255,255,255,0.3)" }}
                     />
                     <span 
                       className="text-sm font-bold uppercase tracking-wider"
                       style={{ color: isActive ? COLORS.primary : "rgba(255,255,255,0.5)" }}
                     >
                       {item.name}
                     </span>
                   </button>
                 );
               })}
             </div>
           </div>

           <div className="p-4 border-t border-white/5">
             {isAuthenticated ? (
               <div className="space-y-3">
                 <div 
                   onClick={() => { setIsCurrencyModalOpen(true); setMobileNavOpen(false); }}
                   style={{ backgroundColor: COLORS.primary }}
                   className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl cursor-pointer shadow-lg transition-all hover:scale-105 group"
                 >
                   <Icon icon="ph:sparkle-fill" className="text-black text-lg" />
                   <span className="text-sm font-black text-black tracking-wider uppercase">
                     {balance !== null ? balance.toLocaleString() : '...'} Stardust
                   </span>
                   <Icon icon="ph:plus-circle-bold" className="text-black/40 group-hover:text-black transition-colors" />
                 </div>

                 <button 
                   onClick={() => { navigate("/profile"); setMobileNavOpen(false); }}
                   className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/10 transition-all"
                 >
                   <div className="w-10 h-10 rounded-full border border-primary/30 overflow-hidden relative">
                     {user?.profile_picture ? (
                       <img src={user.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                     ) : (
                       <div className="w-full h-full flex items-center justify-center bg-primary/20">
                         <Icon icon="ph:user-fill" style={{ color: COLORS.neutralWhite }} />
                       </div>
                     )}
                   </div>
                   <div className="flex flex-col items-start">
                     <span className="text-xs font-black text-white/80 uppercase tracking-wider">
                       {user?.username || 'User'}
                     </span>
                     <span className="text-[10px] font-bold text-white/30 uppercase">View Profile</span>
                   </div>
                   <Icon icon="ph:caret-right" className="ml-auto text-white/20" />
                 </button>

                 <button 
                   onClick={() => { navigate("/notifications"); setMobileNavOpen(false); }}
                   className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] hover:bg-white/5 transition-all"
                 >
                   <Icon icon="ph:bell-duotone" className="text-xl" style={{ color: "rgba(255,255,255,0.3)" }} />
                   <span className="text-sm font-bold uppercase tracking-wider text-white/50">Notifications</span>
                 </button>

                 <button 
                   onClick={() => { logout(); setMobileNavOpen(false); }}
                   className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 transition-all"
                 >
                   <Icon icon="ph:sign-out-duotone" className="text-xl" style={{ color: COLORS.error }} />
                   <span className="text-sm font-bold uppercase tracking-wider" style={{ color: COLORS.error }}>Sign Out</span>
                 </button>
               </div>
             ) : (
               <div className="space-y-3">
                 <button
                   onClick={() => { navigate("/login"); setMobileNavOpen(false); }}
                   className="w-full px-5 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-all hover:scale-105"
                   style={{
                     color: COLORS.neutralWhite,
                     border: `1px solid ${COLORS.neutralWhite}20`,
                     backgroundColor: "transparent",
                   }}
                 >
                   Login
                 </button>

                 <button
                   onClick={() => { navigate("/register"); setMobileNavOpen(false); }}
                   className="w-full px-5 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-all hover:scale-105"
                   style={{
                     color: COLORS.dark,
                     backgroundColor: COLORS.primary,
                     boxShadow: `0 10px 30px ${COLORS.primary}40`,
                   }}
                 >
                   Get Started
                 </button>
               </div>
             )}
           </div>
         </div>
       </div>

      {/* --- CURRENCY MODAL --- */}
      {isCurrencyModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div 
            onClick={() => setIsCurrencyModalOpen(false)}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />
          <div 
            className="relative w-full max-w-md max-h-[90vh] flex flex-col p-6 md:p-8 rounded-[32px] border border-white/10 overflow-hidden shadow-2xl"
            style={{ backgroundColor: COLORS.surface }}
          >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-primary/20 blur-[100px] -z-10" />
              
              <div className="flex justify-between items-start mb-6 md:mb-8 flex-shrink-0">
                <div>
                  <h2 style={{ fontFamily: TYPOGRAPHY.fontFamily.heading }} className="text-4xl font-black text-white italic uppercase tracking-tighter leading-none">
                    Gather <span style={{ color: COLORS.primary }}>Stardust</span>
                  </h2>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white font-black mt-2 opacity-80">Fuel your cosmic journey</p>
                </div>
                <button onClick={() => setIsCurrencyModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 text-white/40 hover:text-white transition-all">
                  <Icon icon="ph:x-bold" className="text-xl" />
                </button>
              </div>

              <div className="grid gap-4 overflow-y-auto pr-1 flex-grow custom-scrollbar max-h-[45vh] md:max-h-[55vh] pt-2 pb-2">
                {(buyOptions.length > 0 ? buyOptions : [
                  { amount: 500, label: "Stardust Mote" },
                  { amount: 1200, label: "Stardust Cluster" },
                  { amount: 3000, label: "Stardust Nebula" },
                ]).map((tier, idx) => {
                  const isPopular = idx === 1;
                  return (
                    <button 
                      key={tier.amount} 
                      onClick={() => navigate("/billing")}
                      style={{ borderColor: isPopular ? `${COLORS.primary}40` : "rgba(255,255,255,0.05)" }}
                      className="group relative flex items-center justify-between p-6 rounded-2xl border bg-white/[0.02] hover:bg-primary/[0.08] transition-all text-left"
                    >
                      {isPopular && (
                        <span style={{ backgroundColor: COLORS.primary }} className="absolute -top-2 right-6 px-3 py-1 text-black text-[9px] font-black rounded-full uppercase tracking-[0.2em] shadow-lg">
                          Council's Choice
                        </span>
                      )}
                      <div>
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-2 group-hover:text-primary transition-colors">{tier.label}</p>
                        <div className="flex items-center gap-3">
                          <Icon icon="ph:sparkle-fill" style={{ color: COLORS.primary }} className="text-xl" />
                          <span className="text-2xl font-black text-white tracking-tighter">{tier.amount}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 md:mt-8 flex-shrink-0">
                <div className="flex items-center justify-center gap-3 opacity-20">
                  <div className="h-[1px] flex-1 bg-white" />
                  <Icon icon="ph:shield-check-bold" className="text-white text-xl" />
                  <div className="h-[1px] flex-1 bg-white" />
                </div>
                <p className="text-[9px] text-center text-white/30 font-black mt-4 uppercase tracking-[0.3em]">Encrypted Astral Transaction</p>
              </div>
            </div>
          </div>
      )}
    </>
  );
}
