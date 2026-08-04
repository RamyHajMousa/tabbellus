# Agent Skills Overview

This document provides a comprehensive list of all custom agent skills available in `.agents/skills`, along with a summary of their capabilities and intended usage.

| Skill | Description |
| :--- | :--- |
| **`ai-interface-reviewer`** | Audits AI-powered interfaces against the UX/UI Principles Part V taxonomy (44 principles covering transparency, trust calibration, human override, consent, etc.). |
| **`brooks-lint`** | Code reviewer grounded in classic software engineering books for catching design smells, coupling issues, and architectural risks. |
| **`bug-hunter`** | Systematically finds and fixes bugs using proven debugging techniques, tracing symptoms to root causes and preventing regression. |
| **`codebase-audit-pre-push`** | Deep audit tool run before a GitHub push to remove junk files, dead code, security holes, and optimization issues. |
| **`design-taste-frontend`** | Guidance for building high-agency frontend interfaces with strict design taste, calibrated color, responsive layout, and motion rules. |
| **`diagnosing-bugs`** | Diagnosis loop for hard-to-reproduce bugs, performance regressions, and unexpected runtime failures. |
| **`docs`** | Collection of framework documentation, architecture guidelines, skill anatomy specs, and integration guides for coding agents. |
| **`emil-design-eng`** | Polish product UI with Emil Kowalski-inspired animation, interaction, and component craft guidance. |
| **`flow-checker`** | Runs preflight and postflight checklists against UX flows (onboarding, forms, pricing, dashboards, empty states) to spot UX smells. |
| **`frontend-api-integration-patterns`** | Production-ready patterns for frontend API integrations (race conditions, cancellation, retry strategies, error normalization). |
| **`full-output-enforcement`** | Ensures complete, unabridged code outputs without placeholders, omissions, or skipped code blocks during refactoring. |
| **`improve-codebase-architecture`** | Scans codebase for deepening opportunities and architectural friction, presenting findings as an interactive HTML report. |
| **`interface-auditor`** | Detects UX antipatterns (smells) in interface descriptions using the UX/UI Principles smell taxonomy. |
| **`logic-lens`** | AI-powered code review using formal logic and reasoning frameworks to detect edge-case bugs and security risks beyond linter capability. |
| **`minimalist-ui`** | Design system rules for clean editorial interfaces with warm monochrome palettes, crisp borders, restrained motion, and flat bento layouts. |
| **`performance-optimizer`** | Identifies and resolves performance bottlenecks in code, databases, and APIs through before-and-after measurements. |
| **`prototype`** | Builds throwaway prototypes (interactive terminal logic apps or toggleable UI variations) to rapidly answer state/design questions. |
| **`redesign-existing-projects`** | Upgrades existing project UI/UX by auditing generic patterns and applying premium design fixes without full rewrites. |
| **`review-animations`** | Reviews animation and motion code against strict craft, performance, accessibility, and interaction-quality standards. |
| **`shadcn`** | Manages `shadcn/ui` components and design systems with context, documentation, and usage patterns. |
| **`skill-check`** | Validates skills against the standard agent-skills specification to catch structural and semantic issues. |
| **`squirrel`** | Full-cycle AI coding pipeline skill that plans, builds, tests, lints, fixes bugs, and writes production-grade documentation. |
| **`stitch-design-taste`** | Generates Google Stitch `DESIGN.md` systems for premium typography, color palettes, motion intent, and anti-generic UI rules. |
| **`tdd`** | Facilitates Test-Driven Development (Red-Green-Refactor cycle) for building features and fixing bugs test-first. |
| **`typescript-expert`** | Advanced TypeScript guidance covering type-level programming, performance optimization, monorepos, and tooling. |
| **`unship`** | Manages comparing multiple agent-made UI variants locally, keeping the chosen variant, and cleaning up unused code. |
| **`uxui-evaluator`** | Evaluates interface descriptions against 168 research-backed UX/UI principles to generate structured findings and severity ratings. |
| **`uxui-principles`** | Injects research-backed UX/UI design principles and antipattern detection into AI coding sessions. |
| **`vibe-coding-advisor`** | Generates contextual UX principle prompts tailored to specific component types (forms, tables, dashboards, navigation) before coding. |
