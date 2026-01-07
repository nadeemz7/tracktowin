import { prisma } from "@/lib/prisma";
import { PolicyStatus } from "@prisma/client";
import { endOfMonth, endOfYear, max, min, startOfMonth, startOfYear } from "date-fns";

type OfficeSummary = {
  hasPlan: boolean;
  planMode: "BUCKET" | "LOB" | null;
  appsActual: number;
  premiumActual: number;
  appsTarget: number | null;
  premiumTarget: number | null;
  appsDelta: number | null;
  premiumDelta: number | null;
  pace: { appsPace: number | null; premiumPace: number | null };
};

type BreakdownRow = {
  key: string;
  category?: string | null;
  appsActual: number;
  premiumActual: number;
  appsTarget: number | null;
  premiumTarget: number | null;
  appsDelta: number | null;
  premiumDelta: number | null;
  pacePremium: number | null;
};

type PersonRow = {
  personId: string;
  name: string;
  roleName: string | null;
  appsActual: number;
  premiumActual: number;
  appsTarget: number;
  premiumTarget: number;
  appsDelta: number;
  premiumDelta: number;
  pacePremium: number | null;
  expectationSource: "override" | "role";
};

export type BenchmarksReport = {
  office: OfficeSummary;
  breakdown: { mode: "BUCKET" | "LOB"; rows: BreakdownRow[] };
  people: PersonRow[];
};

export class BenchmarksReportError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function daysInclusive(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function toStartOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function toEndOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function toNonNegativeNumber(value: any) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return num;
}

function normalizeBucketTargets(input: any) {
  if (!input || typeof input !== "object") return null;
  const pc = toNonNegativeNumber((input as any).PC);
  const fs = toNonNegativeNumber((input as any).FS);
  const ipsRaw = (input as any).IPS;
  const ips = ipsRaw !== undefined ? toNonNegativeNumber(ipsRaw) : undefined;
  return ips === undefined ? { PC: pc, FS: fs } : { PC: pc, FS: fs, IPS: ips };
}

function sumAppGoalsByLob(input: any) {
  if (!input || typeof input !== "object") return null;
  const auto = toNonNegativeNumber((input as any).AUTO);
  const fire = toNonNegativeNumber((input as any).FIRE);
  const life = toNonNegativeNumber((input as any).LIFE);
  const health = toNonNegativeNumber((input as any).HEALTH);
  const ipsRaw = (input as any).IPS;
  const ips = ipsRaw !== undefined ? toNonNegativeNumber(ipsRaw) : 0;
  return auto + fire + life + health + ips;
}

type GetBenchmarksReportParams = {
  orgId: string;
  start: Date;
  end: Date;
  statuses: PolicyStatus[];
};

