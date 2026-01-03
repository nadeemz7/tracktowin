import { prisma } from "@/lib/prisma";
import { PolicyStatus, WinSourceType } from "@prisma/client";

export async function resolveWinTheDayPlanForPerson(agencyId: string | null, personId?: string, teamId?: string) {
  if (personId) {
    const personAssignment = await prisma.winTheDayPlanPersonAssignment.findFirst({
      where: { personId, active: true },
      include: { plan: true },
    });
    if (personAssignment?.plan) return personAssignment.plan;
  }

  if (teamId) {
    const teamAssignment = await prisma.winTheDayPlanTeamAssignment.findFirst({
      where: { teamId, active: true },
      include: { plan: true },
    });
    if (teamAssignment?.plan) return teamAssignment.plan;
  }

  // fallback: pick any default plan for agency? choose by team type if known else first active
  const plan = await prisma.winTheDayPlan.findFirst({
    where: { agencyId: agencyId || undefined, active: true },
    orderBy: { createdAt: "asc" },
  });
  return plan;
}

export async function computeWinTheDayPoints(planId: string, personId: string | null, date: Date) {
  const plan = await prisma.winTheDayPlan.findUnique({
    where: { id: planId },
    include: { rules: true },
  });
  if (!plan) return { points: 0, target: 0, win: false, breakdown: [] as { ruleId: string; points: number; detail: string }[] };

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const breakdown: { ruleId: string; points: number; detail: string }[] = [];
  let total = 0;

  for (const rule of plan.rules) {
    if (rule.sourceType === WinSourceType.WRITTEN_APPS) {
      const writtenCount = await prisma.soldProduct.count({
        where: {
          soldByPersonId: personId || undefined,
          status: PolicyStatus.WRITTEN,
          dateSold: { gte: start, lt: end },
        },
      });
      const points = applyRule(rule, writtenCount);
      total += points;
      breakdown.push({ ruleId: rule.id, points, detail: `${writtenCount} written apps -> ${points} points` });
    } else if (rule.sourceType === WinSourceType.ACTIVITY) {
      const activityType = rule.activityTypeId
        ? await prisma.activityType.findUnique({ where: { id: rule.activityTypeId } })
        : null;
      const activityName = activityType?.name;
      const sum = activityName
        ? await prisma.activityRecord.aggregate({
            where: {
              personId: personId || undefined,
              activityName,
              activityDate: { gte: start, lt: end },
            },
            _sum: { count: true },
          })
        : null;
      const count = sum?._sum?.count ?? 0;
      const points = applyRule(rule, count);
      total += points;
      breakdown.push({
        ruleId: rule.id,
        points,
        detail: `${count} ${activityName || "activity"} -> ${points} points`,
      });
    }
  }

  const target = plan.pointsToWin;
  return { points: total, target, win: total >= target, breakdown };
}

function applyRule(rule: { unitsPerPoint: number | null; pointsAwarded: number }, units: number) {
  const divisor = rule.unitsPerPoint && rule.unitsPerPoint > 0 ? rule.unitsPerPoint : 1;
  const batches = Math.floor(units / divisor);
  return batches * (rule.pointsAwarded || 0);
}
