import { Link } from "react-router-dom";
import { Icon } from "@iconify/react";
import Seo from "../../../components/Seo";
import { COLORS } from "../../../theme";

// SSR-safe homepage: pure presentational content (no data fetching or browser
// APIs at render time) so it prerenders to real HTML for crawlers. Featured
// readers are a static, curated list (Valentina first); the live grid still
// lives on /psychics-browse.

interface FeaturedReader {
  name: string;
  specialty: string;
  blurb: string;
}

const FEATURED_READERS: FeaturedReader[] = [
  {
    name: "Valentina",
    specialty: "Love & Reconnection",
    blurb:
      "Honest, grounding readings for the connection you can't stop thinking about. No sugar-coating — just clarity.",
  },
  {
    name: "Amrit",
    specialty: "Twin Flames & Soulmates",
    blurb:
      "Reads the pattern underneath the push and pull, and what it's really asking of you.",
  },
  {
    name: "Samantha",
    specialty: "Ex & No Contact",
    blurb:
      "Specialises in breakups, silence and timing — what's likely happening on his side of the quiet.",
  },
];

const STEPS = [
  {
    icon: "ph:magnifying-glass-duotone",
    title: "Choose your reader",
    body: "Browse intuitive love and tarot readers and pick the one whose energy feels right.",
  },
  {
    icon: "ph:chat-teardrop-dots-duotone",
    title: "Ask what's weighing on you",
    body: "Start a private one-to-one reading and ask the question you keep circling back to.",
  },
  {
    icon: "ph:sparkle-duotone",
    title: "Get honest clarity",
    body: "Leave with a clear read on where things stand and what tends to happen next.",
  },
];

const TESTIMONIALS = [
  {
    name: "Aria V.",
    text: "It felt like she was reading the very blueprint of my heart. I finally stopped second-guessing every text.",
  },
  {
    name: "Elena R.",
    text: "Short, piercingly accurate, and delivered with real warmth. Exactly the clarity I needed.",
  },
  {
    name: "Marcus K.",
    text: "Rarely do you find someone this honest. No fluff, no false hope — just the truth I'd been avoiding.",
  },
];

const FAQS = [
  {
    q: "Are readings private?",
    a: "Completely. Every reading is a private, one-to-one conversation between you and your reader — nothing is shared.",
  },
  {
    q: "What can I ask about?",
    a: "Most people come with questions about love — a specific person, a breakup, silence, or whether a connection is really over. You can ask about anything that's weighing on you.",
  },
  {
    q: "Do you promise a specific outcome?",
    a: "No. A reading offers clarity, patterns and likely timing — honest guidance, not a guaranteed result.",
  },
];

function ReaderAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold"
      style={{
        background: `linear-gradient(135deg, ${COLORS.primaryDark} 0%, ${COLORS.secondary} 100%)`,
        color: COLORS.neutralWhite,
      }}
    >
      {initial}
    </div>
  );
}

