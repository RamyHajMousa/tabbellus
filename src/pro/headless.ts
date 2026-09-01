/**
 * TabBellus Pro Headless Subsystem Entry Point
 *
 * Exposes pure, DOM-free, React-free engines for background service workers
 * and headless runtimes.
 *
 * ZERO-DOM & ZERO-REACT GUARANTEE:
 * Must never import React, JSX, document, or window.
 */

export { rulesEngine, RulesEngine } from './rules/engine/rulesEngine';
export { RuleMatcher } from './rules/engine/matcher';
export { RuleExecutor } from './rules/engine/executor';
