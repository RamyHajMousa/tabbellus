/**
 * TabBellus Pro Background Subsystem Entry Point
 *
 * Exposes pure, DOM-free, React-free engines for background service workers
 * and headless runtimes.
 *
 * ZERO-DOM & ZERO-REACT GUARANTEE:
 * Must never import React, JSX, document, window, or Zustand stores (@/store/*).
 */

export { rulesEngine, RulesEngine } from './rules/engine/rulesEngine';
export { RuleMatcher } from './rules/engine/matcher';
export { RuleExecutor } from './rules/engine/executor';


