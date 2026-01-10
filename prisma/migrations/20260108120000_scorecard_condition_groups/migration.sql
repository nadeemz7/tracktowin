-- CreateEnum
CREATE TYPE "CompScorecardConditionGroupMode" AS ENUM ('ALL', 'ANY');

-- CreateTable
CREATE TABLE "CompPlanScorecardConditionGroup" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "mode" "CompScorecardConditionGroupMode" NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CompPlanScorecardConditionGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CompPlanScorecardCondition"
ADD COLUMN "groupId" TEXT,
ADD COLUMN "filters" JSONB;

-- Backfill default groups for existing tiers with conditions
WITH tiers_with_conditions AS (
    SELECT t.id AS tier_id, t."requiresAllConditions" AS requires_all
    FROM "CompPlanScorecardTier" t
    WHERE EXISTS (
        SELECT 1 FROM "CompPlanScorecardCondition" c WHERE c."tierId" = t.id
    )
),
inserted_groups AS (
    INSERT INTO "CompPlanScorecardConditionGroup" ("id", "tierId", "name", "mode", "orderIndex")
    SELECT CONCAT('scg_', tier_id), tier_id, 'Default',
        CASE WHEN requires_all THEN 'ALL' ELSE 'ANY' END::"CompScorecardConditionGroupMode",
        0
    FROM tiers_with_conditions
    RETURNING "id", "tierId"
)
UPDATE "CompPlanScorecardCondition" c
SET "groupId" = ig.id
FROM inserted_groups ig
WHERE c."tierId" = ig."tierId";

-- CreateIndex
CREATE INDEX "CompPlanScorecardConditionGroup_tierId_idx" ON "CompPlanScorecardConditionGroup"("tierId");

-- CreateIndex
CREATE INDEX "CompPlanScorecardCondition_groupId_idx" ON "CompPlanScorecardCondition"("groupId");

-- AddForeignKey
ALTER TABLE "CompPlanScorecardConditionGroup" ADD CONSTRAINT "CompPlanScorecardConditionGroup_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CompPlanScorecardTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompPlanScorecardCondition" ADD CONSTRAINT "CompPlanScorecardCondition_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CompPlanScorecardConditionGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
