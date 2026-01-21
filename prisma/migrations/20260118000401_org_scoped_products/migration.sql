/*
  Warnings:

  - You are about to drop the column `agencyId` on the `LineOfBusiness` table. All the data in the column will be lost.
  - You are about to drop the column `agencyId` on the `SoldProduct` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[orgId,name]` on the table `LineOfBusiness` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `orgId` to the `LineOfBusiness` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orgId` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orgId` to the `SoldProduct` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "LineOfBusiness" DROP CONSTRAINT "LineOfBusiness_agencyId_fkey";

-- DropForeignKey
ALTER TABLE "SoldProduct" DROP CONSTRAINT "SoldProduct_agencyId_fkey";

-- DropIndex
DROP INDEX "LineOfBusiness_agencyId_name_key";

-- DropIndex
DROP INDEX "SoldProduct_agencyId_dateSold_idx";

-- AlterTable
ALTER TABLE "LineOfBusiness" DROP COLUMN "agencyId",
ADD COLUMN     "orgId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "orgId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SoldProduct" DROP COLUMN "agencyId",
ADD COLUMN     "orgId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "LineOfBusiness_orgId_idx" ON "LineOfBusiness"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "LineOfBusiness_orgId_name_key" ON "LineOfBusiness"("orgId", "name");

-- CreateIndex
CREATE INDEX "Product_orgId_idx" ON "Product"("orgId");

-- CreateIndex
CREATE INDEX "SoldProduct_orgId_dateSold_idx" ON "SoldProduct"("orgId", "dateSold");

-- AddForeignKey
ALTER TABLE "LineOfBusiness" ADD CONSTRAINT "LineOfBusiness_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoldProduct" ADD CONSTRAINT "SoldProduct_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
