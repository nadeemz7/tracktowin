import "dotenv/config";
import { prisma } from "../lib/prisma.ts";

type Counts = {
  agency: number;
  person: number;
  team: number;
  soldProduct: number;
  compPlan: number;
  compPlanVersion: number;
  commissionPlan: number;
  activityType: number;
  activityEvent: number;
  reportSnapshot: number;
  lineOfBusiness: number;
  household: number;
  householdFieldDefinition: number;
  marketingSourceOption: number;
  premiumBucket: number;
  productionExpectation: number;
  reportPreset: number;
  valuePolicyDefault: number;
  winTheDayPlan: number;
  benchOfficePlan: number;
  compMonthlyResult: number;
};

function assertSafeToRun() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run: NODE_ENV is production.");
    process.exit(1);
  }
  if (process.env.NUKE_CONFIRM !== "YES") {
    console.error("Refusing to run: set NUKE_CONFIRM=YES.");
    process.exit(1);
  }
}

async function getCounts(): Promise<Counts> {
  const [
    agency,
    person,
    team,
    soldProduct,
    compPlan,
    compPlanVersion,
    commissionPlan,
    activityType,
    activityEvent,
    reportSnapshot,
    lineOfBusiness,
    household,
    householdFieldDefinition,
    marketingSourceOption,
    premiumBucket,
    productionExpectation,
    reportPreset,
    valuePolicyDefault,
    winTheDayPlan,
    benchOfficePlan,
    compMonthlyResult,
  ] = await Promise.all([
    prisma.agency.count(),
    prisma.person.count(),
    prisma.team.count(),
    prisma.soldProduct.count(),
    prisma.compPlan.count(),
    prisma.compPlanVersion.count(),
    prisma.commissionPlan.count(),
    prisma.activityType.count(),
    prisma.activityEvent.count(),
    prisma.reportSnapshot.count(),
    prisma.lineOfBusiness.count(),
    prisma.household.count(),
    prisma.householdFieldDefinition.count(),
    prisma.marketingSourceOption.count(),
    prisma.premiumBucket.count(),
    prisma.productionExpectation.count(),
    prisma.reportPreset.count(),
    prisma.valuePolicyDefault.count(),
    prisma.winTheDayPlan.count(),
    prisma.benchOfficePlan.count(),
    prisma.compMonthlyResult.count(),
  ]);

  return {
    agency,
    person,
    team,
    soldProduct,
    compPlan,
    compPlanVersion,
    commissionPlan,
    activityType,
    activityEvent,
    reportSnapshot,
    lineOfBusiness,
    household,
    householdFieldDefinition,
    marketingSourceOption,
    premiumBucket,
    productionExpectation,
    reportPreset,
    valuePolicyDefault,
    winTheDayPlan,
    benchOfficePlan,
    compMonthlyResult,
  };
}

function printCounts(label: string, counts: Counts) {
  const rows: Array<[string, number]> = [
    ["Agency", counts.agency],
    ["Person", counts.person],
    ["Team", counts.team],
    ["SoldProduct", counts.soldProduct],
    ["CompPlan", counts.compPlan],
    ["CompPlanVersion", counts.compPlanVersion],
    ["CommissionPlan", counts.commissionPlan],
    ["ActivityType", counts.activityType],
    ["ActivityEvent", counts.activityEvent],
    ["ReportSnapshot", counts.reportSnapshot],
    ["LineOfBusiness", counts.lineOfBusiness],
    ["Household", counts.household],
    ["HouseholdFieldDefinition", counts.householdFieldDefinition],
    ["MarketingSourceOption", counts.marketingSourceOption],
    ["PremiumBucket", counts.premiumBucket],
    ["ProductionExpectation", counts.productionExpectation],
    ["ReportPreset", counts.reportPreset],
    ["ValuePolicyDefault", counts.valuePolicyDefault],
    ["WinTheDayPlan", counts.winTheDayPlan],
    ["BenchOfficePlan", counts.benchOfficePlan],
    ["CompMonthlyResult", counts.compMonthlyResult],
  ];

  console.log(`\n${label}`);
  rows.forEach(([name, count]) => {
    console.log(`${name}: ${count}`);
  });
}

async function main() {
  assertSafeToRun();

  const before = await getCounts();
  printCounts("BEFORE", before);

  let hadError = false;
  try {
    const result = await prisma.agency.deleteMany({});
    console.log(`\nDelete agencies result: ${result.count}`);
  } catch (err) {
    hadError = true;
    console.error("\nDelete agencies failed:");
    console.error(err);
  }

  const after = await getCounts();
  printCounts("AFTER", after);

  const ok = !hadError && after.agency === 0;
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("Unexpected error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
