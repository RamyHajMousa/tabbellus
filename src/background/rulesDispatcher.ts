/**
 * Background Tab Lifecycle Listener & Automation Dispatcher
 *
 * Evaluates open/updated tabs against the active `RulesContract` provider
 * and dispatches matched Chrome side-effect actions (pin/mute/discard/
 * group/space). Binds `chrome.tabs.onCreated`/`onUpdated`/`onRemoved` and
 * an `APPLY_RULES_TO_WINDOW` runtime message handler for manual batch sweeps.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Resolves the concrete rules engine strictly through
 *   `contractRegistry.getRulesProvider()` (Free Core contract).
 * - This module itself MUST NOT statically import anything from `src/pro/`.
 *   The one necessary exception lives in `background/index.ts` (the entry
 *   point), which registers the concrete rules engine into the registry —
 *   see the comment there for why: dynamic `import()` is disallowed inside
 *   a ServiceWorkerGlobalScope per the HTML spec, so unlike the sidepanel,
 *   the background cannot lazily attach Pro at runtime.
 */

import { contractRegistry } from '@/core/contracts/registry';

/** Debounce window (ms) for skipping re-evaluation of an identical tab/URL transition. */
const DEDUPE_WINDOW_MS = 2000;

const CHROME_WEB_STORE_URL_PREFIXES = [
  'https://chromewebstore.google.com/',
  'https://chrome.google.com/webstore/',
];

/**
 * Excludes internal browser schemes and Chrome Web Store pages from rule
 * evaluation — these are pages the extension cannot act on or shouldn't.
 */
export function isRuleEligibleUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase().trim();
  if (!lower) return false;

  if (
    lower.startsWith('about:') ||
    lower.startsWith('chrome://') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('edge://') ||
    lower.startsWith('devtools://') ||
    lower.startsWith('view-source:')
  ) {
    return false;
  }

  if (CHROME_WEB_STORE_URL_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return false;
  }

  return true;
}

interface ProcessedTransition {
  lastUrl: string;
  timestamp: number;
}

export class RulesDispatcher {
  /** Tracks the most recently evaluated URL per tab to debounce duplicate navigation events. */
  private processedTabs = new Map<number, ProcessedTransition>();

  private shouldSkip(tabId: number, url: string): boolean {
    const previous = this.processedTabs.get(tabId);
    if (!previous || previous.lastUrl !== url) return false;
    return Date.now() - previous.timestamp < DEDUPE_WINDOW_MS;
  }

  private markProcessed(tabId: number, url: string): void {
    this.processedTabs.set(tabId, { lastUrl: url, timestamp: Date.now() });
  }

  /** Evicts a tab's debounce cache entry — call on `chrome.tabs.onRemoved`. */
  clearTab(tabId: number): void {
    this.processedTabs.delete(tabId);
  }

  /**
   * Evaluates a single tab against the active rules provider and dispatches
   * the first matching rule's actions. No-ops on ineligible URLs or when
   * the same tab/URL transition was already evaluated within the debounce window.
   */
  async processTab(tab: chrome.tabs.Tab): Promise<void> {
    if (tab.id === undefined || !isRuleEligibleUrl(tab.url)) return;
    const url = tab.url!;

    if (this.shouldSkip(tab.id, url)) return;
    // Mark before awaiting so a burst of near-simultaneous events for the
    // same tab/URL cannot both pass the debounce check.
    this.markProcessed(tab.id, url);

    try {
      const rulesProvider = contractRegistry.getRulesProvider();
      const result = await rulesProvider.evaluateTab({ url: tab.url, title: tab.title });

      if (result.matched && result.actions.length > 0) {
        await rulesProvider.executeActions(tab.id, result.actions, tab.windowId);
      }
    } catch (err) {
      console.error('RulesDispatcher: Failed to process tab', tab.id, err);
    }
  }

