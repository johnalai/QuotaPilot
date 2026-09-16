# features/ramp

Owns the ramp / onboarding flight plan (30/60/90) and, later, the onboarding
wizard. Route: `/(dashboard)/ramp` (wizard route arrives with onboarding in
Phase 2).

**Public interface (`index.ts`):** `RampPage`, `RampPhase`.

**Boundary:** quota setup shares types with `features/quota` (both model
QuotaPlan); prefer contract schemas there over duplicated shapes.

**Internal layout:** `components/` · `types.ts`. Wizard steps, `schemas.ts`,
`services.ts` (OnboardUser), and `actions.ts` land in Phase 2 — not scaffolded
empty.
