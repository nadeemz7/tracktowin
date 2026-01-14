-- CreateTable
CREATE TABLE "PersonAgencyMembership" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonAgencyMembership_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "ActivityEvent" ADD COLUMN "agencyId" TEXT;

-- AddColumn
ALTER TABLE "ActivityTarget" ADD COLUMN "agencyId" TEXT;

-- AddColumn
ALTER TABLE "ActivityRecord" ADD COLUMN "agencyId" TEXT;

-- Backfill ActivityEvent agencyId from ActivityType.
UPDATE "ActivityEvent"
SET "agencyId" = "ActivityType"."agencyId"
FROM "ActivityType"
WHERE "ActivityEvent"."activityTypeId" = "ActivityType"."id";

-- Backfill ActivityTarget agencyId from ActivityType.
UPDATE "ActivityTarget"
SET "agencyId" = "ActivityType"."agencyId"
FROM "ActivityType"
WHERE "ActivityTarget"."activityTypeId" = "ActivityType"."id";

-- Backfill ActivityRecord agencyId from Person.primaryAgencyId when personId is present.
UPDATE "ActivityRecord"
SET "agencyId" = "Person"."primaryAgencyId"
FROM "Person"
WHERE "ActivityRecord"."personId" = "Person"."id"
  AND "ActivityRecord"."agencyId" IS NULL;

-- Make ActivityEvent.agencyId required.
ALTER TABLE "ActivityEvent" ALTER COLUMN "agencyId" SET NOT NULL;

-- Make ActivityTarget.agencyId required.
ALTER TABLE "ActivityTarget" ALTER COLUMN "agencyId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PersonAgencyMembership_personId_agencyId_key" ON "PersonAgencyMembership"("personId", "agencyId");

-- CreateIndex
CREATE INDEX "PersonAgencyMembership_personId_idx" ON "PersonAgencyMembership"("personId");

-- CreateIndex
CREATE INDEX "PersonAgencyMembership_agencyId_idx" ON "PersonAgencyMembership"("agencyId");

-- CreateIndex
CREATE INDEX "ActivityEvent_agencyId_occurredAt_idx" ON "ActivityEvent"("agencyId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityTarget_agencyId_idx" ON "ActivityTarget"("agencyId");

-- CreateIndex
CREATE INDEX "ActivityRecord_agencyId_activityDate_idx" ON "ActivityRecord"("agencyId", "activityDate");

-- AddForeignKey
ALTER TABLE "PersonAgencyMembership" ADD CONSTRAINT "PersonAgencyMembership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonAgencyMembership" ADD CONSTRAINT "PersonAgencyMembership_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTarget" ADD CONSTRAINT "ActivityTarget_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRecord" ADD CONSTRAINT "ActivityRecord_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
