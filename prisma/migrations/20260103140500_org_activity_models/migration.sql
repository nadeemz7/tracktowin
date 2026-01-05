-- AlterTable
ALTER TABLE "ActivityType"
ADD COLUMN "orgId" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN "createdByPersonId" TEXT;

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "activityTypeId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityTarget" (
    "id" TEXT NOT NULL,
    "activityTypeId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "monthlyMinimum" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityEvent_activityTypeId_occurredAt_idx" ON "ActivityEvent"("activityTypeId", "occurredAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_personId_occurredAt_idx" ON "ActivityEvent"("personId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityTarget_activityTypeId_personId_key" ON "ActivityTarget"("activityTypeId", "personId");

-- CreateIndex
CREATE INDEX "ActivityTarget_personId_idx" ON "ActivityTarget"("personId");

-- AddForeignKey
ALTER TABLE "ActivityType" ADD CONSTRAINT "ActivityType_createdByPersonId_fkey" FOREIGN KEY ("createdByPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTarget" ADD CONSTRAINT "ActivityTarget_activityTypeId_fkey" FOREIGN KEY ("activityTypeId") REFERENCES "ActivityType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityTarget" ADD CONSTRAINT "ActivityTarget_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
