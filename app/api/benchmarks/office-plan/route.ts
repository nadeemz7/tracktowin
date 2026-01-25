import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";
import {
  ValidationError,
  assertYear,
  assertNonNegativeInt,
  assertNonNegativeNumber,
} from "@/lib/benchmarks/validate";
import { hasBenchmarksWriteAccess } from "@/lib/benchmarks/guards";

const ROUTE_VERSION = "office-plan-route::vNEXT::2026-01-06";

function parseYear(param: string | null) {
  return assertYear(param, "year");
}

type AppGoalsByLob = { AUTO: number; FIRE: number; LIFE: number; HEALTH: number; IPS?: number };
type PremiumByBucket = { PC: number; FS: number; IPS?: number };
type PremiumFsBreakdown = { LIFE?: number; HEALTH?: number };

function parseAppGoalsByLob(input: any): AppGoalsByLob {
  if (!input || typeof input !== "object") {
    throw new ValidationError("appGoalsByLob must be an object", "appGoalsByLob");
  }
  const goals: AppGoalsByLob = {
    AUTO: assertNonNegativeInt(input.AUTO, "appGoalsByLob.AUTO"),
    FIRE: assertNonNegativeInt(input.FIRE, "appGoalsByLob.FIRE"),
    LIFE: assertNonNegativeInt(input.LIFE, "appGoalsByLob.LIFE"),
    HEALTH: assertNonNegativeInt(input.HEALTH, "appGoalsByLob.HEALTH"),
  };
  if (input.IPS !== undefined && input.IPS !== null && input.IPS !== "") {
    goals.IPS = assertNonNegativeInt(input.IPS, "appGoalsByLob.IPS");
  }
  return goals;
}

function parsePremiumByBucket(input: any): PremiumByBucket {
  if (!input || typeof input !== "object") {
    throw new ValidationError("premiumByBucket must be an object", "premiumByBucket");
  }
  const bucket: PremiumByBucket = {
    PC: assertNonNegativeNumber(input.PC, "premiumByBucket.PC"),
    FS: assertNonNegativeNumber(input.FS, "premiumByBucket.FS"),
  };
  if (input.IPS !== undefined && input.IPS !== null && input.IPS !== "") {
    bucket.IPS = assertNonNegativeNumber(input.IPS, "premiumByBucket.IPS");
  }
  return bucket;
}

function parsePremiumFsBreakdown(input: any): PremiumFsBreakdown | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== "object") {
    throw new ValidationError("premiumFsBreakdown must be an object", "premiumFsBreakdown");
  }
  const breakdown: PremiumFsBreakdown = {};
  if (input.LIFE !== undefined && input.LIFE !== null && input.LIFE !== "") {
    breakdown.LIFE = assertNonNegativeNumber(input.LIFE, "premiumFsBreakdown.LIFE");
  }
  if (input.HEALTH !== undefined && input.HEALTH !== null && input.HEALTH !== "") {
    breakdown.HEALTH = assertNonNegativeNumber(input.HEALTH, "premiumFsBreakdown.HEALTH");
  }
  return Object.keys(breakdown).length ? breakdown : null;
}

function safeNumber(value: any) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function normalizeLegacyBucket(input: any): PremiumByBucket | null {
  if (!input || typeof input !== "object") return null;
  const pc = safeNumber(input.PC);
  const fs = safeNumber(input.FS);
  if (pc == null || fs == null) return null;
  const bucket: PremiumByBucket = { PC: pc, FS: fs };
  const ips = safeNumber(input.IPS);
  if (ips != null) bucket.IPS = ips;
  return bucket;
}

function normalizeLegacyAppsTotal(value: any): AppGoalsByLob {
  const total = safeNumber(value) ?? 0;
  return { AUTO: Math.round(total), FIRE: 0, LIFE: 0, HEALTH: 0 };
}

function normalizeLegacyPremiumTotal(value: any): PremiumByBucket {
  const total = safeNumber(value) ?? 0;
  return { PC: total, FS: 0 };
}

function sumAppGoals(goals: AppGoalsByLob) {
  return goals.AUTO + goals.FIRE + goals.LIFE + goals.HEALTH + (goals.IPS ?? 0);
}

function sumPremium(bucket: PremiumByBucket) {
  return bucket.PC + bucket.FS + (bucket.IPS ?? 0);
}

