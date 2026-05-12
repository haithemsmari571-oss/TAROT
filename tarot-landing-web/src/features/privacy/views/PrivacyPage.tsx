import { useState, useEffect } from "react";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { motion } from "framer-motion";
import axiosClient from "../../../lib/axiosClient";
import MarkdownRenderer from "../../../components/MarkdownRenderer";

const PrivacyPage = () => {
  const [content, setContent] = useState("");

  useEffect(() => {
    axiosClient.get("/settings/public").then((res) => {
      if (res.data?.privacy_policy) setContent(res.data.privacy_policy);
    }).catch(() => {});
  }, []);

  return (
    <div className="relative min-h-screen" style={{ backgroundColor: COLORS.dark }}>
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-32">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1
            className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-12"
            style={{ ...TYPOGRAPHY.headings.h2, color: COLORS.neutralWhite }}
          >
            Privacy <span style={{ color: COLORS.primary }}>Policy</span>
          </h1>
          {content ? (
            <MarkdownRenderer content={content} />
          ) : (
            <p style={{ color: COLORS.neutralGray }}>Loading...</p>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default PrivacyPage;
