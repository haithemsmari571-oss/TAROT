import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { Icon } from "@iconify/react";
import { useState, useRef, useEffect } from "react";
import { COLORS, TYPOGRAPHY } from "../../../theme";

// --- EXPANDED DATA: ZODIAC LORE ---
const ZODIAC_SIGNS = [
  { name: "Aries", icon: "tabler:zodiac-aries", date: "Mar 21 - Apr 19", element: "Fire", planet: "Mars", modality: "Cardinal", trait: "Bold" },
  { name: "Taurus", icon: "tabler:zodiac-taurus", date: "Apr 20 - May 20", element: "Earth", planet: "Venus", modality: "Fixed", trait: "Sensual" },
  { name: "Gemini", icon: "tabler:zodiac-gemini", date: "May 21 - Jun 20", element: "Air", planet: "Mercury", modality: "Mutable", trait: "Expressive" },
  { name: "Cancer", icon: "tabler:zodiac-cancer", date: "Jun 21 - Jul 22", element: "Water", planet: "Moon", modality: "Cardinal", trait: "Intuitive" },
  { name: "Leo", icon: "tabler:zodiac-leo", date: "Jul 23 - Aug 22", element: "Fire", planet: "Sun", modality: "Fixed", trait: "Magnetic" },
  { name: "Virgo", icon: "tabler:zodiac-virgo", date: "Aug 23 - Sep 22", element: "Earth", planet: "Mercury", modality: "Mutable", trait: "Analytical" },
  { name: "Libra", icon: "tabler:zodiac-libra", date: "Sep 23 - Oct 22", element: "Air", planet: "Venus", modality: "Cardinal", trait: "Harmonious" },
  { name: "Scorpio", icon: "tabler:zodiac-scorpio", date: "Oct 23 - Nov 21", element: "Water", planet: "Pluto", modality: "Fixed", trait: "Passionate" },
  { name: "Sagittarius", icon: "tabler:zodiac-sagittarius", date: "Nov 22 - Dec 21", element: "Fire", planet: "Jupiter", modality: "Mutable", trait: "Adventurous" },
  { name: "Capricorn", icon: "tabler:zodiac-capricorn", date: "Dec 22 - Jan 19", element: "Earth", planet: "Saturn", modality: "Cardinal", trait: "Ambitious" },
  { name: "Aquarius", icon: "tabler:zodiac-aquarius", date: "Jan 20 - Feb 18", element: "Air", planet: "Uranus", modality: "Fixed", trait: "Visionary" },
  { name: "Pisces", icon: "tabler:zodiac-pisces", date: "Feb 19 - Mar 20", element: "Water", planet: "Neptune", modality: "Mutable", trait: "Mystical" },
];

