-- QuotaPilot · Phase 1 Slice 2 — app-role bootstrap (one-time, local dev).
--
-- Run as the LOCAL database superuser (the migration owner, `quotapilot`)
-- BEFORE applying the Prisma migration, because the migration's GRANT /
-- ALTER DEFAULT PRIVILEGES statements reference this role.
--
--   docker compose exec -T db psql -U quotapilot -d quotapilot -f - < apps/web/prisma/bootstrap-app-role.sql
--
-- App role = non-owner, NOBYPASSRLS. It is never used to create objects and
-- it must never have DDL privilege; it only does DML through table grants and
-- is subject to row-level security. Owner powers stay exclusively with the
-- migration role.

CREATE ROLE quotapilot_app LOGIN PASSWORD 'quotapilot_app'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS        -- RLS is enforced on this role; never bypasses policies.
  NOINHERIT;

GRANT CONNECT ON DATABASE quotapilot TO quotapilot_app;

-- Verify (expect rolsuper=f, rolcreatedb=f, rolcreaterole=f, rolbypassrls=f):
--   SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls
--     FROM pg_roles WHERE rolname = 'quotapilot_app';