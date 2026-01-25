import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import {
  ValidationError,
  assertNonNegativeInt,
  assertNonNegativeNumber,
} from "@/lib/benchmarks/validate";
import { hasBenchmarksWriteAccess } from "@/lib/benchmarks/guards";

export async function GET(req: Request) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const overrides = await prisma.benchPersonOverride.findMany({
      where: {
        person: { primaryAgencyId: viewer.orgId },
      },
    });

    return NextResponse.json({ overrides });
  } catch (err: any) {
    console.error("[benchmarks/person-overrides][GET] error", err);
    return NextResponse.json({ error: "Failed to fetch person overrides" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId || !(viewer?.personId || viewer?.userId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isOrgAdmin = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
    if (!isOrgAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!hasBenchmarksWriteAccess(viewer)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId) {
      throw new ValidationError("personId is required", "personId");
    }

    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: { team: true },
    });

    if (!person || person.primaryAgencyId !== viewer.orgId) {
      return NextResponse.json({ error: "Person not found in org" }, { status: 404 });
    }

    const normalizeRecord = (raw: any, field: string) => {
      if (raw === undefined || raw === null) return null;
      if (typeof raw !== "object" || Array.isArray(raw)) {
        throw new ValidationError(`${field} must be an object`, field);
      }
      const out: Record<string, number> = {};
      Object.entries(raw).forEach(([key, value]) => {
        const id = String(key || "").trim();
        if (!id) return;
        out[id] = assertNonNegativeInt(value, `${field}.${id}`);
      });
      return Object.keys(out).length ? out : null;
    };

    const appGoalsByLobOverrideJson = normalizeRecord(body.appGoalsByLobOverrideJson, "appGoalsByLobOverrideJson");
    const activityTargetsByTypeOverrideJson = normalizeRecord(
      body.activityTargetsByTypeOverrideJson,
      "activityTargetsByTypeOverrideJson"
    );

    let premiumByBucketOverride: { PC: number; FS: number; IPS?: number } | null = null;
    if (body.premiumByBucketOverride !== undefined && body.premiumByBucketOverride !== null) {
      if (typeof body.premiumByBucketOverride !== "object" || Array.isArray(body.premiumByBucketOverride)) {
        throw new ValidationError("premiumByBucketOverride must be an object", "premiumByBucketOverride");
      }
      const pc = assertNonNegativeNumber(body.premiumByBucketOverride.PC, "premiumByBucketOverride.PC");
      const fs = assertNonNegativeNumber(body.premiumByBucketOverride.FS, "premiumByBucketOverride.FS");
      const ips =
        body.premiumByBucketOverride.IPS !== undefined &&
        body.premiumByBucketOverride.IPS !== null &&
        body.premiumByBucketOverride.IPS !== ""
          ? assertNonNegativeNumber(body.premiumByBucketOverride.IPS, "premiumByBucketOverride.IPS")
          : undefined;
      premiumByBucketOverride = ips === undefined ? { PC: pc, FS: fs } : { PC: pc, FS: fs, IPS: ips };
    }

    const override = await prisma.benchPersonOverride.upsert({
      where: { personId },
      create: {
        personId,
        monthlyAppsOverride: null,
        monthlyPremiumOverride: null,
        premiumModeOverride: null,
        premiumByLobOverride: null,
        premiumByBucketOverride,
        appGoalsByLobOverrideJson,
        activityTargetsByTypeOverrideJson,
      },
      update: {
        monthlyAppsOverride: null,
        monthlyPremiumOverride: null,
        premiumModeOverride: null,
        premiumByLobOverride: null,
        premiumByBucketOverride,
        appGoalsByLobOverrideJson,
        activityTargetsByTypeOverrideJson,
      },
    });

    return NextResponse.json({ override });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error("[benchmarks/person-overrides][POST] error", err);
    return NextResponse.json({ error: "Failed to save person override" }, { status: 500 });
  }
}
