# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TabBellus is a Chrome Extension (Manifest V3) — a premium tab/workspace manager ("Spaces", "Read Later", search/command palette) built with React 19, TypeScript, Vite, and Dexie.js (IndexedDB). It ships a Free core plus an isolated Pro subsystem (licensing + Google Drive sync).

Two large living documents are the source of truth and MUST be consulted (and kept current — see "Updating context docs" below):
- `.context.md` — concise manifest of DB schema, services, mandatory abstractions, component map, state management, testing.
- `TABBELLUS_KNOWLEDGE_BASE.md` — fuller history/design record, including phase-by-phase refactor log.
- `DESIGN.md` — the "Sleek Developer Minimalist" visual design system (colors, tokens, layout).

## Commands

```bash
npm run dev          # vite dev server (extension in dev mode)
npm run build         # tsc typecheck + vite production build
npm run preview        # preview built extension
npm test            # vitest run (unit/integration, fake-indexeddb)
npm run test:watch      # vitest watch mode
npm run test:e2e        # builds first, then runs Playwright e2e
npm run release        # hardened 6-stage release pipeline (see below)
```

Run a single test file: `npx vitest run src/lib/__tests__/spaceService.test.ts`
Run tests matching a name: `npx vitest run -t "duplicate"`
Typecheck only: `npx tsc --noEmit`

The `release` script (`scripts/release.js`) cleans stale artifacts, typechecks, runs the full Vitest suite, builds production, sanitizes `dist/` (rejects `.map`/`.md`/`.ts`/`.tsx`, test/mock artifacts, `localhost`/`127.0.0.1` references), validates `manifest.json` (MV3, min Chrome version, full icon set), and zips the bundle via PowerShell `Compress-Archive`.

## Architecture

### Extension shell
- Background service worker: `src/background/index.ts` (+ `discardService.ts`, `badgeService.ts`) — tab/group lifecycle listeners, `chrome.alarms`-driven auto-discard sweep, dynamic badge, native context menus, `Alt+R` read-later capture, active-space auditing on startup/window close.
- Side panel UI: `src/sidepanel/` (main app surface, `default_path` in manifest).
- Popup: `src/popup/`.
- Content script: `src/content/lockGuard.ts` — enforces tab-lock protection (`beforeunload`/nav interception) on `<all_urls>`.
- Manifest is generated dynamically in `manifest.config.ts` via `@crxjs/vite-plugin` (not a static `manifest.json`).

### Data layer
Dexie database `TabBellusDB` (v3) with tables `spaces`, `tabs`, `readLater` (schema documented in `.context.md` §1). All domain access goes through service modules in `src/lib/` (`spaceService`, `tabService`, `bookmarkService`, `mediaService`, `readLaterService`, `dataService`) — **never** raw Dexie queries from components.

### Free/Pro boundary (zero-contamination)
- `src/core/` — Free-owned pure contracts (`contracts/`), a `ContractRegistry` singleton, `useEntitlement`/`useSyncStatus` reactive hooks (`useSyncExternalStore`, fail-open), and the declarative `<FeatureGate>` component.
- `src/pro/` — isolated Pro drivers: `licensing/` (entitlement engine, dev-testing harness gated at compile time), `sync/` (Google Drive OAuth client, REST client, LWW `DiffEngine`, `SyncEngine`, `SyncSettingsCard` UI) that register into `src/core/` registries at runtime.
- **Hard rule:** `src/features/*`, `src/lib/*`, `src/store/*`, `src/sidepanel/*` must never import from `src/pro/*`. The Free build must compile, pass 100% of tests, and run fully with `src/pro/` entirely removed. Pro gating uses `<FeatureGate>` or registry slot lookups — never scattered `if (isPro)`.

### Feature modules
`src/features/{spaces,tabs,read-later,search,settings,history,bookmarks}/` — each uses a barrel `index.ts`. Active-session tab tree uses `react-virtuoso` + `@atlaskit/pragmatic-drag-and-drop` with a flattened 1D `VirtualRow` topology for 1,000+ tab performance; see `.context.md` §4/§6.3 for the render-strategy registry and DnD details.

### State management
- Zustand `useAppStore` — persisted `AppSettings` (theme, badge mode, discard interval, etc.) via a custom Chrome-storage adapter with legacy-safe merge, plus ephemeral `activeSpaces` (Space↔Window 1:1 binding, synced via `chrome.storage.session`).
- Zustand `useTabLockStore` — ephemeral locked-tab set, synced via `chrome.storage.session`.
- Zustand `useUIStore` — dialog/panel open state.
- Full inventory of hooks, services, and slices: `.context.md` §5.

## Mandatory custom abstractions

