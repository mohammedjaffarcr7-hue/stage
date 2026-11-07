# Stage design system: "Ember"

Inspired by two references from Awesome DESIGN.md (getdesign.md): Claude's warm editorial feel (serif headings, warm neutrals) and xAI's stark near-black minimalism. Stage keeps its own palette and does not copy either brand.

## Colour
| Token | Value | Use |
|---|---|---|
| `--bg` | `#131210` | Page canvas (warm near-black) |
| `--surface` / `--surface2` | `#1c1b18` / `#26241f` | Cards, bubbles, inputs / hover, your messages |
| `--line` | `#312e29` | Hairlines and borders |
| `--ink` | `#f4f1ea` | Headings, names, important text |
| `--body` | `#dcd6cb` | Running text |
| `--muted` | `#958f84` | Secondary text, *actions* |
| `--accent` | `#d97a52` | **The one accent ("ember")**: primary buttons, send, active states |

No gradients, no drop shadows, no violet. Depth comes from surface contrast only.

## Type
- Headings: **Newsreader** (serif), weight 400, slight negative tracking.
- Text and UI: **Inter**; Arabic: **IBM Plex Sans Arabic**. Code: system monospace.
- Assistant answers read like a document (no bubble); character replies sit in bubbles; *actions* are italic and muted.

## Shape and motion
- Radius: 12 (inputs), 20 (cards, bubbles), 28 (large cards, sheets); buttons are pills.
- Buttons lift 1 px on hover and press in on click; linked cards lift 2 px. Animate only transform, opacity and colours, never `transition: all`.
- Everything rests under `prefers-reduced-motion`.

## Checks (Web Interface Guidelines)
- Every icon button has an `aria-label`; every control is at least 44 px tall; visible `:focus-visible` rings.
- Placeholders and loading text end with `…`. Destructive actions ask first.
- Check every change in Playwright at 390 px and 1280 px, with English and Arabic text.
