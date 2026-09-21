-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('trial', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'invited', 'deactivated');

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan_tier" "PlanTier" NOT NULL DEFAULT 'pro',
    "quota_currency" TEXT NOT NULL,
    "feature_flags" JSONB NOT NULL DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "image" TEXT,
    "password_hash" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "onboarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "created_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_token" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "membership_user_id_idx" ON "membership"("user_id");

-- CreateIndex
CREATE INDEX "membership_status_idx" ON "membership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "membership_organization_id_user_id_key" ON "membership"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "invite_organization_id_idx" ON "invite"("organization_id");

-- CreateIndex
CREATE INDEX "invite_email_idx" ON "invite"("email");

-- CreateIndex
CREATE INDEX "invite_created_by_idx" ON "invite"("created_by");

-- CreateIndex
CREATE INDEX "account_user_id_idx" ON "account"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_provider_provider_account_id_key" ON "account"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_session_token_key" ON "session"("session_token");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_token_identifier_token_key" ON "verification_token"("identifier", "token");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- QuotaPilot · Phase 1 Slice 2 · app-role grants + RLS backstop
-- (appended to the Prisma-generated DDL; runs as the migration owner `quotapilot`)
-- Prereq: the quotapilot_app role must already exist
-- (apps/web/prisma/bootstrap-app-role.sql). Do not run before bootstrap.
-- ─────────────────────────────────────────────────────────────────────────────

-- Schema access: USAGE only. The app role has NO CREATE / DDL on schema public.
GRANT USAGE ON SCHEMA public TO quotapilot_app;

-- Full CRUD on non-organization runtime tables (identity + tenant tables).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "user", membership, invite, account, session, verification_token
  TO quotapilot_app;

-- Organization: narrow privileges, no DELETE/TRUNCATE/REFERENCES.
-- plan_tier stays DB-defaulted ('pro') and unwritable by the app role;
-- created_at is DB-defaulted; updated_at is Prisma @updatedAt (nvars on write).
GRANT SELECT ON organization TO quotapilot_app;
GRANT INSERT (id, name, slug, quota_currency, settings, feature_flags, updated_at) ON organization TO quotapilot_app;
GRANT UPDATE (name, slug, quota_currency, settings, feature_flags, updated_at) ON organization TO quotapilot_app;

-- Sequences (future-proofing; cuid(2) is client-generated today).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO quotapilot_app;

-- Enum types: the app role needs USAGE to read/write columns typed with these
-- (membership.role / invite.role / organization.plan_tier).
GRANT USAGE ON TYPE "PlanTier", "MembershipRole", "MembershipStatus" TO quotapilot_app;

-- Future objects created by the migration owner inherit the same grants.
ALTER DEFAULT PRIVILEGES FOR ROLE quotapilot IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO quotapilot_app;
ALTER DEFAULT PRIVILEGES FOR ROLE quotapilot IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO quotapilot_app;

-- Row-level security backstop: tenant-scoped tables only.
-- organization is protected by service-layer authorization + grants
-- (Slice 2 Adjustment 1); identity tables (user/account/session/
-- verification_token) are not org-scoped and carry no org-claim policy.
ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite ENABLE ROW LEVEL SECURITY;

CREATE POLICY membership_isolation ON membership
  FOR ALL
  USING (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id');

CREATE POLICY invite_isolation ON invite
  FOR ALL
  USING (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id');
