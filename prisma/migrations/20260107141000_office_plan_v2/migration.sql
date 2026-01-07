-- AlterTable
ALTER TABLE "BenchOfficePlan" ADD COLUMN "appGoalsByLobJson" JSONB;
ALTER TABLE "BenchOfficePlan" ADD COLUMN "premiumByBucketJson" JSONB;
ALTER TABLE "BenchOfficePlan" ADD COLUMN "premiumExtrasJson" JSONB;

-- Backfill from legacy totals where possible
UPDATE "BenchOfficePlan"
SET "appGoalsByLobJson" = jsonb_build_object(
  'AUTO', COALESCE("appsAnnualTarget", 0),
  'FIRE', 0,
  'LIFE', 0,
  'HEALTH', 0
)
WHERE "appGoalsByLobJson" IS NULL;

UPDATE "BenchOfficePlan"
SET "premiumByBucketJson" = COALESCE(
  "premiumByBucket",
  jsonb_build_object(
    'PC', COALESCE("premiumAnnualTarget", 0),
    'FS', 0
  )
)
WHERE "premiumByBucketJson" IS NULL;
