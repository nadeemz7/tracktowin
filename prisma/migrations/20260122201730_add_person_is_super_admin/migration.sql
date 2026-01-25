-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
