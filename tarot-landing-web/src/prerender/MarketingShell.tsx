// Lightweight static header/footer wrapper used ONLY during prerendering, so
// crawlers get brand context + internal links around the page content. The live
// client app renders the full PublicLayout (Navbar/Footer) instead — this markup
// is replaced on client mount (createRoot), so it doesn't need to match exactly.
import { Link } from "react-router-dom";
import { COLORS } from "../theme";

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: COLORS.dark, minHeight: "100vh", color: COLORS.neutralWhite }}>
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: `1px solid ${COLORS.neutralDarkGray}` }}
      >
        <Link to="/" style={{ color: COLORS.primary, fontWeight: 800, letterSpacing: "-0.02em" }}>
          Ask Valentina
        </Link>
        <nav className="flex gap-6 text-sm">
          <Link to="/psychics-browse" style={{ color: COLORS.neutralGray }}>
            Readers
          </Link>
          <Link to="/articles/" style={{ color: COLORS.neutralGray }}>
            Articles
          </Link>
          <Link to="/does-he-miss-me" style={{ color: COLORS.neutralGray }}>
            Does He Miss Me?
          </Link>
          <Link to="/will-my-ex-come-back" style={{ color: COLORS.neutralGray }}>
            Will My Ex Come Back?
          </Link>
          <Link to="/about" style={{ color: COLORS.neutralGray }}>
            About
          </Link>
        </nav>
      </header>

      <main>{children}</main>

      <footer
        className="px-6 py-10 text-sm"
        style={{ borderTop: `1px solid ${COLORS.neutralDarkGray}`, color: COLORS.neutralGray }}
      >
        <nav className="flex flex-wrap gap-6 mb-4">
          <Link to="/" style={{ color: COLORS.neutralGray }}>Home</Link>
          <Link to="/psychics-browse" style={{ color: COLORS.neutralGray }}>Readers</Link>
          <Link to="/articles/" style={{ color: COLORS.neutralGray }}>Articles</Link>
          <Link to="/does-he-miss-me" style={{ color: COLORS.neutralGray }}>Does He Miss Me?</Link>
          <Link to="/will-my-ex-come-back" style={{ color: COLORS.neutralGray }}>Will My Ex Come Back?</Link>
          <Link to="/about" style={{ color: COLORS.neutralGray }}>About</Link>
          <Link to="/privacy" style={{ color: COLORS.neutralGray }}>Privacy</Link>
          <Link to="/terms" style={{ color: COLORS.neutralGray }}>Terms</Link>
        </nav>
        <p>© 2026 Ask Valentina · Private love &amp; tarot readings</p>
      </footer>
    </div>
  );
}
