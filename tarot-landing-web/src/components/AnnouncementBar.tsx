import { useNavigate } from "react-router-dom";

// Slim, sticky, site-wide welcome-offer bar. Fixed to the very top of the public
// layout; the navbar is offset down by this bar's height (36px) so it's always
// visible above the fold. Styled on the glass token sheet (src/styles/glass.css)
// so it follows the candlelight/daylight mood.
export default function AnnouncementBar() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate("/register")}
      className="gl-offer fixed inset-x-0 top-0 z-[55] h-9 w-full"
    >
      <span>
        ✨ New here? Your first reading is on us — <b>£15 free credit</b>
      </span>
    </button>
  );
}
