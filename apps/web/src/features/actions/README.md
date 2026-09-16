# features/actions

Owns the daily action plan: today + upcoming tasks, priority ordering, and
toggle/skip/refresh mutations. Route: `/(dashboard)/actions` (today view lands
Phase 3 as `REFREAMP` when the builder ships).

**Public interface (`index.ts`):** `ActionsPage`, `TodayPlanCard` (dashboard
tile), `ActionTask` / `TaskKind` / `TaskStatus` types.

**Plan construction is deterministic** — `packages/domain/rules/plan.ts`
(`schedulePlan`) — this feature persists, renders, and lets users complete
tasks. `schemas.ts`, `services.ts`, `actions.ts` (TOGGLE_TASK / SKIP_TASK /
REFRESH_PLAN) land Phase 3.
