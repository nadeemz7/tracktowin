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

type LobOption = {
  id: string;
  name: string;
  premiumCategory: string;
};

type LobActualRow = {
  lobId: string;
  name: string;
  category?: string | null;
  appsActual: number;
  premiumActual: number;
};

type BucketActualRow = {
  bucket: string;
  appsActual: number;
  premiumActual: number;
};

type PersonRow = {
  personId: string;
  name: string;
  roleName: string | null;
  appsActual: number;
  premiumActual: number;
  appsTarget: number;
  premiumTarget: number;
  appsTargetsByLob: Record<string, number>;
  premiumTargetsByBucket: { PC: number; FS: number; IPS: number };
  activityTargetsByType: Record<string, number>;
  appsDelta: number;
  premiumDelta: number;
  pacePremium: number | null;
  expectationSource: "override" | "role";
};

export type BenchmarksReport = {
  office: OfficeSummary;
  breakdown: { mode: "BUCKET" | "LOB"; rows: BreakdownRow[] };
  people: PersonRow[];
  lobs: LobOption[];
  lobActuals: LobActualRow[];
  bucketActuals: BucketActualRow[];
  officePlanYear?: number;
  officePlanAppsByLob?: Record<string, number> | null;
  officePlanPremiumByBucket?: { PC: number; FS: number; IPS: number } | null;
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

function toNonNegativeInt(value: any) {
  return Math.round(toNonNegativeNumber(value));
}

function normalizeTargetRecord(input: any, integer = false) {
  if (!input || typeof input !== "object") return null;
  const result: Record<string, number> = {};
  Object.entries(input as Record<string, any>).forEach(([key, value]) => {
    if (!key) return;
    result[key] = integer ? toNonNegativeInt(value) : toNonNegativeNumber(value);
  });
  return result;
}

function normalizePremiumByLob(input: any) {
  if (!Array.isArray(input)) return null;
  const result: Record<string, number> = {};
  input.forEach((row: any) => {
    const lobId = typeof row?.lobId === "string" ? row.lobId : "";
    if (!lobId) return;
    result[lobId] = toNonNegativeNumber(row?.premium);
  });
  return result;
}

function bucketTargetsFromLob(
  lobTargets: Record<string, number> | null,
  lobCategoryById: Map<string, string>
) {
  if (!lobTargets) return null;
  const totals = { PC: 0, FS: 0, IPS: 0 };
  Object.entries(lobTargets).forEach(([lobId, value]) => {
    const category = lobCategoryById.get(lobId) || "PC";
    if (category === "FS") totals.FS += value;
    else if (category === "IPS") totals.IPS += value;
    else totals.PC += value;
  });
  return totals;
}

function ensureBucketTargets(input: { PC: number; FS: number; IPS?: number } | null) {
  return { PC: input?.PC ?? 0, FS: input?.FS ?? 0, IPS: input?.IPS ?? 0 };
}

function sumRecord(input: Record<string, number>) {
  return Object.values(input).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function normalizeBucketTargets(input: any) {
  if (!input || typeof input !== "object") return null;
  const pc = toNonNegativeNumber((input as any).PC);
  const fs = toNonNegativeNumber((input as any).FS);
  const ipsRaw = (input as any).IPS;
  const ips = ipsRaw !== undefined ? toNonNegativeNumber(ipsRaw) : undefined;
  return ips === undefined ? { PC: pc, FS: fs } : { PC: pc, FS: fs, IPS: ips };
}

type GetBenchmarksReportParams = {
  orgId: string;
  start: Date;
  end: Date;
  statuses: PolicyStatus[];
  personIds?: string[];
  lobIds?: string[];
};

export async function getBenchmarksReport({
  orgId,
  start,
  end,
  statuses,
  personIds,
  lobIds,
}: GetBenchmarksReportParams): Promise<BenchmarksReport> {
  const rangeStart = toStartOfDay(start);
  const rangeEnd = toEndOfDay(end);
  const rangeDays = daysInclusive(rangeStart, rangeEnd);
  if (rangeDays <= 0) {
    throw new BenchmarksReportError("Invalid date range", 400);
  }

  const personFilterIds = Array.isArray(personIds)
    ? personIds.map((id) => String(id)).filter((id) => id)
    : [];
  const lobFilterIds = Array.isArray(lobIds)
    ? lobIds.map((id) => String(id)).filter((id) => id)
    : [];
  const hasPersonFilter = personFilterIds.length > 0;
  const hasLobFilter = lobFilterIds.length > 0;

  // People and expectations
  const [roleExpectations, personOverrides, people, agencyLobs, activityTypes] = await Promise.all([
    prisma.benchRoleExpectation.findMany({
      where: { role: { team: { agencyId: orgId } } },
      include: { role: { include: { team: true } } },
    }),
    prisma.benchPersonOverride.findMany({
      where: {
        person: {
          primaryAgencyId: orgId,
          ...(hasPersonFilter ? { id: { in: personFilterIds } } : {}),
        },
      },
    }),
    prisma.person.findMany({
      where: {
        primaryAgencyId: orgId,
        ...(hasPersonFilter ? { id: { in: personFilterIds } } : {}),
      },
      include: { role: true, team: true },
    }),
    prisma.lineOfBusiness.findMany({
      where: { agencyId: orgId },
      select: { id: true, name: true, premiumCategory: true },
    }),
    prisma.activityType.findMany({
      where: { agencyId: orgId, active: true },
      select: { id: true },
    }),
  ]);

  const lobNameById = new Map(agencyLobs.map((l) => [l.id, l.name]));
  const lobCategoryById = new Map(agencyLobs.map((l) => [l.id, l.premiumCategory]));
  const activityTypeIds = activityTypes.map((t) => t.id);
  const overrideMap = new Map(personOverrides.map((o) => [o.personId, o]));
  const roleExpMap = new Map(roleExpectations.map((r) => [r.roleId, r]));
  const peopleWithExpectations = people.filter((p) => {
    const override = overrideMap.get(p.id);
    const hasOverride =
      override &&
      (override.monthlyAppsOverride != null ||
        override.monthlyPremiumOverride != null ||
        override.premiumModeOverride != null ||
        override.premiumByBucketOverride != null ||
        override.premiumByLobOverride != null ||
        override.appGoalsByLobOverrideJson != null ||
        override.activityTargetsByTypeOverrideJson != null);
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
      ...(hasPersonFilter ? { soldByPersonId: { in: personFilterIds } } : {}),
      ...(hasLobFilter ? { product: { lineOfBusinessId: { in: lobFilterIds } } } : {}),
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

  let officePlanYear: number | undefined;
  let officePlanAppsByLob: Record<string, number> | null = null;
  let officePlanPremiumByBucket: { PC: number; FS: number; IPS: number } | null = null;
  if (startYear === endYear) {
    const plan = planByYear.get(startYear);
    if (plan) {
      officePlanYear = startYear;
      officePlanAppsByLob = normalizeTargetRecord((plan as any).appGoalsByLobJson, true);
      const annualBucketSource =
        normalizeBucketTargets((plan as any).premiumByBucketJson) || normalizeBucketTargets(plan.premiumByBucket);
      officePlanPremiumByBucket = annualBucketSource ? ensureBucketTargets(annualBucketSource) : null;
    }
  }

  let officeAppsTarget: number | null = 0;
  let officePremiumTarget: number | null = 0;
  const bucketTargetMap = new Map<string, number>();
  const lobTargetMap = new Map<string, number>();

  for (let year = startYear; year <= endYear; year++) {
    const plan = planByYear.get(year);
    if (!plan) continue;
    const yearStartDate = new Date(year, 0, 1);
    const yearEndDate = new Date(year, 11, 31);
    const yearStart = max([startOfYear(yearStartDate), rangeStart]);
    const yearEnd = min([endOfYear(yearEndDate), rangeEnd]);
    const daysInYearRange = daysInclusive(yearStart, yearEnd);
    const daysInYearTotal = daysInclusive(startOfYear(yearStart), endOfYear(yearStart));
    const fraction = daysInYearRange / daysInYearTotal;

    const appsByLobTargets = normalizeTargetRecord((plan as any).appGoalsByLobJson, true);
    const appsAnnualTotal = appsByLobTargets != null ? sumRecord(appsByLobTargets) : plan.appsAnnualTarget ?? 0;
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
    const monthKey = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, "0")}`;
    monthBounds.push({
      key: monthKey,
      start: rangeStartBound,
      end: rangeEndBound,
      days: daysInclusive(rangeStartBound, rangeEndBound),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  const peopleRows: PersonRow[] = [];
  peopleWithExpectations.forEach((p) => {
    const override = overrideMap.get(p.id);
    const roleExp = p.roleId ? roleExpMap.get(p.roleId) : undefined;
    if (!override && !roleExp) return;
    const hasOverride =
      override &&
      (override.monthlyAppsOverride != null ||
        override.monthlyPremiumOverride != null ||
        override.premiumModeOverride != null ||
        override.premiumByBucketOverride != null ||
        override.premiumByLobOverride != null ||
        override.appGoalsByLobOverrideJson != null ||
        override.activityTargetsByTypeOverrideJson != null);
    const source = hasOverride ? "override" : "role";

    const appsOverride = normalizeTargetRecord(override?.appGoalsByLobOverrideJson, true);
    const appsRole = normalizeTargetRecord(roleExp?.appGoalsByLobJson, true);
    const activityOverride = normalizeTargetRecord(override?.activityTargetsByTypeOverrideJson, true);
    const activityRole = normalizeTargetRecord(roleExp?.activityTargetsByTypeJson, true);
    const bucketOverride = normalizeBucketTargets(override?.premiumByBucketOverride);
    const bucketRole = normalizeBucketTargets(roleExp?.premiumByBucket);
    const lobPremiumOverride = normalizePremiumByLob(override?.premiumByLobOverride);
    const lobPremiumRole = normalizePremiumByLob(roleExp?.premiumByLob);
    const bucketFromLobOverride = bucketTargetsFromLob(lobPremiumOverride, lobCategoryById);
    const bucketFromLobRole = bucketTargetsFromLob(lobPremiumRole, lobCategoryById);

    const hasAppsJson = override?.appGoalsByLobOverrideJson != null || roleExp?.appGoalsByLobJson != null;
    const hasPremiumJson =
      override?.premiumByBucketOverride != null ||
      override?.premiumByLobOverride != null ||
      roleExp?.premiumByBucket != null ||
      roleExp?.premiumByLob != null;

    const lobIdSet = new Set<string>();
    agencyLobs.forEach((l) => lobIdSet.add(l.id));
    Object.keys(appsOverride || {}).forEach((id) => lobIdSet.add(id));
    Object.keys(appsRole || {}).forEach((id) => lobIdSet.add(id));

    const legacyAppsRaw = !hasAppsJson
      ? hasOverride
        ? override?.monthlyAppsOverride
        : roleExp?.monthlyAppsTarget
      : null;
    const legacyApps = legacyAppsRaw != null ? toNonNegativeInt(legacyAppsRaw) : null;
    const fallbackLobId = agencyLobs[0]?.id;
    if (legacyApps != null) {
      lobIdSet.add(fallbackLobId || "unknown");
    }

    const lobIds = Array.from(lobIdSet);
    const monthlyAppsByLob: Record<string, number> = {};
    lobIds.forEach((lobId) => {
      const overrideVal = appsOverride && Object.prototype.hasOwnProperty.call(appsOverride, lobId) ? appsOverride[lobId] : undefined;
      const roleVal = appsRole && Object.prototype.hasOwnProperty.call(appsRole, lobId) ? appsRole[lobId] : undefined;
      monthlyAppsByLob[lobId] = overrideVal ?? roleVal ?? 0;
    });
    if (legacyApps != null) {
      monthlyAppsByLob[fallbackLobId || "unknown"] = legacyApps;
    }

    const activityIdSet = new Set<string>(activityTypeIds);
    Object.keys(activityOverride || {}).forEach((id) => activityIdSet.add(id));
    Object.keys(activityRole || {}).forEach((id) => activityIdSet.add(id));
    const activityIds = Array.from(activityIdSet);
    const monthlyActivityTargetsByType: Record<string, number> = {};
    activityIds.forEach((activityId) => {
      const overrideVal =
        activityOverride && Object.prototype.hasOwnProperty.call(activityOverride, activityId)
          ? activityOverride[activityId]
          : undefined;
      const roleVal =
        activityRole && Object.prototype.hasOwnProperty.call(activityRole, activityId)
          ? activityRole[activityId]
          : undefined;
      monthlyActivityTargetsByType[activityId] = overrideVal ?? roleVal ?? 0;
    });

    const monthlyBucketTargets = ensureBucketTargets({
      PC: (bucketOverride?.PC ?? bucketFromLobOverride?.PC ?? bucketRole?.PC ?? bucketFromLobRole?.PC ?? 0),
      FS: (bucketOverride?.FS ?? bucketFromLobOverride?.FS ?? bucketRole?.FS ?? bucketFromLobRole?.FS ?? 0),
      IPS: (bucketOverride?.IPS ?? bucketFromLobOverride?.IPS ?? bucketRole?.IPS ?? bucketFromLobRole?.IPS ?? 0),
    });

    if (!hasPremiumJson) {
      const legacyPremiumRaw = hasOverride ? override?.monthlyPremiumOverride : roleExp?.monthlyPremiumTarget;
      const legacyPremium = legacyPremiumRaw != null ? toNonNegativeNumber(legacyPremiumRaw) : null;
      if (legacyPremium != null) {
        monthlyBucketTargets.PC = legacyPremium;
        monthlyBucketTargets.FS = 0;
        monthlyBucketTargets.IPS = 0;
      }
    }

    const appsTargetsByLob: Record<string, number> = {};
    const activityTargetsByType: Record<string, number> = {};
    const premiumTargetsByBucket = { PC: 0, FS: 0, IPS: 0 };

    Object.keys(monthlyAppsByLob).forEach((lobId) => {
      appsTargetsByLob[lobId] = 0;
    });
    Object.keys(monthlyActivityTargetsByType).forEach((activityId) => {
      activityTargetsByType[activityId] = 0;
    });

    monthBounds.forEach((m) => {
      const monthTotalDays = daysInclusive(startOfMonth(m.start), endOfMonth(m.start));
      const fraction = (m.days || 0) / monthTotalDays;
      Object.entries(monthlyAppsByLob).forEach(([lobId, value]) => {
        appsTargetsByLob[lobId] = (appsTargetsByLob[lobId] || 0) + value * fraction;
      });
      premiumTargetsByBucket.PC += monthlyBucketTargets.PC * fraction;
      premiumTargetsByBucket.FS += monthlyBucketTargets.FS * fraction;
      premiumTargetsByBucket.IPS += monthlyBucketTargets.IPS * fraction;
      Object.entries(monthlyActivityTargetsByType).forEach(([activityId, value]) => {
        activityTargetsByType[activityId] = (activityTargetsByType[activityId] || 0) + value * fraction;
      });
    });

    const appsTarget = sumRecord(appsTargetsByLob);
    const premiumTarget = premiumTargetsByBucket.PC + premiumTargetsByBucket.FS + premiumTargetsByBucket.IPS;

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
      appsTargetsByLob,
      premiumTargetsByBucket,
      activityTargetsByType,
      appsDelta: actual.apps - appsTarget,
      premiumDelta: actual.premium - premiumTarget,
      pacePremium: expectedPremiumToDate > 0 ? actual.premium / expectedPremiumToDate : null,
      expectationSource: source,
    });
  });

  peopleRows.sort((a, b) => a.name.localeCompare(b.name));

  const bucketActuals: BucketActualRow[] = ["PC", "FS", "IPS"].map((bucket) => {
    const actual = bucketActual.get(bucket) || { apps: 0, premium: 0 };
    return { bucket, appsActual: actual.apps, premiumActual: actual.premium };
  });

  const lobActuals: LobActualRow[] = Array.from(lobActual.entries()).map(([lobId, row]) => ({
    lobId,
    name: lobNameById.get(lobId) || (lobId === "unknown" ? "Unknown" : lobId),
    category: row.category ?? null,
    appsActual: row.apps,
    premiumActual: row.premium,
  }));

  return {
    office,
    breakdown: { mode: breakdownMode, rows: breakdownRows },
    people: peopleRows,
    lobs: agencyLobs,
    lobActuals,
    bucketActuals,
    officePlanYear,
    officePlanAppsByLob,
    officePlanPremiumByBucket,
  };
}
