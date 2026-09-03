# TabBellus Project Knowledge Base & Source of Truth

This document serves as the comprehensive Source of Truth for the TabBellus project context. It is designed to act as an indexing reference for AI agents and human developers, outlining the codebase architecture, design tokens, configuration files, structural constraints, recent architectural alignment phases, and roadmap.

---

## 1. Project Directory Structure

The codebase is structured around a local-first, domain-centric model using React 19, TypeScript, Vite (@crxjs/vite-plugin), and Tailwind CSS. The folder hierarchy is organized as follows:

```
tabbellus/
├── .agents/                    # Custom agent instructions, supreme rules, and specialized skills
│   ├── AGENTS.md               # Supreme Override project rules & architectural boundaries
│   └── skills/                 # Internal specialized skills (logic-lens, brooks-lint, etc.)
├── .context.md                 # Active Project Context Manifest & API abstractions
├── .vscode/                    # IDE settings and project recommendations
├── docs/                       # Reviewer-ready CWS justifications & zero-data-collection privacy policy
│   ├── CWS_JUSTIFICATIONS.md   # Line-by-line API and <all_urls> host permissions justification matrix
│   └── PRIVACY.md              # Public zero-data-collection, local-first privacy policy
├── public/                     # Static assets, icons, and unpacked extension resources
├── scripts/                    # Release and build packaging automation (release.js)
├── tests/                      # Testing infrastructure and fixtures
│   ├── e2e/                    # Playwright end-to-end tests (spaces, capture, performance)
│   ├── fixtures/               # Extension loader fixtures for browser test runners
│   └── setup.ts                # Vitest global Chrome API mocks and test setup
├── components.json             # shadcn/ui primitive configuration
├── DESIGN.md                   # Visual design & layout specifications
├── manifest.config.ts          # Chrome Extension Manifest V3 configuration (@crxjs/vite-plugin)
├── package.json                # Project dependencies, test scripts, and build pipeline
├── playwright.config.ts        # Playwright E2E configuration for Chromium extension runner
├── postcss.config.js           # PostCSS compiler configuration
├── SKILLS_SUMMARY.md           # Skills inventory and status reference
├── TABBELLUS_KNOWLEDGE_BASE.md # Comprehensive system knowledge base & source of truth
├── tailwind.config.ts          # Tailwind CSS compiler configuration and design tokens
├── tsconfig.json               # Main TypeScript project compiler configuration
├── tsconfig.node.json          # Node/tooling TypeScript compiler configuration
├── vite.config.ts              # Vite bundler configuration (CRXJS plugin & manual chunking)
├── vitest.config.ts            # Vitest unit and integration test configuration
└── src/
    ├── core/                   # Pure TypeScript interfaces & extension registry contracts (Free Core owns)
    │   ├── contracts/          # Core capability interfaces and registration models
    │   │   ├── index.ts        # EntitlementStatus, LicensingContract, ProModule, FeatureSlotRegistration, Sync interfaces
    │   │   ├── sync.ts         # SyncState, SyncTelemetry, SyncStatus, SyncResult, SyncProvider contract
    │   │   ├── rules.ts        # ConditionField/Operator, RuleCondition, ActionType, RuleAction, TabRule, RuleEvaluationResult, RulesContract
    │   │   └── registry.ts     # ContractRegistry singleton, NullLicensingEngine, NullSyncProvider, NullRulesEngine, reactive subscription dispatchers
    │   ├── hooks/
    │   │   ├── useEntitlement.ts # Reactive hook querying active licensing provider with fail-open fallback
    │   │   ├── useSyncStatus.ts  # Reactive hook querying active sync provider with fail-open fallback
    │   │   └── useRules.ts       # Reactive hook querying active rules provider; saveRules() + applyRulesToWindow() (chrome.runtime message to background dispatcher)
    │   ├── components/
    │   │   └── FeatureGate.tsx # Declarative UI feature gating primitive
    │   ├── __tests__/          # registry.test.ts (36), FeatureGate.test.tsx (5), useSyncStatus.test.tsx (3), useRules.test.tsx (10)
    │   └── index.ts            # Public Free Core export barrel
    ├── pro/                    # Isolated Pro drivers, runtime registrations, and licensing engine
    │   ├── licensing/          # Entitlement validation, signature verification, and cache manager
    │   ├── sync/               # Cloud synchronization modules (Google Drive, E2EE)
    │   │   ├── api/            # Google Drive Auth & REST API client layer
    │   │   │   ├── types.ts    # DriveFileMetadata, DriveFileListResponse, DriveApiResult<T>, VaultPayload
    │   │   │   ├── googleAuthClient.ts  # OAuth2 token lifecycle (chrome.identity wrapper)
    │   │   │   ├── googleDriveClient.ts # Drive v3 REST client (appDataFolder CRUD, 401 auto-recovery)
    │   │   │   ├── index.ts    # Barrel re-export
    │   │   │   └── __tests__/  # googleAuthClient.test.ts (13 tests), googleDriveClient.test.ts (16 tests)
    │   │   ├── engine/         # Snapshot serialization & LWW reconciliation engine layer
    │   │   │   ├── types.ts    # SyncVaultSnapshot, ReconciliationResult, SyncStorageState
    │   │   │   ├── snapshotSerializer.ts # Dexie transaction extraction, atomic bulkPut updates, schema validation
    │   │   │   ├── diffEngine.ts         # Record-level LWW diffing, soft-delete tombstones, FK remapping
    │   │   │   ├── syncEngine.ts         # SyncProvider implementation, 8-step syncNow orchestration, storage state
    │   │   │   ├── index.ts    # Barrel re-export
    │   │   │   └── __tests__/  # snapshotSerializer.test.ts (7 tests), diffEngine.test.ts (16 tests), syncEngine.test.ts (15 tests)
    │   │   ├── crypto/         # Pure WebCrypto E2EE primitives & ephemeral session key store
    │   │   │   ├── types.ts    # EncryptedVaultEnvelope, KeyStoreRecord, CryptoErrorCode, CryptoEngineError
    │   │   │   ├── webCrypto.ts # WebCryptoEngine (PBKDF2 600k, AES-GCM 256, chunked Base64, auth tag validation)
    │   │   │   ├── keyStore.ts  # SessionKeyStore (chrome.storage.session key lifecycle & in-memory caching)
    │   │   │   ├── index.ts    # Barrel re-export
    │   │   │   └── __tests__/  # webCrypto.test.ts (17 tests), keyStore.test.ts (7 tests)
    │   │   ├── components/     # UI cards and slot components
    │   │   │   ├── SyncSettingsCard.tsx # Google Drive sync management card for Data tab
    │   │   │   ├── index.ts             # Barrel re-export
    │   │   │   └── __tests__/           # SyncSettingsCard.test.tsx (4 tests)
    │   │   └── index.ts        # Public Pro sync root barrel export
    │   ├── rules/               # Tab automation rules engine (condition matching + Chrome side-effect actions)
    │   │   ├── engine/
    │   │   │   ├── matcher.ts   # RuleMatcher — ReDoS-safe condition evaluator (equals/contains/startsWith/endsWith/wildcard/regex)
    │   │   │   ├── executor.ts  # RuleExecutor — pin/mute/discard/group/space Chrome action dispatcher
    │   │   │   └── rulesEngine.ts # RulesEngine singleton — hydration, priority-ordered first-match evaluation, subscribers
    │   │   ├── storage/
    │   │   │   ├── ruleStorage.ts # chrome.storage.sync persistence with chrome.storage.local fallback
    │   │   │   └── templates.ts   # RULE_TEMPLATES starter presets (Development, Google Workspace, Media & Streaming, Documentation)
    │   │   ├── components/      # Settings UI — Behavior tab feature slot `behavior-tab-rules`
    │   │   │   ├── RuleManagerCard.tsx   # Header actions (Apply Rules Now / Templates / New Rule), rule list (reorder, toggle, edit, delete)
    │   │   │   ├── RuleEditorModal.tsx   # Create/edit Radix Dialog — name, match mode, condition/action row builders, save gate
    │   │   │   ├── ConditionRow.tsx      # Field/operator/value/case-sensitivity condition row with live regex validation
    │   │   │   ├── ActionRow.tsx         # Action-type row; group reveals name+ColorPickerGrid, space reveals useSpaces() dropdown
    │   │   │   ├── TemplatePickerModal.tsx # RULE_TEMPLATES picker with 1-click "Add Rule" instantiation
    │   │   │   ├── ruleListActions.ts    # Pure: sortByPriority, toggleRuleEnabled, moveRulePriority, removeRuleById, insertRule, summarizeRule, runApplyRulesNow
    │   │   │   ├── ruleEditorLogic.ts    # Pure: buildInitialDraft, isValidRegexPattern, validateRuleDraft, row add/update/remove, buildRuleFromDraft
    │   │   │   ├── templateActions.ts    # Pure: instantiateTemplate, runAddTemplate
    │   │   │   ├── index.ts     # Barrel re-export
    │   │   │   └── __tests__/   # RuleManagerCard.test.tsx (12), RuleEditorModal.test.tsx (21), TemplatePickerModal.test.tsx (8)
    │   │   ├── index.ts         # Barrel re-export of matcher, executor, storage, templates, engine, components
    │   │   └── __tests__/       # matcher.test.ts (24), executor.test.ts (12), ruleStorage.test.ts (7), rulesEngine.test.ts (10)
    │   └── [modules]/          # Isolated Pro capability implementations
    ├── background/             # MV3 background service workers & lifecycle controllers
    │   ├── badgeService.ts     # Extension action badge updater for active tabs and audio state
    │   ├── discardService.ts   # Tab auto-discarding and memory reclamation engine
    │   ├── rulesDispatcher.ts  # Tab automation rules listener/dispatcher (RulesDispatcher, isRuleEligibleUrl) — resolves engine via contractRegistry.getRulesProvider(), zero src/pro/ imports
    │   ├── index.ts            # Service worker bootstrap, tab/window listeners, context menus, shortcuts
    │   └── __tests__/          # badge.test.ts (3 tests), rulesDispatcher.test.ts (25 tests)
    ├── components/             # Reusable UI primitives and layout helpers
    │   ├── ui/                 # Radix / shadcn-derived visual primitives (Component Ownership Model)
    │   │   ├── Command.tsx           # Command palette input and group list container
    │   │   ├── context-menu.tsx      # Radix context menu primitive
    │   │   ├── Dialog.tsx            # Radix modal dialog primitive
    │   │   ├── dropdown-menu.tsx     # Radix dropdown menu primitive
    │   │   ├── popover.tsx           # Radix popover floating panel primitive
    │   │   ├── SmartFallbackIcon.tsx # High-performance favicon cache cascade with fallback initials
    │   │   ├── switch.tsx            # High-contrast accessible toggle switch
    │   │   ├── tabs.tsx              # Radix tabs navigation primitive
    │   │   ├── Toaster.tsx           # Sonner-based notification toast container
    │   │   └── Tooltip.tsx           # Radix tooltip wrapper
    │   └── ErrorBoundary.tsx   # React error boundary component for graceful degradation
    ├── config/                 # Static configuration and external endpoints
    │   └── links.ts            # Centralized external links, support hub, and donation URLs
    ├── content/                # Injected content scripts
    │   └── lockGuard.ts        # Injected script providing tab-close protection / beforeunload lock guard
    ├── features/               # Domain-specific logic & feature sub-systems (using Barrel imports)
    │   ├── bookmarks/          # Browser bookmarks popover tree explorer with search
    │   │   └── BookmarkPopoverContent.tsx
    │   ├── history/            # Chrome session retrieval, space fingerprinting, and window restoration
    │   │   └── HistoryDialog.tsx
    │   ├── read-later/         # Inbox queue for deferred reading lists with aging indicators
    │   │   ├── components/     # ReadLaterItem, ReadLaterToolbar
    │   │   ├── ReadLaterList.tsx
    │   │   └── index.ts
    │   ├── search/             # OmniSearch 2.0 executable command palette & zero-state launchpad
    │   │   ├── components/     # CommandItemRow, LaunchpadRows, SearchItemRow, SearchSectionHeader
    │   │   ├── hooks/          # useCommandExecutor, useLaunchpadData, useOmniSearchData
    │   │   ├── registry/       # commandRegistry.ts (executable command dispatcher & metadata)
    │   │   ├── utils/          # searchUtils.ts (score-based multi-token fuzzy matching)
    │   │   ├── OmniSearch.tsx  # Command-K modal search palette
    │   │   ├── types.ts        # Search & command action type definitions
    │   │   └── index.ts
    │   ├── settings/           # Modular settings dialog (Appearance, Behavior, Data, Support)
    │   │   ├── components/     # AppearanceTab, BehaviorTab, DataTab, SupportTab
    │   │   ├── hooks/          # useStorageTelemetry.ts (IndexedDB storage breakdown calculation), useSlotComponents.ts (shared Pro feature-slot loader→React.lazy resolver, used by DataTab & BehaviorTab)
    │   │   ├── SettingsDialog.tsx
    │   │   └── index.ts
    │   ├── spaces/             # Workspace listing, 4-tier sorting, and space lifecycle
    │   │   ├── components/     # ColorPickerGrid, CreateSpaceModal, EditSpaceDialog, SpaceDropzoneOverlay, SpaceItem, SpaceSelectorModal, SpacesToolbar
    │   │   ├── hooks/          # useAddToSpaceAction.ts
    │   │   ├── SpaceList.tsx   # Spaces main view with drag-and-drop, inline actions & context menus
    │   │   ├── useSpaces.ts    # Dexie live query integration hook for spaces & tabs
    │   │   └── index.ts
    │   └── tabs/               # Active window tab lists, drag-and-drop trees, groups & media control
    │       ├── components/     # ActiveToolbar, AnimatedAudioIcon, AudioControlPopover, GroupRow, InteractiveRow, SessionInsightsBar, TabRow, ZoomControlPopover, dnd/
    │       ├── hooks/          # useActiveMediaSession, useAudioTabs, useCurrentTabs, useDuplicateTabs, useGroupLifecycle, useTabLifecycle, useWindowId
    │       ├── store/          # tabLockStore.ts (Zustand store for tab lock states)
    │       ├── utils/          # groupingUtils.ts (native group mapping & ordering)
    │       ├── ActiveSession.tsx # Active tab session view with drag-and-drop reordering
    │       ├── types.ts        # Tab & group view-model type definitions
    │       └── index.ts
    ├── hooks/                  # Global shared React hooks
    │   ├── useActiveSpacesSync.ts # Syncs open window space associations with chrome.storage.local
    │   ├── useClipboard.ts        # Safe clipboard copy utility with timed feedback
    │   ├── useCurrentSpace.ts     # Live query hook resolving active space for current window
    │   ├── useIsTruncated.ts      # ResizeObserver-based text truncation detector for tooltips
    │   └── useUndoDelete.ts       # Unified deletion workflow with undo toast callbacks
    ├── lib/                    # Core service layer, database engine & utility library
    │   ├── bookmarkService.ts  # Chrome bookmarks tree explorer wrapper
    │   ├── colors.ts           # Chrome tab group color token mappings & UI badges
    │   ├── dataService.ts      # IndexedDB backup, single-space JSON export, import & reset
    │   ├── dateUtils.ts        # Intl.RelativeTimeFormat, staleness checking, timestamp normalization
    │   ├── db.ts               # Dexie.js database schema & table models (spaces, tabs, readLater)
    │   ├── mediaService.ts     # Media playback controller script injector (video/audio play/pause)
    │   ├── platform.ts         # OS/Browser detection, dynamic keybindings, safe external link handler
    │   ├── readLaterService.ts # Read later CRUD, atomic batch archiving, ghost state migration
    │   ├── sessionUtils.ts     # Closed window session recovery & fuzzy URL matching algorithms
    │   ├── spaceService.ts     # Space capture, restore, tab moving/copying, and query providers
    │   ├── tabService.ts       # Focus-or-create URL routing, duplicate detection, tab zoom control
    │   ├── usageTracker.ts     # Privacy-respecting local feature interaction counters for launchpad
    │   ├── utils.ts            # clsx and tailwind-merge helper
    │   └── index.ts            # Barrel export for lib services
    ├── popup/                  # Browser action popup entry point
    │   ├── index.html          # Popup HTML shell
    │   └── index.tsx           # Popup React root
    ├── sidepanel/              # Main side panel container & layout routing
    │   ├── components/         # ActiveSpaceAnchor, GlobalHeader, ViewSwitcher
    │   ├── index.html          # Sidepanel HTML entry point
    │   └── index.tsx           # Sidepanel React root, provider tree & view router
    ├── store/                  # Zustand global stores
    │   ├── appStore.ts         # AppSettings, active window spaces, auto-discard policies & persistence
    │   └── uiStore.ts          # Active view navigation, OmniSearch modal state, search query
    └── index.css               # Base Tailwind CSS, HSL design tokens & dark mode color definitions
```

---

## 2. Design System Blueprint

TabBellus adheres to a **Sleek Developer Minimalist** design standard, optimizing for visual speed and information density by removing translucency blurs, drop shadows, and ambient decorations.

### 2.1 Visual & Color Tokens (HSL)
*   **Background (Light Mode):** `hsl(0 0% 100%)` (Pure Solid White)
*   **Background (Dark Mode):** `hsl(0 0% 0%)` (Pure Pitch Black Base)
*   **Card/Surface (Dark Mode):** `hsl(0 0% 3%)` (Solid Flat Matte Charcoal)
*   **Popover/Dialogs (Dark Mode):** `hsl(0 0% 5%)` (Solid High-Contrast Floating Overlay Base)
*   **Foreground / Primary Text:** `hsl(0 0% 98%)` (Pure White Text)
*   **Secondary Text:** `hsl(0 0% 63.9%)` (Zinc Muted Silver)
*   **Border / Divider:** `hsl(0 0% 15%)` (Crisp 1px Structural Line)
*   **Hover State (Dark Mode):** `hsl(0 0% 9%)` (Dense Hover Row Background)
*   **Accent / Focus Accent (Light Mode):** `hsl(0 0% 9%)` (Solid dark charcoal)
*   **Accent / Focus Accent (Dark Mode):** `hsl(0 0% 98%)` (Pure white/silver)

### 2.2 Typography Hierarchy
*   **Font Family:** `Inter, Outfit, sans-serif`
*   **Headers:** `1.125rem` (18px) Semi-Bold (Outfit)
*   **Context Bars / Active Space Anchor:** `0.875rem` (14px) Medium (Inter)
*   **Row Items / Tab Rows:** `0.8125rem` (13px) Regular (Inter)
*   **Actions / Metadata Tags:** `0.625rem` (10px, `text-xxs`) Medium (Inter)

### 2.3 Render Performance Constraints
*   **No Alpha Blurs or Filters:** Background layers must be solid and opaque (`bg-popover`, `bg-card`). No `backdrop-filter` or alpha transparencies are allowed to avoid expensive CPU layer re-draws in side panels.
*   **Sharp 1px Borders:** Spatial grouping is achieved purely using sharp borders (`border-border`) instead of ambient shadow filters.
*   **Rounded Geometry:** Standardized around a fixed `--radius: 0.5rem` design token (`rounded-md`, `rounded-lg`).
*   **Transition Boundaries:** Interactivity transitions are strictly limited to HSL colors or opacity (`transition-colors`, `transition-opacity`) to avoid reflows triggered by changing dimensions.

### 2.4 UI Primitive Component Ownership Rule
Headless Radix/shadcn UI primitives residing in `src/components/ui/` (such as `<Switch>`, `<Checkbox>`, `<Slider>`, `<RadioGroup>`, menu items) are considered owned project source code rather than generic third-party templates. 
*   **Decoupled Interactive Affordances:** Interactive controls must never borrow subtle layout or structural divider tokens (`--border`, `--input`, `--background`, `--muted`) that cause contrast collapse on pitch-black OLED dark cards (`--card: 0 0% 3%`) or pure white light backgrounds.
*   **Structural vs. Interactive Separation:** Structural tokens (`--background`, `--card`, `--popover`, `--border`) are reserved for layout containers. Interactive primitives own explicit, high-contrast Tailwind color utility classes directly in JSX:
    *   *Unchecked Tracks / Rails:* `bg-zinc-300` (Light) / `dark:bg-zinc-700` (Dark), guaranteeing `≥ 3.0:1` WCAG AA contrast against card surfaces.
    *   *Tactile Thumbs / Indicators:* `bg-white` (Light) / `dark:bg-zinc-100` (Dark unchecked) / `dark:bg-black` (Dark checked against white primary fill) with `shadow-sm` and a subtle 1px ring (`ring-1 ring-black/10 dark:ring-white/10`).
    *   *Active Fills:* `bg-primary` (`hsl(0 0% 9%)` light, `hsl(0 0% 98%)` dark) for maximum state distinction.
    *   *Focus Rings:* `focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background`.