export default function home() {
  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", backgroundColor: COLORS.dark }}>
      <Seo path="/" />

      {/* HERO */}
      <section className="relative px-5 md:px-6 pt-16 pb-20 md:pt-24 md:pb-28 text-center">
        <div className="mx-auto max-w-3xl">
          <p
            className="mb-4 text-xs md:text-sm uppercase tracking-[0.3em] font-bold"
            style={{ color: COLORS.starGold }}
          >
            Private Intuitive Readings
          </p>
          <h1
            className="mb-6 text-4xl md:text-6xl font-extrabold"
            style={{ color: COLORS.primary, letterSpacing: "-0.03em", lineHeight: 1.08 }}
          >
            Private Love Readings for the Connection You Cannot Stop Thinking About
          </h1>
          <p
            className="mx-auto mb-9 max-w-2xl text-lg md:text-xl leading-relaxed"
            style={{ color: COLORS.neutralWhite, opacity: 0.85 }}
          >
            Talk to an intuitive reader who gets it. Get honest clarity on him, your
            relationship, and what happens next — no judgment, no false hope.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/psychics-browse"
              className="inline-block px-8 py-4 rounded-xl font-bold uppercase tracking-widest transition-transform hover:scale-105"
              style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
            >
              Browse Our Readers
            </Link>
            <Link
              to="/does-he-miss-me"
              className="inline-block px-8 py-4 rounded-xl font-bold uppercase tracking-widest border transition-colors"
              style={{ borderColor: COLORS.neutralDarkGray, color: COLORS.neutralWhite }}
            >
              Does He Miss Me?
            </Link>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="px-5 md:px-6 py-16 md:py-20" style={{ backgroundColor: COLORS.surface }}>
        <div className="mx-auto max-w-5xl">
          <h2
            className="mb-12 text-center text-3xl md:text-4xl font-bold"
            style={{ color: COLORS.neutralWhite, letterSpacing: "-0.02em" }}
          >
            How It Works
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={i} className="text-center">
                <div className="mb-4 flex justify-center">
                  <Icon icon={step.icon} width={44} height={44} style={{ color: COLORS.primary }} />
                </div>
                <h3 className="mb-2 text-xl font-semibold" style={{ color: COLORS.neutralWhite }}>
                  {i + 1}. {step.title}
                </h3>
                <p className="text-base leading-relaxed" style={{ color: COLORS.neutralGray }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED READERS */}
      <section className="px-5 md:px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <h2
            className="mb-3 text-center text-3xl md:text-4xl font-bold"
            style={{ color: COLORS.neutralWhite, letterSpacing: "-0.02em" }}
          >
            Meet a Few of Our Readers
          </h2>
          <p className="mb-12 text-center text-base md:text-lg" style={{ color: COLORS.neutralGray }}>
            Every reader is intuitive, honest and here to help you find clarity.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURED_READERS.map((reader) => (
              <div
                key={reader.name}
                className="rounded-2xl p-6"
                style={{
                  backgroundColor: COLORS.surface,
                  border: `1px solid ${COLORS.neutralDarkGray}`,
                }}
              >
                <div className="mb-4 flex items-center gap-4">
                  <ReaderAvatar name={reader.name} />
                  <div>
                    <h3 className="text-lg font-bold" style={{ color: COLORS.neutralWhite }}>
                      {reader.name}
                    </h3>
                    <p className="text-sm" style={{ color: COLORS.starGold }}>
                      {reader.specialty}
                    </p>
                  </div>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: COLORS.neutralGray }}>
                  {reader.blurb}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              to="/psychics-browse"
              className="inline-block px-8 py-3.5 rounded-xl font-bold uppercase tracking-widest transition-transform hover:scale-105"
              style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
            >
              See All Readers
            </Link>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="px-5 md:px-6 py-16 md:py-20" style={{ backgroundColor: COLORS.surface }}>
        <div className="mx-auto max-w-5xl">
          <h2
            className="mb-12 text-center text-3xl md:text-4xl font-bold"
            style={{ color: COLORS.neutralWhite, letterSpacing: "-0.02em" }}
          >
            What Seekers Say
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <figure
                key={i}
                className="rounded-2xl p-6"
                style={{ backgroundColor: COLORS.dark, border: `1px solid ${COLORS.neutralDarkGray}` }}
              >
                <blockquote className="mb-4 text-base leading-relaxed" style={{ color: COLORS.neutralWhite }}>
                  “{t.text}”
                </blockquote>
                <figcaption className="text-sm font-semibold" style={{ color: COLORS.starGold }}>
                  — {t.name}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-5 md:px-6 py-16 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2
            className="mb-10 text-center text-3xl md:text-4xl font-bold"
            style={{ color: COLORS.neutralWhite, letterSpacing: "-0.02em" }}
          >
            Common Questions
          </h2>
          <div className="space-y-6">
            {FAQS.map((f, i) => (
              <div key={i}>
                <h3 className="mb-2 text-lg font-semibold" style={{ color: COLORS.neutralWhite }}>
                  {f.q}
                </h3>
                <p className="text-base leading-relaxed" style={{ color: COLORS.neutralGray }}>
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="px-5 md:px-6 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-4 text-3xl md:text-4xl font-bold" style={{ color: COLORS.primary }}>
            Ready for real clarity?
          </h2>
          <p className="mb-8 text-lg" style={{ color: COLORS.neutralGray }}>
            Your reader is waiting. Start a private reading whenever you're ready.
          </p>
          <Link
            to="/psychics-browse"
            className="inline-block px-10 py-4 rounded-xl font-bold uppercase tracking-widest transition-transform hover:scale-105"
            style={{ backgroundColor: COLORS.primary, color: COLORS.dark }}
          >
            Browse Our Readers
          </Link>
        </div>
      </section>
    </div>
  );
}
