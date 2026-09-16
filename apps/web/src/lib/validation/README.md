# lib/validation — zod bridge to packages/contracts

`packages/contracts` holds the zod schemas that are the single source of truth
(architecture §10, CLAUDE.md §4). This folder is the app-side import seam so
route handlers, Server Actions, and services reference schemas by a stable path
and never re-declare them.

Lands in **Phase 2** with the CRUD contracts; `packages/contracts` currently
exports only the quota calculator. Intentionally not scaffolded empty.
