-- CreateTable
CREATE TABLE "forecast_override" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "committed" INTEGER NOT NULL,
    "bestCase" INTEGER NOT NULL,
    "pipeline" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forecast_override_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forecast_override_organization_id_idx" ON "forecast_override"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_override_organization_id_month_key" ON "forecast_override"("organization_id", "month");

-- AddForeignKey
ALTER TABLE "forecast_override" ADD CONSTRAINT "forecast_override_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
