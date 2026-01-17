ALTER TABLE "WinTheDayPlanTeamAssignment"
  DROP CONSTRAINT IF EXISTS "WinTheDayPlanTeamAssignment_teamId_key";

ALTER TABLE "WinTheDayPlanTeamAssignment"
  DROP CONSTRAINT IF EXISTS "WinTheDayPlanTeamAssignment_planId_teamId_key";

DROP INDEX IF EXISTS "WinTheDayPlanTeamAssignment_planId_teamId_key";

DELETE FROM "WinTheDayPlanTeamAssignment" a
USING "WinTheDayPlanTeamAssignment" b
WHERE a."planId" = b."planId"
  AND a."teamId" = b."teamId"
  AND a."id" <> b."id"
  AND (
    a."createdAt" < b."createdAt"
    OR (a."createdAt" = b."createdAt" AND a."id" < b."id")
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'WinTheDayPlanTeamAssignment_planId_teamId_key'
      AND n.nspname = 'public'
  ) THEN
    ALTER TABLE "WinTheDayPlanTeamAssignment"
      ADD CONSTRAINT "WinTheDayPlanTeamAssignment_planId_teamId_key" UNIQUE ("planId", "teamId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WinTheDayPlanTeamAssignment_teamId_idx"
  ON "WinTheDayPlanTeamAssignment" ("teamId");
