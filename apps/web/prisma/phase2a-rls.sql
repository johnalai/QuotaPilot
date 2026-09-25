-- QuotaPilot · Phase 2a — RLS + app-role grants for the six domain tables and forecast_override.
--
-- Run as the migration owner (superuser) AFTER the phase2a-domain migration:
--   docker compose exec -T db psql -U quotapilot -d quotapilot -f - < apps/web/prisma/phase2a-rls.sql
--
-- Same null-safe claim predicate as membership/invite (architecture §7.2):
--   NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id'
-- The claim is set transaction-scoped inside a Prisma interactive transaction
-- (see docs/phase-1-slice-1.md); session-scoped claims are rejected.
--
-- Computed fields (weightedAmount, risk scores, priority scores) are NOT
-- stored — they are produced by packages/domain/rules/* on read, so no column
-- needs to be shielded from writes.

ALTER TABLE quota_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_signal ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast_override ENABLE ROW LEVEL SECURITY;

CREATE POLICY quota_plan_tenant ON quota_plan
  FOR ALL TO quotapilot_app
  USING (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id');

CREATE POLICY customer_tenant ON customer
  FOR ALL TO quotapilot_app
  USING (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id');

CREATE POLICY deal_tenant ON deal
  FOR ALL TO quotapilot_app
  USING (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id');

CREATE POLICY forecast_line_tenant ON forecast_line
  FOR ALL TO quotapilot_app
  USING (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id');

CREATE POLICY risk_signal_tenant ON risk_signal
  FOR ALL TO quotapilot_app
  USING (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id');

CREATE POLICY action_task_tenant ON action_task
  FOR ALL TO quotapilot_app
  USING (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id');

CREATE POLICY forecast_override_tenant ON forecast_override
  FOR ALL TO quotapilot_app
  USING (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id');

GRANT SELECT, INSERT, UPDATE, DELETE ON quota_plan, customer, deal, forecast_line, risk_signal, action_task, forecast_override TO quotapilot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO quotapilot_app;
GRANT USAGE ON TYPE "QuotaPlanCurrency", "AccountStage", "OpportunityStage", "RiskSignalKind", "RiskSignalSeverity", "ActionTaskKind", "ActionTaskStatus" TO quotapilot_app;
