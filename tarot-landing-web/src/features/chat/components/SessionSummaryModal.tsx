import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@iconify/react";
import { useNavigate } from "react-router-dom";
import { COLORS, TYPOGRAPHY } from "../../../theme";
import { formatStardust } from "../../../lib/currency";
import HallDialog from "@/features/hall/HallDialog";

interface SessionSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionData: {
    duration: number; // in seconds
    cost: number;
    endReason: string;
  };
  onTopUp?: () => void;
}

/* Exported so the hall's closing card renders duration with this exact
   function — one formatter, one source. */
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

const formatCost = (cost: number): string => formatStardust(cost);

export const SessionSummaryModal = ({
  isOpen,
  onClose,
  sessionData,
  onTopUp,
}: SessionSummaryModalProps) => {
  const navigate = useNavigate();

  // Distinguish "ran out of Stardust" from a normal end so the copy stays warm.
  const ranOutOfBalance = /balance|insufficient|run out|ran out/i.test(
    sessionData.endReason || ""
  );

  const handleTopUp = () => {
    onClose();
    if (onTopUp) {
      onTopUp();
    } else {
      navigate("/billing");
    }
  };

  return (
    <HallDialog open={isOpen} onClose={onClose} labelledBy="dlg-summary">
      <p className="eyebrow">Your reading</p>
      <h1 className="ptitle" id="dlg-summary">
        {ranOutOfBalance ? "Your reading time has run out" : "Your reading has ended"}
      </h1>
      <p className="psub">
        {ranOutOfBalance
          ? "Add Stardust to keep going — your reader is just a tap away."
          : "We hope it brought you clarity. You're welcome back any time."}
      </p>

      <div className="hdlg-rows">
        <div className="hdlg-row"><span className="slab">Duration</span><b>{formatDuration(sessionData.duration)}</b></div>
        <div className="hdlg-row"><span className="slab">Stardust spent</span><b>{formatCost(sessionData.cost)}</b></div>
      </div>

      {ranOutOfBalance ? (
        <button className="begin" id="dlg-summary-topup" onClick={handleTopUp}>Add Stardust</button>
      ) : (
        <button className="begin" id="dlg-summary-again" onClick={() => { onClose(); navigate("/psychics-browse"); }}>
          Book another reading
        </button>
      )}
      <button className="quiet" id="dlg-summary-close" onClick={onClose}>Close</button>
    </HallDialog>
  );
};
