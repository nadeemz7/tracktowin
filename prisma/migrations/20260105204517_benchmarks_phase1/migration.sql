-- CreateEnum
CREATE TYPE "PremiumTargetMode" AS ENUM ('LOB', 'BUCKET');

-- CreateTable
CREATE TABLE "BenchOfficePlan" (
    "id" TEXT NOT NULL,
    "agencyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "appsAnnualTarget" INTEGER NOT NULL,
    "premiumAnnualTarget" DOUBLE PRECISION NOT NULL,
    "premiumMode" "PremiumTargetMode" NOT NULL,
    "premiumByLob" JSONB,
    "premiumByBucket" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchOfficePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchRoleExpectation" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "monthlyAppsTarget" INTEGER NOT NULL,
    "monthlyPremiumTarget" DOUBLE PRECISION NOT NULL,
    "premiumMode" "PremiumTargetMode" NOT NULL,
    "premiumByLob" JSONB,
    "premiumByBucket" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchRoleExpectation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchPersonOverride" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "monthlyAppsOverride" INTEGER,
    "monthlyPremiumOverride" DOUBLE PRECISION,
    "premiumModeOverride" "PremiumTargetMode",
    "premiumByLobOverride" JSONB,
    "premiumByBucketOverride" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchPersonOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BenchOfficePlan_agencyId_idx" ON "BenchOfficePlan"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "BenchOfficePlan_agencyId_year_key" ON "BenchOfficePlan"("agencyId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "BenchRoleExpectation_roleId_key" ON "BenchRoleExpectation"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "BenchPersonOverride_personId_key" ON "BenchPersonOverride"("personId");

-- AddForeignKey
ALTER TABLE "BenchOfficePlan" ADD CONSTRAINT "BenchOfficePlan_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchRoleExpectation" ADD CONSTRAINT "BenchRoleExpectation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchPersonOverride" ADD CONSTRAINT "BenchPersonOverride_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
