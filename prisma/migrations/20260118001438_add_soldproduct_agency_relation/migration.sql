-- AlterTable
ALTER TABLE "SoldProduct" ADD COLUMN     "agencyId" TEXT;

-- CreateIndex
CREATE INDEX "SoldProduct_agencyId_dateSold_idx" ON "SoldProduct"("agencyId", "dateSold");

-- AddForeignKey
ALTER TABLE "SoldProduct" ADD CONSTRAINT "SoldProduct_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
