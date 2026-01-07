-- AlterTable
ALTER TABLE "BenchOfficePlan" ADD COLUMN "premiumFsBreakdownJson" JSONB;

-- Move legacy extras into FS breakdown
UPDATE "BenchOfficePlan"
SET "premiumFsBreakdownJson" = COALESCE("premiumFsBreakdownJson", "premiumExtrasJson")
WHERE "premiumExtrasJson" IS NOT NULL;

-- Drop legacy extras column
ALTER TABLE "BenchOfficePlan" DROP COLUMN "premiumExtrasJson";
