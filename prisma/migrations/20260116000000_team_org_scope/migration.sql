-- Add orgId column
ALTER TABLE "Team" ADD COLUMN "orgId" TEXT;

-- Backfill orgId from Agency
UPDATE "Team" t
SET "orgId" = a."orgId"
FROM "Agency" a
WHERE t."agencyId" = a."id" AND t."orgId" IS NULL;

-- Merge duplicate teams by orgId + name
WITH dup_groups AS (
  SELECT "orgId", name
  FROM "Team"
  WHERE "orgId" IS NOT NULL
  GROUP BY "orgId", name
  HAVING COUNT(*) > 1
),
teams_ranked AS (
  SELECT t.id,
         t."orgId",
         t.name,
         ROW_NUMBER() OVER (PARTITION BY t."orgId", t.name ORDER BY t.id) AS rn
  FROM "Team" t
  JOIN dup_groups d ON d."orgId" = t."orgId" AND d.name = t.name
),
team_map AS (
  SELECT tr.id AS "oldId",
         (SELECT tr2.id
          FROM teams_ranked tr2
          WHERE tr2."orgId" = tr."orgId" AND tr2.name = tr.name AND tr2.rn = 1) AS "newId"
  FROM teams_ranked tr
  WHERE tr.rn > 1
)
UPDATE "Person" p
SET "teamId" = m."newId"
FROM team_map m
WHERE p."teamId" = m."oldId";

WITH dup_groups AS (
  SELECT "orgId", name
  FROM "Team"
  WHERE "orgId" IS NOT NULL
  GROUP BY "orgId", name
  HAVING COUNT(*) > 1
),
teams_ranked AS (
  SELECT t.id,
         t."orgId",
         t.name,
         ROW_NUMBER() OVER (PARTITION BY t."orgId", t.name ORDER BY t.id) AS rn
  FROM "Team" t
  JOIN dup_groups d ON d."orgId" = t."orgId" AND d.name = t.name
),
team_map AS (
  SELECT tr.id AS "oldId",
         (SELECT tr2.id
          FROM teams_ranked tr2
          WHERE tr2."orgId" = tr."orgId" AND tr2.name = tr.name AND tr2.rn = 1) AS "newId"
  FROM teams_ranked tr
  WHERE tr.rn > 1
)
UPDATE "Role" r
SET "teamId" = m."newId"
FROM team_map m
WHERE r."teamId" = m."oldId";

WITH dup_groups AS (
  SELECT "orgId", name
  FROM "Team"
  WHERE "orgId" IS NOT NULL
  GROUP BY "orgId", name
  HAVING COUNT(*) > 1
),
teams_ranked AS (
  SELECT t.id,
         t."orgId",
         t.name,
         ROW_NUMBER() OVER (PARTITION BY t."orgId", t.name ORDER BY t.id) AS rn
  FROM "Team" t
  JOIN dup_groups d ON d."orgId" = t."orgId" AND d.name = t.name
),
team_map AS (
  SELECT tr.id AS "oldId",
         (SELECT tr2.id
          FROM teams_ranked tr2
          WHERE tr2."orgId" = tr."orgId" AND tr2.name = tr.name AND tr2.rn = 1) AS "newId"
  FROM teams_ranked tr
  WHERE tr.rn > 1
)
UPDATE "ActivityDailyExpectation" a
SET "teamId" = m."newId"
FROM team_map m
WHERE a."teamId" = m."oldId";

WITH dup_groups AS (
  SELECT "orgId", name
  FROM "Team"
  WHERE "orgId" IS NOT NULL
  GROUP BY "orgId", name
  HAVING COUNT(*) > 1
),
teams_ranked AS (
  SELECT t.id,
         t."orgId",
         t.name,
         ROW_NUMBER() OVER (PARTITION BY t."orgId", t.name ORDER BY t.id) AS rn
  FROM "Team" t
  JOIN dup_groups d ON d."orgId" = t."orgId" AND d.name = t.name
),
team_map AS (
  SELECT tr.id AS "oldId",
         (SELECT tr2.id
          FROM teams_ranked tr2
          WHERE tr2."orgId" = tr."orgId" AND tr2.name = tr.name AND tr2.rn = 1) AS "newId"
  FROM teams_ranked tr
  WHERE tr.rn > 1
)
UPDATE "ActivityTeamVisibility" a
SET "teamId" = m."newId"
FROM team_map m
WHERE a."teamId" = m."oldId";

