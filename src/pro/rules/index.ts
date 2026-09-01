/**
 * TabBellus Pro Tab Automation Rules Subsystem Root
 *
 * Re-exports the condition matcher, Chrome action executor, storage layer,
 * starter templates, and the concrete rules engine singleton.
 *
 * ZERO-CONTAMINATION BOUNDARY:
 * - Free Core components must NEVER statically import from here.
 * - Free Core interacts with rules strictly through `@/core/contracts/rules.ts`
 *   and `contractRegistry.getRulesProvider()`.
 */

export * from './engine/matcher';
export * from './engine/executor';
export * from './engine/rulesEngine';
export * from './storage/ruleStorage';
export * from './storage/templates';
export * from './components';
