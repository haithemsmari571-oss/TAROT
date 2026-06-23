import React, { useState } from "react";
import { Icon } from "@iconify/react";
import { psychicsApi } from "../../browse/api/psychicsApi";
import { useToast } from "../../../components/Toast";

interface PsychicOrderControllerProps {
  psychicId: number;
  currentOrder: number | string;
  onUpdated: (newOrder: number) => void;
}

const PsychicOrderController: React.FC<PsychicOrderControllerProps> = ({
  psychicId,
  currentOrder,
  onUpdated,
}) => {
  const [inputValue, setInputValue] = useState<string>(
    currentOrder === 9999 ? "" : String(currentOrder)
  );
  const [isSaving, setIsSaving] = useState(false);
  const toast = useToast();

  const handleBlurOrEnter = async () => {
    // Prevent duplicated calls if value did not change
    const normalizedCurrent = currentOrder === 9999 ? "" : String(currentOrder);
    if (inputValue === normalizedCurrent) return;

    try {
      setIsSaving(true);
      const targetOrderValue = inputValue.trim() === "" ? 9999 : Number(inputValue);

      // Build Form Data envelope structure expected by update_psychic architecture
      const formData = new FormData();
      formData.append("isUpdate", "true");
      formData.append("psychicId", String(psychicId));
      formData.append("data", JSON.stringify({ order: targetOrderValue }));

      // Fire directly to backend service
      await psychicsApi.updatePsychic(psychicId, { order: targetOrderValue } as any, undefined);

      // Update parent layout local states dynamically
      onUpdated(targetOrderValue);
      toast.success("Order sequence priority updated!");
    } catch (err) {
      console.error("Failed to commit sorting update:", err);
      toast.error("Failed to update display position priority");
      // Revert local field visually on layout processing error
      setInputValue(currentOrder === 9999 ? "" : String(currentOrder));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 max-w-[100px]">
      <div className="relative flex items-center rounded-xl border border-white/10 bg-white/5 focus-within:border-primary/40 transition-colors px-3 py-1.5">
        <input
          type="number"
          className="w-full bg-transparent text-white font-bold text-xs outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          placeholder="None"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlurOrEnter}
          onKeyDown={(e) => e.key === "Enter" && handleBlurOrEnter()}
          disabled={isSaving}
        />
        {isSaving && (
          <Icon
            icon="solar:spinner-bold-duotone"
            className="animate-spin text-primary text-xs absolute right-2"
          />
        )}
      </div>
    </div>
  );
};

export default PsychicOrderController;