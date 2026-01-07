-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startISO" TEXT NOT NULL,
    "endISO" TEXT NOT NULL,
    "statusesCSV" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "metaJson" JSONB,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportSnapshot_reportType_createdAt_idx" ON "ReportSnapshot"("reportType", "createdAt");

-- CreateIndex
CREATE INDEX "ReportSnapshot_reportType_startISO_endISO_idx" ON "ReportSnapshot"("reportType", "startISO", "endISO");
