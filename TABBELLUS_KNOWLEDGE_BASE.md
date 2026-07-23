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
│   │   ├── settings/           # UI settings, appearance tab, legal privacy policy, and backup imports/exports
│   │   ├── spaces/             # Workspace listing, 4-tier sorting, Radix empty space dialog + SpacesToolbar
│   │   └── tabs/               # Tab lists, Drag & Drop trees, Group headers, render strategies + ActiveToolbar
│   ├── hooks/                  # Global hooks (useClipboard, useUndoDelete, useIsTruncated, useWindowId, etc.)
│   ├── lib/                    # Core service layer (db, spaceService, tabService, bookmarkService, platform, dataService, sessionUtils)
│   ├── store/                  # Zustand stores (appStore.ts for persistence, uiStore.ts for layout views)
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
*   **Rule Precedence:** `.agents/AGENTS.md` project rules override any conflicting instructions in generic agent skills.
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

---

## 6. Testing & Quality Assurance Infrastructure

### 6.1 Unit & Integration Testing (Vitest)
*   **Configuration (`vitest.config.ts`):** Standard Node environment with in-memory IndexedDB bindings (`fake-indexeddb/auto`).
*   **Core Suites:**
    *   `sessionUtils.test.ts` (10 tests)
    *   `spaceService.test.ts` (9 tests)
    *   `readLaterService.test.ts` (5 tests)
    *   `dataService.test.ts` (3 tests)
*   **Execution Command:** `npm test` (27/27 passing).

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

### Next Specific Technical Objective
- **Option A: Multi-Device Sync**
  - Design a local-first sync protocol syncing space changes across multiple client browser installations.
  - Implement cryptographic payload signatures and export tokens for peer pairing.
  - Handle edge-case conflicts using timestamp reconciliations (LWW - Last Write Wins) in IndexedDB.