async function deriveAnyOrgId(): Promise<{ orgId: string | null; source: string | null }> {
  const a = await prisma.agency.findFirst({ orderBy: { createdAt: "asc" }, select: { orgId: true } });
  if (a?.orgId) return { orgId: a.orgId, source: "agency" };

  const lob = await prisma.lineOfBusiness.findFirst({
    orderBy: { createdAt: "asc" },
    select: { agency: { select: { orgId: true } } },
  });
  if (lob?.agency?.orgId) return { orgId: lob.agency.orgId, source: "lob" };

  const team = await prisma.team.findFirst({
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });
  if (team?.orgId) return { orgId: team.orgId, source: "team" };

  const plan = await prisma.benchOfficePlan.findFirst({
    orderBy: { createdAt: "asc" },
    select: { agency: { select: { orgId: true } } },
  });
  if (plan?.agency?.orgId) return { orgId: plan.agency.orgId, source: "officePlan" };

  return { orgId: null, source: null };
}

async function getDevFallbackViewer() {
  const person =
    (await prisma.person.findFirst({
      where: { isAdmin: true },
      orderBy: { createdAt: "asc" },
      include: { primaryAgency: true, role: true, team: true },
    })) ||
    (await prisma.person.findFirst({
      where: { isManager: true },
      orderBy: { createdAt: "asc" },
      include: { primaryAgency: true, role: true, team: true },
    })) ||
    (await prisma.person.findFirst({
      orderBy: { createdAt: "asc" },
      include: { primaryAgency: true, role: true, team: true },
    }));

  let orgId: string | null = person?.orgId || person?.primaryAgency?.orgId || null;

  let source: string | null = orgId ? "person" : null;

  if (!orgId) {
    const derived = await deriveAnyOrgId();
    orgId = derived.orgId;
    source = derived.source;
  }

  if (!orgId) return null;

  return {
    personId: person?.id ?? "__dev__",
    orgId,
    isAdmin: true,
    isOwner: false,
    isManager: Boolean(person?.isManager),
    impersonating: false,
    __devFallback: true,
    __devFallbackOrgSource: source,
    __devFallbackFoundPerson: Boolean(person),
  };
}

async function resolveViewer(req: Request) {
  let viewer: any = await getOrgViewer(req);
  const isDev = process.env.NODE_ENV !== "production";

  // In dev, if either personId or orgId missing, try fallback
  if (isDev && (!viewer?.personId || !viewer?.orgId)) {
    const fallback = await getDevFallbackViewer();
    if (fallback) viewer = fallback;
  }

  return { viewer, isDev };
}