const CompatibilityHub = () => {
  const [selectedSignForLore, setSelectedSignForLore] = useState(null);

  return (
    <div className="min-h-screen pt-24 pb-20 px-4 md:px-8 overflow-hidden relative" style={{ backgroundColor: COLORS.dark }}>
      
      {/* Immersive Background Particle Field */}
      <CelestialBackground />

      <div className="max-w-[1300px] mx-auto space-y-28 relative z-10">
        
        {/* --- SECTION 1: HERO & INTERACTIVE STAGE --- */}
        <header className="text-center space-y-10">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}>
            <h1 style={{ ...TYPOGRAPHY.headings.h1, color: COLORS.neutralWhite }} className="text-6xl md:text-8xl uppercase tracking-tighter leading-[0.85]">
              Celestial <br /><span style={{ color: COLORS.primary }}>Compatibility</span>
            </h1>
            <p className="text-white/40 uppercase tracking-[0.4em] text-xs mt-6 font-bold">Drag signs onto the stage to test your cosmic bond</p>
          </motion.div>
          
          <InteractiveCompatibilityStage ZODIAC_SIGNS={ZODIAC_SIGNS} />
        </header>

        {/* --- SECTION 2: THE ENHANCED CHART --- */}
        <section className="space-y-16">
          <div className="text-center">
            <h2 style={{ ...TYPOGRAPHY.headings.h2, color: COLORS.neutralWhite }} className="text-4xl uppercase tracking-tight">The Council's <span className="italic font-light"> Zodiac Grid</span></h2>
            <p className="text-white/40 text-base max-w-2xl mx-auto mt-4 font-medium">
              Click any sign to uncover its deep lore, elemental alignment, and core strengths.
            </p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
            {ZODIAC_SIGNS.map((sign, idx) => (
              <ZodiacLoreCard key={sign.name} sign={sign} index={idx} onOpenLore={() => setSelectedSignForLore(sign)} />
            ))}
          </div>
        </section>

        {/* --- SECTION 3: INTERACTIVE LIFE PATH --- */}
        <LifePathSection />

      </div>

      {/* MODAL: ZODIAC LORE DRAWER */}
      <AnimatePresence>
        {selectedSignForLore && (
          <ZodiacLoreModal sign={selectedSignForLore} onClose={() => setSelectedSignForLore(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

// =============================================================================
// --- SUB-COMPONENT: INTERACTIVE STAGE ---
// =============================================================================
const InteractiveCompatibilityStage = ({ ZODIAC_SIGNS }) => {
  const [slot1, setSlot1] = useState(null);
  const [slot2, setSlot2] = useState(null);
  const [resultDrawerOpen, setResultDrawerOpen] = useState(false);

  const handleTest = () => {
    if (slot1 && slot2) setResultDrawerOpen(true);
  };

  return (
    <div className="max-w-5xl mx-auto mt-16 bg-surface p-10 rounded-[3rem] border border-white/5 backdrop-blur-3xl relative">
      <div className="absolute inset-0 bg-primary/5 rounded-[3rem] blur-2xl pointer-events-none" />

      <div className="relative z-10 grid md:grid-cols-[1fr,auto,1fr] gap-10 items-center">
        
        {/* Slot 1: Drag Target */}
        <CompatibilitySlot sign={slot1} setSign={setSlot1} label="Sign One" />

        {/* Center Connection Orb */}
        <motion.div 
          animate={slot1 && slot2 ? { scale: [1, 1.1, 1], rotate: [0, 360] } : {}}
          transition={{ duration: 1, ease: "easeInOut" }}
          className={`w-20 h-20 rounded-full flex items-center justify-center border-2 transition-all duration-700 ${slot1 && slot2 ? 'bg-primary border-primary shadow-[0_0_50px_rgba(var(--primary-rgb),0.6)]' : 'bg-dark border-white/10'}`}
        >
          <Icon icon={slot1 && slot2 ? "ph:link-break-fill" : "ph:heart-break-light"} className={`text-3xl ${slot1 && slot2 ? 'text-dark' : 'text-white/20'}`} />
        </motion.div>

        {/* Slot 2: Drag Target */}
        <CompatibilitySlot sign={slot2} setSign={setSlot2} label="Sign Two" />
      </div>
      
      {/* Draggable Source List */}
      <div className="mt-12 border-t border-white/5 pt-8 flex gap-3 overflow-x-auto no-scrollbar pb-2">
        {ZODIAC_SIGNS.map(sign => (
          <DraggableSignPill key={sign.name} sign={sign} />
        ))}
      </div>

      {/* Test Button - only active when both slots filled */}
      <motion.button
        onClick={handleTest}
        animate={slot1 && slot2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        className="mt-10 px-16 py-5 bg-primary text-dark rounded-full uppercase font-black tracking-[0.2em] text-xs shadow-2xl disabled:opacity-30"
        disabled={!slot1 || !slot2}
      >
        Reveal Connection
      </motion.button>

      {/* RESULTS DRAWER */}
      <AnimatePresence>
        {resultDrawerOpen && (
          <CompatibilityResultDrawer sign1={slot1} sign2={slot2} onClose={() => setResultDrawerOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};

// --- HELPER: Draggable Sign ---
const DraggableSignPill = ({ sign }) => (
  <motion.div
    drag
    dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
    dragElastic={1}
    whileDrag={{ scale: 1.2, zIndex: 100 }}
    onDragEnd={(e, info) => {
      // Logic for detecting if dropped over a slot would go here in a full app.
      // For now, we simulate by just clicking the pill to fill the next empty slot.
    }}
    className="flex-shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 cursor-grab active:cursor-grabbing hover:border-primary/50"
  >
    <Icon icon={sign.icon} className="text-xl text-primary" />
    <span className="text-xs font-bold text-white uppercase tracking-tight">{sign.name}</span>
  </motion.div>
);

// --- HELPER: Compatibility Slot ---
const CompatibilitySlot = ({ sign, setSign, label }) => (
  <div className="aspect-square rounded-[2rem] border-2 border-dashed border-white/10 flex flex-col items-center justify-center p-6 text-center group hover:border-primary/40 transition-colors relative">
    {sign ? (
      <AnimatePresence>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="space-y-4">
          <Icon icon={sign.icon} className="text-6xl text-primary mx-autoPulse" />
          <h4 className="text-lg font-black uppercase text-white tracking-tight">{sign.name}</h4>
          <button onClick={() => setSign(null)} className="absolute top-3 right-3 text-white/20 hover:text-red-400"><Icon icon="ph:x-bold" /></button>
        </motion.div>
      </AnimatePresence>
    ) : (
      <div className="space-y-3">
        <Icon icon="ph:plus-circle-light" className="text-5xl text-white/10 group-hover:text-primary/50 transition-colors" />
        <p className="text-[10px] uppercase font-black text-white/30 tracking-widest">{label}</p>
      </div>
    )}
  </div>
);


// =============================================================================
// --- SUB-COMPONENT: LORE CARD & MODAL ---
// =============================================================================
const ZodiacLoreCard = ({ sign, index, onOpenLore }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, ease: "easeOut" }}
      viewport={{ once: true }}
      whileHover={{ y: -10 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onOpenLore}
      className="group bg-surfaceAccent p-6 rounded-[2rem] border border-white/5 text-center space-y-4 transition-all duration-500 cursor-pointer relative overflow-hidden"
      style={{ 
        borderColor: isHovered ? `${COLORS.primary}80` : "rgba(255,255,255,0.05)" 
      }}
    >
      {/* Elemental Glow */}
      <div className={`absolute -bottom-8 -left-8 w-24 h-24 rounded-full blur-3xl opacity-10 group-hover:opacity-30 transition-opacity ${getSlotColor(sign.element)}`} />

      <Icon 
        icon={sign.icon} 
        className="text-5xl mx-auto transition-all duration-700" 
        style={{ 
          color: isHovered ? COLORS.primary : `${COLORS.neutralWhite}20`,
          filter: isHovered ? `drop-shadow(0 0 10px ${COLORS.primary}40)` : 'none'
        }} 
      />
      
      <div className="relative z-10">
        <h4 className="text-base font-black uppercase tracking-tighter text-white">
          {sign.name}
        </h4>
        <p className="text-[9px] uppercase tracking-[0.2em] text-primary font-bold mt-1">
          {sign.element}
        </p>
        <p className="text-[8px] uppercase tracking-widest text-white/20 mt-3 group-hover:text-white/50 transition-colors">
          {sign.date}
        </p>
      </div>
    </motion.div>
  );
};
const ZodiacLoreModal = ({ sign, onClose }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 z-[200] bg-dark/90 backdrop-blur-xl p-6 flex items-center justify-center"
    onClick={onClose}
  >
    <motion.div
      initial={{ y: 50, scale: 0.9 }}
      animate={{ y: 0, scale: 1 }}
      exit={{ y: 50, scale: 0.9 }}
      className="bg-surface p-12 rounded-[3rem] border border-white/10 max-w-4xl w-full relative"
      onClick={e => e.stopPropagation()} // Prevent close on content click
    >
      <button onClick={onClose} className="absolute top-8 right-8 text-white/20 hover:text-white text-2xl"><Icon icon="ph:x-bold" /></button>
      
      <div className="grid md:grid-cols-[1fr,2fr] gap-12 items-center">
        <div className="text-center space-y-4">
          <Icon icon={sign.icon} className="text-9k text-primary mx-auto" style={{ fontSize: '120px' }} />
          <h3 className="text-4xl font-black uppercase text-white tracking-tighter">{sign.name}</h3>
          <span className={`px-4 py-1.5 rounded-full text-[10px] uppercase font-bold text-dark ${getSlotColor(sign.element)}`}>{sign.element}</span>
        </div>
        
        <div className="space-y-6">
          <p className="text-lg text-white/70 leading-relaxed italic">"Often recognized for their {sign.trait.toLowerCase()} nature, {sign.name} individuals bring unique energy to the Zodiac."</p>
          
          <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-6">
            <LoreAttr label="Ruling Planet" value={sign.planet} icon="ph:planet-fill" />
            <LoreAttr label="Modality" value={sign.modality} icon="ph:atom-fill" />
            <LoreAttr label="Key Trait" value={sign.trait} icon="ph:fingerprint-fill" />
            <LoreAttr label="Council Rating" value="High" icon="ph:seal-check-fill" />
          </div>
        </div>
      </div>
    </motion.div>
  </motion.div>
);

const LoreAttr = ({ label, value, icon }) => (
  <div className="flex items-center gap-4 bg-white/5 p-4 rounded-xl">
    <Icon icon={icon} className="text-2xl text-primary" />
    <div>
      <p className="text-[8px] uppercase tracking-widest text-white/30">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  </div>
);


// =============================================================================
// --- SUB-COMPONENT: REFRESHED LIFE PATH ---
// =============================================================================
const LifePathSection = () => {
  const [dob, setDob] = useState("");
  const [lifePathNumber, setLifePathNumber] = useState(null);

  const calculateLifePath = () => {
    if (!dob) return;
    // Simple sum calculation for demo
    const digits = dob.replace(/-/g, '').split('').map(Number);
    let sum = digits.reduce((a, b) => a + b, 0);
    while (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33) { // Respect Master Numbers
      sum = sum.toString().split('').map(Number).reduce((a, b) => a + b, 0);
    }
    setLifePathNumber(sum);
  };

  return (
    <section className="bg-surface border border-white/5 rounded-[4rem] p-10 md:p-20 relative overflow-hidden">
      {/* Sacred Geometry BG */}
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none scale-125">
        <Icon icon="ph:asterisk-simple-light" className="text-[800px] text-primary animate-spin-slow" />
      </div>
      
      <div className="relative z-10 grid lg:grid-cols-2 gap-16 items-center">
        <div className="space-y-8">
          <div className="space-y-3">
            <h2 style={{ ...TYPOGRAPHY.headings.h2, color: COLORS.neutralWhite }} className="text-5xl uppercase leading-[0.9]">
              Numerology: <br />Your <span style={{ color: COLORS.primary }}>Life Path</span>
            </h2>
            <p className="text-white/60 leading-relaxed max-w-lg font-medium">
              Calculated from your date of birth, this sacred number reveals your core personality and the specific journey your soul mapped out for this lifetime.
            </p>
          </div>
          
          <div className="bg-dark/50 p-6 rounded-3xl border border-white/10 space-y-5 max-w-md">
            <label className="text-[10px] uppercase font-black text-primary tracking-widest ml-1">Select Your Birth Date</label>
            <div className="flex gap-4">
              <input 
                type="date"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-primary transition-colors text-sm"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
              <button onClick={calculateLifePath} className="bg-primary text-dark px-7 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-white transition-colors active:scale-95">
                Calculate
              </button>
            </div>
          </div>
        </div>
        
        {/* Dynamic Result Display */}
        <div className="flex justify-center lg:justify-end">
          <AnimatePresence mode="wait">
            {lifePathNumber ? (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="text-center space-y-4">
                <div className="w-52 h-52 rounded-full border-4 border-primary flex items-center justify-center relative shadow-[0_0_60px_rgba(var(--primary-rgb),0.3)] bg-dark">
                   <div className="absolute inset-2 border border-primary/20 rounded-full animate-pulse" />
                   <span className="text-primary font-black text-9xl leading-none">{lifePathNumber}</span>
                </div>
                <p className="uppercase tracking-[0.4em] text-[11px] font-bold text-white">Your Life Path Destiny</p>
              </motion.div>
            ) : (
              <div className="aspect-square w-52 rounded-full border border-white/5 flex items-center justify-center relative bg-surfaceAccent/50">
                 <Icon icon="ph:fingerprint-thin" className="text-7xl text-white/10" />
                 <p className="absolute bottom-6 text-[8px] uppercase tracking-widest text-white/20">Awaiting Data</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};


// =============================================================================
// --- MISC UTILITIES ---
// =============================================================================

const getSlotColor = (element) => {
  switch(element) {
    case 'Fire': return 'bg-red-500 text-white';
    case 'Water': return 'bg-blue-500 text-white';
    case 'Air': return 'bg-sky-300 text-dark';
    case 'Earth': return 'bg-emerald-500 text-white';
    default: return 'bg-white/10 text-white';
  }
};

const CelestialBackground = () => (
  <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
    {[...Array(50)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute w-0.5 h-0.5 bg-white rounded-full"
        style={{
          top: `${Math.random() * 100}%`,
          left: `${Math.random() * 100}%`,
        }}
        animate={{
          opacity: [0.2, 0.8, 0.2],
          scale: [1, 1.5, 1],
        }}
        transition={{
          duration: 2 + Math.random() * 3,
          repeat: Infinity,
          delay: Math.random() * 5,
        }}
      />
    ))}
  </div>
);

// Results Drawer Placeholder
const CompatibilityResultDrawer = ({ onClose }) => (
  <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25 }}
    className="absolute inset-x-0 bottom-0 z-50 h-[80%] bg-surface border-t-2 border-primary p-10 rounded-t-[3rem] backdrop-blur-xl shadow-2xl"
  >
     <button onClick={onClose} className="absolute top-8 right-8 text-white/20 hover:text-white text-xl"><Icon icon="ph:x-bold" /></button>
     <div className="text-center space-y-10">
       <Icon icon="ph:star-four-fill" className="text-7xl text-primary mx-autoPulse" />
       <h2 className="text-5xl font-black uppercase text-white tracking-tighter">Connection Found</h2>
       <p className="text-white/50 max-w-md mx-auto">This is a placeholder for the deep connection analysis logic. The Council is calculating your bond...</p>
     </div>
  </motion.div>
);


export default CompatibilityHub;