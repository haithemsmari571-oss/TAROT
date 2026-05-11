import { useState, useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { Icon } from "@iconify/react";
import { Link } from "react-router-dom";
import backgroundImage from "../../../assets/Cover.png";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useForgotPassword } from "../hooks";

const ForgotPasswordPage = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const { mutate: forgotPassword, isPending, error, isSuccess } = useForgotPassword();
  
  const mouseX = useSpring(0, { stiffness: 40, damping: 20 });
  const mouseY = useSpring(0, { stiffness: 40, damping: 20 });

  useEffect(() => {
    setIsLoaded(true);
    const handleMouseMove = (e) => {
      mouseX.set(e.clientX / window.innerWidth - 0.5);
      mouseY.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  const parallaxX = useTransform(mouseX, [-0.5, 0.5], [-20, 20]);
  const parallaxY = useTransform(mouseY, [-0.5, 0.5], [-20, 20]);

  const handleSubmit = (e) => {
    e.preventDefault();
    forgotPassword({ email });
  };

  const inputClasses = 
    `w-full bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/10 
     uppercase text-[10px] font-black tracking-[0.2em] focus:outline-none focus:border-primary 
     focus:bg-white/[0.07] focus:ring-1 focus:ring-primary/20 transition-all duration-300`;

  return (
    <div className="h-screen w-full flex overflow-hidden font-body" style={{ backgroundColor: COLORS.dark }}>
      
      <motion.div 
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="w-full lg:w-[450px] xl:w-[550px] h-full flex flex-col justify-center p-8 md:p-12 relative z-20 shadow-2xl border-r border-white/5"
        style={{ backgroundColor: COLORS.surface }}
      >
        <div className="max-w-[360px] w-full mx-auto">
          <header className="space-y-4 mb-10">
            <h1 
              style={{ fontFamily: TYPOGRAPHY.fontFamily.heading, color: COLORS.neutralWhite }}
              className="text-5xl font-black uppercase leading-none tracking-tighter italic"
            >
              Reset <br /> <span style={{ color: COLORS.primary }}>Access</span>
            </h1>
            <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-white/30 leading-relaxed">
              Enter your email to receive password reset instructions.
            </p>
          </header>

          {isSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center space-y-4"
            >
              <Icon icon="ph:check-circle-bold" className="text-green-400 text-5xl mx-auto" />
              <div>
                <h3 className="text-[12px] font-black uppercase tracking-wider text-green-400 mb-2">
                  Reset Link Sent
                </h3>
                <p className="text-[9px] uppercase tracking-widest text-white/40 leading-relaxed">
                  If an account exists with that email, you'll receive reset instructions shortly.
                </p>
              </div>
              <Link 
                to="/login"
                className="inline-block text-[10px] font-black uppercase tracking-[0.4em] py-3 px-8 rounded-xl border border-green-500/20 text-green-400 hover:bg-green-500/5 transition-all"
              >
                Back to Login
              </Link>
            </motion.div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/50 ml-1">Email</label>
                <div className="relative">
                  <Icon icon="ph:envelope-simple-bold" className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 text-lg" />
                  <input 
                    required 
                    type="email" 
                    placeholder="agent@cosmic.net" 
                    className={`${inputClasses} pl-12`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                    {error?.response?.data?.detail || "Failed to send reset link"}
                  </p>
                </div>
              )}

              <motion.button
                type="submit"
                disabled={isPending}
                whileHover={{ scale: 1.02, backgroundColor: COLORS.primaryLight }}
                whileTap={{ scale: 0.98 }}
                style={{ backgroundColor: COLORS.primary }}
                className="w-full py-5 rounded-2xl font-black uppercase text-[11px] tracking-[0.4em] text-black shadow-lg transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
              >
                {isPending ? (
                  <>Sending... <Icon icon="ph:spinner-gap-bold" className="animate-spin text-lg" /></>
                ) : (
                  <>Send Reset Link <Icon icon="ph:paper-plane-tilt-bold" /></>
                )}
              </motion.button>
            </form>
          )}
          
          <div className="mt-12 pt-8 border-t border-white/5 text-center">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/20 font-bold mb-4">
              Remembered your credentials?
            </p>
            <Link 
              to="/login" 
              className="inline-block text-[10px] font-black uppercase tracking-[0.4em] py-3 px-8 rounded-xl border border-white/10 text-white hover:bg-white/5 transition-all"
            >
              Return to Login
            </Link>
          </div>
        </div>
      </motion.div>

      <div className="hidden lg:block flex-1 relative overflow-hidden bg-black">
        <motion.div 
          style={{ x: parallaxX, y: parallaxY, scale: 1.1 }}
          className="absolute inset-0 z-0 opacity-40 grayscale contrast-125 brightness-50"
        >
          <img src={backgroundImage} className="w-full h-full object-cover" alt="Cosmic Background" />
        </motion.div>

        <CelestialBackground count={50} springX={parallaxX} springY={parallaxY} />

        <div className="absolute inset-0 pointer-events-none" 
             style={{ background: `linear-gradient(to right, ${COLORS.surface} 0%, transparent 40%)` }} 
        />
      </div>
    </div>
  );
};

const CelestialBackground = ({ count, springX, springY }) => {
  const stars = Array.from({ length: count });
  return (
    <div className="absolute inset-0 z-1 pointer-events-none">
      {stars.map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-[1.5px] h-[1.5px] bg-white rounded-full"
          style={{
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            x: useTransform(springX, (v) => v * (i % 5 + 1)),
            y: useTransform(springY, (v) => v * (i % 5 + 1)),
          }}
          animate={{ opacity: [0.1, 0.7, 0.1], scale: [1, 1.3, 1] }}
          transition={{ duration: 2 + Math.random() * 5, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
};

export default ForgotPasswordPage;
