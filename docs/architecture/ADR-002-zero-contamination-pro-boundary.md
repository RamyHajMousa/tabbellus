# ADR-002: Zero-Contamination Pro Boundary & Service Worker Vendor Chunking

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** TabBellus Core Team

## Context

TabBellus consists of an open, local-first Free core and an optional Pro subsystem (licensing, Google Drive sync, tab automation rules engine). To preserve project maintainability, open-source integrity, and bundle hygiene, the codebase enforces a strict **Zero-Contamination Boundary**:
1. Free-tier code must never import from `src/pro/*` or contain Pro proprietary business logic.
2. Free core owns all contract interfaces in `src/core/contracts/`; Pro modules implement them and register dynamically at runtime via `contractRegistry`.
3. The Chrome Extension Manifest V3 environment introduces a hard platform constraint: `ServiceWorkerGlobalScope` categorically forbids dynamic `import()` per the HTML specification (`TypeError: import() is disallowed on ServiceWorkerGlobalScope`).
4. Vite/Rollup bundling must ensure the background service worker bundle never accidentally includes React, ReactDOM, or DOM-dependent UI packages.

## Decision

We instituted an asymmetric, decoupled Pro integration architecture with two sanctioned entry points and strict Rollup vendor chunking:

1. **Sidepanel Lazy Ingestion:**
   In web page contexts (`src/sidepanel/index.tsx`), the Pro subsystem is lazily imported via dynamic `import('@/pro')` inside `React.useEffect`. If the Pro folder is absent or fails to load, the import fails silently and Free core remains 100% functional.
2. **Background Static Headless Import:**
   Because dynamic `import()` throws a `TypeError` in `ServiceWorkerGlobalScope`, the background service worker statically imports `rulesEngine` exclusively from `@/pro/headless` (`src/background/index.ts`). `src/pro/headless.ts` is strictly DOM-free and React-free, exporting only headless business logic (rules matcher, executor, storage) without pulling in licensing, sync, or UI dependencies.
3. **Rollup `manualChunks` Vendor Isolation:**
   In `vite.config.ts`, Rollup's `output.manualChunks` explicitly splits vendor libraries into discrete chunks (`vendor-react`, `vendor-dexie`, `vendor-ui`, `vendor-dnd`, `vendor-virtuoso`). This vendor partitioning prevents Rollup from hoisting shared React or DOM primitives into common chunks consumed by the background service worker.
4. **Contract Registry & Feature Slots:**
   Communication between Free core and Pro is mediated by `contractRegistry` (`src/core/contracts/registry.ts`). Feature cards in Free settings views use dynamic slot loaders (`useSlotComponents.ts`) where Pro slot registrations supply loader functions that are resolved into `React.lazy` components only after Pro loads.

## Key Mechanisms & Code Citations

- **Dynamic Sidepanel Import (`src/sidepanel/index.tsx:54-70`):**
  Loads `@/pro` asynchronously on mount. After registration, queries `contractRegistry.getSyncProvider()` to trigger silent initial sync if unlocked.
- **Headless Background Import (`src/background/index.ts:11, 17-48`):**
  Statically imports `rulesEngine` from `@/pro/headless`. Extensive comments document the HTML spec constraint preventing dynamic imports in service workers.
- **Pure Headless Barrel (`src/pro/headless.ts`):**
  Re-exports `rulesEngine` without referencing licensing, sync, React, or DOM elements.
- **Rollup Vendor Chunking (`vite.config.ts:36-55`):**
  ```typescript
  manualChunks(id) {
    if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
      return 'vendor-react';
    }
    if (id.includes('node_modules/dexie/')) {
      return 'vendor-dexie';
    }
    if (id.includes('node_modules/@radix-ui/') || id.includes('node_modules/cmdk/')) {
      return 'vendor-ui';
    }
    if (id.includes('node_modules/@atlaskit/')) {
      return 'vendor-dnd';
    }
    if (id.includes('node_modules/react-virtuoso/')) {
      return 'vendor-virtuoso';
    }
  }
  ```
- **Contract Registry Singleton (`src/core/contracts/registry.ts`):**
  Maintains decoupled registries for `LicensingContract`, `SyncProvider`, `RulesContract`, and UI feature slots (`FeatureSlotRegistration`), with fail-open fallback implementations (`NullLicensingEngine`, `NullSyncProvider`, `NullRulesEngine`).
- **Feature Slot Resolver (`src/features/settings/hooks/useSlotComponents.ts:1-32`):**
  Maps dynamic-import loaders supplied by Pro slot registrations (`src/pro/index.ts`) into `React.lazy` components with error-boundary fallbacks.

## Consequences & Invariants

- **Enforced Invariant:** There are exactly two permitted entry points into Pro (`src/sidepanel/index.tsx` dynamic import, `src/background/index.ts` static headless import). No other file outside `src/pro/` may import from `src/pro/*`.
- **Zero React in Service Worker:** Build sanitization and vendor splitting guarantee the service worker bundle remains lightweight, fast-starting, and free of browser DOM dependencies.
- **Fail-Open Resilience:** Licensing or sync failures never crash tab operations or sidepanel rendering.
