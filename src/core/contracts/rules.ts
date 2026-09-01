/**
 * TabBellus Core Tab Automation Rules Contracts
 *
 * Owned by Free Core. Defines abstract types and the capability interface
 * for a decoupled Pro tab automation rules engine (condition matching +
 * Chrome side-effect actions such as grouping, pinning, muting, and
 * routing tabs into Spaces).
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components interact ONLY with contracts defined here.
 * - This module MUST NOT import anything from `src/pro/`.
 */

export type ConditionField = 'url' | 'domain' | 'title';

export type ConditionOperator = 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'wildcard' | 'regex';

export interface RuleCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
  caseSensitive?: boolean;
}

export type ActionType = 'group' | 'space' | 'pin' | 'mute' | 'discard';

export interface RuleAction {
  type: ActionType;
  groupName?: string;
  groupColor?: string;
  spaceId?: number;
  spaceName?: string;
}

export interface TabRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchAll: boolean;
  conditions: RuleCondition[];
  actions: RuleAction[];
  createdAt: number;
  updatedAt: number;
}

export interface RuleEvaluationResult {
  matched: boolean;
  ruleId?: string;
  ruleName?: string;
  actions: RuleAction[];
}

export interface RulesContract {
  getRules(): Promise<TabRule[]>;
  saveRules(rules: TabRule[]): Promise<void>;
  evaluateTab(tab: { url?: string; title?: string }): Promise<RuleEvaluationResult>;
  executeActions(tabId: number, actions: RuleAction[], windowId?: number): Promise<void>;
  subscribe(callback: (rules: TabRule[]) => void): () => void;
}
