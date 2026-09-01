/**
 * Concrete Tab Automation Rules Engine
 *
 * Implements `RulesContract` defined in Core Contracts. Hydrates the active
 * rule set from persistent storage, evaluates tabs against enabled rules in
 * priority order (lowest priority value evaluates first, first match wins),
 * and dispatches Chrome side-effect actions via `RuleExecutor`.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Implements `@/core/contracts/rules.ts` interface.
 * - Free Core never imports this class directly; it attaches via ContractRegistry.
 */

import type { RuleAction, RuleEvaluationResult, RulesContract, TabRule } from '@/core/contracts/rules';
import { loadRules, saveRules as persistRules, RULES_STORAGE_KEY } from '../storage/ruleStorage';
import { RuleMatcher } from './matcher';
import { RuleExecutor } from './executor';

function sortByPriority(rules: TabRule[]): TabRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority);
}

export class RulesEngine implements RulesContract {
  private rules: TabRule[] = [];
  private listeners = new Set<(rules: TabRule[]) => void>();
  private hydrated: Promise<void>;

  constructor() {
    this.hydrated = this.hydrateFromStorage();
    this.bindStorageListener();
  }

  /**
   * Keeps this engine's in-memory rule set in sync with `chrome.storage`
   * regardless of which JS execution context wrote the change.
   *
   * Required because the background service worker and the sidepanel each
   * hold their own separate `RulesEngine` singleton — one per JS execution
   * context, each hydrated once at construction (see
   * TABBELLUS_KNOWLEDGE_BASE.md Phase 42.5/42.6). Without this listener, a
   * rule added/edited/removed via the sidepanel UI would update that
   * instance's own copy and storage, but the background's separate
   * instance — the one that actually drives live tab automation — would
   * never learn about it until the service worker happened to restart.
   */
  private bindStorageListener(): void {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if ((areaName === 'sync' || areaName === 'local') && changes[RULES_STORAGE_KEY]) {
        this.hydrateFromStorage();
      }
    });
  }

  private async hydrateFromStorage(): Promise<void> {
    try {
      this.rules = sortByPriority(await loadRules());
    } catch {
      this.rules = [];
    }
    this.notifyListeners();
  }

  async getRules(): Promise<TabRule[]> {
    await this.hydrated;
    return [...this.rules];
  }

  async saveRules(rules: TabRule[]): Promise<void> {
    const sorted = sortByPriority(rules);
    this.rules = sorted;
    await persistRules(sorted);
    this.notifyListeners();
  }

  /**
   * Iterates enabled rules in priority order and returns the actions of the
   * first matching rule. Later rules are never consulted once one matches.
   */
  async evaluateTab(tab: { url?: string; title?: string }): Promise<RuleEvaluationResult> {
    await this.hydrated;

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (RuleMatcher.evaluateRule(tab, rule)) {
        return {
          matched: true,
          ruleId: rule.id,
          ruleName: rule.name,
          actions: rule.actions,
        };
      }
    }

    return { matched: false, actions: [] };
  }

  async executeActions(tabId: number, actions: RuleAction[], windowId?: number): Promise<void> {
    await RuleExecutor.executeActions(tabId, actions, windowId);
  }

  subscribe(callback: (rules: TabRule[]) => void): () => void {
    this.listeners.add(callback);
    callback([...this.rules]);

    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    const snapshot = [...this.rules];
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch {
        // Prevent listener exception from breaking notification loop
      }
    });
  }
}

/** Singleton instance for Pro tab automation rules subsystem */
export const rulesEngine = new RulesEngine();
