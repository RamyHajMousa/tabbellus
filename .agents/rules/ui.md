# UI Rules

Scoped rules for TabBellus. `AGENTS.md` at the repo root is the parent document: its precedence (§0) and absolute rules apply here too. Apply these when touching anything under `src/components/`, feature views, styles, or `tailwind.config.ts`. `DESIGN.md` is the only design source.

- Primitives in `src/components/ui/` are owned source code. Never run `npx shadcn add` (or any generator) over existing files there; edit them by hand.
- Interactive controls (`<Switch>`, `<Checkbox>`, `<Slider>`, `<RadioGroup>`, menu items) use explicit high-contrast state classes, never structural tokens (`--border`, `--input`, `--background`, `--muted`), because those collapse on the pure-black OLED and pure-white themes.
- Contrast minimums: 3:1 for non-text UI and focus indicators (WCAG 1.4.11), 4.5:1 for normal text (WCAG 1.4.3).
- Preserve Radix accessibility and state selectors (`data-[state]`, `data-[disabled]`, `focus-visible:*`).
- Follow `DESIGN.md` density and palette. Design skills never override it.
