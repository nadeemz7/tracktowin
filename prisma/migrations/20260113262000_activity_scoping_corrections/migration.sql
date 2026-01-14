-- Drop and recreate ActivityRecord agency FK with SET NULL.
ALTER TABLE "ActivityRecord" DROP CONSTRAINT "ActivityRecord_agencyId_fkey";
ALTER TABLE "ActivityRecord" ADD CONSTRAINT "ActivityRecord_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Replace ActivityTarget unique constraint to include agencyId.
DROP INDEX "ActivityTarget_activityTypeId_personId_key";
CREATE UNIQUE INDEX "ActivityTarget_agencyId_activityTypeId_personId_key" ON "ActivityTarget"("agencyId", "activityTypeId", "personId");
