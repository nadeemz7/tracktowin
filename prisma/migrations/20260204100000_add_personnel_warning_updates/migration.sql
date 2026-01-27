-- AlterTable
ALTER TABLE "PersonnelWarning" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PersonnelWarning" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "PersonnelWarning_orgId_resolvedAt_idx" ON "PersonnelWarning"("orgId", "resolvedAt");
CREATE INDEX "PersonnelDocument_warningId_idx" ON "PersonnelDocument"("warningId");
