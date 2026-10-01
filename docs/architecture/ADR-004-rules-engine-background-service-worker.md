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
   The background service worker statically imports `rulesEngine` from `@/pro/background` and registers it with `contractRegistry` on startup (`src/background/index.ts`). A dedicated `rulesDispatcher` listens to `chrome.tabs.onCreated` and `chrome.tabs.onUpdated` events, invoking `rulesEngine.evaluateAndExecute(tab)` with runtime entitlement checks.
2. **Cross-Context Storage Synchronization:**
   Rules are persisted in `chrome.storage.sync` with automatic fallback to `chrome.storage.local` under the key `tabbellus_tab_rules`. Each `RulesEngine` singleton binds a `chrome.storage.onChanged` listener (`bindStorageListener`). When the sidepanel saves rule changes, the background instance immediately receives the change event and re-hydrates its in-memory rule set.
3. **Guarded Pattern Matching & ReDoS Static Complexity Heuristic:**
   `RuleMatcher` converts `wildcard` glob patterns (`*` / `?`) into fully escaped, anchored `RegExp` objects so no raw user regex syntax is executed for globs. For user-supplied `regex` patterns, a dependency-free static validator (`src/pro/rules/engine/regexSafety.ts`) inspects the pattern syntax before compilation and evaluation, rejecting:
   - Nested quantifiers: quantified groups containing quantifiers (`(a+)+`, `(.*a){20}`, `([a-z]+)*`).
   - Alternation inside quantified groups (`(a|a)*`, `(a|ab)+`).
   - Backreferences (`\1`, `\k<name>`).
   - Patterns exceeding the 250-character cap (`MAX_REGEX_LENGTH = 250`) or failing standard syntax compilation.
   At match time, target input strings are capped at the first 2,048 characters (`MAX_REGEX_TARGET_LENGTH = 2048`), and compiled `RegExp` objects are cached per pattern and flags (`getCachedRegExp`) to avoid redundant parsing on high-frequency tab events.
   *Crucially, this combination of static structural parsing, pattern length caps, and target input bounds is a defensive heuristic and not a mathematical proof of safety.* Because MV3 service workers lack Web Worker spawning and cannot enforce thread-isolated execution timeouts, static validation minimizes catastrophic backtracking risk before the engine evaluates the regex. Standard string operators (`equals`, `contains`, `startsWith`, `endsWith`) are evaluated with zero regex overhead.
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
- **Guarded Matcher & Static ReDoS Defense (`src/pro/rules/engine/regexSafety.ts:25-180`, `src/pro/rules/engine/matcher.ts:25-105`):**
  Converts glob patterns to escaped, anchored `RegExp`s (`wildcardToRegExp`); validates user regex against nested quantifiers, alternation inside quantified groups, and backreferences via AST scanner (`validateRegex`); bounds user regex to `MAX_REGEX_LENGTH = 250` characters; bounds match targets to `MAX_REGEX_TARGET_LENGTH = 2048` characters; caches compiled `RegExp` objects per pattern and flags (`getCachedRegExp`); and returns `false` without throwing on invalid or unsafe patterns.
- **Action Execution (`src/pro/rules/engine/executor.ts`):**
  Dispatches Chrome side-effects: `chrome.tabs.update` (pin/mute), `chrome.tabs.discard`, `chrome.tabs.group`, and `spaceService.addTabToSpace`.
- **Command Message Dispatch (`src/features/search/hooks/useCommandExecutor.ts:31-60`):**
  Sends `APPLY_RULES_TO_WINDOW` runtime messages from Free UI to the background worker.

## Consequences & Invariants

- **Instantaneous Rule Updates:** Edits in the sidepanel take effect in the background service worker within milliseconds without requiring browser restarts.
- **ReDoS Hardening & Heuristic Nature:** User regex is checked statically for catastrophic backtracking shapes (nested quantifiers, alternations in quantified groups, backreferences), bounded to 250 characters, and evaluated against at most 2,048 characters of target strings with compiled `RegExp` caching. These static defenses and caps are an empirical risk-reduction heuristic, not a mathematical proof of safety.
- **Zero-Contamination Maintained:** Free UI views interact with the rules engine purely through `contractRegistry` and Chrome runtime message passing.
