-- CreateEnum
CREATE TYPE "QuotaPlanCurrency" AS ENUM ('USD', 'EUR', 'GBP', 'CAD', 'AUD');

-- CreateEnum
CREATE TYPE "AccountStage" AS ENUM ('new', 'active', 'at_risk', 'churned');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('prospecting', 'qualified', 'proposal', 'negotiation', 'won', 'lost');

-- CreateEnum
CREATE TYPE "RiskSignalKind" AS ENUM ('stale_opportunity', 'pipeline_gap', 'single_customer_concentration', 'forecast_slippage', 'deal_size_outlier', 'win_rate_decline');

-- CreateEnum
CREATE TYPE "RiskSignalSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ActionTaskKind" AS ENUM ('call', 'demo', 'prep', 'review', 'outreach');

-- CreateEnum
CREATE TYPE "ActionTaskStatus" AS ENUM ('open', 'done', 'dismissed');

-- CreateTable
CREATE TABLE "quota_plan" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "quota_amount" INTEGER NOT NULL,
    "avg_deal_value" INTEGER NOT NULL,
    "win_rate" DOUBLE PRECISION NOT NULL,
    "opportunity_conversion_rate" DOUBLE PRECISION NOT NULL,
    "discovery_conversion_rate" DOUBLE PRECISION NOT NULL,
    "first_meeting_conversion_rate" DOUBLE PRECISION NOT NULL,
    "pipeline_coverage_target" DOUBLE PRECISION NOT NULL,
    "sales_cycle_months" INTEGER NOT NULL,
    "quota_currency" "QuotaPlanCurrency" NOT NULL,

    CONSTRAINT "quota_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "industry" TEXT,
    "segment" TEXT,
    "stage" "AccountStage" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "OpportunityStage" NOT NULL,
    "amount" INTEGER NOT NULL,
    "close_date" TIMESTAMP(3) NOT NULL,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_line" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_signal" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "kind" "RiskSignalKind" NOT NULL,
    "severity" "RiskSignalSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_task" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "ActionTaskKind" NOT NULL,
    "opportunity_id" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "ActionTaskStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quota_plan_organization_id_idx" ON "quota_plan"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "quota_plan_organization_id_key" ON "quota_plan"("organization_id");

-- CreateIndex
CREATE INDEX "customer_organization_id_idx" ON "customer"("organization_id");

-- CreateIndex
CREATE INDEX "customer_stage_idx" ON "customer"("stage");

-- CreateIndex
CREATE INDEX "deal_organization_id_idx" ON "deal"("organization_id");

-- CreateIndex
CREATE INDEX "deal_account_id_idx" ON "deal"("account_id");

-- CreateIndex
CREATE INDEX "deal_owner_id_idx" ON "deal"("owner_id");

-- CreateIndex
CREATE INDEX "deal_stage_idx" ON "deal"("stage");

-- CreateIndex
CREATE INDEX "deal_close_date_idx" ON "deal"("close_date");

-- CreateIndex
CREATE INDEX "forecast_line_organization_id_idx" ON "forecast_line"("organization_id");

-- CreateIndex
CREATE INDEX "forecast_line_month_idx" ON "forecast_line"("month");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_line_organization_id_opportunity_id_month_key" ON "forecast_line"("organization_id", "opportunity_id", "month");

-- CreateIndex
CREATE INDEX "risk_signal_organization_id_idx" ON "risk_signal"("organization_id");

-- CreateIndex
CREATE INDEX "risk_signal_severity_idx" ON "risk_signal"("severity");

-- CreateIndex
CREATE INDEX "action_task_organization_id_idx" ON "action_task"("organization_id");

-- CreateIndex
CREATE INDEX "action_task_due_date_idx" ON "action_task"("due_date");

-- CreateIndex
CREATE INDEX "action_task_status_idx" ON "action_task"("status");

-- AddForeignKey
ALTER TABLE "quota_plan" ADD CONSTRAINT "quota_plan_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_line" ADD CONSTRAINT "forecast_line_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_line" ADD CONSTRAINT "forecast_line_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_signal" ADD CONSTRAINT "risk_signal_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_signal" ADD CONSTRAINT "risk_signal_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_task" ADD CONSTRAINT "action_task_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_task" ADD CONSTRAINT "action_task_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
