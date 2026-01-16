-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "Agency" ADD COLUMN "orgId" TEXT;

-- AddColumn
ALTER TABLE "Person" ADD COLUMN "orgId" TEXT;

-- Seed Orgs for existing data.
INSERT INTO "Org" ("id", "name", "createdAt", "updatedAt")
VALUES
    ('org_1', 'Org 1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('org_2', 'Org 2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Backfill Agency orgId to Org 1.
UPDATE "Agency"
SET "orgId" = 'org_1'
WHERE "orgId" IS NULL;

-- Backfill Person orgId to Org 1.
UPDATE "Person"
SET "orgId" = 'org_1'
WHERE "orgId" IS NULL;

-- Make Agency.orgId required.
ALTER TABLE "Agency" ALTER COLUMN "orgId" SET NOT NULL;

-- Make Person.orgId required.
ALTER TABLE "Person" ALTER COLUMN "orgId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Agency_orgId_idx" ON "Agency"("orgId");

-- CreateIndex
CREATE INDEX "Person_orgId_idx" ON "Person"("orgId");

-- AddForeignKey
ALTER TABLE "Agency" ADD CONSTRAINT "Agency_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
