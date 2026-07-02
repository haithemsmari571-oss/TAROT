# Page background scenes

Full-bleed dimmed background images for whole pages/sections, rendered via
`src/components/PageBackground.tsx`. Optimized the same way as the tier images
(resized to 1600×900, WebP, compressed).

| File | Used on | Preset |
| --- | --- | --- |
| `zodiac-hall-1..4.webp` | Life Path & Zodiac reveal (`/oracle`) — slow crossfade rotation | immersive |
| `celestial-portal.webp` | Home hero | immersive |
| `zodiac-hall-2.webp` | Psychic details (`/psychics/:id/details`) | subtle |
| `moonlit-balcony.webp` | Psychics Browse, Chats, Notifications | faint (texture only) |

Presets (in `PageBackground.tsx`) tune dimming by page job:
- **immersive** — scene clearly visible (landing/discovery).
- **subtle** — atmospheric but recessed.
- **faint** — dimmed to a faint texture so it never competes with dense content
  (profile photos, message text, lists).

The Glider pricing page (`/billing`) doesn't use a file here — it paints its own
per-tier scenes via `StardustGlider fullBleed`.
