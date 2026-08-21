# TabBellus Project Knowledge Base & Source of Truth

This document serves as the comprehensive Source of Truth for the TabBellus project context. It is designed to act as an indexing reference for AI agents and human developers, outlining the codebase architecture, design tokens, configuration files, structural constraints, recent architectural alignment phases, and roadmap.

---

## 1. Project Directory Structure

The codebase is structured around a local-first, domain-centric model using React 19, TypeScript, and Tailwind CSS. The folder hierarchy is organized as follows:

```
tabbellus/
├── .agents/                    # Custom agent instructions and rule files
│   └── AGENTS.md               # Supreme Override project rules
├── .context.md                 # Active Project Context Manifest
├── DESIGN.md                   # Visual design & layout specifications
├── TECH_DEBT_REPORT.md         # Forensic code audit & tech debt findings
├── tailwind.config.ts          # Tailwind compiler configuration
├── manifest.config.ts          # Chrome Extension Manifest V3 configuration
├── package.json                # Project dependencies and release scripts
├── src/
│   ├── background/             # Background service workers (chrome.runtime, tab/session listeners)
│   ├── config/                 # External links and site configurations
│   ├── components/
│   │   └── ui/                 # Reusable Radix / shadcn visual primitives (Command, Dialog, Tooltip, Dropdown, Popover, SmartFallbackIcon)
│   ├── features/               # Domain-specific logic & feature sub-systems (using Barrel imports)
│   │   ├── bookmarks/          # Read-only browser bookmarks popover tree view
│   │   ├── history/            # Chrome session retrieval, space fingerprinting, and window restoration
│   │   ├── read-later/         # Inbox queue for deferred reading lists + ReadLaterToolbar
│   │   ├── search/             # Command-K OmniSearch (cmdk search over spaces, tabs, read-later)
│   │   ├── settings/           # Modular settings dialog (AppearanceTab, BehaviorTab, DataTab, SupportTab)
│   │   ├── spaces/             # Workspace listing, 4-tier sorting, Radix empty space dialog + SpacesToolbar
│   │   └── tabs/               # Tab lists, Drag & Drop trees, Group headers, render strategies + ActiveToolbar
│   ├── hooks/                  # Global hooks (useClipboard, useUndoDelete, useIsTruncated, useWindowId, etc.)
│   ├── lib/                    # Core service layer (db, spaceService, tabService, bookmarkService, platform, dataService, sessionUtils)
│   ├── store/                  # Zustand stores (appStore.ts for AppSettings & persistence, uiStore.ts for layout views)
│   └── sidepanel/              # Sidebar chrome container (GlobalHeader, ViewSwitcher, ActiveSpaceAnchor)
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

## 6. Testing & Quality Assurance Infrastructure

### 6.1 Unit & Integration Testing (Vitest)
*   **Configuration (`vitest.config.ts`):** Standard Node environment with in-memory IndexedDB bindings (`fake-indexeddb/auto`).
*   **Core Suites:**
    *   `discardService.test.ts` (16 tests)
    *   `tabService.test.ts` (10 tests)
    *   `sessionUtils.test.ts` (10 tests)
    *   `spaceService.test.ts` (20 tests)
    *   `readLaterService.test.ts` (13 tests)
    *   `dataService.test.ts` (6 tests)
    *   `dateUtils.test.ts` (13 tests)
    *   `platform.test.ts` (3 tests)
    *   `appStore.test.ts` (12 tests)
    *   `useStorageTelemetry.test.ts` (5 tests)
    *   `commandRegistry.test.ts` (34 tests)
    *   `useOmniSearchData.test.ts` (8 tests)
    *   `badge.test.ts` (3 tests)
*   **Execution Command:** `npm test` (153/153 passing).

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

<!-- Last Updated: 2026-08-21T10:50:00+02:00 -->