*   **Radix State Selectors:** All Radix accessibility attributes and state pseudo-classes (`data-[state]`, `data-[disabled]`, `focus-visible:*`) must be fully preserved.

---

## 3. Core Styling Configuration

### 3.1 Tailwind Config (`tailwind.config.ts`)
```typescript
import type { Config } from "tailwindcss";
import tailwindAnimate from "tailwindcss-animate";

const config = {
    darkMode: ["class"],
    content: [
        './pages/**/*.{ts,tsx}',
        './components/**/*.{ts,tsx}',
        './app/**/*.{ts,tsx}',
        './src/**/*.{ts,tsx}',
    ],
    prefix: "",
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: { '2xl': '1400px' }
        },
        extend: {
            colors: {
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))'
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))'
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))'
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))'
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))'
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))'
                },
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))'
                }
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)'
            },
            fontSize: {
                'xxs': '0.625rem',
                'super-mini': '0.5625rem'
            },
            spacing: {
                'badge-size': '0.875rem'
            },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' }
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' }
                }
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out'
            }
        }
    },
    plugins: [tailwindAnimate, require("tailwindcss-animate")],
} satisfies Config;

export default config;
```

### 3.2 Global Base Rules (`src/index.css`)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 98%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 0%;         /* Pure Pitch Black Base */
    --foreground: 0 0% 98%;
    --card: 0 0% 3%;               /* Flat Matte Charcoal */
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 5%;            /* Solid High-Contrast Floating Overlay Base */
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 0%;
    --secondary: 0 0% 9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 9%;              /* Dense Hover Row State */
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 15%;            /* Crisp 1px Structural Divider Line */
    --input: 0 0% 15%;
    --ring: 0 0% 83.1%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }

  /* Custom Theme-Aware Scrollbars */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-muted-foreground/30 hover:bg-muted-foreground/50 rounded-full;
  }
}
```

### 3.3 TypeScript Configuration (`tsconfig.json`)

Includes `["src", "tests"]` so path aliases (`@/*` -> `./src/*`) resolve cleanly across source code, unit tests, and Playwright fixtures.

---

## 4. Architectural Rules & Engineering Protocols

TabBellus code evolution requires strict alignment with the rules stored in `.agents/AGENTS.md` and `.context.md`.

### 4.1 Supreme Override Rules
*   **Identity & Scope:** Forensic Staff Engineer & System Architect. Every assumption must be verified ("Trust, but Verify", "Measure twice, cut once").
*   **Rule Precedence:** `.agents/AGENTS.md` project rules override any conflicting instructions in generic agent skills. External skills (such as `shadcn` and `minimalist-ui`) must strictly defer to the TabBellus Component Ownership Rule rather than default upstream templates.
*   **Component Ownership & Token Decoupling:** Primitives in `src/components/ui/` are owned source code. Interactive controls (`<Switch>`, `<Checkbox>`, `<Slider>`, `<RadioGroup>`, menu items) must define explicit, high-contrast states (≥ 3.0:1 WCAG AA) and must NEVER use subtle layout tokens (`--input`, `--border`, `--background`, `--muted`) that cause contrast collapse on OLED dark (`hsl(0 0% 0%)`) or pure white backgrounds. Radix accessibility and state selectors (`data-[state]`, `data-[disabled]`, `focus-visible:*`) must be fully preserved.
*   **Storage Policy:** **Local-first ONLY**. Use IndexedDB (Dexie.js) for domain models and `chrome.storage.local/session` for UI state caching. No third-party clouds or external databases.
*   **Dependency Strategy:** KISS/MVS. Rely on native browser APIs where possible. Use `@hello-pangea/dnd` for reordering, `cmdk` for OmniSearch, and `shadcn/ui` for controls. Heavy dependencies require explicit architectural reviews.
*   **Context Maintenance:** Must update `.context.md` (and its timestamp) immediately whenever database schemas change, Zustand state changes, files are created/deleted, or core service logic is refactored.

### 4.2 Engineering & Safe-Edit Protocols
*   **Functional Inventory:** Identify and catalog existing validations, timers, and edge-case structures (like soft-delete undo toast timers) before editing file logic.
*   **Safe Patches:** Apply surgical changes to target blocks rather than overwriting files to minimize risk.
*   **Release Pipeline:** The `npm run release` script:
    1. Compiles production assets (`dist/`).
    2. Runs safety scans for "localhost" bindings (deletes output and errors if found).
    3. Bundles output into a zip folder using PowerShell (`Compress-Archive`).

### 4.3 Pro Subsystem Decoupling & Micro-Kernel Architecture
* **Micro-Kernel Architecture Specification**: Document the lifecycle where Core initializes independently, and Pro modules attach via runtime registration hooks without circular dependencies.
* **Fail-Safe Grace State**: Mandate that if licensing storage is corrupted or unreadable, the core free functionality (Spaces, Active Session, Read Later) operates normally without degradation.
* **Single Build Pipeline**: Ensure Vite build configs (vite.config.ts) and TypeScript paths (tsconfig.json) treat src/core/contracts/ as public contracts and src/pro/ as decoupled consumers.

---

## 5. Architectural Alignment Audit Findings & Refactoring History

The project has completed major refactoring phases to optimize performance, clean up technical debt, and establish consistent UI patterns.

### Phase 1: Hook Decomposition
*   **Outcome:** Extracted massive inline state loops from component trees into modular hooks (`useWindowId`, `useTabLifecycle`, `useGroupLifecycle`).

### Phase 2: Service Boundary
*   **Outcome:** Isolated data operations into stateless service modules (`spaceService.ts`, `tabService.ts`, `readLaterService.ts`, `bookmarkService.ts`, `dataService.ts`).

### Phase 3: Type Safety
*   **Outcome:** Established unified `RowTabData` model for normalized rendering of native Chrome tabs and Dexie database tab records.

### Phase 4: Render Registry
*   **Outcome:** Designed declarative render strategy registry `ACTIVE_SESSION_RENDERERS` in `ActiveSession.tsx`.

### Phase 5: Primitive Composition
*   **Outcome:** Unified styling via `<InteractiveRow>` compound component (`.Leading`, `.Title`, `.Actions`).

### Phase 6: Radix Context Menus
*   **Outcome:** Replaced inline context actions with Radix `ContextMenu` wrappers for `TabRow`, `SpaceItem`, and `ReadLaterItem` featuring nested submenus (Save to Space).

### Phase 7: Global Bookmarks Integration
*   **Outcome:** Integrated `"bookmarks"` permission in manifest, built `bookmarkService.ts`, and rendered a read-only recursive bookmark tree in `BookmarkPopoverContent.tsx` triggered from `GlobalHeader.tsx`.

### Phase 8: Context-Aware Local Toolbars
*   **Outcome:** Created memoized dedicated toolbars for each primary view:
    *   `ActiveToolbar`: New tab, navigation controls, reload, tab sorting by domain/name, bulk close unpinned tabs with snapshot Undo toast.
    *   `SpacesToolbar`: Add empty space trigger, sort order toggle, expand/collapse all toggle.
    *   `ReadLaterToolbar`: Bulk mark all as read and clear read items.

### Phase 9: Layout Compactions, Smart Fallback Icons & 4-Tier Space Sorting
*   **Outcome:**
    *   Compacted `ActiveSession.tsx` header to a dense 28px row.
    *   Removed redundant custom logo from `GlobalHeader.tsx` to expand OmniSearch trigger button.
    *   Created `SmartFallbackIcon.tsx` for URL scheme-aware favicon fallback rendering (`chrome://extensions`, `chrome://settings`, `chrome://`, `file://*.pdf`, `file://*`).
    *   Replaced native `window.prompt` in Spaces view with custom Radix `<Dialog>` modal creating empty spaces via `spaceService.createEmptySpace`.
    *   Implemented 4-tier in-memory sort algorithm for Spaces view: Current Window Active -> Any Window Active -> Pinned Spaces -> Alphabetical/Newest.
    *   Standardized `TooltipSimple` wrappers across action buttons and fixed text truncation detection (`block w-full`).

### Phase 10: 1-to-1 Window Binding, Group Undo Restoration, History Folding & Drag-and-Drop Performance
*   **Outcome:**
    *   Enforced strict 1-to-1 Window-to-Space binding in Zustand `useAppStore` by deleting pre-existing space mappings for a target `windowId` before registration.
    *   Upgraded startup window fingerprinting in `background/index.ts` (`auditActiveSpacesOnStartup`) to evaluate all candidate spaces per window, ranking them by match score and tab length difference to pick the single best match.
    *   Added duplicate space tab prevention in `addTabToSpace` throwing `DUPLICATE_TAB` error, and updated `Toaster` with educational subtitle descriptions (`description?: string`).
    *   Upgraded group closure in `ActiveSession.tsx` to snapshot metadata and perform full group restoration (tabs + native tab group + title & color) on Undo.
    *   Implemented visual folding of recently closed group tabs in `HistoryDialog.tsx` into `"Closed Group (X tabs)"` entries with domain host summaries.
    *   Eliminated `[Violation] mousemove` re-render cascades during drag-and-drop by adding custom primitive comparators to `React.memo` in `TabRow` and `GroupRow`, memoizing sub-renderers, and stabilizing action callbacks with `useCallback()`.

### Phase 11: Smart Focus-If-Open History Routing & Active Space State Hardening
*   **Outcome:**
    *   Updated `tabService.focusOrCreate(url)` with `FocusOrCreateResult` typed telemetry (`{ action: 'focused' | 'created', tabId, windowId }`), ensuring parent windows are brought to foreground via `chrome.windows.update(windowId, { focused: true })`.
    *   Integrated Smart "Focus-If-Open" routing in `HistoryDialog.tsx`:
        *   Checks `useAppStore.activeSpaces` and verifies window existence before restoring matched spaces; if alive, focuses the existing window with `useToast` feedback (`"Focused active space window"`).
        *   Checks for open browser tabs matching normalized URLs before restoring single tabs; if open, focuses the tab with `useToast` feedback (`"Focused open tab"`).
    *   Hardened background worker `chrome.windows.onRemoved` to check remaining open windows for matching space footprints (≥85% coverage) before unregistering `activeSpaces` mappings, preventing state desync.
    *   Expanded unit test suite with `tabService.test.ts` (8 tests), bringing total suite to 45 passing tests across 5 files.

### Phase 12: Space Context Menu Expansion & Non-Destructive Window Appending
*   **Outcome:**
    *   Added `spaceService.getTabsForSpace(spaceId)` and `spaceService.appendSpaceTabsToWindow(spaceId, windowId)`:
        *   Deduplicates against already open tabs in the target window using normalized URLs.
        *   Implements staggered tab creation (200ms interval) to safely append space tabs without tab storms or altering active space window bindings.
        *   Returns structured telemetry `AppendTabsResult: { total, appended, skipped }`.
    *   Enhanced `SpaceItem.tsx` Radix context menu with:
        *   **"Append Tabs to Current Window"** (`FolderPlus` icon): Queries current window, appends non-duplicate space tabs, and triggers dynamic `useToast` telemetry notifications (`"Appended X tabs"`, `"Appended X tabs (Y already open)"`, `"All Y tabs are already open in this window"`).
        *   **"Copy All URLs"** (`Link` icon): Formats space URLs into strictly newline-separated (`\n`) text and copies via `useClipboard` with `useToast` feedback.
    *   Preserved `arePropsEqual` comparator preventing re-render cascades in virtualized `SpaceList`.
    *   Expanded unit tests in `spaceService.test.ts` to 20 tests, bringing total test suite to 49 passing tests across 5 files.

### Phase 13: Forensic Architectural, Performance & Memoization Audit for Spaces
*   **Outcome:**
    *   Hardened `SpaceItem.tsx` and `SpaceList.tsx` memoization graphs: wrapped all event handlers, Drag-and-Drop listeners, and `Virtuoso` item renderers in `useCallback` to prevent closure thrashing.
    *   Optimized `useCurrentSpace.ts` Zustand selector to subscribe exclusively to the current window's assigned space ID rather than the entire `activeSpaces` dictionary reference.
    *   Audited and confirmed 100% strict TypeScript types: removed obsolete type assertions (`as (Space & ...)`), typed catch blocks as `unknown`, and added ref-managed timer cleanups for pointer events unlock handlers.
    *   Audited all Spaces UI elements for Design System compliance: zero native `title` attributes, universal `TooltipSimple`/`TooltipOverflow` wrapping, and `useUndoDelete` integration.

### Phase 14: Read Later — Search Filtering, Standardized Clipboard Export & Streamlined State Machine
*   **Outcome:**
    *   Enhanced `readLaterService.ts` with `archiveAllUnread()` for atomic bulk transitioning of unread items to `'archived'`, and `clearAllArchived()` for bulk deletion of archived items within atomic `db.transaction` with full snapshot undo support.
    *   Extracted `ReadLaterItem.tsx` with strongly typed `ReadLaterItemProps`, stabilized callbacks via `useCallback`, and custom `arePropsEqual` memo comparator for 60 FPS scroll performance.
    *   Streamlined Read Later state machine (eliminating intermediate ghost states): clicking an item or opening via context menu automatically transitions the item to `'archived'`.
    *   Refined `ReadLaterItem` Radix context menu with: "Open in New Tab", "Send to Archive" / "Move to Unread", "Send to Space..." (opens `SpaceSelectorModal` in `'save'` mode), "Copy URL" (via `useClipboard`), and "Delete" (via `useUndoDelete`).
    *   Upgraded `ReadLaterToolbar.tsx` with a Sleek Developer Minimalist text search input (`Filter links...`), "Copy All URLs" (formatting visible URLs as clean newline-separated `\n` text matching Spaces behavior), "Archive All" (`Archive` icon / "Archive All Unread"), and "Clear All Archived" with single and bulk Undo recovery.
    *   Integrated `SpaceSelectorModal` into `ReadLaterList.tsx` to enable sending Read Later items directly to Spaces.
    *   Added memoized search filter pipeline in `ReadLaterList.tsx` querying across titles and URLs with context-aware empty states.
    *   Unit test suite in `readLaterService.test.ts` hardened with 11 tests, maintaining 100% pass rate (55/55 tests passing across 5 files).

### Phase 15: Read Later — Frictionless Ingestion via Global Hotkeys & Native Context Menu
*   **Outcome:**
    *   Added `"contextMenus"` to `manifest.config.ts` permissions and registered global keyboard shortcut command `save-to-read-later` mapped to default `Alt+Shift+S`.
    *   Integrated native context menu item (`tabbellus-save-read-later`, `"Save to TabBellus Read Later"`) on `chrome.runtime.onInstalled` targeting both `"page"` and `"link"` contexts.
    *   Implemented unified background ingestion worker in `src/background/index.ts` capturing page URLs or link targets via `readLaterService.addFromTab()` with browser internal scheme filtering (`chrome://`, `edge://`, `about:`, `chrome-extension://`).
    *   Engineered lightweight, non-blocking visual feedback via dynamic action badge updates (`"✓"` green on success, `"•"` amber on duplicate, `"✕"`/`"!"` red on internal/error) with automated 1.5s timer cleanups.

### Phase 16: Read Later — Native Relative Aging Indicators & Staleness Highlighting
*   **Outcome:**
    *   Engineered centralized `dateUtils.ts` (`formatRelativeTime`, `isStale`, `normalizeTimestamp`) utilizing browser-native `Intl.RelativeTimeFormat` with zero third-party dependencies.
    *   Replaced static date strings in `ReadLaterItem.tsx` with dynamic relative aging (e.g., "now", "yesterday", "2 weeks ago", "3 months ago").
    *   Added visual staleness indicators: links older than 30 days are subtly highlighted with `text-amber-600 dark:text-amber-500` while preserving `text-muted-foreground` for recent items.
    *   Preserved `arePropsEqual` comparator performance across virtualized renders with zero closure leaks.
    *   Added 13 unit tests in `dateUtils.test.ts`, raising total test coverage to 68/68 passing tests across 6 test suites.

### Phase 17: Read Later — Ghost State Eradication & Native Ingestion Hardening
*   **Outcome:**
    *   Implemented `migrateGhostStatesToArchive()` in `readLaterService.ts` to automatically discover and transition legacy `status === 'read'` items to `'archived'`, preventing insertion blocks for re-added URLs.
    *   Hooked automatic ghost state migration into background service worker startup and installation lifecycles (`chrome.runtime.onInstalled` / `chrome.runtime.onStartup`).
    *   Configured global keyboard command `save-to-read-later` (`Alt+R` / `MacCtrl+R`) and context menu `tabbellus-read-later` with complete URL validation (`chrome://`, `edge://`, `about:`, `file://`).
    *   Enhanced visual feedback with 2000ms duration action badge transitions (`#22c55e` success, `#f59e0b` duplicate, `#ef4444` invalid/error).
    *   Added 2 unit tests in `readLaterService.test.ts`, bringing total test suite to 70/70 passing tests across 6 test suites.

### Phase 18: Read Later — Reusable OS-Aware Shortcuts & Discovery UI Layer
*   **Outcome:**
    *   Engineered centralized OS detection and keybinding formatting helpers (`isMac`, `formatKeyBinding`, `getReadLaterShortcutText`) in `platform.ts` formatting `⌥ R` on macOS and `Alt+R` on Windows/Linux.
    *   Exported `ContextMenuShortcut` from Radix primitive wrap in `context-menu.tsx` and integrated dynamic keybindings into `TabRow.tsx` context menu item and inline action tooltip.
    *   Enriched empty state guidance in `ReadLaterList.tsx` with styled `<kbd>` shortcut indicators.
    *   Integrated dynamic keybinding titles into native context menu creation in background service worker (`Save to TabBellus Read Later (Alt+R)`).
    *   Added unit tests in `platform.test.ts`, raising total test coverage to 73/73 passing tests across 7 test suites.

### Phase 19: Action Context Menus — Toolbar Quick Actions for Spaces & Read Later
*   **Outcome:**
    *   Expanded browser toolbar action icon functionality with native `action` context menus registered in `src/background/index.ts`:
        *   `action-capture-window`: `"Capture Window as New Space"` — captures the active window's valid tabs via `spaceService.captureCurrentWindow` with a timestamped fallback name and flashes a blue action badge (`#3b82f6`, `'✓'`, 2000ms).
        *   `action-save-read-later`: `"Save Active Tab to Read Later"` — validates the active tab URL against internal browser schemes and ingests it via `readLaterService.addFromTab`, triggering green success badge feedback (`#22c55e`, `'✓'`, 2000ms).
    *   Maintained 100% type safety and zero regressions across the 73-test Vitest suite.

### Phase 20: Forensic Architectural, Performance & Memoization Audit for Read Later
*   **Outcome:**
    *   Conducted forensic audit across `src/features/read-later/` and `src/background/index.ts`.
    *   Verified complete eradication of legacy domain filtering code, `<select>` dropdowns, and ghost states (`status === 'read'`), enforcing binary `'unread'` vs `'archived'` state machine.
    *   Hardened memoization: audited `ReadLaterItem.tsx` custom `arePropsEqual` comparator verifying strict equality across all primitive properties (`id`, `url`, `title`, `status`, `favicon`, `addedAt`) and callbacks; stabilized all event handlers in `ReadLaterList.tsx` and `ReadLaterItem.tsx` with `useCallback()`.
    *   Standardized design system and abstraction compliance: confirmed zero native HTML `title` attributes, universal `<TooltipSimple>` wrapping, `<TooltipOverflow>` truncation, and `useToast` feedback on clipboard copies.
    *   Hardened background action badge timer lifecycle with a keyed `Map` preventing timer collisions or badge leaks across rapid hotkey presses.
    *   Maintained 100% strict TypeScript typing and 73/73 passing tests.

### Phase 21: Settings Architecture Modularization & AppSettings State Management
*   **Outcome:**
    *   Established strongly-typed `AppSettings` interface (`theme: 'light' | 'dark' | 'system'`, `showDomain: boolean`, `badgeMode: 'none' | 'tabs' | 'read-later'`, `readLaterOpenBehavior: 'foreground' | 'background'`, `readLaterAutoArchive: boolean`) with `DEFAULT_SETTINGS` in `src/store/appStore.ts`.
    *   Provided full backward compatibility with direct store accessors (`theme`, `showDomain`, `badgeMode`) and resilient storage migration fallback handling in Zustand `persist` middleware.
    *   Modularized `SettingsDialog.tsx` into a high-density orchestrator wrapping Radix Tabs (`@radix-ui/react-tabs`) and 4 dedicated subcomponents in `src/features/settings/components/`:
        *   `AppearanceTab.tsx`: Theme selector grid, Tab URL Display segmented control (`Show URLs` vs `Hide URLs`), toolbar icon badge mode picker, and sidebar position launcher.
        *   `BehaviorTab.tsx`: Read Later link opening segmented control (`Foreground` vs `Background`), Auto-Archive on Open switch (`src/components/ui/switch.tsx`), and Global Keyboard Shortcuts manager with `openShortcutsSettings()` browser launcher.
        *   `DataTab.tsx`: Local Storage Health telemetry dashboard (`useStorageTelemetry`), JSON backup export/import, one-click sanitized diagnostic markdown report generator (Environment, Storage metrics, App configuration, and Raw User Agent telemetry), and protected danger zone data wipe.
        *   `SupportTab.tsx`: Streamlined zero-scroll layout with conditional milestone promo card, deduplicated community triggers (Rate 5 Stars, Buy Coffee), unified Resources & Troubleshooting (`openSupportHub`, `openShortcutsSettings`), and About & Privacy Policy (`handleExternalLink`).
    *   Pivoted density paradigm to **Tab URL Display Toggle**: preserved standard comfortable row dimensions (`h-9` and `h-7`), conditionally rendering secondary domain/URL subtitles in `TabRow.tsx` based on `showDomain` boolean to maximize vertical readability with vertical centering intact.
    *   Built accessible, high-contrast `<Switch>` primitive in `src/components/ui/switch.tsx` with crisp 1px borders and distinct unchecked tracks for light mode.
    *   Wired `ReadLaterList.tsx` link opening logic to reactively consume `readLaterOpenBehavior` (for `chrome.tabs.create({ active })`) and `readLaterAutoArchive` (for conditional archive transitions).
    *   Created comprehensive unit test suites in `src/store/__tests__/appStore.test.ts` and `src/features/settings/hooks/__tests__/useStorageTelemetry.test.ts`, raising total test coverage to 87/87 passing tests across 9 suites.

---

### Phase 21.5: Settings Behavior Tab Automation & Tab Memory Reclamation
*   **Outcome:**
    *   **AppSettings Schema Expansion:** Extended `AppSettings` in `useAppStore` with `autoDiscardInterval` (`0 | 15 | 30 | 60 | 120`), `spaceRestoreTrigger` (`'single' | 'double'`), and `duplicateTabBehavior` (`'allow' | 'focus-existing'`) with atomic setters and backward-compatible persistence merge logic.
    *   **Tab Memory Reclamation Discard Engine:** Built stateless `discardService.ts` evaluating tabs against a strict 7-point eligibility predicate (`!active`, `!pinned`, `!audible`, `!discarded`, `!locked`, non-internal scheme, elapsed delta check `Date.now() - (lastAccessed ?? 0) >= intervalMs`).
    *   **Background Alarm Wiring:** Wired `tab-discard-sweep` 5-minute recurring alarm in `background/index.ts`, dynamically scheduled or cleared on startup, install, and `chrome.storage.onChanged` for `tabbellus-settings`.
    *   **Behavior Tab Settings Controls:** Rendered high-density, accessible controls in `BehaviorTab.tsx`: Auto-Discard Idle Tabs (5-segment selector: `Off`, `15m`, `30m`, `1h`, `2h`), Duplicate Tab Handling (`Focus Open Tab` vs `Open New Tab`), and Space Restore Trigger (`Single-Click` vs `Double-Click`).
    *   **SpaceItem Interaction Handling:** Wired `SpaceItem.tsx` header click logic to respect `spaceRestoreTrigger` (double-click mode: single click toggles accordion expansion, double click restores window; action tray button and context menu item always restore immediately).
    *   **TabService Duplicate Handling:** Enhanced `tabService.focusOrCreate(url, behavior)` to dynamically read `duplicateTabBehavior` from `useAppStore` with lazy module loading to prevent circular import cycles.
    *   **Testing Infrastructure:** Created `src/lib/__tests__/discardService.test.ts` (16 tests), expanded `appStore.test.ts` (12 tests) and `tabService.test.ts` (10 tests), raising total test suite to 111/111 passing tests across 11 files.

### Phase 21.6: Forensic Architectural, Performance & Best-Practices Audit for Settings Subsystem
*   **Outcome:**
    *   **Atomic Zustand Selectors:** Replaced coarse multi-property object selectors with atomic single-field selectors across `SettingsDialog.tsx`, `AppearanceTab.tsx`, and `BehaviorTab.tsx`, eradicating cross-tab re-render cascades during settings changes.
    *   **Telemetry Hook Lifecycle & Async Cleanup:** Hardened `useStorageTelemetry.ts` with `isMountedRef` lifecycle safety, ensuring in-flight Dexie queries and `navigator.storage.estimate()` calls safely discard state updates if `SettingsDialog` unmounts.
    *   **Data Safety & Danger Zone Resilience:** Implemented `clearTimerRef` lifecycle tracking and unmount cleanup on `DataTab.tsx` 3-second database wipe safety guard; wrapped backup JSON imports in typed error boundaries with descriptive toast notifications.
    *   **Component Ownership & External Links:** Standardized all external link navigations in `SupportTab.tsx` through `handleExternalLink()` and `openSupportHub()` with `TooltipSimple` wrappers and zero native HTML `title` attributes.

### Phase 22: OmniSearch 2.0 & Executable Command Palette
*   **Outcome:**
    *   **Dual-Mode Search & Execution Engine:** Upgraded `OmniSearch.tsx` to support seamless mode switching:
        *   *Search Mode (default):* Tokenized fuzzy search across 5 entity types: Open Tabs, Saved Spaces, Space Tabs, Read Later items, and Bookmarks with keyboard navigation and recent searches.
        *   *Command Mode (`>` prefix or Mode Pill):* Pure command palette querying a declarative action registry for workspace and browser automation.
    *   **Declarative Command Registry:** Built pure registry `commandRegistry.ts` covering 27 commands partitioned into 5 clean categories:
        1. *Spaces & Workspaces (5):* Create Empty Space, Capture Current Window as Space, Unlink Space from Current Window, Export All Spaces to JSON, Switch View: Saved Spaces.
        2. *Tab Management & Memory (9):* Discard Idle Tabs Now, Close Duplicate Tabs, Group Tabs by Domain, Ungroup All Tabs in Window, Sort Window Tabs by Domain, Sort Window Tabs Alphabetically, Open New Tab, Open New Window, Switch View: Active Session.
        3. *Audio & Tab Control (4):* Mute All Audible Tabs, Unmute All Tabs, Reload All Tabs in Window, Close Unpinned Tabs.
        4. *Read Later & Ingestion (4):* Save Active Tab to Read Later, Archive All Unread Items, Clear All Archived Items, Copy All Read Later URLs.
        5. *Navigation & System (5):* Switch View: Read Later, Toggle Light/Dark Theme, Toggle URL Subtitles, Open Settings, Configure Keyboard Shortcuts.
    *   **De-collided Flexbox Header & Dedicated Hit Targets:** Refactored search header into a unified flex container with `flex-shrink-0` mode icon, `flex-1 min-w-0` yielding `<Command.Input>`, and dedicated `flex-shrink-0 flex items-center gap-1.5` container holding the mode pill and non-colliding `X` close button (`h-6 w-6` target, `TooltipSimple`).
    *   **Category De-duplication & Shortcut Badges:** Category section headers handle grouping; individual `CommandItemRow` instances omit redundant category pills and render trailing `<kbd>` shortcut badges when shortcuts exist.
    *   **Long Label Truncation with Floating Tooltips:** Integrated `useIsTruncated` and `<TooltipOverflow isTruncated={isTruncated} text={...}>` across both `CommandItemRow` and `SearchItemRow` subcomponents for zero label clipping on narrow sidepanel widths (360px–400px).
    *   **Data Aggregation & Safe Dispatching:** Built race-safe data aggregator hook `useOmniSearchData.ts` with unmount lifecycle guards, and `useCommandExecutor.ts` injecting `CommandContext` with automated dialog dismissals and toast telemetry.
    *   **Testing Infrastructure:** Maintained 100% test coverage with `commandRegistry.test.ts` (34 tests covering automated execution for all 27 commands) and `useOmniSearchData.test.ts` (8 tests) across all 153 passing tests in the workspace.

---

### Phase 26: Hybrid Media Play/Pause Controller (Global Header Popover & Inline TabRow)
*   **Outcome:**
    *   **Manifest Permissions:** Added `"scripting"` permission and `host_permissions: ["<all_urls>"]` to `manifest.config.ts` for `chrome.scripting.executeScript` authorization across all websites.
    *   **Media Execution Service:** Built `mediaService.ts` (`toggleMediaPlayback(tabId)`) using `chrome.scripting.executeScript` with `allFrames: true` to inject self-contained play/pause toggle logic into target tabs across all frames with `navigator.mediaSession` fallback and error normalization.
    *   **Multi-Tab Media Session & Audio Tabs Tracking:** Built `useActiveMediaSession.ts` Zustand store managing a multi-tab dictionary registry (`mediaSessions: Record<number, 'playing' | 'paused'>`), and `useAudioTabs.ts` (`queryAudioTabs`) for active audio tab discovery and pause retention across all windows. Retains individual paused tabs in the audio list until tab removal (`onRemoved`), URL navigation (`changeInfo.url`), or tab discard.
    *   **Global Header Audio Tabs Popover (`AudioControlPopover.tsx`):** Displays all playing and paused audio tabs with animated/static `AnimatedAudioIcon`, `SmartFallbackIcon` favicons, individual mute/unmute, instant 0ms optimistic Play/Pause controls, and a bi-directional header bulk action (`Mute All` / `Unmute All`) with `isAllMuted` predicate synchronization.
    *   **Inline TabRow Media Control:** Renders a Play/Pause `InteractiveRow.Action` button inside `InteractiveRow.Actions` when `tab.audible === true` or when `mediaSessions[tab.chromeTabId] === 'paused'`. Swaps icon dynamically between `Play` (to resume) and `Pause` (to pause).
    *   **ActiveMediaDock Teardown:** Completely removed `ActiveMediaDock.tsx` and reclaimed full vertical screen estate in `ActiveSession.tsx`.
    *   **Testing Infrastructure:** Maintained `mediaService.test.ts` (8 tests), `useActiveMediaSession.test.ts` (8 tests), and `useAudioTabs.test.ts` (7 tests). Total suite: 188/188 tests passing across 18 files.

---

## 6. Testing & Quality Assurance Infrastructure

### 6.1 Unit & Integration Testing (Vitest)
*   **Configuration (`vitest.config.ts`):** Standard Node environment with in-memory IndexedDB bindings (`fake-indexeddb/auto`).
*   **Core Suites:**
    *   `discardService.test.ts` (16 tests)
    *   `tabService.test.ts` (10 tests)
    *   `sessionUtils.test.ts` (10 tests)
    *   `spaceService.test.ts` (24 tests)
    *   `readLaterService.test.ts` (13 tests)
    *   `dataService.test.ts` (6 tests)
    *   `dateUtils.test.ts` (13 tests)
    *   `platform.test.ts` (3 tests)
    *   `appStore.test.ts` (12 tests)
    *   `useStorageTelemetry.test.ts` (5 tests)
    *   `commandRegistry.test.ts` (34 tests)
    *   `useOmniSearchData.test.ts` (8 tests)
    *   `useLaunchpadData.test.ts` (5 tests)
    *   `badge.test.ts` (3 tests)
    *   `types.test.ts` (3 tests)
    *   `mediaService.test.ts` (8 tests)
    *   `useActiveMediaSession.test.ts` (8 tests)
    *   `useAudioTabs.test.ts` (7 tests)
    *   `registry.test.ts` (36 tests)
    *   `FeatureGate.test.tsx` (5 tests)
    *   `Toaster.test.tsx` (3 tests)
    *   `useSyncStatus.test.tsx` (3 tests)
    *   `SyncSettingsCard.test.tsx` (4 tests)
    *   `matcher.test.ts` (24 tests)
    *   `executor.test.ts` (12 tests)
    *   `ruleStorage.test.ts` (7 tests)
    *   `rulesEngine.test.ts` (10 tests)
    *   `rulesDispatcher.test.ts` (25 tests)
    *   `useRules.test.tsx` (10 tests)
    *   `RuleManagerCard.test.tsx` (12 tests)
    *   `RuleEditorModal.test.tsx` (21 tests)
    *   `TemplatePickerModal.test.tsx` (8 tests)
*   **Execution Command:** `npm test` (472/472 passing across 43 test files).
*   **SSR-Only Component Testing Constraint:** No jsdom, no `@testing-library/react` (`vitest.config.ts` runs `environment: 'node'`). Empirically verified that Radix `Dialog`/`Popover`/`Tooltip` Portal content renders as an empty string under Node `renderToString` (no `document`). React component tests therefore use `renderToString` for structural/state-driven markup assertions only (non-portal cards; closed-state smoke tests for Dialog-rooted components); interactive/click-driven behavior is covered by extracting the exact logic a handler delegates to into pure functions and unit-testing those directly (e.g. `src/pro/rules/components/{ruleListActions,ruleEditorLogic,templateActions}.ts`).

### 6.2 End-to-End Testing (Playwright)
*   **Configuration (`playwright.config.ts`):** Single-worker headed Chromium instances loading extension from `./dist`.
*   **E2E Specs:** `spaces.spec.ts` (2 tests), `capture.spec.ts` (1 test), `performance.spec.ts` (1 test).
*   **Execution Command:** `npm run test:e2e` (automatically builds extension first).

---

## 7. Development Status & Roadmap

### Current Status (Done)
- **Phase 1: Hook Decomposition** - Complete.
- **Phase 2: Service Boundary** - Complete.
- **Phase 3: Type Safety** - Complete.
- **Phase 4: Render Registry** - Complete.
- **Phase 5: Primitive Composition** - Complete.
- **Phase 6: Radix Context Menus** - Complete.
- **Phase 7: Global Bookmarks Integration** - Complete.
- **Phase 8: Context-Aware Local Toolbars** - Complete.
- **Phase 9: UI Compaction, Smart Fallback Icons & 4-Tier Space Sorting** - Complete.
- **Phase 10: 1-to-1 Window Binding, Group Undo Restoration, History Folding & Drag-and-Drop Performance** - Complete.
- **Phase 11: Smart Focus-If-Open History Routing & Active Space State Hardening** - Complete.
- **Phase 12: Space Context Menu Expansion & Non-Destructive Window Appending** - Complete.
- **Phase 13: Forensic Architectural, Performance & Memoization Audit for Spaces** - Complete.
- **Phase 14: Read Later — Search Filtering, Standardized Clipboard Export & Streamlined State Machine** - Complete.
- **Phase 15: Read Later — Frictionless Ingestion via Global Hotkeys & Native Context Menu** - Complete.
- **Phase 16: Read Later — Native Relative Aging Indicators & Staleness Highlighting** - Complete.
- **Phase 17: Read Later — Ghost State Eradication & Native Ingestion Hardening** - Complete.
- **Phase 18: Read Later — Reusable OS-Aware Shortcuts & Discovery UI Layer** - Complete.
- **Phase 19: Action Context Menus — Toolbar Quick Actions for Spaces & Read Later** - Complete.
- **Phase 20: Forensic Architectural, Performance & Memoization Audit for Read Later** - Complete.
- **Phase 21: Settings Architecture Modularization & AppSettings State Management** - Complete.
- **Phase 21.4: Dynamic Badging Driven by Settings Store & Switch Primitive Contrast Refactor (Component Ownership Model)** - Complete.
- **Phase 21.5: Settings Behavior Tab Automation & Tab Memory Reclamation** - Complete.
- **Phase 21.6: Forensic Architectural, Performance & Best-Practices Audit for Settings Subsystem** - Complete.
- **Phase 22: OmniSearch 2.0 & Executable Command Palette** - Complete.
- **Phase 23: Active Session Visual Polish — Tab Loading Spinner & Chromium _favicon Cache Cascade** - Complete.
- **Phase 24: OmniSearch 2.0 Intelligent Launchpad (Zero-State Engine)** - Complete.
- **Phase 25: Color Swatch Picker Primitive Extraction & Create Space Modal Harmonization** - Complete.
- **Phase 26: Hybrid Media Play/Pause Controller (Global Header Popover & Inline TabRow)** - Complete.
- **Phase 27: Pre-Store Submission Stage 1 (Manifest V3 Security & Build Sanitization Audit)** - Complete.
- **Phase 28: Pre-Store Submission Stage 2 (Dead Code Elimination, Vendor Chunking & CWS Compliance Documentation)** - Complete.
- **Phase 29: Pre-Store Submission Stage 3 (Performance, Memory & Event Listener Lifecycle Forensics)** - Complete.
- **Phase 30: Pre-Store Submission Stage 4 (Data Integrity, Schema Migrations & Storage Forensics)** - Complete.
- **Phase 31: Pre-Store Submission Stage 5 (Visual Polish, Store Assets & Final Packaging Validation)** - Complete.
- **Phase 32: Free Core Gating Infrastructure (Registry, useEntitlement, FeatureGate)** - Complete.
- **Phase 33: Tab Loading Spinner Safety, Watchdog & Lifecycle Event Normalization** - Complete.
- **Phase 34: Portal Escalation for Global Toaster (`z-[100]`), Overlay Stacking Standardization & Tactile Copy Feedback** - Complete.
- **Phase 35: Dev Manifest Security Isolation & Free Core Sync Contracts** - Complete.
- **Phase 36: Zero-Leak Dev Testing Harness & Console Toggles for Pro Licensing** - Complete.
- **Phase 37: Google Drive Auth & REST API Client (Milestone 2 — Part 1)** - Complete.
- **Phase 38: Record-Level LWW Diff & Sync Reconciliation Engine (Milestone 2 — Part 2)** - Complete.
- **Phase 39: Sync UI Card & Settings Slot Integration (Milestone 2 — Part 3)** - Complete.
- **Phase 40: Tab Automation Rules — Core Contracts, Storage & Engine Core (Milestone 3 — Part 1)** - Complete.
- **Phase 41: Background Tab Lifecycle Listener & Automation Dispatcher (Milestone 3 — Part 2)** - Complete.
- **Phase 42: UI Slot Registration, Rule Builder & Template Library (Milestone 3 — Part 3)** - Complete.
- **Phase 42.1: `useRules` Infinite Re-Render Hotfix** - Complete.
- **Phase 42.2: "Apply Rules Now" Window Resolution Hotfix** - Complete.
- **Phase 42.3: Background Service Worker Pro Bootstrap Hotfix** - Complete (necessary but not sufficient — see 42.4).
- **Phase 42.4: Pro Bootstrap Race Condition Hotfix (Evidence-Based)** - Superseded by 42.5 (diagnosis was directionally right — async ordering — but the actual mechanism was different).
- **Phase 42.5: Static Rules Engine Import — the Actual Fix** - Complete.
- **Phase 42.6: Cross-Context Rule Storage Sync Hotfix** - Complete.

### Phase 35: Dev Manifest Security Isolation & Free Core Sync Contracts
*   **Outcome:**
    *   **Security & Git Hardening:** Added `*.pem` and `*.crx` to `.gitignore` to prevent secret and unpacked extension key leakage.
    *   **Dynamic Manifest Generation:** Refactored `manifest.config.ts` to export an async function `(env: ConfigEnv)` leveraging Vite's `loadEnv`:
        *   Dynamically injects extension `key` strictly in development mode (`env.mode === 'development'`) when `VITE_CRX_PUBLIC_KEY` is present.
        *   Omits `key` completely from production release bundles.
        *   Added `"identity"` permission to `manifest.config.ts`.
        *   Configured Google Drive appdata `oauth2` authentication block (`client_id: "355684236759-lpotgaton5baaq7g9m74hj9f14i28bm6.apps.googleusercontent.com"`).
    *   **Pure Core Sync Contracts:** Created `src/core/contracts/sync.ts` defining abstract types (`SyncState`, `SyncTelemetry`, `SyncStatus`, `SyncResult`, `SyncProvider`) with zero Pro contamination.
    *   **ContractRegistry Extension:** Implemented `NullSyncProvider` default fallback and extended `ContractRegistry` with `registerSyncProvider()`, `getSyncProvider()`, `getSyncStatus()`, `subscribeSync()`, subscriber re-binding, and full reset handling.
    *   **Testing & Build Verification:** Expanded unit tests in `src/core/__tests__/registry.test.ts` to 24 tests (267/267 tests passing workspace-wide). Verified clean `tsc --noEmit`, dev/prod Vite compilation, and automated release pipeline.

### Phase 36: Zero-Leak Dev Testing Harness & Console Toggles for Pro Licensing
*   **Outcome:**
    *   **Dev Key Prefix Bypass:** `ProLicensingEngine.validateKey()` now recognizes `DEV-` and `TB-TEST-` prefixed keys, bypassing Lemon Squeezy API calls entirely. Persists mock active license credentials to storage and updates entitlement status atomically.
    *   **Env Var Fallback:** `VITE_DEV_ENTITLEMENT` env variable (`'pro'` or `'free'`) sets initial entitlement status during engine construction in dev mode.
    *   **Console Helpers:** `window.__tabbellusDev` exposes `setPro(tier?)`, `setFree()`, and `getStatus()` for runtime entitlement toggling in DevTools console.
    *   **Compile-Time Guards:** All dev harness code wrapped in `if (import.meta.env.DEV)` blocks. Vite's Rollup/esbuild dead-code elimination guarantees zero bytes in production bundles.
    *   **Vite Env Type Safety:** Created `src/vite-env.d.ts` with `/// <reference types="vite/client" />` and `ImportMetaEnv` interface declaring `VITE_DEV_ENTITLEMENT` and `VITE_CRX_PUBLIC_KEY`.
    *   **Release Script Safety Net:** Added `/__tabbellusDev/` and `/TB-TEST-/` to `scripts/release.js` forbidden patterns to catch any tree-shaking failures.
    *   **Testing:** Expanded `engine.test.ts` from 7 to 11 tests (271/271 tests passing workspace-wide). Verified zero `__tabbellusDev`, `DEV-`, and `TB-TEST-` strings in production bundle.

### Phase 37: Google Drive Auth & REST API Client (Milestone 2 — Part 1)
*   **Outcome:**
    *   **Sync API Types (`src/pro/sync/api/types.ts`):** Defined `DriveFileMetadata` (id, name, mimeType, modifiedTime, appProperties), `DriveFileListResponse` (paginated file list), `DriveApiResult<T>` (discriminated union with `success: true; data: T` | `success: false; error; statusCode?; authExpired?`), and `VaultPayload` (JSON sync envelope with schemaVersion, clientTimestamp, payload/ciphertext, and optional E2EE iv/salt).
    *   **Google Auth Client (`src/pro/sync/api/googleAuthClient.ts`):** Singleton `GoogleAuthClient` wrapping `chrome.identity.getAuthToken` for OAuth2 token lifecycle. Methods: `getAuthToken(interactive?)` (normalizes `chrome.runtime.lastError` and thrown exceptions into `DriveApiResult<string>`), `invalidateToken(token)` (calls `chrome.identity.removeCachedAuthToken`, swallows errors silently), `revokeToken(token)` (POSTs to Google's OAuth2 revocation endpoint then invalidates local cache, returns `DriveApiResult<void>`).
    *   **Google Drive REST Client (`src/pro/sync/api/googleDriveClient.ts`):** Singleton `GoogleDriveClient` for Google Drive v3 REST API operations against `appDataFolder`. Methods: `findVaultFile(fileName?)` (queries `files?spaces=appDataFolder`), `downloadVaultFile(fileId)` (GETs `files/${fileId}?alt=media`), `uploadVaultFile(content, existingFileId?, fileName?)` (creates via POST or updates via PATCH using `multipart/related` boundary bodies). Implements resilient 401 auto-recovery protocol: invalidate stale token → request fresh non-interactive token → retry once. Normalizes 403 (quota/rate limit), 404 (file not found), 5xx (server error), and network offline drops into typed `DriveApiResult` without throwing.
    *   **Barrel Export (`src/pro/sync/api/index.ts`):** Re-exports all types, classes, and singletons. Zero imports from `src/core/` implementation files, zero outward leakage into Free Core.
    *   **Zero-Contamination Boundary Verified:** All new files reside under `src/pro/sync/api/`. No Free Core files were modified for feature code. `manifest.config.ts` already contained `"identity"` permission and `oauth2` configuration from Phase 35.
    *   **Testing:** Created `googleAuthClient.test.ts` (13 tests: interactive/background token retrieval, `chrome.runtime.lastError` normalization, invalidation, revocation endpoint success/failure, exception catch-all) and `googleDriveClient.test.ts` (16 tests: findVaultFile found/empty, downloadVaultFile parsing, uploadVaultFile POST create/PATCH update multipart verification, 401 auto-recovery retry flow, 403/404/5xx normalization, network offline handling, pre-request auth failure). Achieved 300/300 tests passing across 29 test files. Clean `tsc --noEmit` verification.

### Phase 38: Record-Level LWW Diff & Sync Reconciliation Engine (Milestone 2 — Part 2)
*   **Outcome:**
    *   **Sync Engine Types (`src/pro/sync/engine/types.ts`):** Defined `SyncVaultSnapshot` (version, clientTimestamp, deviceId, spaces, tabs, readLater), `ReconciliationResult` (localUpdates for Dexie, mergedSnapshot for Drive upload, hasChanges), and `SyncStorageState` (persistent storage state in `chrome.storage.local`).
    *   **Snapshot Serializer (`src/pro/sync/engine/snapshotSerializer.ts`):** Implemented `SnapshotSerializer` providing `createLocalSnapshot(deviceId)` extracting full Dexie snapshots inside single read transactions, `applyRemoteUpdates(updates)` applying upserts to `spaces`, `tabs`, and `readLater` within atomic read-write transactions (`bulkPut`), and `validateSnapshot(data)` schema type guard.
    *   **Record-Level LWW Diff Engine (`src/pro/sync/engine/diffEngine.ts`):** Implemented deterministic multi-master reconciliation:
        *   *Spaces Reconciliation:* Matches spaces by composite fingerprint (`createdAt + "_" + name`). Applies LWW with soft-deletion tombstone preservation (`deletedAt`), preventing resurrected items across devices. Remaps remote IDs to local auto-increment IDs.
        *   *Tabs Reconciliation:* Remaps remote tab `spaceId` foreign keys to resolved local space IDs to preserve hierarchical space containment. Matches tabs by `(spaceId, url)` and updates order/titles.
        *   *Read Later Reconciliation:* Matches items by URL. Converges states toward `'archived'` to guarantee reliable cross-device reading queue synchronization.
    *   **Concrete Sync Engine (`src/pro/sync/engine/syncEngine.ts`):** Implemented `SyncEngine` singleton conforming to `SyncProvider` from `@/core/contracts/sync.ts`:
        *   *Status & Telemetry Management:* Maintains in-memory `SyncStatus` (`state: 'idle' | 'syncing' | 'synced' | 'error' | 'offline'`, `isConnected: boolean`, `telemetry: SyncTelemetry`).
        *   *OAuth2 Lifecycle:* `connect()` requests interactive consent, updates status, and sets `syncEnabled: true` in storage. `disconnect()` revokes token, resets status, and disables sync.
        *   *8-Step Sync Cycle (`syncNow`):* Verifies auth silently -> queries appDataFolder vault file -> downloads remote snapshot -> serializes local Dexie state -> performs DiffEngine LWW reconciliation -> writes local updates to Dexie -> uploads merged snapshot to Google Drive -> dispatches `'synced'` telemetry to subscribers. Fails open gracefully on 401 auth expiration and network drops. Prevents concurrent sync runs.
    *   **Pro Subsystem Integration (`src/pro/index.ts`):** Registered `syncEngine` into `contractRegistry.registerSyncProvider(syncEngine)`.
    *   **Testing Infrastructure:** Created `snapshotSerializer.test.ts` (6 tests), `diffEngine.test.ts` (9 tests), and `syncEngine.test.ts` (9 tests). Raised test coverage to **324/324 passing tests across 32 test files**. Verified zero TypeScript errors with `npx tsc --noEmit`.

### Phase 39: Sync UI Card & Settings Slot Integration (Milestone 2 — Part 3)
*   **Outcome:**
    *   **Core Sync Hook (`src/core/hooks/useSyncStatus.ts`):** Implemented `useSyncStatus()` leveraging `useSyncExternalStore` with snapshot memoization. Subscribes reactively to `contractRegistry.subscribeSync()` and reads `contractRegistry.getSyncStatus()` with guaranteed fail-open fallback (`state: 'idle'`, `isConnected: false`, `telemetry: { pendingMutations: 0, encrypted: false }`). Exported from `src/core/index.ts`. Zero imports from `src/pro/`.
    *   **Sync Settings Card (`src/pro/sync/components/SyncSettingsCard.tsx`):** High-density UI card adhering strictly to `DESIGN.md`:
        *   *Status Pills:* Context-aware badge states (`synced` emerald, `syncing` blue with spinning indicator, `offline`/`error` amber, `disconnected` muted).
        *   *Disconnected State:* Renders BYOC Google Drive private appData storage explanation and "Connect Google Drive" action with loading spinner.
        *   *Connected State:* Displays relative last-synced telemetry via `dateUtils.formatRelativeTime`, appDataFolder storage location indicator, "Sync Now" action with spinning disabled state, and subtle "Disconnect" option.
        *   *Accessibility:* Native `<TooltipSimple>` wrappers on all actions and `useToast()` notifications.
    *   **Declarative Feature Slot Registration (`src/pro/index.ts`):** Registered `data-tab-sync` slot pointing to `SyncSettingsCard`.
    *   **DataTab Slot Integration (`src/features/settings/components/DataTab.tsx`):** Integrated `data-tab-sync` slot dynamically using `useSlotComponents` helper. Positioned above Diagnostic Report, wrapped in declarative `<FeatureGate fallback={<SyncPromoFallback />}>` and `<Suspense fallback={<SyncLoadingSkeleton />}>`. Maintained zero static imports from `src/pro/`.
    *   **Testing Infrastructure:** Created `src/core/__tests__/useSyncStatus.test.tsx` (3 tests) and `src/pro/sync/components/__tests__/SyncSettingsCard.test.tsx` (4 tests). Test coverage raised to **331/331 passing tests across 34 test files**. Verified clean `tsc --noEmit` and production Vite bundling (`npm run build` cleanly code-split `SyncSettingsCard-*.js`).

### Phase 40: Tab Automation Rules — Core Contracts, Storage & Engine Core (Milestone 3 — Part 1)
*   **Outcome:**
    *   **Free Core Rules Contracts (`src/core/contracts/rules.ts`):** Defined `ConditionField` (`'url' | 'domain' | 'title'`), `ConditionOperator` (`'equals' | 'contains' | 'startsWith' | 'endsWith' | 'wildcard' | 'regex'`), `RuleCondition`, `ActionType` (`'group' | 'space' | 'pin' | 'mute' | 'discard'`), `RuleAction`, `TabRule`, `RuleEvaluationResult`, and the `RulesContract` capability interface. Zero imports from `src/pro/`. Re-exported through `src/core/contracts/index.ts` and transitively through `src/core/index.ts`.
    *   **ContractRegistry Extension:** Implemented `NullRulesEngine` default fallback (empty rule set, no-op `saveRules`/`executeActions`, unmatched `evaluateTab`, synchronous-callback `subscribe`). Extended `ContractRegistry` with `registerRulesProvider(provider)`, `getRulesProvider()`, `getRulesSnapshot()` (synchronous current rule array), and `subscribeRules(callback)`, mirroring the existing licensing/sync provider registration, async re-fetch, and error-isolated notification pattern. Full support added to `reset()`.
    *   **ReDoS-Safe Matcher (`src/pro/rules/engine/matcher.ts`):** `RuleMatcher.evaluateCondition()` extracts `url`/`title`/`domain` (via `tryParseHost` from `@/lib/sessionUtils`) and evaluates `equals`/`contains`/`startsWith`/`endsWith` with case-sensitivity normalization. `wildcard` patterns are escaped and compiled into fully-anchored RegExp objects (`*` → `.*`, `?` → `.`) so no raw glob input reaches the regex engine ungoverned. `regex` patterns are capped at 250 characters and compiled inside a try/catch, gracefully returning `false` on malformed syntax — a risk-reduction heuristic bounding pattern complexity, not a runtime execution timeout guarantee against catastrophic backtracking. `RuleMatcher.evaluateRule()` combines conditions per `rule.matchAll` (AND) or OR; a rule with zero conditions never matches.
    *   **Chrome Action Executor (`src/pro/rules/engine/executor.ts`):** `RuleExecutor.executeActions()` iterates actions independently — a single failed action (closed tab, revoked permission) never blocks the remaining ones. `pin`/`mute`/`discard` call `chrome.tabs.update`/`chrome.tabs.discard` directly. `group` resolves the target window (explicit `windowId` or via `chrome.tabs.get`), queries `chrome.tabGroups.query({ windowId })`, joins an existing group via case-insensitive title match, or creates one via `chrome.tabs.group` + `chrome.tabGroups.update`. `space` resolves live tab details via `chrome.tabs.get` and calls `spaceService.addTabToSpace`, silently ignoring `DUPLICATE_TAB`.
    *   **Rule Storage & Starter Presets (`src/pro/rules/storage/`):** `ruleStorage.ts` persists the rule array to `chrome.storage.sync` (key `tabbellus_tab_rules`) with automatic `chrome.storage.local` fallback on quota/permission errors, mirroring `licensing/storage/licenseStorage.ts`. `templates.ts` defines `RULE_TEMPLATES`: Development (github.com/gitlab.com → group "Dev"/purple), Google Workspace (docs/sheets.google.com → group "Work"/blue), Media & Streaming (youtube.com/twitch.tv → auto-mute), Documentation (developer.mozilla.org/stackoverflow.com → group "Docs"/green).
    *   **Concrete Rules Engine (`src/pro/rules/engine/rulesEngine.ts`):** `RulesEngine` singleton implementing `RulesContract`. Hydrates from `ruleStorage` on construction; `getRules()`/`evaluateTab()` await hydration for deterministic reads. Sorts rules ascending by `priority` and evaluates enabled rules in order, first match wins. `saveRules()` re-sorts, persists, and notifies subscribers. `executeActions()` delegates to `RuleExecutor`.
    *   **Pro Subsystem Integration (`src/pro/rules/index.ts`, `src/pro/index.ts`):** Root barrel re-exports matcher, executor, storage, templates, and the engine singleton. Registered `rulesEngine` into `contractRegistry.registerRulesProvider(rulesEngine)` alongside the existing licensing/sync registrations.
    *   **Testing Infrastructure:** Created `matcher.test.ts` (24 tests: field extraction, all six operators, wildcard escaping/anchoring, regex syntax-error and length-cap safety, AND/OR rule combination), `executor.test.ts` (12 tests: pin/mute/discard, group create-vs-join, space action with live Dexie duplicate-URL handling, cross-action failure isolation), `ruleStorage.test.ts` (7 tests: sync round-trip, quota/permission local fallback, reordering persistence, dual-store clear), and `rulesEngine.test.ts` (10 tests: hydration ordering, priority-ordered first-match-wins, disabled-rule skipping, subscriber notification/unsubscribe). Extended `src/core/__tests__/registry.test.ts` with `NullRulesEngine` and rules-provider registration/subscription/reset coverage (24 → 34 tests). Test coverage raised to **394/394 passing tests across 38 test files**. Verified clean `tsc --noEmit` and production Vite bundling.

### Phase 41: Background Tab Lifecycle Listener & Automation Dispatcher (Milestone 3 — Part 2)
*   **Outcome:**
    *   **Background Rules Dispatcher (`src/background/rulesDispatcher.ts`):** Implemented `RulesDispatcher` class and `rulesDispatcher` singleton, resolving the active rules engine strictly through `contractRegistry.getRulesProvider()` (Free Core contract) — zero static imports from `src/pro/` in `src/background/`.
        *   *Internal Scheme Filtering:* `isRuleEligibleUrl(url?)` excludes empty/blank URLs, `about:`, `chrome://`, `chrome-extension://`, `edge://`, `devtools://`, `view-source:` (case-insensitive), and Chrome Web Store domains (`https://chromewebstore.google.com/*`, `https://chrome.google.com/webstore/*`).
        *   *Navigation Event Deduplication:* An in-memory `Map<number, { lastUrl: string; timestamp: number }>` tracks the most recently evaluated URL per tab. `processTab()` skips re-evaluation when the tab's current URL matches the cached `lastUrl` within a 2000ms debounce window, marking the cache **before** awaiting `evaluateTab()` so a burst of near-simultaneous events (e.g. `loading` → `complete`) cannot both pass the check. Cache entries are evicted on `chrome.tabs.onRemoved` via `clearTab(tabId)`.
        *   *Single Tab Processor (`processTab`):* Verifies URL eligibility and deduplication, evaluates via `rulesProvider.evaluateTab({ url, title })`, and dispatches `rulesProvider.executeActions(tab.id, result.actions, tab.windowId)` only when `result.matched && result.actions.length > 0`.
        *   *Batch Window Processor (`applyRulesToWindow(windowId)`):* Queries `chrome.tabs.query({ windowId })`, filters eligible tabs, sequentially evaluates/executes (always fresh — bypasses the live-listener debounce cache since it is a deliberate manual sweep), isolates per-tab failures, and returns `{ processed, matched }` telemetry.
        *   *Runtime Listener Setup (`init()` / `initRulesDispatcher()`):* Binds `chrome.tabs.onCreated` and `chrome.tabs.onUpdated` (triggers on `changeInfo.url` or `changeInfo.status === 'complete'`) to `processTab`, binds `chrome.tabs.onRemoved` to `clearTab`, and binds `chrome.runtime.onMessage` for `{ type: 'APPLY_RULES_TO_WINDOW', windowId? }` — falls back to the active tab's window (`chrome.tabs.query({ active: true, currentWindow: true })`) when `windowId` is omitted, keeps the message channel open (`return true`), and responds with the sweep telemetry.
    *   **Background Bootstrap Integration (`src/background/index.ts`):** Imports `rulesDispatcher` and calls `rulesDispatcher.init()` synchronously at module evaluation, alongside the other `chrome.tabs.on*` listener bindings, so listeners survive service worker wake cycles.
    *   **Zero-Contamination Boundary Verified:** Confirmed no static `src/pro/` imports in `src/background/`; production bundle grep for `ProLicensingEngine`/`GoogleDriveClient`/`GoogleAuthClient` symbols in the background/registry chunks returned no matches.
    *   **Testing Infrastructure:** Created `src/background/__tests__/rulesDispatcher.test.ts` (25 tests: internal-scheme/Chrome-Web-Store filtering, `onCreated`/`onUpdated`/`onRemoved` listener bindings via `init()`, rapid-succession deduplication with fake timers, debounce-window expiry, cache eviction, `processTab` matched/unmatched/ineligible/no-id paths, `applyRulesToWindow` multi-tab telemetry and per-tab failure isolation, `APPLY_RULES_TO_WINDOW` message dispatch with explicit and fallback `windowId`, and unrelated-message pass-through). Test coverage raised to **419/419 passing tests across 39 test files**. Verified clean `tsc --noEmit` and production Vite bundling.

### Phase 42: UI Slot Registration, Rule Builder & Template Library (Milestone 3 — Part 3)
*   **Outcome:**
    *   **Reactive Core Rules Hook (`src/core/hooks/useRules.ts`):** Implemented `useRules()` — `useSyncExternalStore`-powered, subscribing to `contractRegistry.subscribeRules()` and reading `contractRegistry.getRulesSnapshot()` with fail-open fallback (`rules: []`, `loading: false`, mirroring `useSyncStatus`'s static `loading` precedent). `saveRules(rules)` delegates to the active provider's `saveRules()`, swallowing errors. `applyRulesToWindow(windowId?)` sends `{ type: 'APPLY_RULES_TO_WINDOW', windowId }` via `chrome.runtime.sendMessage` to the background `rulesDispatcher` (Part 2), failing open to `{ processed: 0, matched: 0 }` when `chrome.runtime` is unavailable, the send rejects, or the response is malformed. Exported from `src/core/index.ts`. Zero imports from `src/pro/`.
    *   **Rule Manager UI Card (`src/pro/rules/components/RuleManagerCard.tsx`):** Header row with "Apply Rules Now" (spinning icon, `useToast` feedback `"Applied rules: X tabs organized"` via extracted `runApplyRulesNow()`), "Templates" (opens `<TemplatePickerModal>`), and "New Rule" (opens `<RuleEditorModal>` in create mode). Rule rows: up/down priority reorder buttons (`moveRulePriority()` swaps with the neighbor and re-normalizes priority to sequential indices), a `<Switch>` bound to `rule.enabled` (`toggleRuleEnabled()`, instant save via `saveRules`), name plus `summarizeRule()` badge tags, and Edit/Delete actions — Delete wired through `useUndoDelete` (`fetch`/`delete`/`restore` composed from `removeRuleById()`/`insertRule()`). Empty state offers "Create Custom Rule" / "Browse Starter Presets" CTAs. Chosen a plain bordered-card row layout over `<InteractiveRow>` (task offered either) since the hover-reveal-actions primitive is designed for ephemeral sidepanel lists, not an always-visible Settings management list — matches the existing `DataTab.tsx` row idiom instead.
    *   **Rule Editor Modal (`src/pro/rules/components/RuleEditorModal.tsx`, `ConditionRow.tsx`, `ActionRow.tsx`):** Controlled Radix Dialog for create/edit, seeded via `buildInitialDraft()`. Rule name input, Match ALL (AND) / Match ANY (OR) segmented control, dynamic condition rows (field/operator selects, value input with live regex validation — red border + helper text via `isConditionRegexInvalid()`, case-sensitivity checkbox, remove), dynamic action rows (action-type select; `group` reveals a name input + `<ColorPickerGrid>`; `space` reveals a `useSpaces()`-backed `<select>`). Save button gated by `validateRuleDraft()` (non-empty name, ≥1 condition, every condition value populated, no invalid regex). `buildRuleFromDraft()` preserves `id`/`priority`/`createdAt` in edit mode and generates fresh identity/timestamps in create mode.
    *   **Template Picker Modal (`src/pro/rules/components/TemplatePickerModal.tsx`):** Controlled Dialog listing the four `RULE_TEMPLATES` presets with one-click "Add Rule" buttons; `instantiateTemplate()` generates a `crypto.randomUUID()` id and appends at the **lowest evaluation precedence** (`priority = max(existingRules) + 1` — "lowest priority" read as least-urgent/evaluated-last, so a starter preset never silently reorders ahead of a user's existing custom rules) with fresh `createdAt`/`updatedAt`; `runAddTemplate()` confirms via `useToast`.
    *   **Pro Slot Registration & Behavior Tab Integration:** Registered `contractRegistry.registerSlot({ slotId: 'behavior-tab-rules', component: () => import('./rules/components/RuleManagerCard'), order: 5 })` in `src/pro/index.ts` — using the established raw-loader-function convention (matching `support-tab-license` and `data-tab-sync`) rather than a pre-wrapped `React.lazy()` value, since the existing slot-consumption helper filters on `typeof component === 'function'` before wrapping in `React.lazy()` itself; passing an already-lazy component would have been silently filtered out. Extracted that consumption helper — previously private to `DataTab.tsx` — into a shared `src/features/settings/hooks/useSlotComponents.ts` (`DataTab.tsx` updated to import it) so `BehaviorTab.tsx` reuses the identical pattern rather than duplicating it. `BehaviorTab.tsx` renders the slot at the top of the tab via `useSlotComponents()` + `<FeatureGate fallback={<RulesPromoFallback />}>` + `<Suspense fallback={<RulesLoadingSkeleton />}>`, with a 100ms slot-readiness delay matching `DataTab.tsx`'s existing pattern. Zero static `src/pro/` imports in `BehaviorTab.tsx`.
    *   **Build Verification:** Confirmed `RuleManagerCard-*.js` code-splits into its own lazy chunk (not inlined into the eagerly-loaded `@/pro` bootstrap graph, despite `rules/index.ts` re-exporting `./components` statically — mirroring `sync/index.ts`'s identical, already-working pattern with `SyncSettingsCard`). Grepped the background/registry chunks for Pro symbols (`ProLicensingEngine`, `GoogleDriveClient`, `GoogleAuthClient`, `RuleManagerCard`, `RuleEditorModal`, `TemplatePickerModal`) — zero matches.
    *   **Testing Infrastructure — SSR-Only Constraint:** Discovered empirically (no prior precedent in the suite) that Radix `Dialog` Portal content renders as an empty string under this project's Node-environment `renderToString` (no jsdom/`@testing-library/react`, no `document`). Adapted test strategy: extracted all business logic (list mutations, draft validation, regex checking, template instantiation) into pure functions in `ruleListActions.ts`, `ruleEditorLogic.ts`, and `templateActions.ts`, unit-tested directly; `renderToString` used for structural assertions on the non-portal `RuleManagerCard` (empty vs. populated states, `Switch` `data-state` checked/unchecked, reorder-button `disabled` boundaries — via order-independent tag extraction rather than brittle attribute-order regex) and closed-state smoke tests for the two Dialog-rooted components. Created `src/core/__tests__/useRules.test.tsx` (10 tests), `src/pro/rules/components/__tests__/RuleManagerCard.test.tsx` (12 tests), `RuleEditorModal.test.tsx` (21 tests), `TemplatePickerModal.test.tsx` (8 tests). Test coverage raised to **470/470 passing tests across 43 test files**. Verified clean `tsc --noEmit` and production Vite bundling.

### Phase 42.1: `useRules` Infinite Re-Render Hotfix
*   **Symptom:** Opening Settings → Behavior white-screened the entire side panel. Console showed `The result of getSnapshot should be cached to avoid an infinite loop` (`useSyncExternalStore`) immediately followed by `Uncaught Error: Maximum update depth exceeded`.
*   **Root Cause:** `ContractRegistry.getRulesSnapshot()` returned `[...this.currentRules]` — a brand-new array on every single call. `useRules()` passes this directly as `useSyncExternalStore`'s `getSnapshot`, which requires a referentially stable return value between actual store changes (`Object.is` comparison). A fresh array every call made React believe the store had changed on every render, scheduling another render, which called `getSnapshot()` again, produced yet another new array, and so on — an infinite loop that manifested as a fully blank `RuleManagerCard` (and therefore blank side panel, since it renders at the top of the Behavior tab). Unlike `useEntitlement`/`useSyncStatus`, which each wrap their registry getter in a manually-diffed module-level cache before handing it to `useSyncExternalStore`, `useRules()` had no such caching layer — the gap this session's implementation missed.
*   **Fix (`src/core/contracts/registry.ts`):** `getRulesSnapshot()` now returns the internal `currentRules` array reference directly instead of a spread copy. Safe because `currentRules` is only ever *reassigned* wholesale inside `updateRulesAndNotify()` (never mutated in place elsewhere), so the reference is stable between real rule-list changes and only advances when the provider actually notifies an update.
*   **Regression Coverage (`src/core/__tests__/registry.test.ts`):** Added two tests — `getRulesSnapshot()` returns the identical (`toBe`) reference across repeated calls with no intervening change, and returns a new reference only after `registerRulesProvider()` delivers an actual updated rule list (reverting to stable again immediately after). Test coverage raised to **472/472 passing tests across 43 test files**. Verified clean `tsc --noEmit` and production Vite bundling.
*   **Lesson:** Any future `useSyncExternalStore`-backed Free Core hook must either (a) have its registry getter return a referentially stable value that only changes when the underlying data changes, or (b) wrap the getter in the `useEntitlement`/`useSyncStatus` field-diffing cache pattern. This project's SSR-only test harness (Phase 42) cannot catch this class of bug — `renderToString` never performs the multi-render reconciliation cycle where the loop occurs — so it must be reasoned about at review time, not assumed caught by the test suite.

### Phase 42.2: "Apply Rules Now" Window Resolution Hotfix
*   **Symptom:** QA report — with 3 open tabs (2 matching a "Dev" and a custom "Wiki" rule, 1 unmatched), clicking "Apply Rules Now" in the Behavior tab did nothing: no grouping occurred and the toast read `"Applied rules: 0 tabs organized"`.
*   **Root Cause:** `RuleManagerCard`'s "Apply Rules Now" handler called `applyRulesToWindow()` with no `windowId`, so the background `rulesDispatcher` had to guess via `resolveFallbackWindowId()` → `chrome.tabs.query({ active: true, currentWindow: true })` **executed from the service worker itself**. An MV3 service worker has no window of its own, so `currentWindow: true` resolved there is not the well-defined "the window this UI page belongs to" — it is a known unreliable heuristic in that context and could resolve to no tabs at all, yielding `{ processed: 0, matched: 0 }` (the "does nothing" symptom) regardless of how correct the matcher/executor logic was.
*   **Fix (`src/pro/rules/components/RuleManagerCard.tsx`):** Resolve the window from the *UI* side instead, where "current window" is unambiguous — reused the existing `useWindowId()` hook (`src/features/tabs/hooks/useWindowId.ts`, already relied on by `SpaceList.tsx`/`useCurrentTabs.ts` for exactly this purpose) and now pass that explicit `windowId` through to `applyRulesToWindow(windowId)`. The background's `resolveFallbackWindowId()` heuristic remains as a defensive last resort for any future caller with no window context of its own, but the primary UI-triggered path no longer depends on it.
*   **Verification:** Clean `tsc --noEmit`, full suite still **472/472 passing across 43 test files** (no test depended on the previous no-arg call), and `npm run build` confirmed `RuleManagerCard-*.js` still code-splits correctly.

### Phase 42.3: Background Service Worker Pro Bootstrap Hotfix
*   **Symptom:** Phase 42.2's window-resolution fix did not resolve the reported bug — "Apply Rules Now" still did nothing and the toast still read `"Applied rules: 0 tabs organized"` even with a correct window and genuinely matching tabs open.
*   **Root Cause (the actual bug):** A Chrome extension's background service worker and its sidepanel page run in **separate JS execution contexts**, each with its own independent module graph. `contractRegistry` (`src/core/contracts/registry.ts`) is a module-level singleton — but "singleton" only holds *within one execution context*; the background and the sidepanel each instantiate their own separate copy. The Pro subsystem bootstrap (`contractRegistry.registerLicensingProvider(...)`, `registerSyncProvider(...)`, **`registerRulesProvider(rulesEngine)`**) was only ever triggered via `import('@/pro').catch(...)` inside `sidepanel/index.tsx`'s `useEffect` — nothing equivalent existed for the background. So when `rulesDispatcher.ts` (Phase 41, running entirely inside the background) called `contractRegistry.getRulesProvider()`, it was reading the **background's own, never-bootstrapped** registry — permanently stuck on the default `NullRulesEngine`, whose `evaluateTab()` unconditionally returns `{ matched: false, actions: [] }`. Every tab in every window would therefore always evaluate to zero matches, regardless of window-targeting correctness (which is why the Phase 42.2 fix, though independently correct, could not have resolved the reported symptom on its own).
*   **Fix (`src/background/index.ts`):** Added the identical dynamic-import bootstrap already used by `sidepanel/index.tsx` — `import('@/pro').catch(() => { /* silent fallback to free tier */ })` — at background module evaluation, before `rulesDispatcher.init()`. This is a *dynamic* import, not a static one, so it does not violate the `src/background/` zero-contamination constraint (Free Core still builds and runs fully with `src/pro/` absent — the import simply fails silently); it is the exact same mechanism the codebase already relies on for the sidepanel to attach Pro without a static dependency.
*   **Bundling Verification:** Confirmed via `dist/` chunk inspection that the background's own chunk (`index.ts-*.js`, contains `"TabBellus Service Worker Initialized"`) and the sidepanel's chunk both dynamically `import()` the same shared Pro-bootstrap chunk (containing `registerRulesProvider`). Because that dynamic import executes *within the background's own realm*, it updates the background's own `contractRegistry` instance — the same instance `rulesDispatcher.ts` reads from (both are part of the background's module graph) — resolving the cross-context gap. `registry-*.js` still contains zero Pro engine symbols (`ProLicensingEngine`, `GoogleDriveClient`, `GoogleAuthClient`), confirming the boundary itself is untouched; only the *bridging* changed.
*   **Known Residual Risk:** The dynamic import is asynchronous — there is a narrow window immediately after a cold service-worker start (e.g., right after install/reload, before the import resolves) where a `chrome.tabs` event could fire against the still-default `NullRulesEngine`. Not applicable to the reported test scenario (rules are applied well after the extension has been running), but a candidate for future hardening (e.g., gate `processTab`/`applyRulesToWindow` on a "Pro ready" promise) if flaky first-tab-after-reload behavior is ever observed.
*   **Verification:** Clean `tsc --noEmit`, full suite still **472/472 passing across 43 test files**, `npm run build` succeeded (chunk graph reshuffled as an expected side effect of the background chunk now also reaching the Pro module graph — no functional regression; `RuleManagerCard-*.js` and `registry-*.js` remain correctly isolated from the background's own static chunk).

### Phase 42.4: Pro Bootstrap Race Condition Hotfix (Evidence-Based)
*   **Symptom:** Phase 42.3's background Pro bootstrap did not resolve the reported bug either — "Apply Rules Now" still did nothing.
*   **Diagnosis Method:** Rather than theorize a fourth time, added `[RulesDebug]` console instrumentation at every hop of the pipeline (`useRules.applyRulesToWindow` send/receive, the background's Pro-bootstrap resolve/reject, the `APPLY_RULES_TO_WINDOW` message handler, window resolution, and per-tab evaluation results) and had the user capture both the sidepanel console and the background service worker's own console for one real test run. This is the first hotfix in this incident backed by direct runtime evidence rather than static/architectural reasoning.
*   **Evidence:** `[RulesDebug] applyRulesToWindow(457946677): provider=NullRulesEngine, activeRules=0 (), tabsInWindow=14` — confirmed definitively that `contractRegistry.getRulesProvider()` in the background was *still* returning `NullRulesEngine` at the moment of evaluation, even with the Phase 42.3 bootstrap code present and even though the user was testing live via `npm run dev` (visible from `[vite] connecting...`/`[vite] connected.` in the console — HMR was active, so the new code was in fact running).
*   **Root Cause:** A genuine race condition. `import('@/pro')` in `background/index.ts` is asynchronous — it has to fetch, parse, and execute a separate chunk (real, non-trivial latency in dev mode, where that chunk is fetched over HTTP from the Vite dev server rather than bundled). Meanwhile, `chrome.tabs.onCreated`/`onUpdated` and `chrome.runtime.onMessage` listeners are bound *synchronously* by `rulesDispatcher.init()`, which runs immediately after the dynamic import is merely *initiated* (not awaited). If the service worker is woken specifically to handle an incoming event (tab creation, or the `APPLY_RULES_TO_WINDOW` message), Chrome re-executes the entire top-level script and can dispatch that event to the freshly-registered listener before the still-in-flight `import('@/pro')` promise has resolved. `rulesDispatcher.processTab()`/`applyRulesToWindow()` would then read `contractRegistry.getRulesProvider()` and get the still-default `NullRulesEngine`, permanently for that invocation (there was no retry or wait).
*   **Fix (`src/background/rulesDispatcher.ts`, `src/background/index.ts`):** Added `RulesDispatcher.proReadyPromise` (defaults to an already-resolved `Promise.resolve()` so the dispatcher still functions — against `NullRulesEngine` — if nothing wires a promise up) and a `setProReadyPromise(promise)` setter. Both `processTab()` and `applyRulesToWindow()` now `await this.proReadyPromise` as their very first step, *before* calling `contractRegistry.getRulesProvider()`. `background/index.ts` captures the dynamic import's promise (`const proReadyPromise = import('@/pro').then(...).catch(...)`, note: `.catch()` ensures the promise itself always *resolves*, never rejects, so the await never throws even if Pro genuinely fails to load) and passes it to `rulesDispatcher.setProReadyPromise(proReadyPromise)` before `rulesDispatcher.init()`. This closes the race deterministically: any evaluation now waits for the bootstrap attempt to fully settle (success or failure) before consulting the registry, rather than racing it.
*   **Regression Coverage (`src/background/__tests__/rulesDispatcher.test.ts`):** Added a `setProReadyPromise` describe block (3 tests) using a manually-controlled deferred promise: registers the real provider on `contractRegistry` *while* `processTab()`/`applyRulesToWindow()` is still awaiting the gate (simulating the bootstrap resolving just-in-time), then resolves the gate and asserts the call correctly picks up the freshly-registered provider rather than a stale `NullRulesEngine` captured before the gate opened; plus a test confirming the default resolved-promise behavior when no gate is wired up. Test coverage raised to **475/475 passing tests across 43 test files**.
*   **Diagnostic Logging Retained:** The `[RulesDebug]` console instrumentation added for this investigation was left in place (not stripped) — it proved decisive for root-causing this incident in a codebase with no interactive browser access for the assistant, and remains low-risk, low-noise `console.log`/`console.error`/`console.warn` calls scoped to the rules pipeline only. Candidate for removal once the feature has been in the field without further incident.
*   **Verification:** Clean `tsc --noEmit`, full suite **475/475 passing across 43 test files**, `npm run build` succeeded.
*   **Superseded:** The `proReadyPromise` gate this hotfix added assumed the dynamic import was merely *slow* (a race it could lose). Phase 42.5's runtime evidence showed the import doesn't race — it always throws, deterministically, in this context. Awaiting a promise that is guaranteed to reject-then-be-caught changes nothing; the gate was inert. The `proReadyPromise`/`setProReadyPromise` machinery and its 3 tests were removed in Phase 42.5 once the real mechanism was confirmed.

### Phase 42.5: Static Rules Engine Import — the Actual Fix
*   **Symptom:** Phase 42.4's fix did not resolve the bug either — still `provider=NullRulesEngine` in the background console.
*   **Definitive Evidence:** With the `[RulesDebug]` instrumentation from Phase 42.4 still in place, the background service worker's own console (opened via `chrome://extensions` → TabBellus → "service worker" inspector — distinct from the sidepanel's console, and the piece of evidence that had been missing from every prior round) showed the exact failure directly:
    ```
    [RulesDebug] Background Pro bootstrap FAILED — falling back to free tier
    TypeError: import() is disallowed on ServiceWorkerGlobalScope by the HTML specification.
    See https://github.com/w3c/ServiceWorkerIssues/1356.
    ```
