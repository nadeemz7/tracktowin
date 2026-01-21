/*
  Warnings:

  - You are about to drop the column `agencyId` on the `LineOfBusiness` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "LineOfBusiness" DROP CONSTRAINT "LineOfBusiness_agencyId_fkey";

-- AlterTable
ALTER TABLE "LineOfBusiness" DROP COLUMN "agencyId";
