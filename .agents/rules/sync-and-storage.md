---
trigger: always_on
---

# Testing Rules

Scoped rules for TabBellus. `AGENTS.md` at the repo root is the parent document: its precedence (§0) and absolute rules apply here too. Apply these whenever writing or changing tests.

## Harness
- Vitest runs in a `node` environment with `fake-indexeddb` and the setup in `tests/setup.ts`. There is no jsdom and no `@testing-library/*`. Playwright covers e2e.

## Rules
- Do not write DOM-query tests (`screen.getByText`, `fireEvent`, etc.); they cannot run in this harness. Extract interaction logic into pure helper modules (pattern: `src/pro/rules/components/ruleListActions.ts`) and unit-test those. Static render checks use `renderToString`; Radix portals/dialogs render empty there, so don't assert on their contents. DOM interaction belongs in Playwright e2e. Adding jsdom or Testing Library is a dependency change (§6).
- Run a single file with `npx vitest run <path>` and filter by name with `npx vitest run -t "<name>"` while iterating; the full `npm test` is still required before completion.