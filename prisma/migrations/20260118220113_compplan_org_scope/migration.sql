/*
  Warnings:

  - The column `agencyId` on the `CompPlan` table will be dropped after backfilling `orgId`.

*/
-- DropForeignKey
ALTER TABLE "CompPlan" DROP CONSTRAINT "CompPlan_agencyId_fkey";

-- AlterTable
ALTER TABLE "CompPlan" ADD COLUMN "orgId" TEXT;

-- Backfill from agency orgId
UPDATE "CompPlan"
SET "orgId" = "Agency"."orgId"
FROM "Agency"
WHERE "CompPlan"."agencyId" IS NOT NULL
  AND "CompPlan"."agencyId" = "Agency"."id";

-- Fallback to oldest org for missing agencyId
UPDATE "CompPlan"
SET "orgId" = (
  SELECT "id"
  FROM "Org"
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE "orgId" IS NULL;

-- Enforce NOT NULL and drop agencyId
ALTER TABLE "CompPlan" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "CompPlan" DROP COLUMN "agencyId";

-- CreateIndex
CREATE INDEX "CompPlan_orgId_idx" ON "CompPlan"("orgId");

-- AddForeignKey
ALTER TABLE "CompPlan" ADD CONSTRAINT "CompPlan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
