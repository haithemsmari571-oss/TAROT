import { useState, useEffect } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { Icon } from "@iconify/react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import backgroundImage from "../../../assets/Cover.png";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { useVerifyAccount, useResendVerify } from "../hooks";

const VerifyEmailPage = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [isLoaded, setIsLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const { mutate: verifyAccount, isPending, error, isSuccess } = useVerifyAccount();
  const { mutate: resendVerify, isPending: isResending, isSuccess: resendSuccess } = useResendVerify();
  
  const status = searchParams.get("status");
  const isSuccessFromQuery = status === "success";
  
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

  useEffect(() => {
    if (token && !isSuccessFromQuery) {
      verifyAccount(token);
    }
  }, [token, verifyAccount, isSuccessFromQuery]);

  useEffect(() => {
    if (isSuccessFromQuery) {
      setTimeout(() => {
        window.location.href = "/login?verified=true";
      }, 2000);
    }
  }, [isSuccessFromQuery]);

  const parallaxX = useTransform(mouseX, [-0.5, 0.5], [-20, 20]);
  const parallaxY = useTransform(mouseY, [-0.5, 0.5], [-20, 20]);

  const handleResend = (e) => {
    e.preventDefault();
    resendVerify(email);
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
              Verify <br /> <span style={{ color: COLORS.primary }}>Account</span>
            </h1>
            <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-white/30 leading-relaxed">
              Complete your registration by verifying your email address.
            </p>
          </header>

          {isPending ? (
            <div className="text-center space-y-6">
              <Icon icon="ph:spinner-gap-bold" className="animate-spin text-primary text-6xl mx-auto" />
              <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold">
                Verifying your account...
              </p>
            </div>
          ) : (isSuccess || isSuccessFromQuery) ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center space-y-4"
            >
              <Icon icon="ph:check-circle-bold" className="text-green-400 text-5xl mx-auto" />
              <div>
                <h3 className="text-[12px] font-black uppercase tracking-wider text-green-400 mb-2">
                  Account Verified Successfully
                </h3>
                <p className="text-[9px] uppercase tracking-widest text-white/40 leading-relaxed">
                  Your account has been verified. You can now login to access your dashboard.
                </p>
              </div>
              <Link 
                to="/login?verified=true"
                className="inline-block text-[10px] font-black uppercase tracking-[0.4em] py-3 px-8 rounded-xl border border-green-500/20 text-green-400 hover:bg-green-500/5 transition-all"
              >
                Go to Login
              </Link>
            </motion.div>
          ) : error ? (
            <div className="space-y-6">
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center space-y-4">
                <Icon icon="ph:warning-circle-bold" className="text-red-400 text-5xl mx-auto" />
                <div>
                  <h3 className="text-[12px] font-black uppercase tracking-wider text-red-400 mb-2">
                    Verification Failed
                  </h3>
                  <p className="text-[9px] uppercase tracking-widest text-white/40 leading-relaxed">
                    {error?.response?.data?.detail || "Invalid or expired verification link"}
                  </p>
                </div>
              </div>

              <div className="border-t border-white/5 pt-6">
                <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-bold mb-4 text-center">
                  Need a new verification link?
                </p>
                
                {resendSuccess ? (
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-green-400">
                      Verification email sent! Check your inbox.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleResend} className="space-y-4">
                    <div className="relative">
                      <Icon icon="ph:envelope-simple-bold" className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 text-lg" />
                      <input 
                        required 
                        type="email" 
                        placeholder="your@email.com" 
                        className={`${inputClasses} pl-12`}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <motion.button
                      type="submit"
                      disabled={isResending}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full py-4 rounded-xl font-black uppercase text-[10px] tracking-[0.3em] text-white border border-white/10 hover:bg-white/5 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
                    >
                      {isResending ? (
                        <>Sending... <Icon icon="ph:spinner-gap-bold" className="animate-spin" /></>
                      ) : (
                        <>Resend Verification <Icon icon="ph:paper-plane-tilt-bold" /></>
                      )}
                    </motion.button>
                  </form>
                )}
              </div>
            </div>
          ) : null}
          
          <div className="mt-12 pt-8 border-t border-white/5 text-center">
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

export default VerifyEmailPage;
