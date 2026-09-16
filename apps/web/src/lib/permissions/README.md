# lib/permissions — `authorize(ctx, ability)`

Central authorization is enforced in the service layer (never trusted from the
UI, CLAUDE.md §4). This module owns the ability map over the role matrix
(architecture §9.2) and throws `FORBIDDEN` on denial. The role type lives in
`lib/db/client.ts`.

Lands in **Phase 1** alongside Auth.js and is wired into every service use case
from **Phase 2** on. Intentionally not scaffolded empty.
