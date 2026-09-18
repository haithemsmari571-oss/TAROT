import { useEffect, useMemo, useRef, useState } from "react";
import Seo from "@/components/Seo";
import type { SanctuaryBrowseItem } from "./api/libraryItemsApi";
import { useLibraryItems } from "./hooks/useLibraryItems";
import { useSanctuaryPlayer } from "./SanctuaryPlayerProvider";
import { Cover, formatDuration } from "./cover";
import styles from "./SanctuaryPage.module.css";

const GOLD_JOURNEY = [
  [232, 200, 139],
  [191, 216, 240],
  [240, 190, 147],
  [207, 226, 174],
  [232, 203, 214],
];

const HALL_PALETTE = ["#16082d", "#4f1f72", "#b56391", "#f4d5b8"];
const GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

function emptyOrbArt() {
  const id = "sanctuary-empty-orb";
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A quiet celestial orb"><defs><linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${HALL_PALETTE[0]}"/><stop offset=".48" stop-color="${HALL_PALETTE[1]}"/><stop offset="1" stop-color="${HALL_PALETTE[2]}"/></linearGradient><radialGradient id="${id}-light" cx=".42" cy=".35" r=".65"><stop offset="0" stop-color="${HALL_PALETTE[3]}" stop-opacity=".32"/><stop offset="1" stop-color="${HALL_PALETTE[0]}" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#${id}-bg)"/><rect width="100" height="100" fill="url(#${id}-light)"/><g transform="translate(50 51) rotate(-18)" stroke="var(--sanctuary-gold)" stroke-width=".45" fill="none" opacity=".72"><ellipse rx="35" ry="13"/><ellipse rx="25" ry="33" transform="rotate(42)"/><ellipse rx="31" ry="20" transform="rotate(91)"/></g><circle cx="50" cy="51" r="8" fill="rgba(255,239,199,.78)"/><path d="M0 93 Q30 88 50 93 T100 93V100H0Z" fill="rgba(3,2,8,.18)"/></svg>`;
}

function actionSymbol(item: SanctuaryBrowseItem) {
  return item.interaction === "read" ? "↗" : "▶";
}

function actionVerb(item: SanctuaryBrowseItem) {
  return item.interaction === "read" ? "Open and read" : "Listen now";
}

function ZodiacWheel({ secondary = false }: { secondary?: boolean }) {
  const outer = secondary ? 46 : 48;
  const inner = secondary ? 37.4 : 40.8;
  const circles = [outer, inner, inner - 3];
  return (
    <svg className={`${styles.wheel}${secondary ? ` ${styles.wheelSecondary}` : ""}`} viewBox="0 0 100 100" aria-hidden="true">
      {circles.map((radius) => <circle key={radius} cx="50" cy="50" r={radius} />)}
      {GLYPHS.map((glyph, index) => {
        const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
        const middle = ((index + 0.5) / 12) * Math.PI * 2 - Math.PI / 2;
        const radius = (outer + inner) / 2;
        return (
          <g key={glyph}>
            <line x1={50 + Math.cos(angle) * inner} y1={50 + Math.sin(angle) * inner} x2={50 + Math.cos(angle) * outer} y2={50 + Math.sin(angle) * outer} />
            <text x={50 + Math.cos(middle) * radius} y={50 + Math.sin(middle) * radius}>{glyph}</text>
          </g>
        );
      })}
      {Array.from({ length: 72 }, (_, index) => {
        const angle = (index / 72) * Math.PI * 2;
        const length = index % 6 === 0 ? 4.7 : 3.2;
        return <line key={index} x1={50 + Math.cos(angle) * (inner - 3)} y1={50 + Math.sin(angle) * (inner - 3)} x2={50 + Math.cos(angle) * (inner - 3 - length)} y2={50 + Math.sin(angle) * (inner - 3 - length)} />;
      })}
    </svg>
  );
}

