@AGENTS.md
@.agents/rules/mv3.md
@.agents/rules/sync-and-storage.md
@.agents/rules/testing.md
@.agents/rules/ui.md

## Claude Code

The shared rules above are the single source of truth for every coding agent. Do not duplicate or restate them in this file; change them in `AGENTS.md` or `.agents/rules/` instead.

- The scoped rule files are imported above, so they are always in context here. Apply each one when its scope matches the task.
- Skills in `.agents/skills/` are Antigravity skills and are not auto-loaded by Claude Code. When a task matches a skill listed in `SKILLS_SUMMARY.md`, read that skill's `SKILL.md` directly and follow it, subject to `AGENTS.md` §0 precedence.

### Commands

- `npm run dev`: Vite dev server (extension in dev mode)
- `npm run build`: `tsc` typecheck + production build
- `npm run preview`: preview the built extension
- `npm test`: Vitest unit/integration suite (single run)
- `npm run test:watch`: Vitest watch mode
- `npm run test:e2e`: builds first, then runs Playwright
- `npm run release`: release pipeline (`scripts/release.js`)
- Single test file: `npx vitest run <path>`; by name: `npx vitest run -t "<name>"`; typecheck only: `npx tsc --noEmit`