*   **Root Cause (confirmed, not inferred):** Dynamic `import()` is categorically forbidden inside a `ServiceWorkerGlobalScope` — a hard restriction from the HTML/Service Worker specification itself, enforced by Chrome, not a bundler limitation or something fixable with better timing. It does not "sometimes fail" or "race" — it rejects **every single time**, unconditionally, in this context. This is why Phase 42.3 (bootstrap the background at all) and Phase 42.4 (await the bootstrap before evaluating) both failed identically: there was never a live rules engine for either fix to wait for or synchronize with. The sidepanel's identical `import('@/pro')` call works fine only because the sidepanel is a regular page context, not a service worker — the two are not equivalent despite looking like the same line of code.
*   **Fix — a deliberate, narrow exception to the zero-contamination rule:**
    *   `src/background/index.ts` now **statically** imports `rulesEngine` directly from `@/pro/rules/engine/rulesEngine` (bypassing the `@/pro/rules` and `@/pro` barrels, which would additionally pull in React/Radix UI component code the background has no use for) and calls `contractRegistry.registerRulesProvider(rulesEngine)` synchronously at module evaluation — before `rulesDispatcher.init()` binds any listeners. Because ES module static imports are fully resolved and executed before the importing module's own top-level code runs, this registration is guaranteed to complete before any `chrome.tabs`/`chrome.runtime` event can reach a listener — the race Phase 42.4 tried (and failed) to close no longer exists structurally, because there is no async gap left to race across.
    *   This is a **necessary, narrow, and consciously-scoped exception** to "Zero static imports from `src/pro/` in `src/background/`": the imported module (`rulesEngine.ts`) pulls in only the matcher, executor, and `chrome.storage`-backed rule storage — no licensing, no sync, no Google OAuth clients, no React — confirmed via a production-bundle grep showing zero occurrences of `ProLicensingEngine`, `GoogleDriveClient`, `GoogleAuthClient`, `RuleManagerCard`, or any UI component string in the background's own chunk. Licensing and sync remain excluded from the background exactly as before; only the sidepanel needs those.
    *   `rulesDispatcher.ts` itself is unchanged in this respect — it still only touches `contractRegistry`, never `src/pro/` directly; the exception is confined entirely to the entry-point file (`background/index.ts`), documented inline with the confirmed error text and a link to the spec issue.
    *   Removed the now-provably-unnecessary `proReadyPromise`/`setProReadyPromise` gating from `RulesDispatcher` (see the Phase 42.4 entry above) and its 3 associated tests, since registration is now synchronous and there is no async gap to gate.
