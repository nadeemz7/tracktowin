import { prisma } from "./prisma";

type TeamMap = { sales?: { id: string }; cs?: { id: string } };

const DEFAULT_ACTIVITY_CONFIG = [
  { name: "Outbounds", unitLabel: "calls", salesAvailable: true, salesDefault: true },
  { name: "Inbounds", unitLabel: "calls", csAvailable: true, csDefault: true },
  { name: "Quotes", unitLabel: "quotes", salesAvailable: true, salesDefault: true },
  { name: "Referrals", unitLabel: "referrals", salesAvailable: true },
  { name: "IFRs", unitLabel: "IFRs", csAvailable: true, csDefault: true },
  { name: "FS Appointments Held", unitLabel: "appointments", salesAvailable: true },
  { name: "Walk-ins", unitLabel: "walk-ins", csAvailable: true, csDefault: true },
  { name: "Tasks", unitLabel: "tasks", salesAvailable: true, csAvailable: true },
  { name: "Life Opportunities", unitLabel: "opportunities", salesAvailable: true },
  { name: "Onboarding Tasks", unitLabel: "tasks", csAvailable: true },
  { name: "Reviews", unitLabel: "reviews", salesAvailable: true, csAvailable: true },
];

async function ensureDefaultTeams(agencyId: string): Promise<TeamMap> {
  const existing = await prisma.team.findMany({
    where: { agencyId, name: { in: ["Sales", "Customer Service"] } },
  });

  const map: TeamMap = {};
  for (const team of existing) {
    if (team.name === "Sales") map.sales = { id: team.id };
    if (team.name === "Customer Service") map.cs = { id: team.id };
  }

  if (!map.sales) {
    const created = await prisma.team.create({ data: { agencyId, name: "Sales" } });
    map.sales = { id: created.id };
  }

  if (!map.cs) {
    const created = await prisma.team.create({ data: { agencyId, name: "Customer Service" } });
    map.cs = { id: created.id };
  }

  return map;
}

async function ensureDefaultActivities(agencyId: string, teams: TeamMap) {
  const existing = await prisma.activityType.findMany({
    where: { agencyId },
    select: { id: true, name: true },
  });
  const existingNames = new Set(existing.map((a) => a.name));

  for (const cfg of DEFAULT_ACTIVITY_CONFIG) {
    let activityId: string | undefined;

    if (!existingNames.has(cfg.name)) {
      const created = await prisma.activityType.create({
        data: {
          agencyId,
          name: cfg.name,
          active: true,
          inputMode: "COUNT",
          unitLabel: cfg.unitLabel,
          trackOnly: true,
          payable: false,
          requiresFullName: false,
        },
        select: { id: true },
      });
      activityId = created.id;
    } else {
      activityId = existing.find((a) => a.name === cfg.name)?.id;
    }

    if (!activityId) continue;

    const visibilityCreates = [];

    if (cfg.salesAvailable && teams.sales) {
      const existingVis = await prisma.activityTeamVisibility.findFirst({
        where: { activityTypeId: activityId, teamId: teams.sales.id },
      });
      if (!existingVis) {
        visibilityCreates.push(
          prisma.activityTeamVisibility.create({
            data: {
              activityTypeId: activityId,
              teamId: teams.sales.id,
              canUse: true,
              isDefaultForTeam: Boolean(cfg.salesDefault),
            },
          })
        );
      }
    }

    if (cfg.csAvailable && teams.cs) {
      const existingVis = await prisma.activityTeamVisibility.findFirst({
        where: { activityTypeId: activityId, teamId: teams.cs.id },
      });
      if (!existingVis) {
        visibilityCreates.push(
          prisma.activityTeamVisibility.create({
            data: {
              activityTypeId: activityId,
              teamId: teams.cs.id,
              canUse: true,
              isDefaultForTeam: Boolean(cfg.csDefault),
            },
          })
        );
      }
    }

    if (visibilityCreates.length) {
      await prisma.$transaction(visibilityCreates);
    }
  }
}

