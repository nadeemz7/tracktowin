-- Backfill ActivityType agencyId using earliest created agency (covers single-agency case).
WITH chosen_agency AS (
  SELECT "id" FROM "Agency" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "ActivityType"
SET "agencyId" = (SELECT "id" FROM chosen_agency)
WHERE "agencyId" IS NULL;

ALTER TABLE "ActivityType" ALTER COLUMN "agencyId" SET NOT NULL;

ALTER TABLE "ReportSnapshot" ADD COLUMN "agencyId" TEXT;

-- Backfill ReportSnapshot agencyId using earliest created agency (covers single-agency case).
WITH chosen_agency AS (
  SELECT "id" FROM "Agency" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "ReportSnapshot"
SET "agencyId" = (SELECT "id" FROM chosen_agency)
WHERE "agencyId" IS NULL;

ALTER TABLE "ReportSnapshot" ALTER COLUMN "agencyId" SET NOT NULL;

ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ReportSnapshot_agencyId_idx" ON "ReportSnapshot"("agencyId");

ALTER TABLE "CompMonthlyResult" ADD CONSTRAINT "CompMonthlyResult_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CompMonthlyResult_agencyId_month_idx" ON "CompMonthlyResult"("agencyId", "month");