*   **Bundling Verification:** Confirmed via `dist/` inspection that the background's own chunk now contains a genuine static `import` of a new shared `rulesEngine-*.js` chunk (not a dynamic `import(` call — grepped for zero occurrences in the background chunk) and the literal string `registerRulesProvider`; that `rulesEngine-*.js` chunk itself contains zero React/JSX symbols; and the background chunk still contains zero licensing/sync/UI-component symbols.
*   **Honest Trade-off:** If `src/pro/` were physically deleted for a hypothetical Free-only distribution, `src/background/index.ts` would now fail to build (module not found) — this specific guarantee no longer holds for the background entry point, only for the sidepanel/popup entry points and every other Free Core module. This is an unavoidable consequence of a genuine platform constraint (dynamic import is impossible in service workers) colliding with a design goal (Pro-optional background). Flagged explicitly here rather than silently accepted.
*   **Verification:** Clean `tsc --noEmit`, full suite **472/472 passing across 43 test files** (475 minus the 3 obsolete `setProReadyPromise` tests removed), `npm run build` succeeded with the corrected static bundling confirmed above.

### Phase 42.6: Cross-Context Rule Storage Sync Hotfix
*   **Symptom:** QA report — adding or removing a rule via the sidepanel UI has no effect on live tab automation until the side panel is reloaded.
*   **Root Cause:** A direct, foreseeable side effect of Phase 42.5's own fix. `export const rulesEngine = new RulesEngine();` (`src/pro/rules/engine/rulesEngine.ts`) is a **module-level singleton, hydrated from `chrome.storage` exactly once, in its constructor**, with no mechanism to learn about later changes. Since Phase 42.5 gives the background service worker its own statically-imported `RulesEngine` instance (necessarily separate from the sidepanel's own dynamically-bootstrapped instance — two independent JS execution contexts, two independent module graphs, confirmed across Phases 42.3–42.5), editing a rule via `RuleManagerCard` → `useRules().saveRules()` updates only the **sidepanel's** in-memory copy and `chrome.storage`. The **background's** separate, already-constructed instance never re-reads storage, so `processTab()`/`applyRulesToWindow()` keep evaluating tabs against the stale rule set until the service worker happens to restart (idle-timeout respawn, or a coincidental full extension reload) — which is why a sidepanel reload appeared to "fix" it: enough time passing for the SW to idle out and restart is a plausible, if indirect and unreliable, explanation for the reported workaround.
*   **Fix (`src/pro/rules/engine/rulesEngine.ts`, `src/pro/rules/storage/ruleStorage.ts`):**
    *   Exported `RULES_STORAGE_KEY` from `ruleStorage.ts` (previously a private, unexported `STORAGE_KEY` constant) so other modules can reference the exact storage key without duplicating the literal string.
    *   `RulesEngine` now binds a `chrome.storage.onChanged` listener in its constructor (`bindStorageListener()`, guarded for `chrome`/`chrome.storage.onChanged` being unavailable). Whenever a change to `RULES_STORAGE_KEY` arrives in the `sync` or `local` area — regardless of which JS execution context wrote it — the engine re-runs `hydrateFromStorage()`, which re-reads the full rule set and calls `notifyListeners()`. This is the same standard cross-context reactivity pattern already used elsewhere in this codebase (`tabLockStore.ts`'s `chrome.storage.onChanged` subscription; `background/index.ts`'s listener for `'tabbellus-settings'` changes) — not a new pattern, a consistent application of an existing one.
    *   Self-consistent for the writing instance too: the sidepanel's own `saveRules()` already updates its in-memory copy and notifies synchronously (no behavior change there), and will additionally receive its own `onChanged` event shortly after (Chrome dispatches storage-change events back to the writer's own context, not just other contexts) — a harmless, idempotent redundant re-hydration of data it already has, not a correctness concern.
