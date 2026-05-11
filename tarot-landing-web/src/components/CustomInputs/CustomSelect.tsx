import { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";

const CustomSelect = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative flex flex-col items-start min-w-[180px]" ref={dropdownRef}>
      {/* Dossier-style Label */}
      <div className="bg-white/5 border-t border-x border-white/10 px-3 py-1 flex items-center gap-2 ml-1">
        <span className="text-[8px] text-white/30 uppercase tracking-[0.2em]">Sort_Archive</span>
      </div>

      {/* Main Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white/5 border border-white/10 px-4 py-3 text-[10px] text-white flex items-center justify-between transition-all hover:border-white/20"
      >
        <span className="font-bold tracking-widest">{selectedOption?.label}</span>
        <Icon 
          icon="ph:caret-down" 
          className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} 
        />
      </button>

      {/* Custom Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.ul
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-full left-0 w-full mt-1 bg-[#1a1a1a] border border-white/10 z-50 shadow-2xl"
          >
            {options.map((opt) => (
              <li
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`px-4 py-3 text-[10px] cursor-pointer uppercase tracking-widest transition-colors ${
                  value === opt.value 
                    ? "text-[#d4af37] bg-white/5" 
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                {opt.label}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomSelect;