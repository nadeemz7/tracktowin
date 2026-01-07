import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import {
  ValidationError,
  assertNonNegativeInt,
  assertNonNegativeNumber,
  normalizePremiumTargets,
} from "@/lib/benchmarks/validate";
import { hasBenchmarksWriteAccess } from "@/lib/benchmarks/guards";

export async function GET(req: Request) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expectations = await prisma.benchRoleExpectation.findMany({
      where: { role: { team: { agencyId: viewer.orgId } } },
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
    if (!viewer?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    if (!role || role.team?.agencyId !== viewer.orgId) {
      return NextResponse.json({ error: "Role not found in org" }, { status: 404 });
    }

    const monthlyAppsTarget = assertNonNegativeInt(body.monthlyAppsTarget, "monthlyAppsTarget");
    const monthlyPremiumTarget = assertNonNegativeNumber(body.monthlyPremiumTarget, "monthlyPremiumTarget");

    const { premiumMode, premiumByLob, premiumByBucket } = normalizePremiumTargets(
      body.premiumMode,
      body.premiumByLob,
      body.premiumByBucket
    );

    const expectation = await prisma.benchRoleExpectation.upsert({
      where: { roleId },
      create: {
        roleId,
        monthlyAppsTarget,
        monthlyPremiumTarget,
        premiumMode,
        premiumByLob,
        premiumByBucket,
      },
      update: {
        monthlyAppsTarget,
        monthlyPremiumTarget,
        premiumMode,
        premiumByLob,
        premiumByBucket,
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
    if (!viewer?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasBenchmarksWriteAccess(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as any;
    const roleId = typeof body.roleId === "string" ? body.roleId.trim() : "";
    if (!roleId) return NextResponse.json({ error: "roleId is required" }, { status: 400 });

    const role = await prisma.role.findUnique({ where: { id: roleId }, include: { team: true } });
    if (!role || role.team?.agencyId !== viewer.orgId) {
      return NextResponse.json({ error: "Role not found in org" }, { status: 404 });
    }

    await prisma.benchRoleExpectation.delete({ where: { roleId } }).catch(() => null);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[benchmarks/role-expectations][DELETE] error", err);
    return NextResponse.json({ error: "Failed to clear role expectation" }, { status: 500 });
  }
}