async function ensureDefaultWinTheDayPlans(agencyId: string) {
  const teams = await ensureDefaultTeams(agencyId);
  await ensureDefaultActivities(agencyId, teams);

  const activityLookup = await prisma.activityType.findMany({
    where: { agencyId, name: { in: ["Quotes", "Outbounds", "FS Appointments Held", "Inbounds", "IFRs", "Walk-ins"] } },
    select: { id: true, name: true },
  });
  const idFor = (name: string) => activityLookup.find((a) => a.name === name)?.id;

  // Sales WTD plan
  const salesPlanName = "Sales – Win The Day";
  let salesPlan = await prisma.winTheDayPlan.findFirst({ where: { agencyId, name: salesPlanName } });
  if (!salesPlan) {
    salesPlan = await prisma.winTheDayPlan.create({
      data: {
        agencyId,
        name: salesPlanName,
        pointsToWin: 6,
        active: true,
      },
    });

    await prisma.winTheDayRule.createMany({
      data: [
        { planId: salesPlan.id, orderIndex: 0, sourceType: "ACTIVITY", activityTypeId: idFor("Quotes"), unitsPerPoint: 1, pointsAwarded: 1 },
        { planId: salesPlan.id, orderIndex: 1, sourceType: "ACTIVITY", activityTypeId: idFor("Outbounds"), unitsPerPoint: 40, pointsAwarded: 1 },
        { planId: salesPlan.id, orderIndex: 2, sourceType: "WRITTEN_APPS", unitsPerPoint: 1, pointsAwarded: 1 },
        { planId: salesPlan.id, orderIndex: 3, sourceType: "ACTIVITY", activityTypeId: idFor("FS Appointments Held"), unitsPerPoint: 1, pointsAwarded: 1 },
      ],
    });

    if (teams.sales) {
      await prisma.winTheDayPlanTeamAssignment.create({
        data: { planId: salesPlan.id, teamId: teams.sales.id, active: true },
      });
    }
  }

  // Customer Service WTD plan
  const csPlanName = "Customer Service – Win The Day";
  let csPlan = await prisma.winTheDayPlan.findFirst({ where: { agencyId, name: csPlanName } });
  if (!csPlan) {
    csPlan = await prisma.winTheDayPlan.create({
      data: {
        agencyId,
        name: csPlanName,
        pointsToWin: 32,
        active: true,
      },
    });

    await prisma.winTheDayRule.createMany({
      data: [
        { planId: csPlan.id, orderIndex: 0, sourceType: "ACTIVITY", activityTypeId: idFor("Inbounds"), unitsPerPoint: 1, pointsAwarded: 1 },
        { planId: csPlan.id, orderIndex: 1, sourceType: "ACTIVITY", activityTypeId: idFor("IFRs"), unitsPerPoint: 1, pointsAwarded: 3 },
        { planId: csPlan.id, orderIndex: 2, sourceType: "ACTIVITY", activityTypeId: idFor("Walk-ins"), unitsPerPoint: 1, pointsAwarded: 1 },
      ],
    });

    if (teams.cs) {
      await prisma.winTheDayPlanTeamAssignment.create({
        data: { planId: csPlan.id, teamId: teams.cs.id, active: true },
      });
    }
  }
}

async function backfillAgencyDefaults() {
  const agencies = await prisma.agency.findMany({ select: { id: true, name: true } });

  let createdActivities = 0;
  let createdPlans = 0;
  let createdTeams = 0;

  for (const agency of agencies) {
    const teamsBefore = await prisma.team.count({ where: { agencyId: agency.id } });
    const teams = await ensureDefaultTeams(agency.id);
    const teamsAfter = await prisma.team.count({ where: { agencyId: agency.id } });
    createdTeams += teamsAfter - teamsBefore;

    const activityCountBefore = await prisma.activityType.count({ where: { agencyId: agency.id } });
    await ensureDefaultActivities(agency.id, teams);
    const activityCountAfter = await prisma.activityType.count({ where: { agencyId: agency.id } });
    createdActivities += activityCountAfter - activityCountBefore;

    const planCountBefore = await prisma.winTheDayPlan.count({ where: { agencyId: agency.id } });
    await ensureDefaultWinTheDayPlans(agency.id);
    const planCountAfter = await prisma.winTheDayPlan.count({ where: { agencyId: agency.id } });
    createdPlans += planCountAfter - planCountBefore;
  }

  return { agenciesProcessed: agencies.length, createdTeams, createdActivities, createdPlans };
}

export {
  ensureDefaultTeams,
  ensureDefaultActivities,
  ensureDefaultWinTheDayPlans,
  backfillAgencyDefaults,
};
