import { useEffect, useMemo, useRef, useState } from "react";
import Seo from "@/components/Seo";
import type { SanctuaryBrowseItem } from "./api/libraryItemsApi";
import { useLibraryItems } from "./hooks/useLibraryItems";
import styles from "./SanctuaryPage.module.css";

const GOLD_JOURNEY = [
  [232, 200, 139],
  [191, 216, 240],
  [240, 190, 147],
  [207, 226, 174],
  [232, 203, 214],
];

const LIBRARY_PALETTES = [
  ["#050f2d", "#163c76", "#58a7d5", "#d6efff"],
  ["#160725", "#512071", "#b55ca1", "#f4d4ef"],
  ["#230a0d", "#7b2638", "#db6673", "#ffd4c4"],
  ["#061d1a", "#175e54", "#55b49b", "#d8f3c4"],
  ["#171025", "#413572", "#7d83d8", "#e0ddff"],
  ["#241006", "#82461b", "#dfa057", "#ffe2a8"],
  ["#061822", "#0f526a", "#43adc0", "#d2f7ef"],
  ["#210717", "#71214f", "#d15e99", "#ffd5e8"],
  ["#170c25", "#623178", "#9d6bd0", "#ead6ff"],
  ["#16150b", "#5f5b21", "#b5ac4e", "#fff1b0"],
  ["#07142a", "#253d83", "#6588e0", "#d9e0ff"],
  ["#20100a", "#703728", "#c97757", "#ffdfc2"],
];

