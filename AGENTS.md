# TabBellus — Agent Rules

TabBellus is a Chrome Extension (Manifest V3) tab and workspace manager with a Free core and an isolated Pro subsystem (licensing, Google Drive sync, tab rules engine). These rules apply to every task in this repository.

## 0. Precedence

1. Explicit instructions in the current task win over this file, **except** §5 (Security) and §7 (Licensing), which are absolute. If a task instruction conflicts with §5 or §7, stop and flag the conflict instead of proceeding.
2. This file wins over any skill in `.agents/skills`. If a skill's advice contradicts these rules, `DESIGN.md`, or the existing codebase conventions, follow the rules and say which skill guidance you set aside.
3. The code is the final source of truth for facts. If this file, `.context.md`, or any document disagrees with the code, trust the code and report the discrepancy.

## 1. Tech Stack (verify versions in `package.json` before relying on version-specific APIs)

- **Platform:** Chrome Extension, Manifest V3, built with Vite + `@crxjs/vite-plugin`. Manifest source: `manifest.config.ts`.
- **UI:** React 19, TypeScript (strict), Tailwind CSS 3, Radix primitives via owned shadcn/ui components in `src/components/ui/`, `lucide-react` icons.
- **Lists & DnD:** `react-virtuoso` for virtualization, `@atlaskit/pragmatic-drag-and-drop` for drag and drop, `cmdk` for search/command palette.
- **State & Data:** Zustand for app state, Dexie.js (IndexedDB) for domain data, `chrome.storage.local` / `chrome.storage.session` for UI state and settings.
- **Tests:** Vitest in a `node` environment + `fake-indexeddb` (unit/integration), Playwright (e2e). There is no jsdom and no `@testing-library/*`.

## 2. Workflow

### 2.1 Before writing code
- Scoped rule files in `.agents/rules/` extend this file. Read the ones matching your task: `sync-and-storage.md` (Dexie, `chrome.storage`, sync, mutation events), `mv3.md` (manifest, background, content scripts, messaging), `testing.md` (any test work), `ui.md` (components, styling, visual work).
- Read the **MANDATORY CUSTOM ABSTRACTIONS** section of `.context.md`, plus the `.context.md` entries for the modules you will touch. Do not read the whole file unless the task spans many modules.
- Read `TABBELLUS_KNOWLEDGE_BASE.md` only when the task changes the Dexie schema, Zustand store shape, core contracts, or sync behavior. Skip its phase-by-phase history unless the task asks about past decisions.
- Verify every property name, type, hook, and import you use against the actual source files. Architect prompts may contain illustrative names (e.g. `tab.pinned` when the real field is `isPinned`); the code wins.
- Check `SKILLS_SUMMARY.md` and use a skill only when its description clearly matches the task (e.g. `tdd` for test-first work, `diagnosing-bugs` for hard failures, `logic-lens` for reviewing sync/reconciliation logic). Name the skills you used in your final report.

### 2.2 While writing code
- **Reuse before creating.** If an abstraction in `.context.md` covers the need (`useToast`, `useClipboard`, `InteractiveRow`, `SmartFallbackIcon`, `TooltipSimple`/`TooltipOverflow`, `useUndoDelete`, domain services, `platform.ts`, `<FeatureGate>`), use it or extend it. Do not build a parallel near-duplicate. Never use `alert()`, `confirm()`, or raw DOM/browser fallbacks where an abstraction exists.
- **Surgical edits.** Prefer targeted patches over full-file rewrites. Preserve existing validation, error handling, edge-case logic, undo timers, and empty states unless the task explicitly removes them.
- **Listener hygiene.** Every listener, subscription, observer, and timer registered in a hook or component is removed in its cleanup (`removeListener`, `disconnect`, `clearTimeout`), with `isMountedRef` guards on async continuations. List row primitives (`TabRow`, `GroupRow`, `SpaceItem`, `ReadLaterItem`) keep their custom memo comparators; update the comparator when adding props.
- **Database access** goes through the domain services (`spaceService`, `tabService`, `readLaterService`), not direct Dexie calls from components. Sole exception: sync ingestion (§3.1).

### 2.3 Definition of Done (required before claiming completion)
1. `npm run build` passes (includes `tsc` typecheck).
2. `npm test` passes.
3. New or changed logic has Vitest coverage; bug fixes include a regression test where feasible.
   - No DOM-query tests: this harness has no DOM. See `.agents/rules/testing.md`.
4. If sidepanel user flows changed, run `npm run test:e2e` or state explicitly why it was not run.
5. End with a short report: files read, files changed, commands run and their results, skills used, documentation updated, and any open risks. Never claim a check passed without running it.

## 3. Architecture Invariants