  /**
   * Evaluates every eligible tab in a window, sequentially executing any
   * matched actions. Used for manual "apply rules now" sweeps — always
   * re-evaluates, bypassing the live-listener debounce cache.
   */
  async applyRulesToWindow(windowId: number): Promise<{ processed: number; matched: number }> {
    let processed = 0;
    let matched = 0;

    try {
      const tabs = await chrome.tabs.query({ windowId });
      const rulesProvider = contractRegistry.getRulesProvider();
      const providerRules = await rulesProvider.getRules();

      console.log(
        `[RulesDebug] applyRulesToWindow(${windowId}): provider=${rulesProvider.constructor.name}, ` +
        `activeRules=${providerRules.length} (${providerRules.map((r) => `${r.name}:${r.enabled ? 'on' : 'off'}`).join(', ')}), ` +
        `tabsInWindow=${tabs.length}`,
      );

      for (const tab of tabs) {
        if (tab.id === undefined || !isRuleEligibleUrl(tab.url)) {
          console.log(`[RulesDebug] skip tab ${tab.id} (${tab.url}) — ineligible or no id`);
          continue;
        }

        processed++;
        try {
          const result = await rulesProvider.evaluateTab({ url: tab.url, title: tab.title });
          console.log(
            `[RulesDebug] tab ${tab.id} (${tab.url}) -> matched=${result.matched} ` +
            `rule=${result.ruleName ?? 'none'} actions=${result.actions.length}`,
          );
          if (result.matched && result.actions.length > 0) {
            await rulesProvider.executeActions(tab.id, result.actions, tab.windowId);
            matched++;
          }
        } catch (err) {
          console.error('RulesDispatcher: Failed to evaluate/execute rules for tab', tab.id, err);
        }
      }
    } catch (err) {
      console.error('RulesDispatcher: Failed to query window tabs for rule sweep', windowId, err);
    }

    console.log(`[RulesDebug] applyRulesToWindow(${windowId}) done: processed=${processed}, matched=${matched}`);
    return { processed, matched };
  }

  private async resolveFallbackWindowId(): Promise<number | undefined> {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return activeTab?.windowId;
    } catch {
      return undefined;
    }
  }

  private async handleApplyRulesMessage(windowId?: number): Promise<{ processed: number; matched: number }> {
    const targetWindowId = windowId ?? (await this.resolveFallbackWindowId());
    console.log(`[RulesDebug] handleApplyRulesMessage: received windowId=${windowId}, resolved targetWindowId=${targetWindowId}`);
    if (targetWindowId === undefined) {
      console.warn('[RulesDebug] handleApplyRulesMessage: could not resolve any window — returning zeroed telemetry');
      return { processed: 0, matched: 0 };
    }
    return this.applyRulesToWindow(targetWindowId);
  }

  /** Binds all Chrome tab lifecycle listeners and the runtime message handler. */
  init(): void {
    chrome.tabs.onCreated.addListener((tab) => {
      this.processTab(tab).catch((err) => {
        console.error('RulesDispatcher: onCreated processing failed', err);
      });
    });

    chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
      if (changeInfo.url || changeInfo.status === 'complete') {
        this.processTab(tab).catch((err) => {
          console.error('RulesDispatcher: onUpdated processing failed', err);
        });
      }
    });

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.clearTab(tabId);
    });

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'APPLY_RULES_TO_WINDOW') {
        console.log('[RulesDebug] APPLY_RULES_TO_WINDOW message received', message);
        this.handleApplyRulesMessage(message.windowId)
          .then((result) => {
            console.log('[RulesDebug] APPLY_RULES_TO_WINDOW responding with', result);
            sendResponse(result);
          })
          .catch((err) => {
            console.error('[RulesDebug] APPLY_RULES_TO_WINDOW handler threw', err);
            sendResponse({ processed: 0, matched: 0 });
          });
        return true; // Keep message channel open for async response
      }
      return undefined;
    });
  }
}

/** Singleton instance bound during service worker startup. */
export const rulesDispatcher = new RulesDispatcher();

/** Convenience wrapper — binds all listeners on the shared `rulesDispatcher` singleton. */
export function initRulesDispatcher(): void {
  rulesDispatcher.init();
}