const HALL_PALETTE = ["#16082d", "#4f1f72", "#b56391", "#f4d5b8"];
const GLYPHS = ["♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓"];

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function safe(text: string) {
  return String(text).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

function starsMarkup(rnd: () => number, count: number) {
  let output = "";
  for (let index = 0; index < count; index += 1) {
    const x = (rnd() * 100).toFixed(2);
    const y = (rnd() * 100).toFixed(2);
    const radius = (0.12 + rnd() * 0.42).toFixed(2);
    const opacity = (0.22 + rnd() * 0.64).toFixed(2);
    output += `<circle cx="${x}" cy="${y}" r="${radius}" fill="#fffaf0" opacity="${opacity}"/>`;
  }
  return output;
}

function luminousSheetsMarkup(family: number, rnd: () => number, id: string) {
  const a = `fill="url(#${id}a)"`;
  const b = `fill="url(#${id}b)"`;
  const glow = `filter="url(#${id}glow)"`;
  const soft = `filter="url(#${id}soft)"`;
  const rotation = Math.round(rnd() * 54 - 27);
  let output = `<g transform="rotate(${rotation} 50 50)" style="mix-blend-mode:screen">`;

  if (family === 0) {
    output += `<g class="${styles.coverFlame} ${styles.coverFlameA}" ${soft}><path d="M-18 105C7 76 2 27 40-12C30 35 79 37 49 112Z" ${a} opacity=".72"/><path d="M18 112C53 77 39 25 83-8C67 36 111 69 77 112Z" ${b} opacity=".54"/></g><path d="M3 98C28 70 19 34 48 4C43 42 77 49 60 99" fill="none" stroke="url(#${id}line)" stroke-width="1.1" opacity=".7" ${glow}/>`;
  } else if (family === 1) {
    let petals = "";
    for (let index = 0; index < 7; index += 1) petals += `<path d="M50 52C29 39 35 10 50 1C63 18 71 38 50 52Z" transform="rotate(${index * 51 + rotation} 50 52)" ${index % 2 ? a : b} opacity="${(0.25 + index * 0.045).toFixed(2)}"/>`;
    output += `<g class="${styles.coverFlame} ${styles.coverFlameA}" ${soft}>${petals}</g><circle cx="50" cy="52" r="7" fill="url(#${id}core)" ${glow}/>`;
  } else if (family === 2) {
    output += `<g class="${styles.coverFlame} ${styles.coverFlameB}" ${soft}><ellipse cx="51" cy="51" rx="41" ry="15" transform="rotate(-18 51 51)" fill="none" stroke="url(#${id}a)" stroke-width="11" opacity=".6"/><ellipse cx="51" cy="51" rx="24" ry="43" transform="rotate(34 51 51)" fill="none" stroke="url(#${id}b)" stroke-width="8" opacity=".5"/></g><ellipse cx="51" cy="51" rx="31" ry="11" transform="rotate(-18 51 51)" fill="none" stroke="url(#${id}line)" stroke-width=".65" opacity=".72"/>`;
  } else if (family === 3) {
    output += `<g class="${styles.coverFlame} ${styles.coverFlameA}" ${soft}><path d="M11 82L38 5L58 55Z" ${a} opacity=".7"/><path d="M31 96L62 8L92 79Z" ${b} opacity=".57"/><path d="M4 54L51 25L80 105Z" ${a} opacity=".33"/></g><path d="M11 82L38 5L58 55L62 8L92 79" fill="none" stroke="url(#${id}line)" stroke-width=".55" opacity=".62"/>`;
  } else if (family === 4) {
    output += `<g class="${styles.coverFlame} ${styles.coverFlameB}" fill="none" stroke-linecap="round" ${soft}><path d="M-14 89C19 70 27 22 108 8" stroke="url(#${id}a)" stroke-width="15" opacity=".46"/><path d="M-8 102C32 66 46 40 111 32" stroke="url(#${id}b)" stroke-width="8" opacity=".58"/></g><path d="M-8 94C25 70 34 30 108 15" fill="none" stroke="url(#${id}line)" stroke-width=".8" opacity=".8" ${glow}/>`;
  } else if (family === 5) {
    let curtains = "";
    for (let index = 0; index < 5; index += 1) {
      const x = 4 + index * 21 + rnd() * 5;
      const sway = 8 + rnd() * 14;
      curtains += `<path d="M${x.toFixed(1)} -10C${(x + sway).toFixed(1)} 24 ${(x - sway).toFixed(1)} 66 ${(x + 4).toFixed(1)} 112L${(x + 17).toFixed(1)} 112C${(x - sway + 10).toFixed(1)} 63 ${(x + sway + 14).toFixed(1)} 23 ${(x + 14).toFixed(1)} -10Z" ${index % 2 ? a : b} opacity="${(0.22 + index * 0.075).toFixed(2)}"/>`;
    }
    output += `<g class="${styles.coverFlame} ${styles.coverFlameA}" ${soft}>${curtains}</g>`;
  } else if (family === 6) {
    output += `<g class="${styles.coverFlame} ${styles.coverFlameA}" ${soft}><circle cx="37" cy="42" r="30" ${a} opacity=".55"/><circle cx="65" cy="61" r="26" ${b} opacity=".5"/><circle cx="72" cy="25" r="13" ${a} opacity=".42"/></g><g fill="none" stroke="url(#${id}line)" opacity=".68"><circle cx="50" cy="50" r="29" stroke-width=".5"/><circle cx="50" cy="50" r="18" stroke-width=".3"/><path d="M9 57C31 38 64 36 92 49" stroke-width=".55"/></g>`;
  } else if (family === 7) {
    output += `<g class="${styles.coverFlame} ${styles.coverFlameB}" ${soft}><path d="M49 96C18 83 3 51 13 17C29 27 47 47 49 96Z" ${a} opacity=".66"/><path d="M51 96C81 81 98 49 87 15C70 27 53 49 51 96Z" ${b} opacity=".62"/></g><path d="M50 94C45 65 45 37 50 7M50 72C32 54 24 37 18 22M50 72C68 52 77 35 83 20" fill="none" stroke="url(#${id}line)" stroke-width=".55" opacity=".72"/>`;
  } else if (family === 8) {
    const points = Array.from({ length: 7 }, () => ({ x: 12 + rnd() * 76, y: 12 + rnd() * 76 }));
    const lines = points.slice(0, -1).map((point, index) => `<path d="M${point.x.toFixed(1)} ${point.y.toFixed(1)}L${points[index + 1].x.toFixed(1)} ${points[index + 1].y.toFixed(1)}"/>`).join("");
    const nodes = points.map((point, index) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${index % 3 ? 1.2 : 2.1}"/>`).join("");
    output += `<g class="${styles.coverFlame} ${styles.coverFlameA}" ${soft}><path d="M2 76C20 34 46 16 99 23C70 43 76 76 35 102Z" ${a} opacity=".48"/></g><g fill="none" stroke="url(#${id}line)" stroke-width=".45" opacity=".72">${lines}</g><g fill="url(#${id}core)" ${glow}>${nodes}</g>`;
  } else if (family === 9) {
    output += `<g class="${styles.coverFlame} ${styles.coverFlameB}" ${soft}><path d="M4 22L45 5L30 64Z" ${a} opacity=".55"/><path d="M29 64L75 10L97 71Z" ${b} opacity=".48"/><path d="M8 85L57 47L84 107Z" ${a} opacity=".42"/><path d="M48 25L104 2L81 59Z" ${b} opacity=".34"/></g><path d="M4 22L45 5L30 64L75 10L97 71L57 47L84 107" fill="none" stroke="url(#${id}line)" stroke-width=".4" opacity=".58"/>`;
  } else if (family === 10) {
    const rays = Array.from({ length: 16 }, (_, index) => `<path d="M50 50L50 ${4 + (index % 4) * 3}" transform="rotate(${index * 22.5} 50 50)"/>`).join("");
    output += `<g class="${styles.coverFlame} ${styles.coverFlameA}" ${soft}><circle cx="50" cy="50" r="31" ${a} opacity=".58"/><circle cx="50" cy="50" r="18" ${b} opacity=".72"/></g><g fill="none" stroke="url(#${id}line)" stroke-width=".45" opacity=".63">${rays}<circle cx="50" cy="50" r="33"/></g><circle cx="50" cy="50" r="5" fill="url(#${id}core)" ${glow}/>`;
  } else {
    output += `<g class="${styles.coverFlame} ${styles.coverFlameB}" ${soft}><path d="M-12 25C19 2 39 56 112 13L112 43C61 72 35 22-12 59Z" ${a} opacity=".55"/><path d="M-9 61C31 31 53 92 109 48L109 79C66 111 28 57-9 96Z" ${b} opacity=".51"/></g><path d="M-8 43C29 18 48 72 108 31M-7 78C32 49 58 101 108 64" fill="none" stroke="url(#${id}line)" stroke-width=".55" opacity=".65"/>`;
  }
  return `${output}</g>`;
}

function libraryCoverArt(item: Pick<SanctuaryBrowseItem, "title" | "coverUrl">) {
  const seed = hash(item.title);
  const rnd = random(seed);
  const colours = LIBRARY_PALETTES[(seed >>> 3) % LIBRARY_PALETTES.length];
  const id = `sanctuary-flame-${seed}`;
  const family = seed % 12;
  const x = (18 + rnd() * 64).toFixed(1);
  const y = (12 + rnd() * 66).toFixed(1);
  const initials = safe(item.title.split(/\s+/).filter((word) => word.length > 2).slice(0, 2).map((word) => word[0]).join("").toUpperCase());
  const monogram = item.coverUrl ? "" : `<g opacity=".82"><circle cx="50" cy="50" r="14" fill="rgba(8,4,16,.28)" stroke="url(#${id}line)" stroke-width=".35"/><text x="50" y="54" fill="#fff8e9" text-anchor="middle" font-family="Georgia,serif" font-size="10" letter-spacing="1.8">${initials}</text></g>`;

  return `<svg class="${styles.libraryCoverArt}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Generated cover art for ${safe(item.title)}"><defs><linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colours[0]}"/><stop offset=".52" stop-color="${colours[1]}"/><stop offset="1" stop-color="#08030f"/></linearGradient><linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colours[3]}" stop-opacity=".94"/><stop offset=".48" stop-color="${colours[2]}" stop-opacity=".64"/><stop offset="1" stop-color="${colours[1]}" stop-opacity=".06"/></linearGradient><linearGradient id="${id}b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3d2" stop-opacity=".88"/><stop offset=".4" stop-color="${colours[3]}" stop-opacity=".72"/><stop offset="1" stop-color="${colours[2]}" stop-opacity=".04"/></linearGradient><linearGradient id="${id}line" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e8"/><stop offset=".56" stop-color="var(--sanctuary-gold)"/><stop offset="1" stop-color="${colours[2]}"/></linearGradient><radialGradient id="${id}core"><stop offset="0" stop-color="#fffdf4"/><stop offset=".35" stop-color="var(--sanctuary-gold)"/><stop offset="1" stop-color="${colours[2]}" stop-opacity="0"/></radialGradient><radialGradient id="${id}halo"><stop offset="0" stop-color="${colours[3]}" stop-opacity=".5"/><stop offset="1" stop-color="${colours[2]}" stop-opacity="0"/></radialGradient><filter id="${id}soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter><filter id="${id}glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.8" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="${id}grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed="${seed % 97}"/><feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 .18 0"/></filter></defs><rect width="100" height="100" fill="url(#${id}bg)"/><ellipse cx="${x}" cy="${y}" rx="48" ry="39" fill="url(#${id}halo)" filter="url(#${id}soft)"/>${luminousSheetsMarkup(family, rnd, id)}${starsMarkup(rnd, 18)}${monogram}<rect width="100" height="100" filter="url(#${id}grain)" opacity=".2" style="mix-blend-mode:soft-light"/></svg>`;
}

function emptyOrbArt() {
  const id = "sanctuary-empty-orb";
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A quiet celestial orb"><defs><linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${HALL_PALETTE[0]}"/><stop offset=".48" stop-color="${HALL_PALETTE[1]}"/><stop offset="1" stop-color="${HALL_PALETTE[2]}"/></linearGradient><radialGradient id="${id}-light" cx=".42" cy=".35" r=".65"><stop offset="0" stop-color="${HALL_PALETTE[3]}" stop-opacity=".32"/><stop offset="1" stop-color="${HALL_PALETTE[0]}" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#${id}-bg)"/><rect width="100" height="100" fill="url(#${id}-light)"/><g transform="translate(50 51) rotate(-18)" stroke="var(--sanctuary-gold)" stroke-width=".45" fill="none" opacity=".72"><ellipse rx="35" ry="13"/><ellipse rx="25" ry="33" transform="rotate(42)"/><ellipse rx="31" ry="20" transform="rotate(91)"/></g><circle cx="50" cy="51" r="8" fill="rgba(255,239,199,.78)"/><path d="M0 93 Q30 88 50 93 T100 93V100H0Z" fill="rgba(3,2,8,.18)"/></svg>`;
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "";
  if (seconds < 120) {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes ? `${minutes}m ` : ""}${remaining ? `${remaining}s` : ""}`;
  }
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h${minutes ? ` ${minutes}m` : ""}`;
}

function formatPlayerTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remaining = String(wholeSeconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}` : `${minutes}:${remaining}`;
}

function actionSymbol(item: SanctuaryBrowseItem) {
  return item.interaction === "read" ? "↗" : "▶";
}

function actionVerb(item: SanctuaryBrowseItem) {
  return item.interaction === "read" ? "Open and read" : "Listen now";
}

function Cover({ item }: { item: SanctuaryBrowseItem }) {
  if (item.coverUrl) return <img className={styles.coverImage} src={item.coverUrl} alt={`Cover art for ${item.title}`} />;
  return <span className={styles.generatedCover} dangerouslySetInnerHTML={{ __html: libraryCoverArt(item) }} />;
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
        <span className={styles.cardVerb}>{actionVerb(item)}</span>
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const { items, loading, error } = useLibraryItems();
  const [activeKind, setActiveKind] = useState("Everything");
  const [changing, setChanging] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [activeItem, setActiveItem] = useState<SanctuaryBrowseItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
    };
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

  const playItem = (item: SanctuaryBrowseItem) => {
    const audio = audioRef.current;
    if (!audio || !item.audioUrl) return;

    const replacingItem = activeItem?.source !== item.source || activeItem.key !== item.key;
    if (replacingItem) {
      audio.src = item.audioUrl;
      setElapsedSeconds(0);
      setTotalSeconds(item.durationSeconds ?? 0);
      setActiveItem(item);
    }

    void audio.play().catch(() => setIsPlaying(false));
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  };

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setElapsedSeconds(seconds);
  };

  const syncDuration = () => {
    const duration = audioRef.current?.duration;
    if (duration != null && Number.isFinite(duration)) setTotalSeconds(duration);
  };

  const titleWords = hero?.title.split(" ") ?? [];
  const titleTurn = Math.max(1, Math.ceil(titleWords.length / 2));

  return (
    <div className={`${styles.page}${activeItem ? ` ${styles.hasPlayer}` : ""}`} ref={rootRef} data-sanctuary-mounted="true">
      <Seo meta={{ path: "/sanctuary", canonical: "https://askvalentina.co.uk/sanctuary", title: "The Sanctuary | Ask Valentina", description: "A quiet library of meditations, stories, music and small ways back to yourself." }} />
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(event) => setElapsedSeconds(event.currentTarget.currentTime)}
        onLoadedMetadata={syncDuration}
        onDurationChange={syncDuration}
      />
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
      {activeItem ? (
        <aside className={styles.playerBar} aria-label="Now playing">
          <div className={styles.playerInner}>
            <div className={styles.playerCover}><Cover item={activeItem} /></div>
            <div className={styles.playerCopy} aria-live="polite">
              <span>{activeItem.type}</span>
              <strong>{activeItem.title}</strong>
            </div>
            <button className={styles.playerToggle} type="button" onClick={togglePlayback} aria-label={`${isPlaying ? "Pause" : "Play"} ${activeItem.title}`}>
              <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
            </button>
            <div className={styles.playerTimeline}>
              <span>{formatPlayerTime(elapsedSeconds)}</span>
              <input
                className={styles.playerSeek}
                type="range"
                min="0"
                max={Math.max(totalSeconds, 0)}
                step="0.1"
                value={Math.min(elapsedSeconds, totalSeconds || 0)}
                onChange={(event) => seek(Number(event.target.value))}
                aria-label={`Seek ${activeItem.title}`}
              />
              <span>{formatPlayerTime(totalSeconds)}</span>
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
