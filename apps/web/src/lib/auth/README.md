# lib/auth — sessions & tenancy hydration

Auth.js v5 configuration, session helpers (`getSession` → `TenantContext`),
and the non-sensitive `/api/session` projection (route-map §4). All server-only.

Lands in **Phase 1** (Auth.js Credentials + database sessions, argon2id). Until
then the `(dashboard)` shell is ungated and the sidebar renders from static
config. Intentionally not scaffolded empty.
