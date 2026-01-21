/* eslint-disable @typescript-eslint/no-require-imports */
/* Demo data seeder
 * Usage: DEMO_RESET=1 node scripts/seed-demo.js
 * DEMO_RESET=1 will wipe core tables first. Omit to only upsert/additive.
 */

const {
  PrismaClient,
  PremiumCategory,
  ProductType,
  PolicyStatus,
  CompApplyScope,
  CompPayoutType,
  CompTierMode,
  CompTierBasis,
  CompRuleType,
  CompBonusType,
  CompMetricSource,
  CompRewardType,
  CompAssignmentScope,
  TeamType,
} = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, errorFormat: "colorless" });

const DEFAULT_LOBS = [
  {
    name: "Auto",
    premiumCategory: PremiumCategory.PC,
    products: [
      { name: "Auto Raw New", classification: ProductType.PERSONAL },
      { name: "Auto Added", classification: ProductType.PERSONAL },
      { name: "Business Raw Auto", classification: ProductType.BUSINESS },
      { name: "Business Added Auto", classification: ProductType.BUSINESS },
    ],
  },
  {
    name: "Fire",
    premiumCategory: PremiumCategory.PC,
    products: [
      { name: "Homeowners", classification: ProductType.PERSONAL },
      { name: "Renters", classification: ProductType.PERSONAL },
      { name: "Condo", classification: ProductType.PERSONAL },
      { name: "PAP", classification: ProductType.PERSONAL },
      { name: "PLUP", classification: ProductType.PERSONAL },
      { name: "Boat", classification: ProductType.PERSONAL },
      { name: "BOP", classification: ProductType.BUSINESS },
      { name: "Apartment", classification: ProductType.BUSINESS },
      { name: "CLUP", classification: ProductType.BUSINESS },
      { name: "Workers Comp", classification: ProductType.BUSINESS },
    ],
  },
  {
    name: "Health",
    premiumCategory: PremiumCategory.FS,
    products: [
      { name: "Short Term Disability", classification: ProductType.PERSONAL },
      { name: "Long Term Disability", classification: ProductType.PERSONAL },
      { name: "Hospital Indemnity", classification: ProductType.PERSONAL },
    ],
  },
  {
    name: "Life",
    premiumCategory: PremiumCategory.FS,
    products: [
      { name: "Term", classification: ProductType.PERSONAL },
      { name: "Whole Life", classification: ProductType.PERSONAL },
      { name: "Universal Life", classification: ProductType.PERSONAL },
    ],
  },
  {
    name: "IPS",
    premiumCategory: PremiumCategory.IPS,
    products: [
      { name: "Advisory Account", classification: ProductType.PERSONAL },
      { name: "Non Advisory Account", classification: ProductType.PERSONAL },
    ],
  },
];

const ACTIVITIES = ["Outbounds", "Inbounds", "Quotes", "Referrals", "FS Appointments Held", "IFRs", "Reviews"];

const DEFAULT_ACTIVITY_TYPES = [
  { name: "Outbounds", payable: true, requiresFullName: false },
  { name: "Inbounds", payable: true, requiresFullName: false },
  { name: "Quotes", payable: true, requiresFullName: false },
  { name: "Referrals", payable: true, requiresFullName: true },
  { name: "FS Appointments Held", payable: true, requiresFullName: false },
  { name: "IFRs", payable: true, requiresFullName: false },
  { name: "Reviews", payable: true, requiresFullName: false },
];

const PEOPLE = [
  { name: "Nadeem Moustafa", email: "nadeem@example.com", teamType: TeamType.SALES },
  { name: "Tina Ho", email: "tina@example.com", teamType: TeamType.SALES },
  { name: "Brian Lewis", email: "brian@example.com", teamType: TeamType.SALES },
  { name: "Elijah Hardison", email: "elijah@example.com", teamType: TeamType.SALES },
  { name: "Destiny Foil", email: "destiny@example.com", teamType: TeamType.CS },
  { name: "Justin Correa", email: "justin@example.com", teamType: TeamType.CS },
];

const MONTHS_2025 = Array.from({ length: 12 }, (_, i) => i);

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(arr) {
  return arr[randInt(0, arr.length - 1)];
}

async function ensureOrg(name) {
  const existing = await prisma.org.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.org.create({ data: { name } });
}

