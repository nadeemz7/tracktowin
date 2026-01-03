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

function normalizeName(name) {
  return name.trim().toLowerCase();
}

async function main() {
  const people = await prisma.person.findMany();
  const nameMap = new Map();
  const duplicateNames = new Set();

  for (const p of people) {
    const key = normalizeName(p.fullName);
    if (nameMap.has(key)) {
      duplicateNames.add(key);
    } else {
      nameMap.set(key, p);
    }
  }

  if (duplicateNames.size > 0) {
    console.warn(
      `Warning: duplicate names found (skipping these for safety): ${Array.from(duplicateNames).join(", ")}`
    );
  }

  // Backfill ActivityRecord.personId
  const activityRecords = await prisma.activityRecord.findMany({
    where: { personId: null, personName: { not: null } },
  });

  let activityUpdated = 0;
  for (const rec of activityRecords) {
    const name = rec.personName || "";
    const key = normalizeName(name);
    if (!nameMap.has(key) || duplicateNames.has(key)) continue;
    const person = nameMap.get(key);
    await prisma.activityRecord.update({
      where: { id: rec.id },
      data: { personId: person.id },
    });
    activityUpdated += 1;
  }

  // Backfill SoldProduct.soldByPersonId
  const soldProducts = await prisma.soldProduct.findMany({
    where: { soldByPersonId: null, soldByName: { not: null } },
  });

  let soldUpdated = 0;
  for (const sp of soldProducts) {
    const name = sp.soldByName || "";
    const key = normalizeName(name);
    if (!nameMap.has(key) || duplicateNames.has(key)) continue;
    const person = nameMap.get(key);
    await prisma.soldProduct.update({
      where: { id: sp.id },
      data: { soldByPersonId: person.id },
    });
    soldUpdated += 1;
  }

  console.log(`Backfill complete. Activity records linked: ${activityUpdated}. Sold products linked: ${soldUpdated}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
