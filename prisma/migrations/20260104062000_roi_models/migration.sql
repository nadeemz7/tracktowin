-- CreateTable
CREATE TABLE "RoiCommissionRate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "lob" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "effectiveStart" TIMESTAMP(3) NOT NULL,
    "effectiveEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoiCommissionRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoiCompPlan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "monthlySalary" DOUBLE PRECISION NOT NULL,
    "effectiveStart" TIMESTAMP(3) NOT NULL,
    "effectiveEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoiCompPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoiMonthlyInputs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "commissionPaid" DOUBLE PRECISION NOT NULL,
    "leadSpend" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoiMonthlyInputs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoiCommissionRate_orgId_lob_idx" ON "RoiCommissionRate"("orgId", "lob");

-- CreateIndex
CREATE INDEX "RoiCommissionRate_effectiveStart_effectiveEnd_idx" ON "RoiCommissionRate"("effectiveStart", "effectiveEnd");

-- CreateIndex
CREATE INDEX "RoiCompPlan_orgId_personId_idx" ON "RoiCompPlan"("orgId", "personId");

-- CreateIndex
CREATE INDEX "RoiCompPlan_effectiveStart_effectiveEnd_idx" ON "RoiCompPlan"("effectiveStart", "effectiveEnd");

-- CreateIndex
CREATE UNIQUE INDEX "RoiMonthlyInputs_orgId_personId_month_key" ON "RoiMonthlyInputs"("orgId", "personId", "month");

-- CreateIndex
CREATE INDEX "RoiMonthlyInputs_orgId_month_idx" ON "RoiMonthlyInputs"("orgId", "month");

-- AddForeignKey
ALTER TABLE "RoiCompPlan" ADD CONSTRAINT "RoiCompPlan_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoiMonthlyInputs" ADD CONSTRAINT "RoiMonthlyInputs_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
