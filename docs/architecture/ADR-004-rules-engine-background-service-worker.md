# ADR-004: Tab Automation Rules Engine in Background Service Worker

- **Status:** Accepted
- **Date:** 2026-09-28
- **Deciders:** TabBellus Core Team

## Context

TabBellus Pro includes an automated tab rules engine capable of automatically muting, pinning, discarding, grouping, or assigning tabs to specific workspaces based on user-defined condition patterns (URL, domain, title).

Implementing tab automation in a Manifest V3 Chrome Extension poses several architectural constraints:
1. **Always-On Background Automation:** Rules must execute in the background service worker on tab creation and navigation events, even when the extension sidepanel or popup is closed.
2. **Multi-Context State Divergence:** Because the service worker and the sidepanel run in separate JavaScript execution environments, each maintains its own `RulesEngine` singleton instance in memory. If a user modifies or reorders a rule in the sidepanel UI, the background service worker instance must immediately reflect the change without requiring an extension reload.
3. **ReDoS Vulnerability Guard:** User-supplied regular expressions run against every created tab and navigation URL. Unchecked regular expressions could cause catastrophic backtracking (ReDoS), locking the single-threaded service worker and hanging all tab events in Chrome.

## Decision

We implemented a **Headless Background Rules Engine with Reactive Storage Synchronization and Guarded Condition Matching**:

1. **Headless Background Integration:**
   The background service worker statically imports `rulesEngine` from `@/pro/headless` and registers it with `contractRegistry` on startup (`src/background/index.ts`). A dedicated `rulesDispatcher` listens to `chrome.tabs.onCreated` and `chrome.tabs.onUpdated` events, invoking `rulesEngine.evaluateAndExecute(tab)` with runtime entitlement checks.
2. **Cross-Context Storage Synchronization:**
   Rules are persisted in `chrome.storage.sync` with automatic fallback to `chrome.storage.local` under the key `tabbellus_tab_rules`. Each `RulesEngine` singleton binds a `chrome.storage.onChanged` listener (`bindStorageListener`). When the sidepanel saves rule changes, the background instance immediately receives the change event and re-hydrates its in-memory rule set.
3. **Guarded Pattern Matching & Complexity Heuristic:**
   `RuleMatcher` converts `wildcard` glob patterns (`*` / `?`) into fully escaped, anchored `RegExp` objects so no raw user regex syntax is executed for globs. For user-supplied `regex` patterns, it enforces a 250-character length cap (`MAX_REGEX_LENGTH = 250`) and compiles inside a `try/catch` block to swallow syntax errors. The length cap bounds pattern complexity as a risk-reduction heuristic; it is not a runtime execution timeout guarantee against catastrophic backtracking. Standard string operators (`equals`, `contains`, `startsWith`, `endsWith`) are evaluated with zero regex overhead.
4. **Decoupled UI Command Execution:**
   When the user triggers "Apply Tab Rules to Window" from the OmniSearch command palette (`useCommandExecutor.ts`), Free UI code checks the entitlement snapshot and dispatches an `APPLY_RULES_TO_WINDOW` message to the background service worker, preserving Zero-Contamination.

## Key Mechanisms & Code Citations

- **Service Worker Registration (`src/background/index.ts:11, 17-48`):**
  Statically attaches `rulesEngine` to `contractRegistry` at startup, bypassing MV3 dynamic import restrictions.
- **Tab Event Dispatcher (`src/background/rulesDispatcher.ts`):**
  Monitors tab lifecycle events, verifies that the user is entitled to Pro rules, and executes matched actions via `rulesEngine.evaluateAndExecute(tab)`.
- **Storage Synchronization Listener (`src/pro/rules/engine/rulesEngine.ts:35-54`):**
  ```typescript
  private bindStorageListener(): void {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if ((areaName === 'sync' || areaName === 'local') && changes[RULES_STORAGE_KEY]) {
        this.hydrateFromStorage();
      }
    });
  }
  ```
- **Guarded Matcher (`src/pro/rules/engine/matcher.ts:8-36`):**
  Converts glob patterns to escaped, anchored `RegExp`s (`wildcardToRegExp`); bounds user regex to `MAX_REGEX_LENGTH = 250` characters as a complexity heuristic; catches compilation errors.
- **Action Execution (`src/pro/rules/engine/executor.ts`):**
  Dispatches Chrome side-effects: `chrome.tabs.update` (pin/mute), `chrome.tabs.discard`, `chrome.tabs.group`, and `spaceService.addTabToSpace`.
- **Command Message Dispatch (`src/features/search/hooks/useCommandExecutor.ts:31-60`):**
  Sends `APPLY_RULES_TO_WINDOW` runtime messages from Free UI to the background worker.

## Consequences & Invariants

- **Instantaneous Rule Updates:** Edits in the sidepanel take effect in the background service worker within milliseconds without requiring browser restarts.
- **Pattern Complexity Limits:** Wildcards are fully escaped and anchored; user regex is length-bounded to 250 characters as a complexity heuristic to reduce risk on the extension background thread.
- **Zero-Contamination Maintained:** Free UI views interact with the rules engine purely through `contractRegistry` and Chrome runtime message passing.
