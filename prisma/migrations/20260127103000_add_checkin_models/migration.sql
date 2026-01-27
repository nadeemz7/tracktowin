-- CreateEnum
CREATE TYPE "CheckInFrequencyType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'CUSTOM_DAYS');

-- CreateEnum
CREATE TYPE "CheckInQuestionType" AS ENUM ('SCALE_1_10', 'TEXT_SHORT', 'TEXT_LONG', 'YES_NO', 'MULTIPLE_CHOICE');

-- CreateTable
CREATE TABLE "CheckInTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "frequencyType" "CheckInFrequencyType" NOT NULL,
    "intervalDays" INTEGER,
    "weekStartDay" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckInTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "questionsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckInTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamCheckInTemplateAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamCheckInTemplateAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInSubmission" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "teamId" TEXT,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "answersJson" JSONB NOT NULL,
    "goalsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByPersonId" TEXT NOT NULL,

    CONSTRAINT "CheckInSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckInTemplate_orgId_idx" ON "CheckInTemplate"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInTemplate_orgId_name_key" ON "CheckInTemplate"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInTemplateVersion_templateId_version_key" ON "CheckInTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "CheckInTemplateVersion_templateId_idx" ON "CheckInTemplateVersion"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamCheckInTemplateAssignment_teamId_templateId_key" ON "TeamCheckInTemplateAssignment"("teamId", "templateId");

-- CreateIndex
CREATE INDEX "TeamCheckInTemplateAssignment_orgId_idx" ON "TeamCheckInTemplateAssignment"("orgId");

-- CreateIndex
CREATE INDEX "TeamCheckInTemplateAssignment_teamId_idx" ON "TeamCheckInTemplateAssignment"("teamId");

-- CreateIndex
CREATE INDEX "TeamCheckInTemplateAssignment_templateId_idx" ON "TeamCheckInTemplateAssignment"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInSubmission_orgId_personId_templateId_periodKey_key" ON "CheckInSubmission"("orgId", "personId", "templateId", "periodKey");

-- CreateIndex
CREATE INDEX "CheckInSubmission_orgId_periodStart_idx" ON "CheckInSubmission"("orgId", "periodStart");

-- CreateIndex
CREATE INDEX "CheckInSubmission_personId_periodStart_idx" ON "CheckInSubmission"("personId", "periodStart");

-- CreateIndex
CREATE INDEX "CheckInSubmission_templateId_periodStart_idx" ON "CheckInSubmission"("templateId", "periodStart");

-- AddForeignKey
ALTER TABLE "CheckInTemplate" ADD CONSTRAINT "CheckInTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInTemplateVersion" ADD CONSTRAINT "CheckInTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CheckInTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCheckInTemplateAssignment" ADD CONSTRAINT "TeamCheckInTemplateAssignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCheckInTemplateAssignment" ADD CONSTRAINT "TeamCheckInTemplateAssignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCheckInTemplateAssignment" ADD CONSTRAINT "TeamCheckInTemplateAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CheckInTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInSubmission" ADD CONSTRAINT "CheckInSubmission_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInSubmission" ADD CONSTRAINT "CheckInSubmission_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInSubmission" ADD CONSTRAINT "CheckInSubmission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CheckInTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInSubmission" ADD CONSTRAINT "CheckInSubmission_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "CheckInTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInSubmission" ADD CONSTRAINT "CheckInSubmission_createdByPersonId_fkey" FOREIGN KEY ("createdByPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
