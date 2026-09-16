# lib/db/queries — read-model projections

Read-model query modules consumed by Server Components (page loaders). Same
tenancy contract as the repositories: every query scopes by `organization_id`
from a `TenantContext`, and every module is `import 'server-only'`.

Lands in **Phase 2** alongside the repositories. Intentionally not scaffolded
empty (working rule: no empty abstractions).
