import { motion } from "framer-motion";
import LegalText from "../../../components/LegalText";
import "../../../styles/glass.css";

const PrivacyPage = () => {
  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 max-w-4xl mx-auto px-6 py-20 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="gl-kicker">The small print</p>
          <h1 className="gl-h1 mb-10">
            Privacy <i>Policy</i>
          </h1>
          <div className="gl-panel px-6 py-8 md:px-12 md:py-12">
            <LegalText field="privacy_policy" />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default PrivacyPage;
