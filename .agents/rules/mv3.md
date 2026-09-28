---
trigger: always_on
---

# Manifest V3 Rules

Scoped rules for TabBellus. `AGENTS.md` at the repo root is the parent document: its precedence (§0) and absolute rules apply here too. Apply these when touching `manifest.config.ts`, `src/background/*`, `src/content/*`, or any `chrome.runtime` messaging.

- **Manifest and permissions:** any change to `permissions`, `host_permissions`, `optional_permissions`, or CSP in `manifest.config.ts` requires explicit approval. New permission warnings can disable the extension for existing users on update.
- **Service worker is ephemeral:** never rely on module-level variables in the background worker to hold state between events. Persist to `chrome.storage.session` or Dexie.
- **Messaging:** a `chrome.runtime.onMessage` listener that responds asynchronously must be a synchronous function that returns `true` only inside the branch for a message type it handles asynchronously, then calls `sendResponse` on every path of that branch, including errors. Unhandled messages must return `undefined` (never a catch-all `return true`), because multiple listeners share the channel (the background has two) and a stray `true` leaves callers hanging. Never make the listener itself `async`: it returns a Promise instead of `true`, and the port can close before responding. Keep message types typed.
- No remotely hosted code, `eval`, or `new Function`.