WITH dup_groups AS (
  SELECT "orgId", name
  FROM "Team"
  WHERE "orgId" IS NOT NULL
  GROUP BY "orgId", name
  HAVING COUNT(*) > 1
),
teams_ranked AS (
  SELECT t.id,
         t."orgId",
         t.name,
         ROW_NUMBER() OVER (PARTITION BY t."orgId", t.name ORDER BY t.id) AS rn
  FROM "Team" t
  JOIN dup_groups d ON d."orgId" = t."orgId" AND d.name = t.name
),
team_map AS (
  SELECT tr.id AS "oldId",
         (SELECT tr2.id
          FROM teams_ranked tr2
          WHERE tr2."orgId" = tr."orgId" AND tr2.name = tr.name AND tr2.rn = 1) AS "newId"
  FROM teams_ranked tr
  WHERE tr.rn > 1
)
UPDATE "CommissionPlan" c
SET "teamId" = m."newId"
FROM team_map m
WHERE c."teamId" = m."oldId";

WITH dup_groups AS (
  SELECT "orgId", name
  FROM "Team"
  WHERE "orgId" IS NOT NULL
  GROUP BY "orgId", name
  HAVING COUNT(*) > 1
),
teams_ranked AS (
  SELECT t.id,
         t."orgId",
         t.name,
         ROW_NUMBER() OVER (PARTITION BY t."orgId", t.name ORDER BY t.id) AS rn
  FROM "Team" t
  JOIN dup_groups d ON d."orgId" = t."orgId" AND d.name = t.name
),
team_map AS (
  SELECT tr.id AS "oldId",
         (SELECT tr2.id
          FROM teams_ranked tr2
          WHERE tr2."orgId" = tr."orgId" AND tr2.name = tr.name AND tr2.rn = 1) AS "newId"
  FROM teams_ranked tr
  WHERE tr.rn > 1
)
UPDATE "WinTheDayPlanTeamAssignment" w
SET "teamId" = m."newId"
FROM team_map m
WHERE w."teamId" = m."oldId";

WITH dup_groups AS (
  SELECT "orgId", name
  FROM "Team"
  WHERE "orgId" IS NOT NULL
  GROUP BY "orgId", name
  HAVING COUNT(*) > 1
),
teams_ranked AS (
  SELECT t.id,
         t."orgId",
         t.name,
         ROW_NUMBER() OVER (PARTITION BY t."orgId", t.name ORDER BY t.id) AS rn
  FROM "Team" t
  JOIN dup_groups d ON d."orgId" = t."orgId" AND d.name = t.name
),
team_map AS (
  SELECT tr.id AS "oldId",
         (SELECT tr2.id
          FROM teams_ranked tr2
          WHERE tr2."orgId" = tr."orgId" AND tr2.name = tr.name AND tr2.rn = 1) AS "newId"
  FROM teams_ranked tr
  WHERE tr.rn > 1
)
DELETE FROM "Team" t
USING team_map m
WHERE t.id = m."oldId";

-- Drop old constraints
ALTER TABLE "Team" DROP CONSTRAINT IF EXISTS "Team_agencyId_fkey";
DROP INDEX IF EXISTS "Team_agencyId_name_key";

-- Enforce orgId and remove agencyId
ALTER TABLE "Team" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Team" DROP COLUMN "agencyId";

-- Add new constraints/indexes
ALTER TABLE "Team" ADD CONSTRAINT "Team_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Team_orgId_name_key" ON "Team"("orgId", "name");
CREATE INDEX "Team_orgId_idx" ON "Team"("orgId");
