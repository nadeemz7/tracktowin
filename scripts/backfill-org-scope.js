/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

function makePrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing. Check your .env file.");
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return new PrismaClient({ adapter });
}

const prisma = makePrismaClient();

// Run after orgId columns exist; script uses agencyId columns if present.

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

async function hasColumn(tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    LIMIT 1
  `;
  return Array.isArray(rows) && rows.length > 0;
}

const COUNT_TABLES = new Set(["LineOfBusiness", "Product", "SoldProduct"]);

async function countNullOrgIds(tableName) {
  if (!COUNT_TABLES.has(tableName)) {
    throw new Error(`Unexpected table name: ${tableName}`);
  }
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS count FROM "${tableName}" WHERE "orgId" IS NULL`
  );
  return Number(rows?.[0]?.count || 0);
}

async function backfillOrgIds() {
  const hasLobOrgId = await hasColumn("LineOfBusiness", "orgId");
  if (!hasLobOrgId) {
    throw new Error("LineOfBusiness.orgId is missing. Add the column before running this script.");
  }

  const hasLobAgencyId = await hasColumn("LineOfBusiness", "agencyId");
  if (hasLobAgencyId) {
    const updated = await prisma.$executeRawUnsafe(`
      UPDATE "LineOfBusiness" AS lob
      SET "orgId" = a."orgId"
      FROM "Agency" AS a
      WHERE lob."agencyId" = a."id"
        AND (lob."orgId" IS NULL OR lob."orgId" <> a."orgId")
    `);
    console.log(`LineOfBusiness orgId updated from Agency: ${updated}`);
  } else {
    console.log("LineOfBusiness.agencyId not found. Skipping Agency-based backfill.");
  }

  const hasProductOrgId = await hasColumn("Product", "orgId");
  if (!hasProductOrgId) {
    throw new Error("Product.orgId is missing. Add the column before running this script.");
  }

  const updatedProducts = await prisma.$executeRawUnsafe(`
    UPDATE "Product" AS p
    SET "orgId" = lob."orgId"
    FROM "LineOfBusiness" AS lob
    WHERE p."lineOfBusinessId" = lob."id"
      AND (p."orgId" IS NULL OR p."orgId" <> lob."orgId")
  `);
  console.log(`Product orgId updated from LineOfBusiness: ${updatedProducts}`);

  const hasSoldOrgId = await hasColumn("SoldProduct", "orgId");
  if (!hasSoldOrgId) {
    throw new Error("SoldProduct.orgId is missing. Add the column before running this script.");
  }

  const hasSoldAgencyId = await hasColumn("SoldProduct", "agencyId");
  if (hasSoldAgencyId) {
    const updatedSoldAgency = await prisma.$executeRawUnsafe(`
      UPDATE "SoldProduct" AS sp
      SET "orgId" = a."orgId"
      FROM "Agency" AS a
      WHERE sp."agencyId" = a."id"
        AND (sp."orgId" IS NULL OR sp."orgId" <> a."orgId")
    `);
    console.log(`SoldProduct orgId updated from Agency: ${updatedSoldAgency}`);
  } else {
    console.log("SoldProduct.agencyId not found. Skipping Agency-based backfill.");
  }

  const updatedSoldProduct = await prisma.$executeRawUnsafe(`
    UPDATE "SoldProduct" AS sp
    SET "orgId" = p."orgId"
    FROM "Product" AS p
    WHERE sp."productId" = p."id"
      AND p."orgId" IS NOT NULL
      AND (sp."orgId" IS NULL OR sp."orgId" <> p."orgId")
  `);
  console.log(`SoldProduct orgId updated from Product: ${updatedSoldProduct}`);

  const lobNulls = await countNullOrgIds("LineOfBusiness");
  const productNulls = await countNullOrgIds("Product");
  const soldNulls = await countNullOrgIds("SoldProduct");

  if (lobNulls || productNulls || soldNulls) {
    throw new Error(
      `orgId nulls remain after backfill (LineOfBusiness: ${lobNulls}, Product: ${productNulls}, SoldProduct: ${soldNulls}).`
    );
  }
}

async function backfillSoldByPerson() {
  const mismatchRows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count
    FROM "SoldProduct" AS sp
    JOIN "Person" AS p ON sp."soldByPersonId" = p."id"
    WHERE sp."orgId" IS NOT NULL
      AND p."orgId" <> sp."orgId"
  `;
  const mismatchCount = Number(mismatchRows?.[0]?.count || 0);
  if (mismatchCount > 0) {
    const cleared = await prisma.$executeRawUnsafe(`
      UPDATE "SoldProduct" AS sp
      SET "soldByPersonId" = NULL
      FROM "Person" AS p
      WHERE sp."soldByPersonId" = p."id"
        AND sp."orgId" IS NOT NULL
        AND p."orgId" <> sp."orgId"
    `);
    console.log(`Cleared mismatched soldByPersonId rows: ${cleared}`);
  }

  const people = await prisma.person.findMany({ select: { id: true, fullName: true, orgId: true } });
  const nameMap = new Map();
  const duplicates = new Set();

  for (const p of people) {
    const key = `${p.orgId}::${normalizeName(p.fullName)}`;
    if (nameMap.has(key)) {
      duplicates.add(key);
    } else {
      nameMap.set(key, p.id);
    }
  }

  const sold = await prisma.soldProduct.findMany({
    where: {
      soldByPersonId: null,
      soldByName: { not: null },
      orgId: { not: null },
    },
    select: { id: true, soldByName: true, orgId: true },
  });

  let linked = 0;
  let skippedDupes = 0;
  for (const sp of sold) {
    const key = `${sp.orgId}::${normalizeName(sp.soldByName)}`;
    if (!key.trim() || !nameMap.has(key)) continue;
    if (duplicates.has(key)) {
      skippedDupes += 1;
      continue;
    }
    const personId = nameMap.get(key);
    await prisma.soldProduct.update({
      where: { id: sp.id },
      data: { soldByPersonId: personId },
    });
    linked += 1;
  }

  console.log(`SoldProduct soldByPersonId linked by name: ${linked} (skipped duplicates: ${skippedDupes}).`);
}

async function main() {
  await backfillOrgIds();
  await backfillSoldByPerson();
  console.log("Backfill complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