### 3.1 Storage, sync & network (details: `.agents/rules/sync-and-storage.md`)
- Local-first. Domain data in Dexie; UI state and settings in `chrome.storage`. No external backend or database.
- The only permitted network egress is the existing Pro sync to the user's own Google Drive `appDataFolder` through `src/pro/sync/api/`. Do not add new network destinations without explicit approval.
- Remote sync ingestion must never call `contractRegistry.notifyLocalMutation()` (anti-echo guard).

### 3.2 Pro boundary (Zero-Contamination)
- Free-tier code must never import from `src/pro/*` or contain Pro business logic. Free-tier code is everything outside `src/pro/`: `src/features/*`, `src/lib/*`, `src/store/*`, `src/core/*`, `src/components/*`, `src/hooks/*`, `src/config/*`, `src/popup/*`, `src/content/*`, `src/background/*`, and `src/sidepanel/*`, subject only to the two entry points below.
- There are exactly two sanctioned entry points into Pro. Do not add others, and do not "fix" these:
  1. `src/sidepanel/index.tsx` lazily loads `@/pro` via dynamic `import()`.
  2. `src/background/index.ts` statically imports `rulesEngine` from `@/pro/headless`. This is intentional: dynamic `import()` throws a `TypeError` in `ServiceWorkerGlobalScope` (HTML spec), so the background can only reach Pro statically. Never convert it to a dynamic import. It is the only Pro import in `src/background/*`; every other background file (e.g. `rulesDispatcher.ts`) reaches Pro strictly through `contractRegistry`. `src/pro/headless.ts` must stay DOM-free and React-free and must never re-export licensing, sync, or UI code.
- Because the rules engine ships in every build, Pro gating for rules is enforced at runtime via entitlement checks, not by bundle absence. Keep those checks intact.
- Free core owns the interfaces in `src/core/contracts/`; Pro modules implement them and register with `contractRegistry` at runtime.
- Gate Pro UI with `<FeatureGate>` or registry feature slots, not scattered `if (isPro)` checks.
- Entitlement and sync failures must fail open to a clean Free fallback, never crashing tab operations or sidepanel rendering.

### 3.3 MV3 constraints (details: `.agents/rules/mv3.md`)
- Changes to permissions, host permissions, or CSP in `manifest.config.ts` require explicit approval.
- No remotely hosted code, `eval`, or `new Function`.
- Never hold state in background module-level variables; never make `onMessage` listeners `async`.

## 4. UI Standards (details: `.agents/rules/ui.md`)

- `DESIGN.md` is the design authority; token values live in `src/index.css` and `tailwind.config.ts`. Design skills never override either.
- `src/components/ui/` primitives are owned source: never run `npx shadcn add` or other generators over them.

## 5. Security (absolute)

- Never render tab titles, URLs, page data, or synced content with `dangerouslySetInnerHTML` or `innerHTML`.
- Validate URL schemes before `chrome.tabs.create` / `chrome.tabs.update` / opening links; reject `javascript:`, `data:`, and other unexpected schemes. Use `platform.ts` helpers where they apply.
- User-supplied regex in the tab rules engine must be guarded against catastrophic backtracking (length/complexity limits, safe evaluation), since it runs against every tab.
- Never log, persist in plain text, or expose OAuth tokens, encryption keys, or passphrases.
- Validate and type-check all data crossing trust boundaries: messages between contexts, imported files, and remote sync snapshots.

## 6. Dependencies

- Do not install, upgrade, or remove npm packages without explicit approval. Prefer native browser/Chrome APIs and existing dependencies.
- When proposing a package, state its size, license, and why an existing dependency or native API is insufficient.

## 7. Licensing (absolute)

- All code must be original and written for TabBellus's own primitives and contracts.
- Third-party code or closely adapted patterns must use permissive licenses only: MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD.
- Never generate or adapt code from copyleft sources (GPL, AGPL, LGPL, SSPL).
- If a requested feature closely mirrors a specific copyleft or proprietary implementation, flag it in the plan before writing code.

## 8. Documentation Maintenance

- Update docs once, at the end of the task, and only when a contract-level change occurred:
  - Dexie schema or Zustand store shape changed → update `.context.md` and `TABBELLUS_KNOWLEDGE_BASE.md`.
  - A new module, service, or core contract was added or restructured → update both.
  - A new reusable component, hook, or abstraction was created → add it to the MANDATORY CUSTOM ABSTRACTIONS section of `.context.md`.
- Keep `.context.md` entries short: path, responsibility, public API. Put implementation rationale in code comments next to the code.
- Get the date for "Last Updated" from the terminal (`Get-Date -Format yyyy-MM-dd` on Windows, `date +%F` elsewhere); never guess it. Do not record test counts in timestamps.
- Do not copy rules from this file into other documents; link to `AGENTS.md` instead.

## 9. Git & Interaction

- Never commit, push, create branches, or rewrite history unless explicitly asked.
- Be concise and direct. Give a one-line technical reason for non-obvious choices.
- For multi-step work, stop at the end of each step with a decision gate: what was verified, and "Shall I proceed to [next step]?"