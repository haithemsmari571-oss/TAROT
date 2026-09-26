import { useNavigate } from "react-router-dom";
import { formatGbp } from "../lib/currency";
import { hasWelcomeCredit } from "../features/client-app/useWelcomeCredit";

// Slim, sticky, site-wide welcome-offer bar. Fixed to the very top of the public
// layout; the navbar is offset down by this bar's height (36px) so it's always
// visible above the fold. Styled on the glass token sheet (src/styles/glass.css)
// so it follows the candlelight/daylight mood. The credit is the server's figure
// (useWelcomeCredit, read by PublicLayout); until it arrives the bar keeps its
// place with no words.
export default function AnnouncementBar({ creditGbp }: { creditGbp: number | undefined }) {
  const navigate = useNavigate();
  const offer = hasWelcomeCredit(creditGbp);

  return (
    <button
      type="button"
      onClick={() => navigate("/register")}
      disabled={!offer}
      aria-hidden={!offer}
      className="gl-offer fixed inset-x-0 top-0 z-[55] h-9 w-full"
    >
      <span>
        {offer && <>✨ New here? Your first reading is on us — <b>{formatGbp(creditGbp)} free credit</b></>}
      </span>
    </button>
  );
}