export async function GET(req: Request) {
  try {
    const { viewer, isDev } = await resolveViewer(req);

    // In dev, allow the page to render even if auth is missing by returning plan:null
    if (!viewer?.orgId || !viewer?.personId) {
      if (isDev) {
        return NextResponse.json({
          routeVersion: ROUTE_VERSION,
          plan: null,
          debug: {
            NODE_ENV: process.env.NODE_ENV,
            viewer,
            triedDevFallback: true,
            devFallbackFailed: !viewer?.orgId,
          },
        });
      }
      return NextResponse.json({ error: "Unauthorized", routeVersion: ROUTE_VERSION }, { status: 401 });
    }

    const url = new URL(req.url);
    const year = parseYear(url.searchParams.get("year"));

    const plan = (await prisma.benchOfficePlan.findUnique({
      where: { agencyId_year: { agencyId: viewer.orgId, year } },
    })) as any;

    if (!plan) {
      return NextResponse.json({ routeVersion: ROUTE_VERSION, plan: null });
    }

    let appGoalsByLob = normalizeLegacyAppsTotal(plan.appsAnnualTarget);
    let premiumByBucket =
      normalizeLegacyBucket(plan.premiumByBucket) || normalizeLegacyPremiumTotal(plan.premiumAnnualTarget);
    let premiumFsBreakdown: PremiumFsBreakdown | null = null;

    try {
      if (plan.appGoalsByLobJson) appGoalsByLob = parseAppGoalsByLob(plan.appGoalsByLobJson);
    } catch {}

    try {
      if (plan.premiumByBucketJson) premiumByBucket = parsePremiumByBucket(plan.premiumByBucketJson);
    } catch {}

    try {
      if (plan.premiumFsBreakdownJson) premiumFsBreakdown = parsePremiumFsBreakdown(plan.premiumFsBreakdownJson);
    } catch {
      premiumFsBreakdown = null;
    }

    return NextResponse.json({
      routeVersion: ROUTE_VERSION,
      plan: { year: plan.year, appGoalsByLob, premiumByBucket, premiumFsBreakdown },
    });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field, routeVersion: ROUTE_VERSION }, { status: 400 });
    }
    console.error("[office-plan][GET] error", err);
    return NextResponse.json(
      { error: err?.message || "Failed to fetch office plan", routeVersion: ROUTE_VERSION },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { viewer, isDev } = await resolveViewer(req);
    const canWrite = hasBenchmarksWriteAccess(viewer);

    if (!viewer?.orgId || !(viewer?.personId || viewer?.userId)) {
      if (isDev) console.log("[office-plan][POST][viewer]", viewer);
      return NextResponse.json({ error: "Unauthorized", routeVersion: ROUTE_VERSION }, { status: 401 });
    }

    const isOrgAdmin = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
    if (!isOrgAdmin) {
      return NextResponse.json({ error: "Forbidden", routeVersion: ROUTE_VERSION }, { status: 403 });
    }

    if (!canWrite) {
      return NextResponse.json({ error: "Forbidden", routeVersion: ROUTE_VERSION }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as any;

    const year = assertYear(body.year, "year");
    const appGoalsByLob = parseAppGoalsByLob(body.appGoalsByLob);
    const premiumByBucket = parsePremiumByBucket(body.premiumByBucket);
    const premiumFsBreakdown = parsePremiumFsBreakdown(body.premiumFsBreakdown);
    const appsAnnualTarget = sumAppGoals(appGoalsByLob);
    const premiumAnnualTarget = sumPremium(premiumByBucket);

    const plan = (await prisma.benchOfficePlan.upsert({
      where: { agencyId_year: { agencyId: viewer.orgId, year } },
      create: {
        agencyId: viewer.orgId,
        year,
        appsAnnualTarget,
        premiumAnnualTarget,
        premiumMode: "BUCKET",
        premiumByLob: null,
        premiumByBucket,
        appGoalsByLobJson: appGoalsByLob,
        premiumByBucketJson: premiumByBucket,
        premiumFsBreakdownJson: premiumFsBreakdown,
      },
      update: {
        appsAnnualTarget,
        premiumAnnualTarget,
        premiumMode: "BUCKET",
        premiumByLob: null,
        premiumByBucket,
        appGoalsByLobJson: appGoalsByLob,
        premiumByBucketJson: premiumByBucket,
        premiumFsBreakdownJson: premiumFsBreakdown,
      },
    })) as any;

    return NextResponse.json({
      routeVersion: ROUTE_VERSION,
      plan: { year: plan.year, appGoalsByLob, premiumByBucket, premiumFsBreakdown },
    });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field, routeVersion: ROUTE_VERSION }, { status: 400 });
    }
    console.error("[office-plan][POST] error", err);
    return NextResponse.json(
      { error: err?.message || "Failed to save office plan", routeVersion: ROUTE_VERSION },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { viewer, isDev } = await resolveViewer(req);
    const canWrite = hasBenchmarksWriteAccess(viewer);

    if (!viewer?.orgId || !(viewer?.personId || viewer?.userId)) {
      return NextResponse.json({ error: "Unauthorized", routeVersion: ROUTE_VERSION }, { status: 401 });
    }

    const isOrgAdmin = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
    if (!isOrgAdmin) {
      return NextResponse.json({ error: "Forbidden", routeVersion: ROUTE_VERSION }, { status: 403 });
    }

    if (!canWrite) {
      return NextResponse.json({ error: "Forbidden", routeVersion: ROUTE_VERSION }, { status: 403 });
    }

    const url = new URL(req.url);
    const year = parseYear(url.searchParams.get("year"));

    await prisma.benchOfficePlan
      .delete({
        where: { agencyId_year: { agencyId: viewer.orgId, year } },
      })
      .catch(() => null);

    return NextResponse.json({ ok: true, routeVersion: ROUTE_VERSION });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field, routeVersion: ROUTE_VERSION }, { status: 400 });
    }
    console.error("[office-plan][DELETE] error", err);
    return NextResponse.json(
      { error: err?.message || "Failed to clear office plan", routeVersion: ROUTE_VERSION },
      { status: 500 }
    );
  }
}