function LibraryCard({ item, featured = false, onActivate }: { item: SanctuaryBrowseItem; featured?: boolean; onActivate: (item: SanctuaryBrowseItem) => void }) {
  const duration = formatDuration(item.durationSeconds);
  return (
    <article className={`${styles.libraryCard}${featured ? ` ${styles.featuredCard}` : ""}`} data-sanctuary-kind={item.type}>
      <button className={styles.cardCoverButton} type="button" aria-label={`${actionVerb(item)}: ${item.title}`} onClick={() => onActivate(item)}>
        <span className={styles.cover}><Cover item={item} /></span>
        <span className={styles.cardActionIcon} aria-hidden="true">{actionSymbol(item)}</span>
      </button>
      <div className={styles.cardCopy}>
        <div className={styles.cardMeta}>
          <span>{item.type}</span>
          {duration ? <span className={styles.duration}>{duration}</span> : null}
        </div>
        <h3>{item.title}</h3>
        <p className={styles.cardDescription}>{item.description}</p>
        <button className={styles.cardVerb} type="button" onClick={() => onActivate(item)}>{actionVerb(item)}</button>
      </div>
    </article>
  );
}

function QuietState({ loading, error }: { loading: boolean; error: string | null }) {
  return (
    <section className={styles.emptyState} aria-labelledby="sanctuary-empty-title" data-sanctuary-state={loading ? "loading" : error ? "error" : "empty"}>
      <div className={styles.emptyInner}>
        <div className={styles.emptyOrb} aria-hidden="true" dangerouslySetInnerHTML={{ __html: emptyOrbArt() }} />
        <p className={styles.eyebrow}>The Sanctuary</p>
        {loading ? (
          <>
            <h1 id="sanctuary-empty-title">The room is <em>opening softly.</em></h1>
            <p>Stay beneath the sky for a moment while the Sanctuary gathers around you.</p>
          </>
        ) : error ? (
          <>
            <h1 id="sanctuary-empty-title">The door is resting <em>between moments.</em></h1>
            <p>Nothing has been lost. Come back shortly and the room will be waiting here.</p>
          </>
        ) : (
          <>
            <h1 id="sanctuary-empty-title">A quiet room is being <em>prepared for you.</em></h1>
            <p>Meditations, stories, music and small ways back to yourself will gather here. For now, the sky is yours to sit beneath.</p>
          </>
        )}
      </div>
    </section>
  );
}

