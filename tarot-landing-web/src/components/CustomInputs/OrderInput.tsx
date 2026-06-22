import React from "react";
import { PrimaryInput } from "../CustomInputs/PrimaryInput"; // Assuming PrimaryInput exists

interface OrderInputProps {
  value: number | undefined;
  onChange: (newValue: number) => void;
}

export const OrderInput: React.FC<OrderInputProps> = ({ value, onChange }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v)) {
      onChange(v);
    } else {
      onChange(0);
    }
  };

  return (
    <PrimaryInput
      type="number"
      value={value ?? ""}
      onChange={handleChange}
      placeholder="Order"
      fullWidth={false}
      min={0}
      style={{ width: "70px" }}
    />
  );
};
