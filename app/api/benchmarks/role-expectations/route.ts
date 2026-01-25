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

    const expectations = await prisma.benchRoleExpectation.findMany({
      where: { role: { team: { orgId: viewer.orgId } } },
    });

    return NextResponse.json({ expectations });
  } catch (err: any) {
    console.error("[benchmarks/role-expectations][GET] error", err);
    return NextResponse.json({ error: "Failed to fetch role expectations" }, { status: 500 });
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
    const roleId = typeof body.roleId === "string" ? body.roleId.trim() : "";
    if (!roleId) {
      throw new ValidationError("roleId is required", "roleId");
    }

    const role = await prisma.role.findUnique({ where: { id: roleId }, include: { team: true } });
    if (!role || role.team?.orgId !== viewer.orgId) {
      return NextResponse.json({ error: "Role not found in org" }, { status: 404 });
    }

    const normalizeRecord = (raw: any, field: string, parser: (value: any, label: string) => number) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const out: Record<string, number> = {};
      Object.entries(raw).forEach(([key, value]) => {
        const id = String(key || "").trim();
        if (!id) return;
        out[id] = parser(value, `${field}.${id}`);
      });
      return out;
    };

    const appGoalsByLobRaw = body.appGoalsByLobJson;
    const activityTargetsByTypeRaw = body.activityTargetsByTypeJson;
    const appGoalsByLobParsed = normalizeRecord(appGoalsByLobRaw, "appGoalsByLobJson", assertNonNegativeInt);
    const activityTargetsByTypeParsed = normalizeRecord(
      activityTargetsByTypeRaw,
      "activityTargetsByTypeJson",
      assertNonNegativeInt
    );

    const premiumByBucketObj =
      body.premiumByBucket && typeof body.premiumByBucket === "object" ? body.premiumByBucket : null;
    if (!premiumByBucketObj) {
      throw new ValidationError("premiumByBucket must be an object with PC and FS numbers", "premiumByBucket");
    }
    const pc = assertNonNegativeNumber(premiumByBucketObj.PC, "premiumByBucket.PC");
    const fs = assertNonNegativeNumber(premiumByBucketObj.FS, "premiumByBucket.FS");
    const ips =
      premiumByBucketObj.IPS !== undefined && premiumByBucketObj.IPS !== null && premiumByBucketObj.IPS !== ""
        ? assertNonNegativeNumber(premiumByBucketObj.IPS, "premiumByBucket.IPS")
        : undefined;
    const premiumByBucket = ips === undefined ? { PC: pc, FS: fs } : { PC: pc, FS: fs, IPS: ips };
    const premiumMode = "BUCKET" as const;
    const premiumByLob = null;

    const monthlyAppsTarget = Object.values(appGoalsByLobParsed).reduce((sum, val) => sum + val, 0);
    const monthlyPremiumTarget = pc + fs + (ips ?? 0);
    const appGoalsByLobJson = Object.keys(appGoalsByLobParsed).length ? appGoalsByLobParsed : null;
    const activityTargetsByTypeJson = Object.keys(activityTargetsByTypeParsed).length
      ? activityTargetsByTypeParsed
      : null;

    const expectation = await prisma.benchRoleExpectation.upsert({
      where: { roleId },
      create: {
        roleId,
        monthlyAppsTarget,
        monthlyPremiumTarget,
        premiumMode,
        premiumByLob,
        premiumByBucket,
        appGoalsByLobJson,
        activityTargetsByTypeJson,
      },
      update: {
        monthlyAppsTarget,
        monthlyPremiumTarget,
        premiumMode,
        premiumByLob,
        premiumByBucket,
        appGoalsByLobJson,
        activityTargetsByTypeJson,
      },
    });

    return NextResponse.json({ expectation });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error("[benchmarks/role-expectations][POST] error", err);
    return NextResponse.json({ error: "Failed to save role expectation" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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
    const roleId = typeof body.roleId === "string" ? body.roleId.trim() : "";
    if (!roleId) return NextResponse.json({ error: "roleId is required" }, { status: 400 });

    const role = await prisma.role.findUnique({ where: { id: roleId }, include: { team: true } });
    if (!role || role.team?.orgId !== viewer.orgId) {
      return NextResponse.json({ error: "Role not found in org" }, { status: 404 });
    }

    await prisma.benchRoleExpectation.delete({ where: { roleId } }).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[benchmarks/role-expectations][DELETE] error", err);
    return NextResponse.json({ error: "Failed to clear role expectation" }, { status: 500 });
  }
}