*   **Regression Coverage (`src/pro/rules/__tests__/rulesEngine.test.ts`):** Added a "cross-context storage sync" describe block (5 tests): re-hydrates and returns the updated rule set when a matching storage change arrives; notifies existing `subscribe()` callbacks when that happens; ignores changes to unrelated storage keys; ignores changes from unrelated storage areas (e.g. `'managed'`); does not throw when `chrome.storage.onChanged` is unavailable (fail-open, consistent with the rest of the codebase's Chrome-API-optional guards). Test coverage raised to **477/477 passing tests across 43 test files**.
*   **Verification:** Clean `tsc --noEmit`, full suite **477/477 passing across 43 test files**, `npm run build` succeeded.

### Phase 42.7: Dialog Dismissal Guard on Toast Undo Interaction
*   **Symptom:** Clicking the "Undo" button on an action toast (e.g., after deleting a rule in the Behavior tab's `RuleManagerCard` via `useUndoDelete`) while the Settings dialog is open caused the Settings dialog to dismiss immediately.
*   **Root Cause:** The toast container is portalled to `document.body` with `z-[100]`, outside the Radix `DialogPrimitive.Content` boundary. When clicking the "Undo" action inside the toast, Radix UI interprets the click as an outside interaction (`onInteractOutside` / `onPointerDownOutside`), triggering dialog closure.
*   **Fix (`src/components/ui/Dialog.tsx`, `src/features/settings/SettingsDialog.tsx`, `src/components/ui/Toaster.tsx`):**
    *   `src/components/ui/Dialog.tsx`: Added `isToastTarget` helper to `DialogContent` checking `target?.closest('[data-toast]') || target?.closest('[data-sonner-toaster]') || target?.closest('.toaster') || target?.closest('[role="status"]') || target?.closest('[role="alert"]')`. Calls `e.preventDefault()` on both `onInteractOutside` and `onPointerDownOutside`, preventing dialog dismissal on toast clicks across all dialog instances while preserving user callbacks.
    *   `src/features/settings/SettingsDialog.tsx`: Configured explicit `onInteractOutside` and `onPointerDownOutside` handlers on `<DialogContent>` for defense-in-depth.
    *   `src/components/ui/Toaster.tsx`: Added `.toaster`, `data-sonner-toaster=""`, and `data-toast=""` attributes to toast container and toast card elements for explicit selector targeting.
    *   `src/hooks/useUndoDelete.ts`: Verified `useUndoDelete` does not interact with `useUIStore.isSettingsOpen` or alter `activeView`, ensuring modal focus remains completely stable during undo operations.
*   **Testing Infrastructure (`src/components/ui/__tests__/Dialog.test.tsx`):** Created 6 unit tests covering selector detection, event prevention on toast interactions, normal backdrop dismissal retention, SSR rendering, and `useUndoDelete` modal open state stability. Full suite raised to **483/483 passing tests across 44 test files**.
*   **Verification:** Clean `tsc --noEmit`, full suite **483/483 passing across 44 test files**.

### Phase 42.8: ActionRow Radix Space Selector & Dialog Guard Hardening
*   **Outcome:**
    *   **Polished Space Selector (`src/pro/rules/components/ActionRow.tsx`):** Completely eradicated raw HTML `<select>` and `<option>` elements in `ActionRow`. Replaced target space selection and action type selection with Radix-based `<DropdownMenu>` components conforming strictly to `DESIGN.md`:
        *   *Trigger Button:* `h-8`, `px-2.5`, `border border-border`, `bg-card hover:bg-muted` with active space color dot (`w-2 h-2 rounded-full shrink-0` mapped via `getGroupColorClasses` from `@/lib/colors`), space name with `truncate max-w-[170px] text-xs font-medium text-foreground`, and trailing `ChevronDown` icon (`w-3.5 h-3.5 text-muted-foreground`). Falls back to `"Select target space..."` placeholder when unselected.
        *   *Dropdown Content Panel:* `bg-popover`, `border border-border`, `rounded-md`, `shadow-md`, `p-1`, `max-h-48 overflow-y-auto`. Each item displays space color indicator, truncated name, and active `Check` mark.
        *   *Action Type Selector:* Styled `<DropdownMenu>` displaying active option label and checkmark indicator.
    *   **Testing Infrastructure:** Created `src/pro/rules/components/__tests__/ActionRow.test.tsx` (6 tests: placeholder rendering, color swatch and truncated name rendering, uncolored space fallback, space selection callback with `spaceId` and `spaceName`, group options rendering, and action type rendering). Extended `RuleEditorModal.test.tsx` (+1 test, total 22 tests). Test coverage raised to **490/490 passing tests across 45 test files**. Verified clean `tsc --noEmit` and production Vite bundling (`npm run build`).

### Phase 42.9: OmniSearch 2.0 Pro Command Integration ("Apply Tab Rules to Window")
*   **Outcome:**
    *   **Command Registration (`src/features/search/registry/commandRegistry.ts`):** Added command #28 (`apply-tab-rules`) under `'Tab Management & Memory'` category (10 commands in category, 28 total across workspace). Metadata includes `isPro: true`, `Sparkles` icon, comprehensive keywords (`rules`, `auto group`, `organize`, `tab rules`, `match`, `automate`).
    *   **Visual Pro Badge Pill (`src/features/search/components/CommandItemRow.tsx`):** Rendered a high-contrast `PRO` badge pill (`text-xxs font-semibold px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary shrink-0`) in trailing container before shortcut indicators when `command.isPro` is `true`.
    *   **Execution Dispatcher & Zero-Contamination Boundary (`src/features/search/hooks/useCommandExecutor.ts`):** Evaluates user entitlement via `contractRegistry.getEntitlementSnapshot()` without importing from `src/pro/`:
        *   *Free Tier:* Dismisses search palette (`setSearchOpen(false)`) and triggers upgrade prompt toast (`toast('TabBellus Pro Feature', { description: 'Tab Rules and automation require an active Pro license.', action: { label: 'Upgrade', onClick: () => setSettingsOpen(true) } })`).
        *   *Pro Tier:* Dispatches `chrome.runtime.sendMessage({ type: 'APPLY_RULES_TO_WINDOW' })` and triggers toast with telemetry (`Organized X of Y tabs in this window.`). Fails open gracefully with error toast on rejection.
    *   **Toaster Action Support (`src/components/ui/Toaster.tsx`):** Enhanced `Toaster.tsx` to support custom `action: { label: string; onClick: () => void }` buttons alongside existing `onUndo` actions, and supported object-based config payloads.
    *   **Testing Infrastructure:** Added `src/features/search/hooks/__tests__/useCommandExecutor.test.tsx` (4 tests) and `src/features/search/components/__tests__/CommandItemRow.test.tsx` (2 tests). Updated `src/features/search/__tests__/commandRegistry.test.ts` (36 tests). Full test suite raised to **499/499 passing tests across 47 test files**. Clean `tsc --noEmit` (0 errors) and production Vite bundling (`npm run build`).

### Phase 42.10: Idempotent Space Rule Action & DUPLICATE_TAB Noise Suppression
*   **Outcome:**
    *   **Idempotent Space Action (`src/pro/rules/engine/executor.ts`):** Wrapped `spaceService.addTabToSpace` invocation in `RuleExecutor`'s `'space'` action execution. If the tab's URL is already saved in the space (error is `DUPLICATE_TAB` or `err.message === 'DUPLICATE_TAB'`), it silently returns, guaranteeing idempotence and preventing failure of subsequent rule actions. If an unexpected error occurs (e.g., database lock or deleted space), logs a polite warning `console.warn('[RuleExecutor] Could not assign tab to space:', err)` without throwing or halting the rule pipeline.
    *   **Space Service Clean Error Logging (`src/lib/spaceService.ts`):** In `addTabToSpace`, `moveTabBetweenSpaces`, and `copyTabToSpace`, suppressed `console.error` when the caught error is `DUPLICATE_TAB`. Business duplicate checks rethrow `new Error('DUPLICATE_TAB')` directly while reserving `console.error` strictly for unexpected database transaction failures.
    *   **Testing Infrastructure (`src/pro/rules/__tests__/executor.test.ts`):** Added tests verifying that when `addTabToSpace` throws `DUPLICATE_TAB`, `executeActions` completes cleanly without throwing and successfully executes subsequent actions (e.g., `pin`). Verified that unexpected database errors trigger `console.warn('[RuleExecutor] Could not assign tab to space:', ...)` without throwing. Suite raised to **501/501 passing tests across 47 test files**. Clean `tsc --noEmit` and production build (`npm run build`).

### Phase 42.11: Milestone 3 Forensic Code Review & Architectural Audit
*   **Audit Scope:** Audited entire Milestone 3 surface across contracts (`rules.ts`, `registry.ts`), hooks (`useRules.ts`), headless and runtime entry points (`src/pro/headless.ts`, `src/pro/index.ts`), engine modules (`matcher.ts`, `executor.ts`, `rulesEngine.ts`), storage (`ruleStorage.ts`, `templates.ts`), UI components (`RuleManagerCard.tsx`, `RuleEditorModal.tsx`, `TemplatePickerModal.tsx`, `ActionRow.tsx`, `ConditionRow.tsx`), background lifecycle dispatcher (`rulesDispatcher.ts`, `background/index.ts`), and command palette integrations (`commandRegistry.ts`, `useCommandExecutor.ts`).
*   **Audit Findings & Remediation:**
    *   *Zero-Contamination Boundary (Pass):* Zero static imports from `src/pro/` in `src/core/`, `src/features/`, or `src/lib/`. Extracted `src/pro/headless.ts` as a pure, React-free, DOM-free engine barrel export, allowing `src/background/index.ts` to import exclusively from `@/pro/headless`.
    *   *Service Worker Safety (Pass):* All DevTools console helpers (`window.__tabbellusDev`) are guarded by `typeof window !== 'undefined'`. Zero DOM dependencies exist in the headless dependency graph.
    *   *ReDoS & Algorithmic Security (Pass):* `RuleMatcher` bounds regex inputs to 250 characters, compiles inside `try/catch`, and escapes all wildcard metacharacters.
    *   *Idempotence & Lifecycle Garbage Collection (Pass):* `RuleExecutor` isolates each action in individual try/catch blocks and handles `DUPLICATE_TAB` idempotently. `rulesDispatcher` navigation debounce cache evicts closed tab entries via `chrome.tabs.onRemoved`.
    *   *React 19 Snapshot Stability (Pass):* `useRules` uses `useSyncExternalStore` with stable `EMPTY_RULES` snapshot and memoized callbacks. Dialog dismissals are fully guarded on toast interactions.
*   **Verification:** `501/501` unit tests passing across `47` test files (100% pass rate), 0 TypeScript errors (`tsc --noEmit`), and clean production build (`npm run build`).

### Phase 43.1: Milestone 4 — Part 1: Pure WebCrypto Engine & Key Store
*   **Architectural Scope:** Established the client-side Zero-Knowledge End-to-End Encryption (E2EE) foundation for Pro Cloud Sync within `src/pro/sync/crypto/`.
*   **Components & Implementations:**
    *   **Cryptographic Type Definitions (`src/pro/sync/crypto/types.ts`):** Defined `EncryptedVaultEnvelope` (version: 1, Base64 salt, Base64 12-byte IV, Base64 ciphertext with 16-byte auth tag, iterations: 600,000), `KeyDerivationOptions`, `KeyStoreRecord` (rawKey, salt, unlockedAt), `CryptoErrorCode` (`'INVALID_PASSPHRASE' | 'DECRYPTION_FAILED' | 'KEY_DERIVATION_FAILED' | 'SESSION_LOCKED'`), and custom error class `CryptoEngineError`.
    *   **Pure WebCrypto Implementation (`src/pro/sync/crypto/webCrypto.ts`):** `WebCryptoEngine` implements:
        *   `PBKDF2_ITERATIONS = 600_000`, `SALT_BYTE_LENGTH = 16`, `IV_BYTE_LENGTH = 12`, `KEY_BIT_LENGTH = 256`.
        *   `generateSalt()` via `crypto.getRandomValues`.
        *   `deriveKeyFromPassphrase(passphrase, salt, iterations)` using PBKDF2-HMAC-SHA256 deriving extractable 256-bit AES-GCM key.
        *   `encryptPayload(plaintext, key, salt, iterations)` using AES-GCM with fresh 12-byte IV per encryption, returning `EncryptedVaultEnvelope`.
        *   `decryptPayload(envelope, key)` using AES-GCM; catches `OperationError` (GCM auth tag verification failure / wrong key / bit flips) and maps directly to `CryptoEngineError('INVALID_PASSPHRASE')`.
        *   Deterministic, chunk-safe `uint8ArrayToBase64` and `base64ToUint8Array` running cleanly in Browser, Service Worker, and Node.js without Node `Buffer`.
    *   **Ephemeral Session Key Store (`src/pro/sync/crypto/keyStore.ts`):** `SessionKeyStore` singleton manages unlocked vault key lifecycle:
        *   Storage Key: `tabbellus_vault_session` in `chrome.storage.session`.
        *   In-memory caching (`cachedKey`, `cachedSalt`) for low-latency queries during active sidepanel operations.
        *   `saveSession(key, salt)` exports raw key to `chrome.storage.session` and populates cache.
        *   `loadSession()` returns from memory cache or re-imports raw key from `chrome.storage.session`.
        *   `clearSession()` purges both in-memory cache and session storage.
        *   `isUnlocked()` verifies unlock state.
        *   Fail-open guards: gracefully degrades to in-memory only storage if `chrome.storage.session` is undefined.
    *   **Barrel Exports (`src/pro/sync/crypto/index.ts`, `src/pro/sync/index.ts`):** Re-exported `WebCryptoEngine`, `SessionKeyStore`, `sessionKeyStore`, `CryptoEngineError`, and all types. Free Core boundary remains zero-contaminated.
*   **Testing Infrastructure:**
    *   `src/pro/sync/crypto/__tests__/webCrypto.test.ts` (17 tests): PBKDF2 key determinism, JSON roundtrip, bit tampering detection on ciphertext, auth tag mutation detection, IV tampering detection, wrong passphrase rejection, multiple encryptions producing distinct IVs, chunked Base64 binary roundtrips.
    *   `src/pro/sync/crypto/__tests__/keyStore.test.ts` (7 tests): Save/load lifecycle, raw key export/re-import decryption verification, cache invalidation on clear, unlock state check, fallback on missing `chrome.storage.session`, malformed storage handling.
    *   Test coverage increased from 501 to **525 passing tests across 49 test files** (100% pass rate).
*   **Verification:** Clean `tsc --noEmit` (0 errors), `npm test` (525/525 passing), clean production build (`npm run build` completed in 8.80s).

### Phase 43.2: Milestone 4 — Part 2: Vault Payload Serialization & E2EE Sync Engine Integration
*   **Architectural Scope:** Integrated Zero-Knowledge End-to-End Encryption (E2EE) seamlessly into the Google Drive `SyncEngine` orchestration pipeline with zero Free Core contamination.
*   **Contracts & Schema Upgrades:**
    *   **Sync State & Provider Interface (`src/core/contracts/sync.ts`, `src/core/contracts/registry.ts`):**
        *   Extended `SyncState` with `'locked'`.
        *   Added optional encryption lifecycle methods to `SyncProvider`: `setupEncryption?(passphrase: string): Promise<void>`, `unlockVault?(passphrase: string): Promise<boolean>`, `lockVault?(): Promise<void>`.
        *   Updated `NullSyncProvider` in Free Core with safe no-op fallbacks (`unlockVault` returns `false`, `setupEncryption` and `lockVault` resolve cleanly).
    *   **Storage & API Models (`src/pro/sync/engine/types.ts`, `src/pro/sync/api/types.ts`):**
        *   Extended `SyncStorageState` with `isEncrypted?: boolean` and `vaultSalt?: string`.
        *   Extended `VaultPayload` with `isEncrypted?: boolean` alongside existing `iv` and `salt`.
*   **Sync Engine Pipeline Integration (`src/pro/sync/engine/syncEngine.ts`):**
    *   **State & Storage Initialization:** On startup, reads `isEncrypted` from storage; if encrypted and `sessionKeyStore.isUnlocked()` is false, sets initial state to `'locked'` with `telemetry.encrypted = true`.
    *   **Race Condition Prevention:** Sets `this.isSyncing = true` synchronously at the top of `syncNow()` prior to any `await` calls, preventing concurrent overlapping sync executions.
    *   **Decryption Interceptor (Step 3):**
        *   Detects encrypted remote envelopes (`isEncrypted || (iv && salt)`), records `isEncrypted = true` and `vaultSalt` into local storage.
        *   If session key is missing, halts sync cleanly, transitions state to `'locked'`, and notifies subscribers.
        *   If unlocked, loads session and decrypts ciphertext via `WebCryptoEngine.decryptPayload`. On `INVALID_PASSPHRASE`, marks status as `'error'`, records telemetry, and exits early without mutating Dexie.
        *   Provides 100% backward compatibility for unencrypted `VaultPayload` and raw legacy snapshots.
    *   **Encryption Interceptor (Step 7):**
        *   If encryption is active, encrypts merged snapshot JSON with session key, uploads envelope with `schemaVersion: '2.0.0-e2ee'`, `isEncrypted: true`, random IV, and salt.
        *   If unencrypted, uploads standard payload with `schemaVersion: '1.0.0'` and `isEncrypted: false`.
    *   **Passphrase & Key Lifecycle Operations:**
        *   `setupEncryption(passphrase)`: Generates cryptographic salt, derives AES-GCM key with PBKDF2 (600,000 iterations), persists session, and triggers full encrypted sync upload (`forceFull: true`).
        *   `unlockVault(passphrase)`: Resolves salt from storage or remote envelope, derives key, verifies decryptability against remote ciphertext, caches session, sets state to `'idle'`, and triggers reconciliation.
        *   `lockVault()`: Purges session key from `chrome.storage.session` and memory cache, sets state to `'locked'`, and halts background sync cycles.
*   **Testing Infrastructure:**
    *   `src/core/__tests__/registry.test.ts` (37 tests): Verified `NullSyncProvider` safe no-op handling for encryption methods.
    *   `src/pro/sync/engine/__tests__/syncEngine.test.ts` (15 tests): Added 6 comprehensive E2EE tests:
        1. Encrypted remote download pauses sync and enters `'locked'` state with intact Dexie when session key is missing.
        2. `unlockVault` with valid passphrase unlocks session and completes full reconciliation.
        3. `unlockVault` with invalid passphrase returns `false` without corrupting local Dexie.
        4. `setupEncryption` converts unencrypted state into encrypted upload payload with valid `iv` and `salt`.
        5. Seamless backward-compatible download and reconciliation of legacy unencrypted `VaultPayload`.
        6. `lockVault()` purges session key and prevents subsequent background sync flushes until unlocked.
    *   Full test suite raised to **532/532 passing tests across 49 test files** (100% pass rate).
*   **Verification:** Clean `tsc --noEmit` (0 errors), `npm test` (532/532 passing), production build (`npm run build` completed in 8.51s).

### Phase 43.3: Milestone 4 — Part 3: UI Integration, Passphrase Setup Modal & Vault Unlock Dialogs
*   **Architectural Scope:** Delivered high-density, accessible UI surfaces for Zero-Knowledge End-to-End Encryption (E2EE) management in the Settings Data tab.
*   **Component Implementations:**
    *   **Pure Logic Helpers (`src/pro/sync/components/encryptionModalLogic.ts` & `unlockModalLogic.ts`):**
        *   `calculatePassphraseStrength(passphrase)`: Pure evaluator calculating strength score from 0 to 4 based on length ($\ge 8$, $\ge 12$), uppercase, lowercase, numbers, and symbols. Returns score, human-readable labels (`'Too Weak'`, `'Weak'`, `'Fair'`, `'Strong'`, `'Very Strong'`), and progressive color classes.
        *   `validateSetupDraft(passphrase, confirm)`: Enforces non-empty, minimum 8 characters, and exact confirmation match.
        *   `validateUnlockDraft(passphrase)`: Enforces non-empty passphrase string.
    *   **Passphrase Setup Dialog (`src/pro/sync/components/EncryptionSetupModal.tsx`):** Controlled Radix `<Dialog>` featuring zero-knowledge disclaimer box (warning that TabBellus holds no master recovery keys), show/hide passphrase toggles, live 4-segment strength bar, confirmation match checks, and async `syncEngine.setupEncryption` trigger with loading spinner and toast notifications.
    *   **Vault Unlock Dialog (`src/pro/sync/components/VaultUnlockModal.tsx`):** Controlled Radix `<Dialog>` prompting for passphrase on locked devices with auto-focus, show/hide toggle, inline validation errors, and an expandable emergency "Forgot Passphrase?" section with a double-confirmation cloud reset flow.
    *   **Sync Settings Card Upgrades (`src/pro/sync/components/SyncSettingsCard.tsx`):**
        *   Reactive status pills: amber `"Vault Locked"` (`Lock`), emerald `"E2E Encrypted"` (`ShieldCheck`), and muted `"Standard Sync"` (`Shield`).
        *   Action trays: Primary `"Unlock Vault"` button opening `<VaultUnlockModal>` when locked; `"Enable E2EE"` trigger opening `<EncryptionSetupModal>` when connected and unencrypted; subtle `"Lock"` button purging session key and entering locked state when active.
        *   Telemetry tile displaying `appDataFolder (E2EE)` when encrypted.
    *   **Barrel Exports (`src/pro/sync/components/index.ts`):** Re-exported `EncryptionSetupModal`, `VaultUnlockModal`, `SyncSettingsCard`, and all logic helpers.
*   **Testing Infrastructure:**
    *   `src/pro/sync/components/__tests__/encryptionModalLogic.test.ts` (11 tests): Tested strength scoring across empty, short, low-variety, medium, strong, and long/complex passphrases; tested validation for empty, short, mismatching, and valid drafts.
    *   `src/pro/sync/components/__tests__/unlockModalLogic.test.ts` (3 tests): Tested rejection of empty and whitespace passphrases, and acceptance of valid passphrases.
    *   `src/pro/sync/components/__tests__/SyncSettingsCard.test.tsx` (7 tests): Added tests verifying locked state with "Vault Locked" badge and "Unlock Vault" CTA, active E2EE state with "E2E Encrypted" badge and "Lock" action, and standard unencrypted state with "Standard Sync" badge and "Enable E2EE" action.
    *   Full test suite raised to **549/549 passing tests across 51 test files** (100% pass rate).
*   **Verification:** Clean `tsc --noEmit` (0 errors), `npm test` (549/549 passing), production build (`npm run build` completed in 9.13s).

### Phase 43.4: Milestone 4 — Part 4: Multi-Master Tab Deduplication, Empty Space Adoption & Tab Pruning
*   **Architectural Scope:** Resolved multi-master tab duplication, ghost tab resurrection, tab count divergence (e.g. 13 vs 14), and empty space fragmentation in the Pro cloud sync reconciler (`DiffEngine`).
*   **Engine & Serializer Enhancements:**
    *   **URL Normalization (`normalizeTabUrl`):** Pure utility stripping hash fragments (`parsed.hash = ''`), trailing slashes on root paths (`href.endsWith('/') && parsed.pathname === '/'`), and trimming whitespace to ensure deterministic cross-device URL comparisons.
    *   **Empty Space Placeholder Adoption:** In `DiffEngine.reconcileSpaces`, unmatched remote spaces fall back to inspect active (`deletedAt === undefined`) local spaces with the exact same name and 0 local tabs. When found, the remote space binds to the local space ID (`remoteToLocalSpaceId`), updating local metadata (`createdAt`, `color`) without generating a duplicate space.
    *   **Self-Healing Remote Tab Deduplication:** In `DiffEngine.reconcileTabs`, incoming remote tabs within each space are pre-deduplicated by `normalizeTabUrl(tab.url)`. If corrupted remote snapshots in Google Drive contain duplicates, only the tab with the lowest `order` index is retained, automatically cleansing corrupted cloud vaults.
    *   **Local Primary Key Binding:** In `DiffEngine.reconcileTabs`, when a remote tab matches an existing local tab by normalized URL within a space, `tabToUpsert.id` is explicitly bound to `existingLocalTab.id`. This ensures Dexie's `db.tabs.bulkPut` performs an in-place update rather than generating new auto-increment rows. New tabs omit `id` (leave `undefined`) so Dexie safely generates auto-increment primary keys without collision.
    *   **Pruning Timestamp Ground Truth:** Since `Space` in `db.ts` lacks an `updatedAt` field, `DiffEngine.reconcileTabs` accepts `localLastSyncedAt: number` (hydrated from `SyncStorageState.lastSyncedAt ?? 0`). For spaces known to both devices, local tabs absent from the incoming remote list are only pruned if `remoteClientTimestamp > localLastSyncedAt`. Pruned tabs are added to `localUpdates.tabIdsToDelete` and omitted from `mergedTabs`.
    *   **Atomic Bulk Deletion (`SnapshotSerializer.applyRemoteUpdates`):** Executes `await db.tabs.bulkDelete(updates.tabIdsToDelete)` inside the atomic read-write transaction (`db.transaction('rw', [db.spaces, db.tabs, db.readLater])`) prior to `bulkPut`.
*   **Testing Infrastructure:**
    *   `src/pro/sync/engine/__tests__/diffEngine.test.ts` (16 tests):
        1. `"Idempotent multi-cycle sync does not duplicate tabs"` (verified across 4 consecutive reconciliation cycles that tab count remains strictly $N$, never $2N$, $3N$, or $4N$).
        2. `"Adopts empty local space with matching name instead of duplicating"`.
        3. `"Prunes deleted tabs when remote snapshot has fewer tabs"`.
        4. `"Does not prune local tabs when localLastSyncedAt is more recent than remote snapshot"`.
        5. `"cleanses duplicate remote tabs within space by keeping lowest order index"`.
        6. `"normalizeTabUrl"` tests for root slashes, anchors, whitespace, and non-standard schemes.
    *   `src/pro/sync/engine/__tests__/snapshotSerializer.test.ts` (7 tests): Added test verifying atomic `bulkDelete` execution on `tabIdsToDelete`.
    *   Full test suite raised to **557/557 passing tests across 51 test files** (100% pass rate).
*   **Verification:** Clean `tsc --noEmit` (0 errors), `npm test` (557/557 passing).

### Phase 43.5: Milestone 5 — Step 1: Dexie Schema Version 4 & Soft-Delete Architecture
*   **Architectural Scope:** Eliminated the fundamental cause of cloud sync ghost tab resurrection and data loss by introducing non-destructive soft-delete tombstones (`deletedAt?: number`) across all tab and Read Later records, accompanied by defensive revival and backup export sanitization.
*   **Dexie Schema Evolution (`src/lib/db.ts`):**
    *   **Version 4 Store Declaration:** Added `this.version(4).stores({ tabs: '++id, spaceId, url, order, deletedAt, [spaceId+order]', readLater: '++id, url, status, addedAt, deletedAt' })` without modifying historic version 1, 2, or 3 definitions.
    *   **Tombstone Interfaces:** Extended `Tab` and `ReadLaterItem` interfaces with optional `deletedAt?: number`.
    *   **Atomic Helpers:** Added `softDeleteTab`, `undoDeleteTab`, `softDeleteReadLater`, and `undoDeleteReadLater` in `TabBellusDB`.
*   **Space Domain Service Refactoring (`src/lib/spaceService.ts`):**
    *   **Tab Soft Deletion (`deleteTab`):** Soft deletes tabs by recording `{ deletedAt: Date.now() }` rather than permanently dropping rows from IndexedDB.
    *   **Tab Restoration (`restoreTab`):** Restores tabs by clearing the tombstone (`{ deletedAt: undefined }`). Supports both `number` primary key and `Tab` object (via `db.tabs.put`).
    *   **Query Filtering:** `getTabsForSpaceQuery` and `getTabsForSpace` use Dexie native index traversal (`.sortBy('order')`) followed by post-filtering active records (`.then(tabs => tabs.filter(t => !t.deletedAt))`), preserving high-throughput query velocity (500 tabs processed in 5.36ms).
    *   **Defensive Revival (`addTabToSpace`):** When adding a tab, checks active tabs for duplicate URL. If inactive tombstoned records exist for that URL, selects at most one record to revive (`deletedAt: undefined`), positions it at the tail of active items (`nextOrder`), updates title and favicon, and purges any redundant secondary tombstones (`db.tabs.bulkDelete(redundantIds)`).
    *   **Active Isolation:** `duplicateSpace`, `restoreSpace`, `getSavedTabsGroupedByUrl`, `moveTabBetweenSpaces`, and `copyTabToSpace` strictly operate on active records (`!t.deletedAt`).
*   **Read Later Domain Service Refactoring (`src/lib/readLaterService.ts`):**
    *   **Item Soft Deletion (`deleteItem`):** Soft deletes items by recording `{ deletedAt: Date.now() }`.
    *   **Item Restoration (`restoreItem`, `restoreItems`):** Restores records by clearing `{ deletedAt: undefined }` using `put` for item objects and `update` for numeric IDs.
    *   **Archived Purging (`clearAllArchived`):** Soft deletes active archived items by setting `{ deletedAt: Date.now() }` and returns snapshots for undo recovery.
    *   **Defensive Revival (`addFromTab`):** If tombstoned items exist with identical URL, revives primary record (`deletedAt: undefined`, `status: 'unread'`), updates metadata, and cleanses secondary tombstones.
    *   **Active Query Isolation:** `getItemsByStatusQuery`, `getUnreadCountQuery`, `getAllItems`, `getDistinctDomains`, and `archiveAllUnread` filter out soft-deleted items.
*   **Backup Export Sanitization (`src/lib/dataService.ts`):**
    *   `exportData()` filters out soft-deleted spaces, tabs, and readLater items (`!s.deletedAt`, `!t.deletedAt`, `!r.deletedAt`).
    *   `exportSpaceAsJson(spaceId)` rejects soft-deleted spaces and filters out soft-deleted tabs, ensuring exported JSON backups never contain ghost tombstones.
*   **Testing Infrastructure:**
    *   `src/lib/__tests__/spaceService.test.ts` (27 tests): Added tests for tab soft-delete retention in IndexedDB, active query exclusion, tab restoration, and defensive revival with redundant tombstone purging.
    *   `src/lib/__tests__/readLaterService.test.ts` (15 tests): Updated test case 9 for soft delete assertions, added single item soft-delete and restoration, and defensive revival with redundant tombstone purging.
    *   `src/lib/__tests__/dataService.test.ts` (10 tests): Added test case 10 verifying export sanitization for both full backups and single space exports.
    *   Full test suite raised to **563/563 passing tests across 51 test files** (100% pass rate).
*   **Verification:** Clean `tsc --noEmit` (0 errors), `npm test` (563/563 passing), production build (`npm run build` completed in 12.73s).

### Phase 43.6: Milestone 5 — Step 2: Neutralize Background Saboteur (performSync Delta Upsert)
*   **Architectural Scope:** Neutralized the background service worker tab synchronizer (`performSync`) which previously executed destructive `db.tabs.where({ spaceId }).delete()` on window tab events, obliterating auto-increment primary keys, destroying soft-delete tombstones, and causing cross-device sync thrashing and tab multiplication.
*   **Zero-Contamination Utility Relocation:**
    *   **Tab URL Normalizer (`src/lib/tabService.ts`):** Moved `normalizeTabUrl(rawUrl: string): string` into Free Core `tabService.ts`. Strips `#hash` scroll anchors, root path trailing slashes, and trims whitespace with safe fallback for non-standard schemes.
    *   **Pro Inversion:** `src/pro/sync/engine/diffEngine.ts` now imports `normalizeTabUrl` from `@/lib/tabService` and re-exports it for backward compatibility.
    *   **Zero-Contamination Compliance:** `src/background/tabSyncService.ts` and `src/background/index.ts` import `normalizeTabUrl` strictly from `@/lib/tabService`, maintaining zero static imports from `src/pro/` in Free Core background code.
*   **In-Place Delta Upsert Architecture (`src/background/tabSyncService.ts`):**
    *   **Signature:** `performSync(windowId: number, explicitSpaceId?: number)` resolves `spaceId` from `explicitSpaceId` or looks up the tracked window from `chrome.storage.session.get('activeSpaces')`.
    *   **Pre-Filter Safeguard:** Filters out internal browser schemes (`chrome://`, `chrome-extension://`, `about:`, `edge://`). If 0 valid tabs exist, returns early without touching IndexedDB.
    *   **In-Place Primary Key Binding:** Groups existing space tabs by `normalizeTabUrl(tab.url)`. Open tabs matching an existing active record retain `id: existingTab.id`, update `order`, `title`, and `favicon`, with `deletedAt: undefined`.
    *   **Tombstone Revival:** Open tabs matching a soft-deleted record revive it in place (`deletedAt: undefined`), preserving the original row primary key.
    *   **Closed Tab Tombstoning:** Any existing active tabs for the space that are no longer open in the Chrome window are marked with `{ ...existingTab, deletedAt: Date.now() }`.
    *   **Atomic Bulk Put:** Replaced destructive `db.tabs.where({ spaceId }).delete()` and `bulkAdd()` with an atomic `await db.tabs.bulkPut(tabsToUpsert)` within `db.transaction('rw', db.tabs)`.
*   **Testing Infrastructure:**
    *   `src/background/__tests__/tabSyncService.test.ts` (5 tests):
        1. `"should update tab order and metadata in place while strictly preserving original auto-increment IDs"`.
        2. `"should tombstone closed tabs with deletedAt instead of destroying rows"`.
        3. `"should revive a tombstoned tab when reopened and preserve its original ID"`.
        4. `"should resolve spaceId from session storage activeSpaces when not explicitly provided"`.
        5. `"should safely skip execution if window contains only internal or invalid URLs"`.
    *   Full test suite raised to **568/568 passing tests across 52 test files** (100% pass rate).
*   **Verification:** Clean `tsc --noEmit` (0 errors), `npm test` (568/568 passing), production build (`npm run build` completed in 8.69s).

### Phase 43.7: Milestone 5 — Step 3: Symmetric Tombstone Reconciliation in DiffEngine
*   **Architectural Scope:** Implemented symmetric tombstone reconciliation and deduplication across both `tabs` and `readLater` domains within `src/pro/sync/engine/diffEngine.ts`. Prevents tab resurrection loops and ghost record propagation across multiple syncing devices.
*   **Symmetric 4-Case Tombstone LWW Reconciliation for Tabs (`reconcileTabs`):**
    *   **Case 1 (Local Tombstone vs Remote Active):** If `localTab.deletedAt > remoteClientTimestamp`, the local deletion occurred after the remote snapshot was taken; local tombstone wins (`deletedAt: localTab.deletedAt`), preventing tab resurrection. If `remoteClientTimestamp >= localTab.deletedAt`, the remote device modified or reopened the tab after deletion; remote wins, reviving the tab locally (`deletedAt: undefined`).
    *   **Case 2 (Remote Tombstone vs Local Active):** If `remoteTab.deletedAt > localLastSyncedAt`, the remote deletion occurred after this machine's baseline sync; remote tombstone wins, queuing `tabToUpsert` with `deletedAt: remoteTab.deletedAt` into `localUpdates.tabs` for in-place soft-delete without row destruction. If `localLastSyncedAt >= remoteTab.deletedAt`, local activity is newer; local wins, keeping the tab active.
    *   **Case 3 (Both Active):** Preserves local `id`, updates metadata/order in place.
    *   **Case 4 (Both Tombstoned):** Preserves newest tombstone (`Math.max(localTab.deletedAt, remoteTab.deletedAt)`).
    *   **Unmatched Remote Tombstones:** If a remote tab is tombstoned and does not exist locally, it is retained in `mergedTabs` for cloud propagation but omitted from `localUpdates.tabs` to prevent cluttering local IndexedDB.
*   **Symmetric Tombstone & Self-Healing Reconciliation for Read Later (`reconcileReadLater`):**
    *   **Pre-Deduplication:** Sanitizes and deduplicates incoming `remote.readLater` array by `normalizeTabUrl(item.url)` before reconciliation. Resolves duplicates by favoring `'archived'` status, active over tombstoned (or latest deletion timestamp), and highest `addedAt`.
    *   **4-Case Tombstone Resolution:** Applies identical symmetric LWW logic using `item.deletedAt` against `remoteClientTimestamp` and `localLastSyncedAt`.
    *   **Status Convergence:** For active items, converges toward `'archived'` status if either device has marked the item archived.
    *   **In-Place Primary Key Binding:** Preserves local Dexie primary key `id` on matched updates so `bulkPut` updates records in place.
*   **Testing Infrastructure (`src/pro/sync/engine/__tests__/diffEngine.test.ts`):**
    *   Added 4 new comprehensive test cases:
        1. `"preserves local tab tombstone when localTab.deletedAt > remoteClientTimestamp without resurrecting locally"`
        2. `"propagates remote soft-deleted tab when remoteTab.deletedAt > localLastSyncedAt"`
        3. `"preserves local Read Later tombstone when localItem.deletedAt > remoteClientTimestamp"`
        4. `"cleanses duplicate URLs in remote readLater snapshot and prefers archived status"`
    *   Test suite raised from 16 to **20 passed tests** in `diffEngine.test.ts`.
    *   Full test suite raised to **572/572 passing tests across 52 test files** (100% pass rate).
### Phase 43.8: Milestone 5 — Step 4: Cross-Context Web Lock Mutex in SyncEngine
*   **Architectural Scope:** Implemented a cross-context Web Lock Mutex helper `withSyncLock` in `src/pro/sync/engine/syncEngine.ts` to prevent race conditions, concurrent cloud vault writes, and re-entrant sync loops between the sidepanel, background service worker, and popup.
*   **Web Lock Mutex Algorithm (`withSyncLock`):**
    *   **Primary Path (Web Locks API):** Checks `typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function'`. Requests lock `tabbellus_sync_vault` with `{ ifAvailable: true }`. If another extension context already holds the lock, logs `[SyncEngine] Skipping ${operationName}: lock held by another context` and immediately invokes `onContention()`. If granted, sets `this.isSyncing = true`, executes `action()`, and guarantees `this.isSyncing = false` in a `finally` block.
    *   **Fallback Path (In-Memory Mutex):** If `navigator.locks` is unavailable (e.g. Node test environment), checks `this.isSyncing`. If already syncing, logs debug message and returns `onContention()`. Sets `this.isSyncing = true`, executes `action()`, and resets `this.isSyncing = false` in a `finally` block.
*   **Protected Operations:**
    *   `syncNow(options)`: Delegates core synchronization cycle to `executeSync` inside `withSyncLock`. On contention, returns `{ success: false, error: 'Sync already in progress.', timestamp: Date.now() }` cleanly without mutating sync status, firing erroneous error toasts, or altering Dexie state.
    *   `setupEncryption(passphrase)`: Reconfigurations run under `withSyncLock('setupEncryption')` and call `executeSync({ forceFull: true })` without contention deadlock.
    *   `resetCloudVault()`: Emergency reset wipes session keys and triggers an unencrypted sync upload under `withSyncLock('resetCloudVault')`.
    *   `SyncProvider` Contract (`src/core/contracts/sync.ts`): Added optional `resetCloudVault?(): Promise<void>`.
*   **Testing Infrastructure (`src/pro/sync/engine/__tests__/syncEngine.test.ts`):**
    *   Added 3 new comprehensive test cases in `Cross-Context Web Lock Mutex`:
        1. `"requests lock 'tabbellus_sync_vault' with { ifAvailable: true } and runs to completion when available"`
        2. `"skips sync execution when navigator.locks.request yields null (simulating concurrent context)"` (asserts 0 Google Drive calls, 0 Dexie mutations, and idle status retention)
        3. `"falls back to in-memory mutex when navigator.locks is undefined to prevent re-entrant calls"`
    *   Test suite raised from 15 to **18 passed tests** in `syncEngine.test.ts`.
    *   Full test suite raised to **575/575 passing tests across 52 test files** (100% pass rate).
### Phase 43.9: Milestone 5 — Step 5: Google Drive Upload Bypass Fix & Dual Change Detection
*   **Architectural Scope:** Resolved silent cloud upload bypass and number-vs-string JavaScript comparison failures during sync reconciliation across `src/pro/sync/engine/diffEngine.ts`, `src/pro/sync/engine/types.ts`, and `src/pro/sync/engine/syncEngine.ts`.
*   **Safe Epoch Conversion (`toEpochMs`):**
    *   Created and exported `toEpochMs(timestamp: string | number | undefined | null): number` in `diffEngine.ts`.
    *   Eliminated silent `NaN` comparison bugs where JavaScript evaluates `number > string` as `false` when comparing Dexie timestamps (`1725372000000`) against ISO strings from Google Drive (`'2026-09-03T14:30:00.000Z'`).
    *   Applied `toEpochMs` across all 4-case LWW comparisons in `reconcileSpaces`, `reconcileTabs`, and `reconcileReadLater`.
*   **Dual Change Detection (`ReconciliationResult`):**
    *   Extended `ReconciliationResult` in `src/pro/sync/engine/types.ts`:
        *   `hasLocalChanges: boolean`: Set to `true` when `localUpdates.spaces.length > 0 || localUpdates.tabs.length > 0 || localUpdates.readLater.length > 0 || tabIdsToDelete.length > 0`.
        *   `hasRemoteChanges: boolean`: Set to `true` when `mergedSnapshot` differs from `remoteSnapshot` in count, order, titles, URLs, or soft-delete tombstones (`mergedTab.deletedAt !== remoteTab.deletedAt`). Ensures local deletions are promptly uploaded to Google Drive even when local IndexedDB requires zero updates.
        *   `hasChanges: boolean`: Disjunction `hasLocalChanges || hasRemoteChanges`.
*   **Decoupled Step 6 and Step 7 in SyncEngine (`src/pro/sync/engine/syncEngine.ts`):**
    *   Step 6: Applies incoming updates to local Dexie only `if (reconciliation.hasLocalChanges)`.
    *   Step 7: Overwrites Google Drive vault file `if (reconciliation.hasRemoteChanges || options?.forceFull)`.
*   **Testing Infrastructure (`src/pro/sync/engine/__tests__/diffEngine.test.ts`):**
    *   Added 7 new unit test cases covering:
        1. `toEpochMs` numeric direct pass-through.
        2. `toEpochMs` ISO string parse and conversion.
        3. `toEpochMs` comparison between `Date.now()` and ISO string.
        4. `toEpochMs` fallback for null, undefined, empty, and invalid strings.
        5. Local tab deletion sets `hasRemoteChanges: true` while `hasLocalChanges: false`.
        6. Identical snapshots set all change flags to `false`.
        7. Seamless handling of ISO string `clientTimestamp` in remote snapshot without comparison error.
    *   Test suite raised from 20 to **27 passed tests** in `diffEngine.test.ts`.
    *   Full test suite raised to **582/582 passing tests across 52 test files** (100% pass rate).
*   **Verification:** Clean `tsc --noEmit` (0 errors), `npm test` (582/582 passing), production build (`npm run build` completed in 12.42s).

### Phase 43.10: Milestone 5 — Step 6: Debounced Auto-Sync on Local Mutations & Sidepanel Mount Sync
*   **Architectural Scope:** Implemented reactive auto-sync orchestration, connecting Free Core user mutations to the Pro Google Drive sync engine without violating the Zero-Contamination Boundary, along with sidepanel mount synchronization.
*   **Free Core Event Bus (`src/core/contracts/registry.ts`, `src/core/contracts/sync.ts`):**
    *   Added `SyncOptions` interface with `forceFull?: boolean` and `silent?: boolean` (suppresses UI toast noise during background auto-sync).
    *   Extended `SyncProvider` contract with `syncNow(options?: SyncOptions): Promise<SyncResult>` and optional `dispose?(): void`.
    *   Implemented `localMutationListeners = new Set<() => void>()`, `notifyLocalMutation(): void`, and `subscribeLocalMutation(callback: () => void): () => void` in `ContractRegistry`.
    *   Isolated listener execution with `try / catch` so individual subscriber errors never disrupt other listeners.
    *   Reset `localMutationListeners.clear()` in `ContractRegistry.reset()`.
    *   Exported standalone helpers `notifyLocalMutation` and `subscribeLocalMutation` from `src/core/contracts/registry.ts` and `src/core/index.ts`.
*   **Domain Service Instrumentation (Free Core):**
    *   Injected `contractRegistry.notifyLocalMutation()` at the conclusion of all user mutation operations:
        *   `src/lib/spaceService.ts` (15 methods): `createEmptySpace`, `captureCurrentWindow`, `createSpaceFromTabs`, `softDeleteSpace`, `undoDeleteSpace`, `hardDeleteSpace`, `updateSpaceName`, `updateSpaceColor`, `updateSpaceDetails`, `toggleSpacePin`, `addTabToSpace`, `deleteTab`, `restoreTab`, `moveTabBetweenSpaces`, `copyTabToSpace`.
        *   `src/lib/readLaterService.ts` (7 methods): `deleteItem`, `restoreItem`, `restoreItems`, `addFromTab`, `updateStatus`, `archiveAllUnread`, `clearAllArchived`.
    *   **Anti-Echo Guard Maintained:** `src/pro/sync/engine/snapshotSerializer.ts` does NOT emit `notifyLocalMutation()`, guaranteeing remote downloads and IndexedDB writes never trigger ping-pong sync loops.
*   **Debounced Auto-Sync Engine (`src/pro/sync/engine/syncEngine.ts`):**
    *   Subscribed to `contractRegistry.subscribeLocalMutation()` in `SyncEngine` constructor.
    *   Implemented `handleLocalMutation()` with a 3000ms debounce timer (`AUTO_SYNC_DEBOUNCE_MS = 3000`).
    *   Rapid consecutive mutations cancel any in-flight debounce timer and reschedule, coalescing bursts of edits into a single sync operation.
    *   Fails fast and skips scheduling when disconnected (`!status.isConnected`) or vault is locked (`status.state === 'locked'`).
    *   Cancels active debounce timers on `disconnect()`, `lockVault()`, and `dispose()`.
    *   Executes `this.syncNow({ silent: true })` inside `withSyncLock`, ensuring re-entrant safety and zero collision with manual user syncs.
*   **Sidepanel Mount Synchronization (`src/sidepanel/index.tsx`):**
    *   In the root `useEffect`, after dynamic Pro bootstrap completes, queued a 500ms mount sync check.
    *   Queries `syncProvider.getStatus()`; if `status.isConnected && status.state !== 'locked'`, dispatches `syncProvider.syncNow({ silent: true })`.
    *   Includes unmount cleanup cancelling pending mount timers.
*   **Testing Infrastructure:**
    *   `src/core/__tests__/registry.test.ts`: Added 5 unit tests for `Local Mutation Event Bus` (notification dispatch, unsubscription, `reset()` purging, error isolation, standalone helper exports). Test suite raised from 37 to **42 tests**.
    *   `src/pro/sync/engine/__tests__/syncEngine.test.ts`: Added 5 unit tests for `Debounced Auto-Sync` (3000ms debounce trigger with `{ silent: true }`, rapid consecutive mutation timer reset, disconnected state ignore, locked vault state ignore, timer cancellation on disconnect/lock). Test suite raised from 18 to **23 tests**.
    *   Full test suite raised to **592/592 passing tests across 52 test files** (100% pass rate).
*   **Verification:** Clean `tsc --noEmit` (0 errors), `npm test` (592/592 passing), production build (`npm run build` completed in 9.19s).

### Phase 43.11: E2EE Teardown & Vault Reset to Standard Cloud Sync
*   **Free Core Extension Contracts (`src/core/contracts/`):**
    *   `src/core/contracts/sync.ts`: Extended `SyncProvider` contract interface with optional `disableEncryption?(): Promise<void>;` and documented `resetCloudVault?(): Promise<void>;`.
    *   `src/core/contracts/registry.ts`: Added no-op fallback methods `async disableEncryption(): Promise<void> {}` and `async resetCloudVault(): Promise<void> {}` to `NullSyncProvider`.
*   **SyncEngine Teardown & Overwrite Architecture (`src/pro/sync/engine/syncEngine.ts`):**
    *   **`disableEncryption(): Promise<void>`:**
        *   Guarded with `withSyncLock('disableEncryption')` to ensure atomic, non-overlapping execution.
        *   Fails fast if not connected (`!status.isConnected`).
        *   Step 1: Purges active ephemeral session keys (`await sessionKeyStore.clearSession()`).
        *   Step 2: Resets storage state (`await this.saveStorageState({ isEncrypted: false, vaultSalt: undefined, lastError: undefined })`).
        *   Step 3: Updates in-memory telemetry immediately (`telemetry.encrypted = false`).
        *   Step 4: Dispatches `executeSync({ forceFull: true, forceUnencrypted: true })` — Step 3 bypasses remote decryption checks while preserving existing `vaultFileId`, and Step 7 serializes unencrypted plaintext JSON with `schemaVersion: '1.0.0'` and `isEncrypted: false` (no `iv` or `salt`), replacing the remote Drive vault.
        *   Step 5: Transitions state to `'synced'`, updates `telemetry.encrypted = false`, and notifies subscribers.
    *   **`resetCloudVault(): Promise<void>`:**
        *   Refined emergency reset flow when a user has forgotten their passphrase on a locked device.
        *   Clears `sessionKeyStore`, resets `storageState.isEncrypted = false` and `vaultSalt = undefined`, and calls `executeSync({ forceFull: true, forceUnencrypted: true })`.
        *   Overwrites the remote encrypted vault file with the current device's local unencrypted data snapshot, and transitions state to `'synced'`.
*   **UI Controls & Confirmation Surfaces (`src/pro/sync/components/`):**
    *   **`SyncSettingsCard.tsx`:**
        *   When vault is connected, encrypted, and unlocked (`telemetry.encrypted && status.state !== 'locked'`), renders `"Disable E2EE"` secondary action button with `ShieldOff` icon next to `"Lock"`.
        *   Clicking `"Disable E2EE"` opens a controlled Radix `Dialog` ("Disable End-to-End Encryption?") explaining that the cloud vault will be replaced with standard unencrypted JSON.
        *   Confirmation triggers `syncEngine.disableEncryption()`, displays loading spinner, closes dialog, and fires toast `"E2E Encryption Disabled: Cloud vault reverted to standard sync."`.
    *   **`VaultUnlockModal.tsx`:**
        *   Enhanced the expandable "Lost your passphrase?" drawer with clear zero-knowledge notice: *"Resetting will overwrite your remote Google Drive vault with the unencrypted data currently stored on this device."*
        *   Action button `"Reset Cloud Vault"` triggers double-confirmation with warning prompt text *"Are you sure? This cannot be undone."*.
        *   Confirmation calls `syncEngine.resetCloudVault()`, closes modal, and displays toast `"Cloud Vault Reset: Encryption removed and local data synchronized."`.
*   **Testing & Quality Metrics:**
    *   `src/pro/sync/engine/__tests__/syncEngine.test.ts`: Added unit tests for `disableEncryption()` (key purge, `vaultSalt` clear, and unencrypted `schemaVersion: '1.0.0'` upload) and `resetCloudVault()` (overwriting locked remote vault with unencrypted snapshot and transitioning to synced). Suite raised to **25 tests**.
    *   `src/pro/sync/components/__tests__/SyncSettingsCard.test.tsx`: Verified `"Disable E2EE"` button renders in active E2EE state. Suite maintains **7 tests**.
    *   `src/core/__tests__/registry.test.ts`: Verified `NullSyncProvider.disableEncryption()` and `resetCloudVault()` resolve safely. Suite maintains **42 tests**.
    *   Full test suite raised to **594/594 passing tests across 52 test files** (100% pass rate).
    *   Clean `npx tsc --noEmit` (0 errors), clean `npm run build` (built in 11.69s).

---

### Phase 43.10: Fix 3-Second Auto-Sync Reversal in Read Later & Tab Duplication on Move
*   **Root Cause Analysis:**
    1.  *Read Later Status Ratchet:* `DiffEngine.reconcileReadLater` contained a one-way status ratchet (`localItem.status === 'archived' || remoteItem.status === 'archived' ? 'archived' : ...`). When a user marked an archived item as unread locally, the debounced auto-sync fired 3 seconds later, saw that the remote cloud snapshot was `'archived'`, and reversed the local status back to `'archived'`.
    2.  *Tab Move Duplication:* `SpaceService.moveTabBetweenSpaces` mutated `sourceTab.spaceId = targetSpaceId` in-place without leaving a tombstone in the source space. When multi-master sync reconciled against the remote vault (which still held the tab in the source space), local had no tombstone record for the tab in the source space, causing the remote tab to be resurrected in the source space while also existing in the target space.
*   **Implementation Details:**
    *   **Read Later LWW Status Reconciliation (`src/lib/db.ts`, `readLaterService.ts`, `diffEngine.ts`):**
        *   `src/lib/db.ts`: Extended `ReadLaterItem` interface with optional `updatedAt?: number`.
        *   `src/lib/readLaterService.ts`: Injected `updatedAt: Date.now()` on `updateStatus`, `addFromTab` (both insert and revival), and `archiveAllUnread`.
        *   `src/pro/sync/engine/diffEngine.ts`: Eliminated the one-way `'archived'` status ratchet in `reconcileReadLater`. Implemented symmetric timestamp-based Last-Write-Wins:
            ```typescript
            const localUpdated = toEpochMs(localItem.updatedAt ?? localItem.addedAt);
            const remoteUpdated = toEpochMs(remoteItem.updatedAt ?? remoteClientTimestamp);
            const remoteWins = remoteUpdated > localUpdated;
            const mergedStatus = remoteWins ? remoteItem.status : localItem.status;
            ```
            Preserved `updatedAt = Math.max(localUpdated, remoteUpdated)` on `mergedItem` when present.
    *   **Space Tab Move Tombstone Integrity (`src/lib/spaceService.ts`):**
        *   Refactored `moveTabBetweenSpaces(tabId, targetSpaceId)` inside atomic Dexie transaction `db.transaction('rw', [db.tabs, db.spaces])`.
        *   Soft-deletes the source tab (`await db.tabs.update(tabId, { deletedAt: Date.now() })`) to establish an authoritative tombstone preventing remote resurrection.
        *   Calls `await this.addTabToSpace(targetSpaceId, ...)` to add or revive the tab in the target space.
        *   Updated `restoreTabPosition` to clear `deletedAt: undefined` upon undo.
*   **Testing & Quality Metrics:**
    *   `src/pro/sync/engine/__tests__/diffEngine.test.ts`: Added test `"preserves local 'unread' status when localItem.updatedAt > remoteClientTimestamp despite remote being 'archived'"`. Suite raised to **28 tests**.
    *   `src/lib/__tests__/spaceService.test.ts`: Added test `"moveTabBetweenSpaces soft-deletes the source tab with deletedAt timestamp and creates active tab in target space"`. Suite raised to **28 tests**.
    *   Full test suite raised to **596/596 passing tests across 52 test files** (100% pass rate).
    *   `npx tsc --noEmit`: 0 diagnostics.
    *   `npm run build`: Production build succeeded in 8.95s.

<!-- Last Updated: 2026-09-03 (Milestone 5 — Phase 8: Fix 3-Second Auto-Sync Reversal in Read Later & Tab Duplication on Move: 596 Unit Tests Passing across 52 Test Files) -->




