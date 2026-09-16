# lib/db/dal — repository layer

Data-access repositories for tenant-scoped tables (architecture §6/§7). They
are the _only_ DB access — services never import a query client directly.

Contract (mandatory):

- Every method takes a `TenantContext` and injects `organization_id` into the
  query. There is no tenant-scoped lookup without an org.
- Each module begins with `import 'server-only'`.

Lands in **Phase 1** (auth/org/membership repos) and **Phase 2** (quota,
accounts, opportunities…). Nothing lives here until then — see
[domain-model.md](../../../../domain-model.md) §1 for the entity catalog and
[implementation-plan.md](../../../../implementation-plan.md) §1–2 for timing.
Intentionally not scaffolded empty (working rule: no empty abstractions).
