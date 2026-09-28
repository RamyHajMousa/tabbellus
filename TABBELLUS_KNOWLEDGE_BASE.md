# TabBellus System Knowledge Base & Architectural Reference

This document serves as the durable, comprehensive architectural reference for the TabBellus project. It is intended for human developers and system architects to understand the core subsystems, system boundaries, and design invariants.

For day-to-day coding workflows and API inventories, refer to the working context manifest in [`.context.md`](file:///d:/Projects/tabbellus/.context.md). For agent operational rules and constraints, refer to [`AGENTS.md`](file:///d:/Projects/tabbellus/AGENTS.md). For historical sprint-by-sprint logs, consult [`docs/history/phase-log.md`](file:///d:/Projects/tabbellus/docs/history/phase-log.md).

---

## 1. Project Directory Structure

TabBellus is organized as a local-first Chrome Extension (Manifest V3) built with React 19, TypeScript (strict), Vite (`@crxjs/vite-plugin`), and Tailwind CSS. The repository is partitioned into a Free core and an isolated Pro subsystem:

```
tabbellus/
├── .agents/                    # Scoped agent rules, workflows, and developer skills
│   └── rules/                  # Scoped rules: sync-and-storage.md, mv3.md, testing.md, ui.md
├── AGENTS.md                   # Supreme project governance, architecture invariants & workflow rules
├── .context.md                 # Working context map: custom abstractions, schema, storage keys, services
├── docs/                       # Project documentation & architectural records
│   ├── architecture/           # Architecture Decision Records (ADR-001 to ADR-005)
│   ├── history/                # Historical development logs (phase-log.md)
│   ├── CWS_JUSTIFICATIONS.md   # Chrome Web Store permission justifications
│   └── PRIVACY.md              # Zero-data-collection, local-first privacy policy
├── public/                     # Static icons (16, 32, 48, 128) and manifest assets
├── scripts/                    # Release and build automation (release.js)
├── tests/                      # Testing infrastructure (Vitest setup, Playwright fixtures & E2E)
├── manifest.config.ts          # Manifest V3 configuration (@crxjs/vite-plugin)
├── DESIGN.md                   # Sleek Developer Minimalist UI specification
├── vite.config.ts              # Vite bundler, path aliases, Rollup manual chunking
├── vitest.config.ts            # Vitest unit test configuration (Node environment + fake-indexeddb)
└── src/
    ├── core/                   # Capability interfaces and contract registry (Free Core owns)
    │   ├── contracts/          # Licensing, Sync, and Rules contract definitions
    │   ├── hooks/              # useEntitlement, useSyncStatus, useRules
    │   └── components/         # FeatureGate declarative UI gating primitive
    ├── pro/                    # Isolated Pro drivers, runtime registrations, and headless engine
    │   ├── licensing/          # Entitlement validation, signature verification, and cache manager
    │   ├── sync/               # Cloud sync modules (Drive REST client, diffEngine, syncEngine, E2EE crypto)
    │   ├── rules/              # Tab automation rules engine (matcher, executor, templates, UI cards)
    │   ├── headless.ts         # DOM-free, React-free headless export barrel for service worker
    │   └── index.ts            # Public Pro root barrel & runtime contract registration
    ├── features/               # Feature domain modules (tabs, spaces, read-later, search, settings, history)
    ├── lib/                    # Domain services (spaceService, tabService, readLaterService, dataService, db)
    ├── store/                  # Zustand state stores (appStore, uiStore, tabLockStore)
    ├── components/ui/          # Owned shadcn/ui primitives with explicit high-contrast states
    ├── background/             # Background service worker (index.ts, tabSyncService, rulesDispatcher)
    ├── sidepanel/              # Main side panel container & layout routing (index.tsx, ViewSwitcher)
    └── popup/                  # Browser action popup entry point
```

---

## 2. Core Architectural Pillars

### 2.1 Local-First Storage & Service Layer (ADR-001)
TabBellus operates entirely offline-first with zero mandatory cloud dependencies.
- **Domain Persistence:** Managed via IndexedDB through Dexie.js (`TabBellusDB` v5). Core entities (`spaces`, `tabs`, `readLater`) support schema versioning, compound indexing, and atomic transactions.
- **Settings & UI State:** Managed via `chrome.storage.local` (persisted settings) and `chrome.storage.session` (ephemeral window bindings, lock guards, temporary restore locks).
- **Service Encapsulation:** React UI components never execute raw IndexedDB queries; all operations flow through domain services (`spaceService`, `tabService`, `readLaterService`).
- *See:* [`docs/architecture/ADR-001-local-first-data-architecture.md`](file:///d:/Projects/tabbellus/docs/architecture/ADR-001-local-first-data-architecture.md).

### 2.2 Zero-Contamination Pro Boundary & Micro-Kernel Design (ADR-002)
The codebase strictly separates the open Free core from the proprietary Pro subsystem.
- **Boundary Invariant:** Free core code never imports from `src/pro/*` or contains Pro business logic.
- **Two Permitted Entry Points:**
  1. `src/sidepanel/index.tsx` dynamically imports `@/pro` on mount via dynamic `import()`.
  2. `src/background/index.ts` statically imports `rulesEngine` exclusively from `@/pro/headless` (due to the HTML spec disallowing dynamic imports in `ServiceWorkerGlobalScope`).
- **Vendor Chunk Isolation:** Rollup `manualChunks` in `vite.config.ts` divides `vendor-react`, `vendor-dexie`, `vendor-ui`, `vendor-dnd`, and `vendor-virtuoso`, ensuring the service worker bundle remains completely free of React and DOM dependencies.
- *See:* [`docs/architecture/ADR-002-zero-contamination-pro-boundary.md`](file:///d:/Projects/tabbellus/docs/architecture/ADR-002-zero-contamination-pro-boundary.md).

### 2.3 Decentralized Cloud Sync & Conflict Reconciliation (ADR-003)
Pro synchronization uses the user's private Google Drive `appDataFolder` without intermediary servers.
- **LWW Diffing & Soft Deletes:** Resolves concurrent edits using record-level Last-Write-Wins and `deletedAt` tombstones.
- **Linear O(N) Tab Indexing:** Tabs are matched across devices via composite `${spaceId}:::${normalizedUrl}` hash maps, avoiding quadratic scanning loops during synchronization.
- **Pre-Flight Version Guard & OCC Retry Loop:** Drive v3 file uploads check the expected remote version before committing; conflicts trigger randomized jitter backoff (`250ms + Math.random() * 500ms`) and re-reconciliation up to 3 retries.
- **Anti-Echo Guard:** Remote snapshot ingestion into Dexie bypasses local mutation notifications to prevent recursive sync cascades.
- *See:* [`docs/architecture/ADR-003-drive-sync-reconciliation.md`](file:///d:/Projects/tabbellus/docs/architecture/ADR-003-drive-sync-reconciliation.md).

### 2.4 Headless Background Tab Automation (ADR-004)
Tab automation rules run continuously in the Manifest V3 background service worker.
- **Always-On Dispatching:** `rulesDispatcher` monitors Chrome tab creation and update events, evaluating tabs against user-defined rules even when the sidepanel is closed.
- **Cross-Context Storage Sync:** Background and sidepanel singletons stay synchronized in real time via `chrome.storage.onChanged` listeners.
- **ReDoS Safety:** Conditions are evaluated with length and complexity limits to protect the single-threaded service worker from catastrophic regex backtracking.
- *See:* [`docs/architecture/ADR-004-rules-engine-background-service-worker.md`](file:///d:/Projects/tabbellus/docs/architecture/ADR-004-rules-engine-background-service-worker.md).

### 2.5 End-to-End Encryption (E2EE) Sync Vault (ADR-005)
Optional cryptographic protection for synced cloud workspaces.
- **WebCrypto Primitives:** PBKDF2 key derivation (600,000 iterations, SHA-256) and AES-GCM 256-bit authenticated encryption.
- **Zero Passphrase Persistence:** The passphrase is never stored on disk or in persistent storage. The derived key exists only in memory and ephemeral `chrome.storage.session`.
- **Locked State & Peer Downgrade:** Safe transitions prevent overwriting unencrypted local data when remote vaults are locked, and automatically adjust when encryption is toggled off on another device.
- *See:* [`docs/architecture/ADR-005-e2ee-sync-vault.md`](file:///d:/Projects/tabbellus/docs/architecture/ADR-005-e2ee-sync-vault.md).

---

## 3. Architecture Decision Records (ADRs)

Detailed rationale, trade-offs, and implementation mechanics are cataloged in `docs/architecture/`:

| ADR | Title | Key Mechanism Citations | Status |
|---|---|---|---|
| [**ADR-001**](file:///d:/Projects/tabbellus/docs/architecture/ADR-001-local-first-data-architecture.md) | Local-First IndexedDB and chrome.storage Architecture | `src/lib/db.ts:1-70`, `src/lib/spaceService.ts`, `src/store/appStore.ts` | Accepted |
| [**ADR-002**](file:///d:/Projects/tabbellus/docs/architecture/ADR-002-zero-contamination-pro-boundary.md) | Zero-Contamination Pro Boundary & Service Worker Chunking | `src/background/index.ts:11`, `src/sidepanel/index.tsx:58`, `vite.config.ts:36-55` | Accepted |
| [**ADR-003**](file:///d:/Projects/tabbellus/docs/architecture/ADR-003-drive-sync-reconciliation.md) | Google Drive Sync Reconciliation & Conflict Resolution | `src/pro/sync/engine/diffEngine.ts:246, 438`, `src/pro/sync/engine/syncEngine.ts` | Accepted |
| [**ADR-004**](file:///d:/Projects/tabbellus/docs/architecture/ADR-004-rules-engine-background-service-worker.md) | Tab Automation Rules Engine in Background Service Worker | `src/background/rulesDispatcher.ts`, `src/pro/rules/engine/rulesEngine.ts:35-54` | Accepted |
| [**ADR-005**](file:///d:/Projects/tabbellus/docs/architecture/ADR-005-e2ee-sync-vault.md) | End-to-End Encryption (E2EE) Sync Vault | `src/pro/sync/crypto/webCrypto.ts`, `src/pro/sync/crypto/keyStore.ts` | Accepted |

---

## 4. Design System & UI Specifications

TabBellus adheres to a **Sleek Developer Minimalist** design standard, optimized for density, visual speed, and zero-jank 60 FPS scrolling.
- **Visual Design Specifications:** Curated HSL color palette, typography hierarchy (Outfit headers, Inter body), solid matte surfaces without expensive CPU blur filters (`backdrop-filter`), and sharp 1px structural borders. See [`DESIGN.md`](file:///d:/Projects/tabbellus/DESIGN.md).
- **Component Ownership Model:** Primitives in `src/components/ui/` are owned source code. Interactive affordances (switches, checkboxes, sliders) define explicit high-contrast states (`bg-zinc-300`/`dark:bg-zinc-700` tracks, `bg-white`/`dark:bg-zinc-100` thumbs) that never collapse on OLED dark (`hsl(0 0% 0%)`) or pure white light modes. See [`.agents/rules/ui.md`](file:///d:/Projects/tabbellus/.agents/rules/ui.md).

---

## 5. Quality Assurance & Testing Infrastructure

- **Unit & Integration Testing (Vitest):** Tests run in a pure Node environment with `fake-indexeddb/auto` mocks. Component testing utilizes `renderToString` for structural validation, while interactive workflows are tested through decoupled pure functions. See [`.agents/rules/testing.md`](file:///d:/Projects/tabbellus/.agents/rules/testing.md).
  - Command: `npm test`
- **End-to-End Testing (Playwright):** Headed Chromium instances validate sidepanel flows, window binding, and performance against production extension bundles.
  - Command: `npm run test:e2e`

---

## 6. Release & Security Pipeline

- **Manifest V3 Security:** Strict adherence to Chrome Extension Manifest V3 specifications. No `eval`, no remotely hosted code, minimal host permissions, and dynamic development key injection. See [`manifest.config.ts`](file:///d:/Projects/tabbellus/manifest.config.ts), [`docs/CWS_JUSTIFICATIONS.md`](file:///d:/Projects/tabbellus/docs/CWS_JUSTIFICATIONS.md), and [`docs/PRIVACY.md`](file:///d:/Projects/tabbellus/docs/PRIVACY.md).
- **6-Stage Production Pipeline (`scripts/release.js`):**
  1. Clean `dist/` and prior zip artifacts.
  2. TypeScript typecheck (`tsc --noEmit`).
  3. Vitest test suite (`vitest run`).
  4. Production build (`vite build --mode production`).
  5. Bundle sanitization & security scan (verifies no forbidden extensions, test artifacts, or localhost dev endpoints exist in `dist/`).
  6. PowerShell native archiving (`Compress-Archive`) creating production release zip.
  - Command: `npm run release`

---

## 7. Historical Development & Phase Archives

A detailed historical record of all completed engineering phases, performance refactoring sprints, architectural alignment audits, and hotfixes is preserved in the phase log archive:
- Consult [`docs/history/phase-log.md`](file:///d:/Projects/tabbellus/docs/history/phase-log.md) for chronological sprint logs (Phases 1–56).

<!-- Last Updated: 2026-09-28 -->