export async function getBenchmarksReport({
  orgId,
  start,
  end,
  statuses,
}: GetBenchmarksReportParams): Promise<BenchmarksReport> {
  const rangeStart = toStartOfDay(start);
  const rangeEnd = toEndOfDay(end);
  const rangeDays = daysInclusive(rangeStart, rangeEnd);
  if (rangeDays <= 0) {
    throw new BenchmarksReportError("Invalid date range", 400);
  }

  // People and expectations
  const [roleExpectations, personOverrides, people, agencyLobs] = await Promise.all([
    prisma.benchRoleExpectation.findMany({
      where: { role: { team: { agencyId: orgId } } },
      include: { role: { include: { team: true } } },
    }),
    prisma.benchPersonOverride.findMany({
      where: { person: { primaryAgencyId: orgId } },
    }),
    prisma.person.findMany({
      where: { primaryAgencyId: orgId },
      include: { role: true, team: true },
    }),
    prisma.lineOfBusiness.findMany({
      where: { agencyId: orgId },
      select: { id: true, name: true, premiumCategory: true },
    }),
  ]);

  const lobNameById = new Map(agencyLobs.map((l) => [l.id, l.name]));
  const lobCategoryById = new Map(agencyLobs.map((l) => [l.id, l.premiumCategory]));
  const overrideMap = new Map(personOverrides.map((o) => [o.personId, o]));
  const roleExpMap = new Map(roleExpectations.map((r) => [r.roleId, r]));
  const peopleWithExpectations = people.filter((p) => {
    const override = overrideMap.get(p.id);
    const hasOverride =
      override &&
      (override.monthlyAppsOverride != null ||
        override.monthlyPremiumOverride != null ||
        override.premiumModeOverride != null ||
        (override.premiumByBucketOverride && Object.keys(override.premiumByBucketOverride).length > 0) ||
        (override.premiumByLobOverride && override.premiumByLobOverride.length > 0));
    if (hasOverride) return true;
    if (p.roleId && roleExpMap.has(p.roleId)) return true;
    return false;
  });

  // Sold products
  const sold = await prisma.soldProduct.findMany({
    where: {
      agencyId: orgId,
      dateSold: { gte: rangeStart, lte: rangeEnd },
      status: { in: statuses },
    },
    include: { product: { include: { lineOfBusiness: true } } },
  });

  // Office plan(s) for range years
  const startYear = rangeStart.getFullYear();
  const endYear = rangeEnd.getFullYear();
  const officePlans = await prisma.benchOfficePlan.findMany({
    where: { agencyId: orgId, year: { gte: startYear, lte: endYear } },
  });
  const planByYear = new Map(officePlans.map((p) => [p.year, p]));

  let officeAppsTarget: number | null = 0;
  let officePremiumTarget: number | null = 0;
  const bucketTargetMap = new Map<string, number>();
  const lobTargetMap = new Map<string, number>();

  for (let year = startYear; year <= endYear; year++) {
    const plan = planByYear.get(year);
    if (!plan) continue;
    const yearStart = max([startOfYear(new Date(`${year}-01-01T00:00:00`)), rangeStart]);
    const yearEnd = min([endOfYear(new Date(`${year}-12-31T00:00:00`)), rangeEnd]);
    const daysInYearRange = daysInclusive(yearStart, yearEnd);
    const daysInYearTotal = daysInclusive(startOfYear(yearStart), endOfYear(yearStart));
    const fraction = daysInYearRange / daysInYearTotal;

    const appsByLobTotal = sumAppGoalsByLob((plan as any).appGoalsByLobJson);
    const appsAnnualTotal = appsByLobTotal != null ? appsByLobTotal : plan.appsAnnualTarget ?? 0;
    officeAppsTarget = (officeAppsTarget ?? 0) + appsAnnualTotal * fraction;

    const bucketSource = normalizeBucketTargets((plan as any).premiumByBucketJson) || normalizeBucketTargets(plan.premiumByBucket);
    const premiumAnnualTotal = bucketSource
      ? bucketSource.PC + bucketSource.FS + (bucketSource.IPS ?? 0)
      : plan.premiumAnnualTarget ?? 0;
    officePremiumTarget = (officePremiumTarget ?? 0) + premiumAnnualTotal * fraction;

    if (plan.premiumMode === "BUCKET" && bucketSource) {
      ["PC", "FS", "IPS"].forEach((k) => {
        const val = (bucketSource as any)[k];
        if (val != null) {
          const current = bucketTargetMap.get(k) ?? 0;
          bucketTargetMap.set(k, current + Number(val) * fraction);
        }
      });
    } else if (plan.premiumMode === "LOB" && plan.premiumByLob) {
      const pl = plan.premiumByLob as any[];
      pl.forEach((entry: any) => {
        if (!entry?.lobId) return;
        const current = lobTargetMap.get(entry.lobId) ?? 0;
        lobTargetMap.set(entry.lobId, current + Number(entry.premium ?? 0) * fraction);
      });
    }
  }

  if (officePlans.length === 0) {
    officeAppsTarget = null;
    officePremiumTarget = null;
  }

  // Actuals aggregation
  let appsActual = 0;
  let premiumActual = 0;
  const bucketActual = new Map<string, { apps: number; premium: number }>();
  const lobActual = new Map<string, { apps: number; premium: number; category?: string }>();
  const personActual = new Map<string, { apps: number; premium: number }>();

  sold.forEach((sp) => {
    appsActual += 1;
    premiumActual += sp.premium ?? 0;

    const category = sp.product?.lineOfBusiness?.premiumCategory || "PC";
    const bucket = bucketActual.get(category) || { apps: 0, premium: 0 };
    bucket.apps += 1;
    bucket.premium += sp.premium ?? 0;
    bucketActual.set(category, bucket);

    const lobId = sp.product?.lineOfBusiness?.id || "unknown";
    const lobCategory = sp.product?.lineOfBusiness?.premiumCategory || undefined;
    const lobRow = lobActual.get(lobId) || { apps: 0, premium: 0, category: lobCategory };
    lobRow.apps += 1;
    lobRow.premium += sp.premium ?? 0;
    if (!lobRow.category && lobCategory) lobRow.category = lobCategory;
    lobActual.set(lobId, lobRow);

    const pid = sp.soldByPersonId || "";
    if (!pid) return;
    const pa = personActual.get(pid) || { apps: 0, premium: 0 };
    pa.apps += 1;
    pa.premium += sp.premium ?? 0;
    personActual.set(pid, pa);
  });

  // Office pace
  const today = new Date();
  const clampedToday = toEndOfDay(today) > rangeEnd ? rangeEnd : toEndOfDay(today);
  const elapsedDays = clampedToday < rangeStart ? 0 : daysInclusive(rangeStart, clampedToday);
  const expectedAppsToDate =
    officeAppsTarget != null && rangeDays > 0 ? officeAppsTarget * (elapsedDays / rangeDays) : null;
  const expectedPremiumToDate =
    officePremiumTarget != null && rangeDays > 0 ? officePremiumTarget * (elapsedDays / rangeDays) : null;

  const office: OfficeSummary = {
    hasPlan: officePlans.length > 0,
    planMode: officePlans.find((p) => p.premiumMode === "LOB") ? "LOB" : officePlans.length ? "BUCKET" : null,
    appsActual,
    premiumActual,
    appsTarget: officeAppsTarget,
    premiumTarget: officePremiumTarget,
    appsDelta: officeAppsTarget != null ? appsActual - officeAppsTarget : null,
    premiumDelta: officePremiumTarget != null ? premiumActual - officePremiumTarget : null,
    pace: {
      appsPace: expectedAppsToDate && expectedAppsToDate > 0 ? appsActual / expectedAppsToDate : null,
      premiumPace: expectedPremiumToDate && expectedPremiumToDate > 0 ? premiumActual / expectedPremiumToDate : null,
    },
  };

  // Breakdown (default bucket mode; supports lob if plan requested it)
  const breakdownMode: "BUCKET" | "LOB" = office.planMode === "LOB" ? "LOB" : "BUCKET";
  const breakdownRows: BreakdownRow[] = [];
  if (breakdownMode === "BUCKET") {
    ["PC", "FS", "IPS"].forEach((bucket) => {
      const actual = bucketActual.get(bucket) || { apps: 0, premium: 0 };
      const target = bucketTargetMap.has(bucket) ? bucketTargetMap.get(bucket)! : null;
      const expectedToDate = target != null && rangeDays > 0 ? target * (elapsedDays / rangeDays) : null;
      breakdownRows.push({
        key: bucket,
        category: bucket,
        appsActual: actual.apps,
        premiumActual: actual.premium,
        appsTarget: null,
        premiumTarget: target,
        appsDelta: null,
        premiumDelta: target != null ? actual.premium - target : null,
        pacePremium: expectedToDate && expectedToDate > 0 ? actual.premium / expectedToDate : null,
      });
    });
  } else {
    const lobIds = agencyLobs.map((l) => l.id);
    if (lobActual.has("unknown")) lobIds.push("unknown");
    lobIds.sort((a, b) => (lobNameById.get(a) || a).localeCompare(lobNameById.get(b) || b));
    lobIds.forEach((lobId) => {
      const actual = lobActual.get(lobId) || { apps: 0, premium: 0, category: lobCategoryById.get(lobId) };
      const target = lobTargetMap.has(lobId) ? lobTargetMap.get(lobId)! : null;
      const expectedToDate = target != null && rangeDays > 0 ? target * (elapsedDays / rangeDays) : null;
      const keyLabel = lobNameById.get(lobId) || (lobId === "unknown" ? "Unknown" : lobId);
      breakdownRows.push({
        key: keyLabel,
        category: actual.category,
        appsActual: actual.apps,
        premiumActual: actual.premium,
        appsTarget: null,
        premiumTarget: target,
        appsDelta: null,
        premiumDelta: target != null ? actual.premium - target : null,
        pacePremium: expectedToDate && expectedToDate > 0 ? actual.premium / expectedToDate : null,
      });
    });
  }

  // Person expectations proration by month
  const monthBounds: Array<{ key: string; start: Date; end: Date; days: number }> = [];
  let cursor = startOfMonth(rangeStart);
  while (cursor <= rangeEnd) {
    const mStart = cursor;
    const mEnd = endOfMonth(cursor);
    const rangeStartBound = mStart < rangeStart ? rangeStart : mStart;
    const rangeEndBound = mEnd > rangeEnd ? rangeEnd : mEnd;
    monthBounds.push({
      key: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, "0")}`,
      start: rangeStartBound,
      end: rangeEndBound,
      days: daysInclusive(rangeStartBound, rangeEndBound),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  const peopleRows: PersonRow[] = [];
  peopleWithExpectations.forEach((p) => {
    const override = overrideMap.get(p.id);
    const hasOverride =
      override &&
      (override.monthlyAppsOverride != null ||
        override.monthlyPremiumOverride != null ||
        override.premiumModeOverride != null ||
        (override.premiumByBucketOverride && Object.keys(override.premiumByBucketOverride).length > 0) ||
        (override.premiumByLobOverride && override.premiumByLobOverride.length > 0));
    const source = hasOverride ? "override" : "role";
    const exp = hasOverride ? override : p.roleId ? roleExpMap.get(p.roleId) : undefined;
    if (!exp) return;

    let appsTarget = 0;
    let premiumTarget = 0;
    const premiumMode = hasOverride ? override?.premiumModeOverride : (exp as any)?.premiumMode;
    const bucketPremium =
      premiumMode === "BUCKET"
        ? (hasOverride ? (override as any)?.premiumByBucketOverride : (exp as any)?.premiumByBucket) || null
        : null;
    const lobPremium =
      premiumMode === "LOB"
        ? (hasOverride ? (override as any)?.premiumByLobOverride : (exp as any)?.premiumByLob) || null
        : null;
    monthBounds.forEach((m) => {
      const monthTotalDays = daysInclusive(startOfMonth(m.start), endOfMonth(m.start));
      const fraction = (m.days || 0) / monthTotalDays;
      const monthlyApps = (hasOverride ? override?.monthlyAppsOverride ?? 0 : (exp as any).monthlyAppsTarget ?? 0) as number;
      let monthlyPremium: number;
      if (premiumMode === "BUCKET" && bucketPremium) {
        const pc = Number((bucketPremium as any).PC ?? 0);
        const fs = Number((bucketPremium as any).FS ?? 0);
        const ips = Number((bucketPremium as any).IPS ?? 0);
        monthlyPremium = pc + fs + ips;
      } else if (premiumMode === "LOB" && Array.isArray(lobPremium)) {
        monthlyPremium = lobPremium.reduce((sum: number, row: any) => sum + Number(row?.premium ?? 0), 0);
      } else {
        monthlyPremium = (hasOverride ? override?.monthlyPremiumOverride ?? 0 : (exp as any).monthlyPremiumTarget ?? 0) as number;
      }
      appsTarget += monthlyApps * fraction;
      premiumTarget += monthlyPremium * fraction;
    });

    const actual = personActual.get(p.id) || { apps: 0, premium: 0 };
    const expectedPremiumToDate = premiumTarget * (elapsedDays / rangeDays);
    peopleRows.push({
      personId: p.id,
      name: p.fullName,
      roleName: p.role?.name || null,
      appsActual: actual.apps,
      premiumActual: actual.premium,
      appsTarget,
      premiumTarget,
      appsDelta: actual.apps - appsTarget,
      premiumDelta: actual.premium - premiumTarget,
      pacePremium: expectedPremiumToDate > 0 ? actual.premium / expectedPremiumToDate : null,
      expectationSource: source,
    });
  });

  peopleRows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    office,
    breakdown: { mode: breakdownMode, rows: breakdownRows },
    people: peopleRows,
  };
}
