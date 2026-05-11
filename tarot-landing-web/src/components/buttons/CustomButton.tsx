import React from "react";
import { motion } from "framer-motion";
import { Icon } from "@iconify/react";

interface CustomButtonProps {
  text: string;
  icon?: string;
  iconWidth?: number;
  onClick?: () => void;
  backgroundColor?: string;
  textColor?: string;
  border?: string;
  paddingX?: string;
  paddingY?: string;
  borderRadius?: string;
  fontSize?: string;
  fontWeight?: string | number;
  gap?: string;
  hoverScale?: number;
  tapScale?: number;
  className?: string;
}

export default function CustomButton({
  text,
  icon,
  iconWidth = 20,
  onClick,
  backgroundColor = "#000",
  textColor = "#fff",
  border = "none",
  paddingX = "2rem",
  paddingY = "1rem",
  borderRadius = "0.5rem",
  fontSize = "1rem",
  fontWeight = "600",
  gap = "0.5rem",
  hoverScale = 1.05,
  tapScale = 0.95,
  className = "",
}: CustomButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: hoverScale }}
      whileTap={{ scale: tapScale }}
      onClick={onClick}
      className={`flex items-center justify-center ${className}`}
      style={{
        backgroundColor,
        color: textColor,
        border,
        padding: `${paddingY} ${paddingX}`,
        borderRadius,
        fontSize,
        fontWeight,
        gap,
      }}
    >
      {icon && <Icon icon={icon} width={iconWidth} />}
      {text}
    </motion.button>
  );
}