async function ensureAgency(orgId, name, profileName) {
  const existing = await prisma.agency.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.agency.create({
    data: {
      name,
      profileName,
      ownerName: "Demo Owner",
      address: "123 Main St",
      org: { connect: { id: orgId } },
    },
  });
}

async function ensureLobs(orgId) {
  for (const lob of DEFAULT_LOBS) {
    const existingLob = await prisma.lineOfBusiness.findFirst({ where: { orgId, name: lob.name } });
    const lobRow =
      existingLob ||
      (await prisma.lineOfBusiness.create({
        data: { org: { connect: { id: orgId } }, name: lob.name, premiumCategory: lob.premiumCategory },
      }));
    for (const prod of lob.products) {
      const existingProduct = await prisma.product.findFirst({ where: { orgId, name: prod.name } });
      if (existingProduct) {
        await prisma.product.update({
          where: { id: existingProduct.id },
          data: { productType: prod.classification, lineOfBusiness: { connect: { id: lobRow.id } } },
        });
      } else {
        await prisma.product.create({
          data: {
            name: prod.name,
            productType: prod.classification,
            org: { connect: { id: orgId } },
            lineOfBusiness: { connect: { id: lobRow.id } },
          },
        });
      }
    }
  }
}

async function createPeople(orgId, agencyId) {
  const created = [];
  for (const p of PEOPLE) {
    const existing = await prisma.person.findFirst({ where: { email: p.email } });
    const row = existing
      ? await prisma.person.update({
          where: { id: existing.id },
          data: { fullName: p.name, teamType: p.teamType, primaryAgency: { connect: { id: agencyId } }, org: { connect: { id: orgId } } },
        })
      : await prisma.person.create({
        data: {
          fullName: p.name,
          email: p.email,
          teamType: p.teamType,
          primaryAgency: { connect: { id: agencyId } },
          org: { connect: { id: orgId } },
        },
      });
    created.push(row);
  }
  return created;
}

