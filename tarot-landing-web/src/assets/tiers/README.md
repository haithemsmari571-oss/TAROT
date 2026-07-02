# Glider tier background images

Full-bleed, dimmed background images for the Stardust glider pricing card, one
per tier. Same dimmed treatment as the auth screens (`login`/`register`), applied
as a crossfading layer behind the glider content.

## Drop your RAW files here, named exactly (any extension — png/jpg/webp):

| Filename        | Tier        | Image                                   |
| --------------- | ----------- | --------------------------------------- |
| `base.*`        | Base/entry  | celestial dome library                  |
| `whisper.*`     | Whisper     | moonlit terrace                         |
| `revelation.*`  | Revelation  | astrology temple with the zodiac wheel  |
| `devotion.*`    | Devotion    | tarot altar with candles and crystals   |
| `lifetime.*`    | Lifetime    | pale moonlit balcony                     |

(The under-$100 "no tier" state shows the `base` scene as the entry mood.)

## What happens next

These raw files are optimized to `*.webp` in this folder (resized for the card,
compressed), the originals are removed, and `StardustGlider.tsx` imports the
`.webp` versions. Do not commit large raw PNG/JPG files here.
