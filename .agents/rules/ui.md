---
trigger: always_on
---

# UI Rules
 
Scoped rules for TabBellus. `AGENTS.md` at the repo root is the parent document: its precedence (§0) and absolute rules apply here too. Apply these when touching anything under `src/components/`, feature views, styles, or `tailwind.config.ts`. Design authority: `DESIGN.md` defines intent (palette roles, token separation, layout, visual constraints); token values live only in `src/index.css` and `tailwind.config.ts`, which win if they disagree with `DESIGN.md`.
 
- Primitives in `src/components/ui/` are owned source code. Never run `npx shadcn add` (or any generator) over existing files there; edit them by hand.
- Interactive controls (`<Switch>`, `<Checkbox>`, `<Slider>`, `<RadioGroup>`, menu items) use explicit high-contrast state classes, never structural tokens (`--border`, `--input`, `--background`, `--muted`), because those collapse on the pure-black OLED and pure-white themes. The full matrix is in `DESIGN.md` (Structural vs. Interactive Token Separation).
- Contrast minimums: 3:1 for non-text UI and focus indicators (WCAG 1.4.11), 4.5:1 for normal text (WCAG 1.4.3).
- Preserve Radix accessibility and state selectors (`data-[state]`, `data-[disabled]`, `focus-visible:*`).
- Use `transition-colors` / `transition-opacity` only, never `transition-all`, to avoid layout reflow.
- Reference color tokens and Tailwind classes, never hardcoded HSL/hex values.
- Follow `DESIGN.md` density and palette. Design skills never override it.