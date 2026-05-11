import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";
import { COLORS } from "../../../theme";

interface GlassChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export const GlassChatInput: React.FC<GlassChatInputProps> = ({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = "Type your message...",
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSend();
      }
    }
  };

  return (
    <motion.div
      animate={{
        borderColor: isFocused ? `${COLORS.primary}80` : `${COLORS.neutralDarkGray}30`,
        boxShadow: isFocused
          ? `0 0 40px ${COLORS.primary}30, 0 8px 32px ${COLORS.dark}60, inset 0 1px 0 ${COLORS.neutralWhite}10`
          : `0 8px 32px ${COLORS.dark}60, inset 0 1px 0 ${COLORS.neutralWhite}05`,
      }}
      transition={{ duration: 0.3 }}
      className="relative p-5 rounded-2xl backdrop-blur-xl border overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${COLORS.surface}F0 0%, ${COLORS.surfaceAccent}DD 100%)`,
      }}
    >
      {/* Animated gradient background on focus */}
      <motion.div
        animate={{
          opacity: isFocused ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${COLORS.primary}08 0%, transparent 70%)`,
        }}
      />

      {/* Top accent line */}
      <motion.div
        animate={{
          opacity: isFocused ? 1 : 0,
          scaleX: isFocused ? 1 : 0,
        }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="absolute top-0 left-0 right-0 h-0.5 origin-center"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${COLORS.primary} 50%, transparent 100%)`,
        }}
      />

      {/* Glass shine effect */}
      <div
        className="absolute inset-0 rounded-2xl opacity-30 pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${COLORS.neutralWhite}08 0%, transparent 50%, ${COLORS.neutralWhite}05 100%)`,
        }}
      />

      <div className="flex items-center gap-4 relative z-10">
        {/* Input container */}
        <div className="flex-1 flex items-center gap-3">
          {/* Icon indicator */}
          <motion.div
            animate={{
              color: isFocused ? COLORS.primary : COLORS.neutralGray,
              scale: isFocused ? 1.1 : 1,
            }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0"
          >
            <Icon
              icon="solar:pen-new-square-bold-duotone"
              className="text-xl"
              style={{ opacity: 0.7 }}
            />
          </motion.div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyPress={handleKeyPress}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            placeholder={placeholder}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-gray-500 resize-none focus:outline-none text-sm leading-relaxed disabled:cursor-not-allowed overflow-y-auto"
            style={{
              height: "auto",
              maxHeight: "120px",
              minHeight: "24px",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Character count indicator (optional, shows when typing) */}
          {value.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              className="px-2 py-1 rounded-lg border"
              style={{
                backgroundColor: `${COLORS.neutralWhite}05`,
                borderColor: `${COLORS.neutralWhite}10`,
              }}
            >
              <span
                className="text-[9px] font-bold"
                style={{ color: COLORS.neutralGray }}
              >
                {value.length}
              </span>
            </motion.div>
          )}

          {/* Send Button with enhanced design */}
          <motion.button
            whileHover={{ scale: value.trim() && !disabled ? 1.1 : 1 }}
            whileTap={{ scale: value.trim() && !disabled ? 0.95 : 1 }}
            onClick={onSend}
            disabled={!value.trim() || disabled}
            className="relative p-4 rounded-xl transition-all duration-300 disabled:cursor-not-allowed overflow-hidden group"
            style={{
              backgroundColor: value.trim() && !disabled ? COLORS.primary : `${COLORS.neutralGray}30`,
              opacity: !value.trim() || disabled ? 0.4 : 1,
            }}
          >
            {/* Animated background on hover */}
            {value.trim() && !disabled && (
              <motion.div
                className="absolute inset-0"
                animate={{
                  background: [
                    `radial-gradient(circle at 0% 0%, ${COLORS.neutralWhite}20 0%, transparent 50%)`,
                    `radial-gradient(circle at 100% 100%, ${COLORS.neutralWhite}20 0%, transparent 50%)`,
                    `radial-gradient(circle at 0% 0%, ${COLORS.neutralWhite}20 0%, transparent 50%)`,
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}

            {/* Glow effect when ready to send */}
            {value.trim() && !disabled && (
              <motion.div
                className="absolute inset-0 rounded-xl"
                animate={{
                  boxShadow: [
                    `0 0 20px ${COLORS.primary}40`,
                    `0 0 30px ${COLORS.primary}60`,
                    `0 0 20px ${COLORS.primary}40`,
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}

            <Icon
              icon="solar:plain-bold"
              className="text-2xl relative z-10"
              style={{
                color: value.trim() && !disabled ? COLORS.dark : COLORS.neutralGray,
                transform: "rotate(45deg)",
              }}
            />
          </motion.button>
        </div>
      </div>

      {/* Helper text */}
      {isFocused && !disabled && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3 pt-3 border-t"
          style={{
            borderColor: `${COLORS.neutralDarkGray}30`,
          }}
        >
          <p
            className="text-[9px] font-bold uppercase tracking-wider flex items-center gap-2"
            style={{ color: COLORS.neutralGray, opacity: 0.6 }}
          >
            <Icon icon="solar:info-circle-linear" className="text-xs" />
            Press Enter to send • Shift + Enter for new line
          </p>
        </motion.div>
      )}
    </motion.div>
  );
};
