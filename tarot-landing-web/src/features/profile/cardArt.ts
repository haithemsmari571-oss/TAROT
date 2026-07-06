// Maps a card_key (Major Arcana 0-21) to its optimized WebP.
// Vite turns each import into a hashed asset URL, loaded only when used.
import c0 from "../../assets/tarot-cards/0.webp";
import c1 from "../../assets/tarot-cards/1.webp";
import c2 from "../../assets/tarot-cards/2.webp";
import c3 from "../../assets/tarot-cards/3.webp";
import c4 from "../../assets/tarot-cards/4.webp";
import c5 from "../../assets/tarot-cards/5.webp";
import c6 from "../../assets/tarot-cards/6.webp";
import c7 from "../../assets/tarot-cards/7.webp";
import c8 from "../../assets/tarot-cards/8.webp";
import c9 from "../../assets/tarot-cards/9.webp";
import c10 from "../../assets/tarot-cards/10.webp";
import c11 from "../../assets/tarot-cards/11.webp";
import c12 from "../../assets/tarot-cards/12.webp";
import c13 from "../../assets/tarot-cards/13.webp";
import c14 from "../../assets/tarot-cards/14.webp";
import c15 from "../../assets/tarot-cards/15.webp";
import c16 from "../../assets/tarot-cards/16.webp";
import c17 from "../../assets/tarot-cards/17.webp";
import c18 from "../../assets/tarot-cards/18.webp";
import c19 from "../../assets/tarot-cards/19.webp";
import c20 from "../../assets/tarot-cards/20.webp";
import c21 from "../../assets/tarot-cards/21.webp";

export const CARD_ART: Record<number, string> = {
  0: c0, 1: c1, 2: c2, 3: c3, 4: c4, 5: c5, 6: c6, 7: c7, 8: c8, 9: c9,
  10: c10, 11: c11, 12: c12, 13: c13, 14: c14, 15: c15, 16: c16, 17: c17,
  18: c18, 19: c19, 20: c20, 21: c21,
};

export const getCardArt = (key: number | null | undefined): string | undefined =>
  key == null ? undefined : CARD_ART[key];
