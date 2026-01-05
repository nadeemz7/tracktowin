-- AlterTable
ALTER TABLE "RoiMonthlyInputs"
ADD COLUMN "otherBonusesManual" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN "marketingExpenses" DOUBLE PRECISION DEFAULT 0;
