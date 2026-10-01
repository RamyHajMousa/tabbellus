---
trigger: always_on
---

# Sync & Storage Rules

Scoped rules for TabBellus. `AGENTS.md` at the repo root is the parent document: its precedence (§0) and absolute rules apply here too. Apply these when touching Dexie, `chrome.storage`, Zustand settings, `contractRegistry` mutation events, or anything under `src/pro/sync/` or `src/pro/rules/storage/`.

- Local-first. Domain data in Dexie; UI state and settings in `chrome.storage.local` / `chrome.storage.session`. No external backend or database.
- **Anti-echo guard:** local mutations call `contractRegistry.notifyLocalMutation()`, which triggers debounced Drive auto-sync. Remote sync ingestion must never emit it, or sync oscillates forever. `SnapshotSerializer.applyRemoteUpdates` writes Dexie directly inside a transaction on purpose (never route it through domain services, which notify); rules and settings from remote snapshots are saved with `{ skipMutationNotification: true }`. Any new synced entity follows the same pattern.
- `chrome.storage.sync` is used only by Pro modules (e.g. `src/pro/rules/storage/ruleStorage.ts`) for cross-device settings. It has an 8,192-byte per-item quota plus total and write-rate limits: keep payloads small, never write on every keystroke (debounce), and preserve the existing fallback to `chrome.storage.local` on quota or permission errors.
- The only permitted network egress is the existing Pro sync to the user's own Google Drive `appDataFolder` through `src/pro/sync/api/`. Do not add new network destinations without explicit approval.
- **Preserve unknown fields on every write.** Applies to all writers, including background services (`tabSyncService`), import, undo/restore, and editors: spread the existing record or use `update()`. Never construct a replacement record from scratch for an existing row.
- **Do not weaken the merge.** `DiffEngine` builds merged records as `{ ...loser, ...winner, ...explicitKnownFields }`, and unknown-field comparison uses `isJsonEqual`, never `!==`. Both are load-bearing.
- **Adding a field:**
  - It must be optional; clients that don't know it must keep working.
  - Values must be JSON-only (no `Date`, `Map`, class instances; no meaning attached to `undefined`).
  - To clear a field, write `null`. Never clear by omitting it: the union merge restores omitted fields from the other side.
  - Add it to the matching `KNOWN_*_KEYS` set in `diffEngine.ts` and give it explicit merge logic.
  - Add a round-trip test with a record carrying the field through a client path that doesn't know it.
- **Prefer new top-level fields** over new properties nested inside existing object fields (e.g. rule `conditions` / `actions`). Nested objects merge as whole values, so an older client editing them can drop nested properties it doesn't know.
- **Breaking changes** — renaming, removing, or changing the meaning of a field, or anything that can't satisfy the rules above — require a schema major bump (the `CURRENT_SCHEMA_MAJOR` gate pauses older clients) and explicit approval.
- **Release sequencing:** the unknown-field preservation shipped in commit `23f6cd2`. The first release that adds a synced field must come at least one release after the first release containing that commit.