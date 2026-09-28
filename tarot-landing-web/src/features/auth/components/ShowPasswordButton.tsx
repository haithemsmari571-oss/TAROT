import { Icon } from "@iconify/react";
import "../../../styles/glass.css";

/* The eye at the right of a password field (sign-up and sign-in): shows what she
   typed, or hides it again. Its name stays "Show password"; aria-pressed says
   whether the password is shown now (ROUND40). The field needs room for it on its
   right (paddingRight 46) and a relative wrapper. */
export default function ShowPasswordButton({ shown, onToggle, controls }: { shown: boolean; onToggle: () => void; controls: string }) {
  return (
    <button type="button" className="gl-eye" onClick={onToggle} aria-label="Show password" aria-pressed={shown} aria-controls={controls}>
      <Icon icon={shown ? "ph:eye-slash-bold" : "ph:eye-bold"} className="text-base" />
    </button>
  );
}
