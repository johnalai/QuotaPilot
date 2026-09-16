# lib — cross-feature support modules

Shared, framework-adjacent code that no single feature owns. Imported by
feature folders and (sparingly) by app routes. Never pulled into client
components unless explicitly safe.

Boundary rules (architecture §6, CLAUDE.md §3):

- **Server-only:** anything touching DB, sessions, or secrets starts with
  `import 'server-only'`. The build fails if a client bundle pulls it in.
- **Layering:** `db` → repository/query access; `permissions` → `authorize`;
  `validation` → zod bridge to `packages/contracts`; `calculations` →
  adapters over `packages/domain` rule modules.
- **Tenancy:** every tenant-scoped read/write carries a `TenantContext`
  (see `db/client.ts`). There is no org-less tenant lookup. Ever.

Current state: Phase 0/1 scaffold. `db/client.ts` holds the tenancy contract;
the rest fill in as their phase lands.
