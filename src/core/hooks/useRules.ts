/**
 * TabBellus Core Tab Automation Rules Hook
 *
 * Reactive hook querying the active rules provider via ContractRegistry.
 * Uses `useSyncExternalStore` for tear-free, concurrent-safe rendering of
 * the active `TabRule[]` set, plus imperative `saveRules` / `applyRulesToWindow`
 * actions. Guaranteed fail-open behavior when no Pro rules driver is registered
 * (falls through to `NullRulesEngine` defaults via the registry).
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components interact ONLY through this hook and contracts.
 * - This file MUST NOT import anything from `src/pro/`.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { TabRule } from '../contracts/rules';
import { contractRegistry } from '../contracts/registry';

export interface UseRulesResult {
  rules: TabRule[];
  loading: boolean;
  saveRules: (rules: TabRule[]) => Promise<void>;
  applyRulesToWindow: (windowId?: number) => Promise<{ processed: number; matched: number }>;
}

const EMPTY_RULES: TabRule[] = [];
const NOOP_TELEMETRY = { processed: 0, matched: 0 };

function getSnapshot(): TabRule[] {
  try {
    return contractRegistry.getRulesSnapshot();
  } catch {
    return EMPTY_RULES;
  }
}

function subscribe(callback: () => void): () => void {
  try {
    return contractRegistry.subscribeRules(callback);
  } catch {
    return () => {};
  }
}

export function useRules(): UseRulesResult {
  const rules = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const saveRules = useCallback(async (updated: TabRule[]): Promise<void> => {
    try {
      const provider = contractRegistry.getRulesProvider();
      await provider.saveRules(updated);
    } catch (err) {
      console.error('useRules: Failed to save rules', err);
    }
  }, []);

  const applyRulesToWindow = useCallback(
    async (windowId?: number): Promise<{ processed: number; matched: number }> => {
      try {
        if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
          console.warn('[RulesDebug] useRules.applyRulesToWindow: chrome.runtime.sendMessage unavailable');
          return NOOP_TELEMETRY;
        }
        console.log(`[RulesDebug] useRules.applyRulesToWindow: sending message with windowId=${windowId}`);
        const response = await chrome.runtime.sendMessage({ type: 'APPLY_RULES_TO_WINDOW', windowId });
        console.log('[RulesDebug] useRules.applyRulesToWindow: received response', response);
        if (response && typeof response.processed === 'number' && typeof response.matched === 'number') {
          return { processed: response.processed, matched: response.matched };
        }
        console.warn('[RulesDebug] useRules.applyRulesToWindow: malformed/empty response, falling back to zeroed telemetry');
        return NOOP_TELEMETRY;
      } catch (err) {
        console.error('[RulesDebug] useRules.applyRulesToWindow: sendMessage threw', err);
        return NOOP_TELEMETRY;
      }
    },
    [],
  );

  return {
    rules,
    loading: false,
    saveRules,
    applyRulesToWindow,
  };
}