export default function SanctuaryPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { items, loading, error } = useLibraryItems();
  const { activeItem, playItem, setTrackList } = useSanctuaryPlayer();
  const [activeKind, setActiveKind] = useState("Everything");
  const [changing, setChanging] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const startedAt = performance.now();
    let frame = 0;
    const paint = () => {
      const position = (performance.now() - startedAt) / 195_000;
      const index = Math.floor(position) % GOLD_JOURNEY.length;
      const raw = position - Math.floor(position);
      const eased = raw * raw * (3 - 2 * raw);
      const from = GOLD_JOURNEY[index];
      const to = GOLD_JOURNEY[(index + 1) % GOLD_JOURNEY.length];
      const colour = from.map((value, channel) => Math.round(value + (to[channel] - value) * eased));
      root.style.setProperty("--sanctuary-gold", `rgb(${colour.join(",")})`);
      root.style.setProperty("--sanctuary-gold-rgb", colour.join(","));
      root.style.setProperty("--sanctuary-gold-pale", `rgb(${colour.map((value) => Math.min(255, Math.round(value + (255 - value) * 0.42))).join(",")})`);
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, []);

  const kinds = useMemo(() => Array.from(new Set(items.map((item) => item.type))), [items]);
  const playableItems = useMemo(
    () => items.filter((item): item is SanctuaryBrowseItem & { audioUrl: string } => Boolean(item.audioUrl)),
    [items],
  );

  useEffect(() => {
    setTrackList(playableItems);
  }, [playableItems, setTrackList]);

  const hero = items[0];
  const showingEverything = activeKind === "Everything";
  const visibleItems = showingEverything ? items.slice(2) : items.filter((item) => item.type === activeKind);

  const chooseKind = (kind: string) => {
    if (kind === activeKind) return;
    setChanging(true);
    window.setTimeout(() => {
      setActiveKind(kind);
      requestAnimationFrame(() => setChanging(false));
    }, 260);
  };

  const titleWords = hero?.title.split(" ") ?? [];
  const titleTurn = Math.max(1, Math.ceil(titleWords.length / 2));

  return (
    <div className={`${styles.page}${activeItem ? ` ${styles.hasPlayer}` : ""}`} ref={rootRef} data-sanctuary-mounted="true">
      <Seo meta={{ path: "/sanctuary", canonical: "https://askvalentina.co.uk/sanctuary", title: "The Sanctuary | Ask Valentina", description: "A quiet library of meditations, stories, music and small ways back to yourself." }} />
      <div className={styles.sky} aria-hidden="true">
        <div className={styles.skyStars} />
        <ZodiacWheel />
        <ZodiacWheel secondary />
        <div className={styles.skyVignette} />
      </div>

      {loading || error || !items.length ? <QuietState loading={loading} error={error} /> : (
        <main className={styles.content}>
          <section className={`${styles.hero} ${styles.shell}${revealed ? ` ${styles.revealed}` : ""}`} aria-labelledby="sanctuary-hero-title">
            <span className={styles.headerWhisper}>come as you are, stay as long as you need</span>
            <div className={styles.heroArtWrap}>
              <div className={styles.heroCover}><Cover item={hero} /></div>
              <span className={styles.coverNote}>Tonight&apos;s invitation</span>
            </div>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Tonight in the Sanctuary</p>
              <h1 id="sanctuary-hero-title">{titleWords.slice(0, titleTurn).join(" ")} <em>{titleWords.slice(titleTurn).join(" ")}</em></h1>
              <p className={styles.heroDescription}>{hero.description}</p>
              <div className={styles.heroMeta}>
                <span>{hero.type}</span>
                {hero.durationSeconds != null ? <span>{formatDuration(hero.durationSeconds)}</span> : null}
              </div>
              <div className={styles.heroActions}>
                <button className={styles.primaryAction} type="button" onClick={() => playItem(hero)}>
                  <span className={styles.actionDisc} aria-hidden="true">{actionSymbol(hero)}</span>
                  <span className={styles.actionCopy}><b>{hero.interaction === "read" ? "Begin reading" : "Begin listening"}</b><small>the room is ready</small></span>
                </button>
                <button className={styles.saveAction} type="button" onClick={() => undefined}>Keep for later</button>
              </div>
            </div>
            <span className={styles.scrollNote} aria-hidden="true">Enter the library</span>
          </section>

          <section className={styles.library} aria-labelledby="sanctuary-library-title">
            <div className={styles.shell}>
              <div className={`${styles.libraryHeading}${revealed ? ` ${styles.revealed}` : ""}`}>
                <div>
                  <p className={styles.eyebrow}>The whole sanctuary</p>
                  <h2 id="sanctuary-library-title">Something for <em>this moment.</em></h2>
                </div>
                <p className={styles.libraryIntro}>Rest, listen, learn, or simply stay awhile. There is no right way to be here.</p>
              </div>
              <div className={styles.filterRow} aria-label="Filter the Sanctuary">
                {["Everything", ...kinds].map((kind) => (
                  <button key={kind} className={styles.filterChip} type="button" onClick={() => chooseKind(kind)} aria-pressed={kind === activeKind}>{kind}</button>
                ))}
              </div>

              {showingEverything ? (
                <section className={styles.featuredCollection} aria-labelledby="sanctuary-featured-title">
                  <div className={styles.featuredHeading}>
                    <p className={styles.eyebrow} id="sanctuary-featured-title">Featured tonight</p>
                    <p>Two gentle places to begin.</p>
                  </div>
                  <div className={styles.featuredGrid}>{items.slice(0, 2).map((item) => <LibraryCard key={`${item.source}:${item.key}`} item={item} featured onActivate={playItem} />)}</div>
                </section>
              ) : null}

              {showingEverything ? <div className={styles.libraryDivider}><span>The rest of the Sanctuary</span></div> : null}
              <div className={`${styles.libraryGrid}${changing ? ` ${styles.changing}` : ""}`}>
                {visibleItems.length ? visibleItems.map((item) => <LibraryCard key={`${item.source}:${item.key}`} item={item} onActivate={playItem} />) : <div className={styles.noResults}>Nothing is asking to be found here tonight.</div>}
              </div>
            </div>
          </section>
        </main>
      )}

      {!loading && !error && items.length ? <footer className={styles.footer}>The door stays open. Come back whenever the night feels long.</footer> : null}
    </div>
  );
}