These exist to prevent duplicated/inconsistent UI patterns. Do not bypass them:

| Never use | Always use |
|---|---|
| `alert()`, `confirm()`, raw inline error text | `useToast()` from `@/components/ui/Toaster` |
| `navigator.clipboard.writeText()` directly | `useClipboard()` from `@/hooks/useClipboard` |
| Raw `<div>` flex rows for tab/space lists | `<InteractiveRow>` compound component from `@/features/tabs/components/InteractiveRow` |
| Raw `<img>` favicons | `<SmartFallbackIcon>` from `@/components/ui/SmartFallbackIcon` (3-tier fallback cascade) |
| Native `title="..."` / raw Radix tooltip boilerplate | `<TooltipSimple>` / `<TooltipOverflow>` from `@/components/ui/Tooltip` |
| Custom context-menu divs | `<ContextMenu>`/`<DropdownMenu>` from `@/components/ui/context-menu` / `dropdown-menu` |
| Raw Dexie queries in components | `spaceService` / `tabService` / `readLaterService` / `dataService` query providers |
| Immediate irreversible deletes | `useUndoDelete()` from `@/hooks/useUndoDelete` |
| Raw `window.open`/unvalidated `chrome.tabs.create` for external links | `handleExternalLink()` / `openSupportHub()` from `@/lib/platform.ts` |
| `bg-input`/`border-input`/other layout tokens on interactive controls | Explicit high-contrast utility classes owned in `src/components/ui/*` (see below) |
| Inline `if (isPro)` in Free view components | `<FeatureGate>` or registry slot lookups against `src/core/contracts/` |

## Design system (see `DESIGN.md` for full detail)

- Flat, high-density, monochromatic HSL palette — pure black/white bases, no `backdrop-filter`/blurs/ambient shadows, solid opaque surfaces, sharp 1px borders, `--radius: 0.5rem`.
- **Structural vs. interactive token separation is load-bearing**: `--background`/`--card`/`--popover`/`--border` are for layout/containers only. Interactive control surfaces (`Switch`, `Checkbox`, `Slider`, `RadioGroup`, menu items) in `src/components/ui/` must use explicit high-contrast Tailwind utilities (e.g. `bg-zinc-300`/`dark:bg-zinc-700` tracks, `bg-white`/`dark:bg-zinc-100` thumbs) instead of `--input`/`--border`/`--muted`, to avoid contrast collapse on OLED-black or pure-white themes. Always preserve Radix state selectors (`data-[state]`, `data-[disabled]`, `focus-visible:*`).
- Transitions limited to `transition-colors`/`transition-opacity` (never `transition-all`) to avoid layout reflow.

## Testing

- Unit/integration: Vitest + `fake-indexeddb`, `node` environment, `@/*` alias, setup in `tests/setup.ts`, spec pattern `src/**/*.test.{ts,tsx}`. Tests live alongside code in `__tests__/` directories per module.
- E2E: Playwright, headed Chromium, specs in `tests/e2e/` (`spaces.spec.ts`, `capture.spec.ts`, `performance.spec.ts`); `npm run test:e2e` builds the extension first.
- List primitives (`TabRow`, `GroupRow`, `SpaceItem`, `ReadLaterItem`) rely on custom `arePropsEqual` memo comparators for virtualization performance — preserve these when touching props shapes.

## Engineering conventions (from `.agents/AGENTS.md`)

- **Verify before writing:** cross-reference property names against `.context.md`/`types.ts` before use (e.g. confirm `isPinned` vs. an assumed `pinned`) — don't trust suggested pseudo-code property names blindly.
- **Safe-Edit Protocol:** prefer surgical, uniquely-anchored patches over full-file rewrites; when refactoring, verify pre-existing safety checks, validation, and edge-case handling (e.g. undo timers, empty states) are preserved, not just replicated in spirit.
- **MVS or KISS:** prefer native Browser APIs; don't add third-party dependencies without explicit need. Local-first only — Dexie/IndexedDB and `chrome.storage.local`/`session`, no external databases/backends outside the Pro Google Drive sync path.
- Event-listener/hook symmetry is enforced project-wide: every subscribing hook must fully unbind (`removeListener`, `disconnect`, `clearTimeout`, mount-guarded async setState).
- Don't commit or push unless explicitly asked.

## Updating context docs

Per `.agents/AGENTS.md` §2, `.context.md` and `TABBELLUS_KNOWLEDGE_BASE.md` must both be updated (with a refreshed "Last Updated" timestamp) whenever: the Dexie schema or Zustand state shape changes, a new feature domain/file/core service is added or refactored, or a new custom UI component/hook/abstraction is created (also add it to the Mandatory Abstractions list above and in `.context.md` §3).