async function createPlan(agencyId, orgId) {
  const plan = await prisma.compPlan.create({
    data: {
      org: { connect: { id: orgId } },
      name: "Demo Comp Plan",
      status: "ACTIVE",
      defaultStatusEligibility: [PolicyStatus.ISSUED, PolicyStatus.PAID],
      versions: {
        create: {
          isCurrent: true,
          ruleBlocks: {
            create: [
              // Auto personal
              {
                name: "Auto Raw New base",
                ruleType: CompRuleType.BASE,
                applyScope: CompApplyScope.PRODUCT,
                applyFilters: { productNames: ["Auto Raw New"] },
                payoutType: CompPayoutType.FLAT_PER_APP,
                basePayoutValue: 10,
                tierMode: CompTierMode.TIERS,
                tierBasis: CompTierBasis.APP_COUNT,
                tiers: { create: [{ minValue: 20, maxValue: 30, payoutValue: 25, payoutUnit: "/app" }, { minValue: 31, maxValue: null, payoutValue: 40, payoutUnit: "/app" }] },
                statusEligibilityOverride: [PolicyStatus.ISSUED, PolicyStatus.PAID],
              },
              {
                name: "Auto Added",
                ruleType: CompRuleType.BASE,
                applyScope: CompApplyScope.PRODUCT,
                applyFilters: { productNames: ["Auto Added"] },
                payoutType: CompPayoutType.FLAT_PER_APP,
                basePayoutValue: 5,
                tierMode: CompTierMode.NONE,
                statusEligibilityOverride: [PolicyStatus.ISSUED, PolicyStatus.PAID],
              },
              // Auto business
              {
                name: "Business Raw Auto",
                ruleType: CompRuleType.BASE,
                applyScope: CompApplyScope.PRODUCT,
                applyFilters: { productNames: ["Business Raw Auto"] },
                payoutType: CompPayoutType.PERCENT_OF_PREMIUM,
                basePayoutValue: 2,
                tierMode: CompTierMode.NONE,
                statusEligibilityOverride: [PolicyStatus.ISSUED, PolicyStatus.PAID],
              },
              {
                name: "Business Added Auto",
                ruleType: CompRuleType.BASE,
                applyScope: CompApplyScope.PRODUCT,
                applyFilters: { productNames: ["Business Added Auto"] },
                payoutType: CompPayoutType.PERCENT_OF_PREMIUM,
                basePayoutValue: 0.5,
                tierMode: CompTierMode.NONE,
                statusEligibilityOverride: [PolicyStatus.ISSUED, PolicyStatus.PAID],
              },
              // Fire personal
              {
                name: "Homeowners",
                ruleType: CompRuleType.BASE,
                applyScope: CompApplyScope.PRODUCT,
                applyFilters: { productNames: ["Homeowners"] },
                payoutType: CompPayoutType.PERCENT_OF_PREMIUM,
                basePayoutValue: 4,
                tierMode: CompTierMode.NONE,
                statusEligibilityOverride: [PolicyStatus.ISSUED, PolicyStatus.PAID],
              },
              {
                name: "Renters / Condo / PAP / PLUP / Boat",
                ruleType: CompRuleType.BASE,
                applyScope: CompApplyScope.PRODUCT,
                applyFilters: { productNames: ["Renters", "Condo", "PAP", "PLUP", "Boat"] },
                payoutType: CompPayoutType.PERCENT_OF_PREMIUM,
                basePayoutValue: 3,
                tierMode: CompTierMode.NONE,
                statusEligibilityOverride: [PolicyStatus.ISSUED, PolicyStatus.PAID],
              },
              // Fire business
              {
                name: "Fire Business (BOP/Apartment/CLUP/Workers Comp)",
                ruleType: CompRuleType.BASE,
                applyScope: CompApplyScope.PRODUCT,
                applyFilters: { productNames: ["BOP", "Apartment", "CLUP", "Workers Comp"] },
                payoutType: CompPayoutType.PERCENT_OF_PREMIUM,
                basePayoutValue: 2,
                tierMode: CompTierMode.NONE,
                statusEligibilityOverride: [PolicyStatus.ISSUED, PolicyStatus.PAID],
              },
              // Health
              {
                name: "Health (STD/LTD/Hospital)",
                ruleType: CompRuleType.BASE,
                applyScope: CompApplyScope.PRODUCT,
                applyFilters: { productNames: ["Short Term Disability", "Long Term Disability", "Hospital Indemnity"] },
                payoutType: CompPayoutType.PERCENT_OF_PREMIUM,
                basePayoutValue: 10,
                tierMode: CompTierMode.TIERS,
                tierBasis: CompTierBasis.PREMIUM_SUM,
                tiers: { create: [{ minValue: 400, maxValue: 800, payoutValue: 14 }, { minValue: 801, maxValue: null, payoutValue: 18 }] },
                statusEligibilityOverride: [PolicyStatus.ISSUED, PolicyStatus.PAID],
              },
              // Life
              {
                name: "Life (Term / Whole / Universal)",
                ruleType: CompRuleType.BASE,
                applyScope: CompApplyScope.PRODUCT,
                applyFilters: { productNames: ["Term", "Whole Life", "Universal Life"] },
                payoutType: CompPayoutType.PERCENT_OF_PREMIUM,
                basePayoutValue: 10,
                tierMode: CompTierMode.TIERS,
                tierBasis: CompTierBasis.PREMIUM_SUM,
                tiers: { create: [{ minValue: 3000, maxValue: 6000, payoutValue: 14 }, { minValue: 6001, maxValue: null, payoutValue: 18 }] },
                statusEligibilityOverride: [PolicyStatus.ISSUED, PolicyStatus.PAID],
              },
              // IPS
              {
                name: "IPS Advisory / Non-Advisory",
                ruleType: CompRuleType.BASE,
                applyScope: CompApplyScope.PRODUCT,
                applyFilters: { productNames: ["Advisory Account", "Non Advisory Account"] },
                payoutType: CompPayoutType.PERCENT_OF_PREMIUM,
                basePayoutValue: 2,
                tierMode: CompTierMode.NONE,
                statusEligibilityOverride: [PolicyStatus.ISSUED, PolicyStatus.PAID],
              },
            ],
          },
          bonusModules: {
            create: {
              name: "Scorecard Bronze/Silver/Gold",
              bonusType: CompBonusType.SCORECARD_TIER,
              highestTierWins: true,
              scorecardTiers: {
                create: [
                  {
                    name: "Bronze",
                    orderIndex: 1,
                    requiresAllConditions: true,
                    conditions: {
                      create: [
                        { metricSource: CompMetricSource.TOTAL_PREMIUM, operator: "GTE", value: 30000 },
                        {
                          metricSource: CompMetricSource.PREMIUM_CATEGORY,
                          operator: "GTE",
                          value: 2000,
                          filters: { premiumCategory: PremiumCategory.PC },
                        },
                      ],
                    },
                    rewards: {
                      create: [
                        { rewardType: CompRewardType.ADD_PERCENT_OF_BUCKET, percentValue: 1, premiumCategory: PremiumCategory.PC },
                        { rewardType: CompRewardType.ADD_PERCENT_OF_BUCKET, percentValue: 2 },
                      ],
                    },
                  },
                  {
                    name: "Silver",
                    orderIndex: 2,
                    requiresAllConditions: true,
                    conditions: {
                      create: [
                        { metricSource: CompMetricSource.TOTAL_PREMIUM, operator: "GTE", value: 60000 },
                        {
                          metricSource: CompMetricSource.PREMIUM_CATEGORY,
                          operator: "GTE",
                          value: 4000,
                          filters: { premiumCategory: PremiumCategory.PC },
                        },
                      ],
                    },
                    rewards: {
                      create: [
                        { rewardType: CompRewardType.ADD_PERCENT_OF_BUCKET, percentValue: 2, premiumCategory: PremiumCategory.PC },
                        { rewardType: CompRewardType.ADD_PERCENT_OF_BUCKET, percentValue: 4 },
                      ],
                    },
                  },
                  {
                    name: "Gold",
                    orderIndex: 3,
                    requiresAllConditions: true,
                    conditions: {
                      create: [
                        { metricSource: CompMetricSource.TOTAL_PREMIUM, operator: "GTE", value: 90000 },
                        {
                          metricSource: CompMetricSource.PREMIUM_CATEGORY,
                          operator: "GTE",
                          value: 6000,
                          filters: { premiumCategory: PremiumCategory.PC },
                        },
                      ],
                    },
                    rewards: {
                      create: [
                        { rewardType: CompRewardType.ADD_PERCENT_OF_BUCKET, percentValue: 3, premiumCategory: PremiumCategory.PC },
                        { rewardType: CompRewardType.ADD_PERCENT_OF_BUCKET, percentValue: 6 },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
    include: { versions: true },
  });

  // fill productIds for auto rule
  const version = plan.versions[0];
  if (version) {
    const allProducts = await prisma.product.findMany({ where: { lineOfBusiness: { orgId } } });
    const nameToIds = allProducts.reduce((acc, p) => {
      acc[p.name] = acc[p.name] || [];
      acc[p.name].push(p.id);
      return acc;
    }, {});

    const ruleProductMap = [
      { rule: "Auto Raw New base", products: ["Auto Raw New"] },
      { rule: "Auto Added", products: ["Auto Added"] },
      { rule: "Business Raw Auto", products: ["Business Raw Auto"] },
      { rule: "Business Added Auto", products: ["Business Added Auto"] },
      { rule: "Homeowners", products: ["Homeowners"] },
      { rule: "Renters / Condo / PAP / PLUP / Boat", products: ["Renters", "Condo", "PAP", "PLUP", "Boat"] },
      { rule: "Fire Business (BOP/Apartment/CLUP/Workers Comp)", products: ["BOP", "Apartment", "CLUP", "Workers Comp"] },
      { rule: "Health (STD/LTD/Hospital)", products: ["Short Term Disability", "Long Term Disability", "Hospital Indemnity"] },
      { rule: "Life (Term / Whole / Universal)", products: ["Term", "Whole Life", "Universal Life"] },
      { rule: "IPS Advisory / Non-Advisory", products: ["Advisory Account", "Non Advisory Account"] },
    ];

    for (const { rule, products } of ruleProductMap) {
      const rb = await prisma.compPlanRuleBlock.findFirst({ where: { planVersionId: version.id, name: rule } });
      if (!rb) continue;
      const ids = products.flatMap((n) => nameToIds[n] || []);
      await prisma.compPlanRuleBlock.update({ where: { id: rb.id }, data: { applyFilters: { productIds: ids } } });
    }
  }

  return plan;
}

async function ensureActivitiesForAgency(agencyId) {
  for (const act of DEFAULT_ACTIVITY_TYPES) {
    const existing = await prisma.activityType.findFirst({ where: { name: act.name, agencyId } });
    if (existing) {
      await prisma.activityType.update({
        where: { id: existing.id },
        data: { payable: act.payable, requiresFullName: act.requiresFullName, active: true },
      });
    } else {
      await prisma.activityType.create({
        data: {
          agencyId,
          name: act.name,
          description: `${act.name} activity`,
          inputMode: "COUNT",
          payable: act.payable,
          requiresFullName: act.requiresFullName,
          trackOnly: false,
          active: true,
        },
      });
    }
  }
}

async function seedSoldProducts(agencyId, orgId, people) {
  const lobs = await prisma.lineOfBusiness.findMany({ where: { orgId }, include: { products: true } });
  const policyStatuses = [PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID];
  // Create a default household per person
  const households = {};
  for (const person of people) {
    const [first, ...rest] = (person.fullName || "Demo Person").split(" ");
    const last = rest.join(" ") || "Household";
    households[person.id] = await prisma.household.create({
      data: {
        agencyId,
        firstName: first,
        lastName: last,
        ecrmLink: null,
        marketingSource: "Demo",
        onboarded: true,
      },
    });
  }

  for (const month of MONTHS_2025) {
    for (const person of people) {
      const num = randInt(4, 8);
      for (let i = 0; i < num; i++) {
        const lob = choice(lobs);
        const product = choice(lob.products);
        await prisma.soldProduct.create({
          data: {
            household: { connect: { id: households[person.id].id } },
            agency: { connect: { id: agencyId } },
            org: { connect: { id: orgId } },
            product: { connect: { id: product.id } },
            soldByPerson: { connect: { id: person.id } },
            soldByName: person.fullName,
            dateSold: new Date(2025, month, randInt(1, 28)),
            premium: randInt(300, 5000),
            status: choice(policyStatuses),
          },
        });
      }
    }

    // Deterministic boosts to make scorecard tiers visible (January only)
    if (month === 0 && people.length >= 3) {
      const pcProduct = lobs.find((l) => l.premiumCategory === "PC")?.products[0];
      const fsProduct = lobs.find((l) => l.premiumCategory === "FS")?.products[0];
      const addBoost = async (person, pcPremium, fsPremium) => {
        if (pcProduct) {
          await prisma.soldProduct.create({
            data: {
              household: { connect: { id: households[person.id].id } },
              agency: { connect: { id: agencyId } },
              org: { connect: { id: orgId } },
              product: { connect: { id: pcProduct.id } },
              soldByPerson: { connect: { id: person.id } },
              soldByName: person.fullName,
              dateSold: new Date(2025, month, 5),
              premium: pcPremium,
              status: PolicyStatus.PAID,
            },
          });
        }
        if (fsProduct) {
          await prisma.soldProduct.create({
            data: {
              household: { connect: { id: households[person.id].id } },
              agency: { connect: { id: agencyId } },
              org: { connect: { id: orgId } },
              product: { connect: { id: fsProduct.id } },
              soldByPerson: { connect: { id: person.id } },
              soldByName: person.fullName,
              dateSold: new Date(2025, month, 6),
              premium: fsPremium,
              status: PolicyStatus.PAID,
            },
          });
        }
      };

      // Person 0 hits Gold, person 1 hits Silver, person 2 hits Bronze
      await addBoost(people[0], 95000, 7000);
      await addBoost(people[1], 65000, 4500);
      await addBoost(people[2], 35000, 2500);
    }
  }
}

async function seedActivities(people) {
  for (const month of MONTHS_2025) {
    for (const person of people) {
      for (const act of ACTIVITIES) {
        await prisma.activityRecord.create({
          data: {
            personId: person.id,
            personName: person.fullName,
            activityName: act,
            activityDate: new Date(2025, month, randInt(1, 28)),
            count: randInt(5, 50),
          },
        });
      }
    }
  }
}

async function safeDelete(delegate, name) {
  try {
    if (delegate?.deleteMany) await delegate.deleteMany();
  } catch (e) {
    console.warn("Skip delete:", name, e?.code || e?.message);
  }
}

async function main() {
  console.log("Seeding demo data...");
  if (process.env.DEMO_RESET === "1") {
    console.log("Resetting tables...");
    // Delete in FK-safe order
    await safeDelete(prisma.winTheDayPlanPersonAssignment, "winTheDayPlanPersonAssignment");
    await safeDelete(prisma.winTheDayPlanTeamAssignment, "winTheDayPlanTeamAssignment");
    await safeDelete(prisma.winTheDayRule, "winTheDayRule");
    await safeDelete(prisma.winTheDayPlan, "winTheDayPlan");
    await prisma.activityRecord.deleteMany();
    await safeDelete(prisma.activityTeamVisibility, "activityTeamVisibility");
    await safeDelete(prisma.activityDailyExpectation, "activityDailyExpectation");
    await safeDelete(prisma.activityType, "activityType");
    await safeDelete(prisma.compPlanScorecardReward, "compPlanScorecardReward");
    await safeDelete(prisma.compPlanScorecardCondition, "compPlanScorecardCondition");
    await safeDelete(prisma.compPlanScorecardTier, "compPlanScorecardTier");
    await safeDelete(prisma.compPlanTierRow, "compPlanTierRow");
    await prisma.compPlanBonusModule.deleteMany();
    await prisma.compPlanRuleBlock.deleteMany();
    await prisma.compPlanVersion.deleteMany();
    await prisma.compPlanAssignment.deleteMany();
    await prisma.compPlan.deleteMany();
    await safeDelete(prisma.compMonthlyResult, "compMonthlyResult");
    await safeDelete(prisma.commissionPlanAssignment, "commissionPlanAssignment");
    await safeDelete(prisma.commissionPlan, "commissionPlan");
    await safeDelete(prisma.commissionComponent, "commissionComponent");
    await safeDelete(prisma.reportPreset, "reportPreset");
    await safeDelete(prisma.productionExpectation, "productionExpectation");
    await prisma.householdFieldValue.deleteMany();
    await prisma.householdFieldDefinition.deleteMany();
    await prisma.marketingSourceOption.deleteMany();
    await prisma.soldProduct.deleteMany();
    await prisma.household.deleteMany();
    await prisma.valuePolicyDefault.deleteMany();
    await safeDelete(prisma.role, "role");
    await safeDelete(prisma.team, "team");
    await prisma.person.deleteMany();
    await prisma.agency.deleteMany();
  }

  const demoOrg = await ensureOrg("Demo Org");

  const legacy = await ensureAgency(demoOrg.id, "Demo Legacy Agency", "Demo Legacy");
  const moa = await ensureAgency(demoOrg.id, "Demo MOA Agency", "Demo MOA");

  await ensureLobs(demoOrg.id);
  await ensureActivitiesForAgency(legacy.id);
  await ensureActivitiesForAgency(moa.id);

  const legacyPeople = await createPeople(legacy.orgId, legacy.id);
  const moaPeople = await createPeople(moa.orgId, moa.id);

  const planLegacy = await createPlan(legacy.id, demoOrg.id);
  const planMoa = await createPlan(moa.id, demoOrg.id);

  // Assign plan to agency (all persons inherit)
  const legacyAssign = await prisma.compPlanAssignment.findFirst({ where: { planId: planLegacy.id, scopeType: CompAssignmentScope.AGENCY, scopeId: legacy.id } });
  if (legacyAssign) {
    await prisma.compPlanAssignment.update({ where: { id: legacyAssign.id }, data: { active: true } });
  } else {
    await prisma.compPlanAssignment.create({ data: { planId: planLegacy.id, scopeType: CompAssignmentScope.AGENCY, scopeId: legacy.id, active: true } });
  }
  const moaAssign = await prisma.compPlanAssignment.findFirst({ where: { planId: planMoa.id, scopeType: CompAssignmentScope.AGENCY, scopeId: moa.id } });
  if (moaAssign) {
    await prisma.compPlanAssignment.update({ where: { id: moaAssign.id }, data: { active: true } });
  } else {
    await prisma.compPlanAssignment.create({ data: { planId: planMoa.id, scopeType: CompAssignmentScope.AGENCY, scopeId: moa.id, active: true } });
  }

  await seedSoldProducts(legacy.id, demoOrg.id, legacyPeople);
  await seedSoldProducts(moa.id, demoOrg.id, moaPeople);
  await seedActivities([...legacyPeople, ...moaPeople]);

  console.log("Done. Demo agencies, plans, people, sold products, and activities for 2025 created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
