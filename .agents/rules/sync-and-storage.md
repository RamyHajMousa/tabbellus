---
trigger: always_on
---

# Sync & Storage Rules

Scoped rules for TabBellus. `AGENTS.md` at the repo root is the parent document: its precedence (§0) and absolute rules apply here too. Apply these when touching Dexie, `chrome.storage`, Zustand settings, `contractRegistry` mutation events, or anything under `src/pro/sync/` or `src/pro/rules/storage/`.

- Local-first. Domain data in Dexie; UI state and settings in `chrome.storage.local` / `chrome.storage.session`. No external backend or database.
- **Anti-echo guard:** local mutations call `contractRegistry.notifyLocalMutation()`, which triggers debounced Drive auto-sync. Remote sync ingestion must never emit it, or sync oscillates forever. `SnapshotSerializer.applyRemoteUpdates` writes Dexie directly inside a transaction on purpose (never route it through domain services, which notify); rules and settings from remote snapshots are saved with `{ skipMutationNotification: true }`. Any new synced entity follows the same pattern.
- `chrome.storage.sync` is used only by Pro modules (e.g. `src/pro/rules/storage/ruleStorage.ts`) for cross-device settings. It has an 8,192-byte per-item quota plus total and write-rate limits: keep payloads small, never write on every keystroke (debounce), and preserve the existing fallback to `chrome.storage.local` on quota or permission errors.
- The only permitted network egress is the existing Pro sync to the user's own Google Drive `appDataFolder` through `src/pro/sync/api/`. Do not add new network destinations without explicit approval.