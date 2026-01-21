/*
  Warnings:

  - Added the required column `agencyId` to the `LineOfBusiness` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LineOfBusiness" ADD COLUMN     "agencyId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "LineOfBusiness" ADD CONSTRAINT "LineOfBusiness_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
