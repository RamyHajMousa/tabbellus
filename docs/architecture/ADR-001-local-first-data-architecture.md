# ADR-001: Local-First IndexedDB (Dexie.js) and chrome.storage Data Architecture

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** TabBellus Core Team

## Context

TabBellus is a Chrome Extension (Manifest V3) tab and workspace manager. A tab manager must operate instantaneously (sub-16ms frame budgets), persist data reliably across browser crashes, function 100% offline, and preserve user privacy without transmitting tab titles, URLs, or browsing histories to external servers.

In Chrome Extensions, developers often choose between `chrome.storage.local` and IndexedDB. While `chrome.storage.local` is simple, it lacks indexing, compound queries, transactional consistency, and scales poorly when managing thousands of tabs across dozens of spaces.

## Decision

We adopted a **local-first, tiered storage architecture**:
1. **Domain Data in IndexedDB via Dexie.js (`TabBellusDB` v5):** All core entities (`spaces`, `tabs`, `readLater`) are stored in IndexedDB. Dexie.js provides schema versioning, compound indexes, atomic transactions, and reactive live queries.
2. **UI State & Settings in `chrome.storage`:**
   - `chrome.storage.local`: App preferences and persisted settings (`tabbellus-settings`).
   - `chrome.storage.session`: Ephemeral, memory-backed session data cleared on browser restart (`tabbellus_active_spaces`, `lockedTabIds`, temporary window restoration locks, E2EE vault session keys).
3. **Strict Domain Service Encapsulation:** React UI components are strictly forbidden from issuing raw database queries (`db.spaces.*`, `db.tabs.*`). All mutations and queries flow through dedicated domain services (`spaceService`, `tabService`, `readLaterService`, `dataService`).

## Key Mechanisms & Code Citations

- **Database Schema (`src/lib/db.ts:1-70`):**
  Defines `TabBellusDB` (extending `Dexie`) with schema version 5. Primary tables include:
  - `spaces`: `++id, &uuid, name, createdAt, updatedAt, deletedAt`
  - `tabs`: `++id, spaceId, url, order, deletedAt, [spaceId+order]`
  - `readLater`: `++id, url, title, addedAt, status, deletedAt`
  Soft deletes via `deletedAt` tombstones preserve sync reconciliation capabilities.
- **Domain Services Layer:**
  - `src/lib/spaceService.ts`: Encapsulates space creation, ordering, 4-tier sorting, window binding, and restoration.
  - `src/lib/tabService.ts`: Encapsulates URL normalization, deduplication, and `focusOrCreate` navigation.
  - `src/lib/readLaterService.ts`: Encapsulates unread/read state transitions, staleness highlighting, and bulk operations.
  - `src/lib/dataService.ts`: Handles JSON backup export, schema validation, atomic imports, and double-confirmed purge wipes.
- **State Stores (`src/store/appStore.ts`, `src/features/tabs/store/tabLockStore.ts`):**
  - Zustand stores manage transient UI state and sync settings with `chrome.storage.local` using atomic selectors to prevent render cascades.
  - `tabLockStore` synchronizes protected tab IDs with `chrome.storage.session` for enforcement by content script lock guards (`src/content/lockGuard.ts`).

## Consequences & Invariants

- **Zero Remote Latency:** Tab switches, space updates, and searches execute with zero network overhead.
- **Privacy by Default:** No user data leaves the client machine unless the user explicitly enables optional Google Drive backup in Pro.
- **Service Layer Invariant:** Direct Dexie queries in UI components are rejected during linting and code review (enforced by `AGENTS.md` §2.2). The sole permitted exception to domain service encapsulation is remote sync snapshot ingestion.
