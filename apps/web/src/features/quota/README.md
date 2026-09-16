# features/quota

Owns quota targets and plans: current plan, components, period progress, and
(admin) edits. Route: `/(dashboard)/quota` (`/[planId]` detail arrives later).

**Public interface (`index.ts`):** `QuotaPage`, `QuotaProgressCard` (dashboard
tile), `QuotaPlan` / `QuotaComponent` types.

**Invariants live in the domain rules** (`packages/domain/rules/quota-calc.ts`),
not here — this feature is projection + use cases (Phase 2).

**Internal layout:** `components/` · `types.ts`. `schemas.ts` (contracts),
`services.ts`, and `actions.ts` (quota CRUD, admin) land Phase 2 — not
scaffolded empty.
