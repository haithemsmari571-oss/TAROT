import { motion } from "framer-motion";
import { COLORS } from "../../../theme";

const CelestialBackground = ({ scrollY }) => {
  // Use a fixed seed or constant values to prevent re-randomizing on every render
  const stars = Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    size: Math.random() * 2 + 1,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    duration: 3 + Math.random() * 5,
    // Higher depth value = slower movement (simulating distance)
    depth: 0.1 + Math.random() * 0.4, 
  }));

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* 1. PRIMARY NEBULA GLOW */}
      <motion.div 
        style={{ y: scrollY }}
        className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] opacity-40"
      >
        <div 
          className="absolute top-1/4 left-1/4 w-[60%] h-[60%] rounded-full blur-[150px]"
          style={{ 
            background: `radial-gradient(circle, ${COLORS.primaryDark}20 0%, transparent 70%)` 
          }} 
        />
        <div 
          className="absolute bottom-1/4 right-1/4 w-[50%] h-[50%] rounded-full blur-[120px]"
          style={{ 
            background: `radial-gradient(circle, ${COLORS.secondary || '#1a1a1a'}10 0%, transparent 70%)` 
          }} 
        />
      </motion.div>

      {/* 2. PARALLAX STAR FIELD */}
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            width: star.size,
            height: star.size,
            top: star.top,
            left: star.left,
            // Individual stars move at different speeds based on their 'depth'
            y: 0,
          }}
          animate={{
            opacity: [0.1, 0.4, 0.1],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: star.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* 3. ATMOSPHERIC VIGNETTE */}
      <div 
        className="absolute inset-0 z-10" 
        style={{ 
          background: `radial-gradient(circle at center, transparent 0%, ${COLORS.dark} 95%)` 
        }} 
      />
      
      {/* 4. SCANLINE / NOISE TEXTURE (Optional editorial touch) */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />
    </div>
  );
};

export default CelestialBackground;
