# features/auth

Owns sign-in / sign-up and the session projection the app trusts.
Routes: `/(auth)/login`, `/(auth)/register`.

**Public interface (`index.ts`):** `LoginPage`, `RegisterPage`, `SessionProjection`.

**Internal layout:** `components/` (pages, later the interactive forms) ·
`types.ts`. `schemas.ts` (credentials zod), `services.ts` (the register →
org → owner-membership transaction), and `actions.ts` (Server Actions) land in
**Phase 1** (implementation-plan §1) — not scaffolded empty.

**Boundary:** server logic is `import 'server-only'`; the client may only
import `SessionProjection` (type) and the interactive form components.
