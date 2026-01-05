import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import { canAccessRoiSetup } from "@/lib/permissions";

function parseDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  const ctx = await getViewerContext(req);
  if (!ctx || !ctx.orgId) {
    return NextResponse.json([]);
  }
  const orgId = ctx.orgId;
  const plans = await prisma.roiCompPlan.findMany({
    where: { orgId },
    orderBy: [{ personId: "asc" }, { effectiveStart: "asc" }],
  });
  return NextResponse.json(Array.isArray(plans) ? plans : []);
}

export async function POST(req: Request) {
  const ctx = await getViewerContext(req);
  if (!ctx || !canAccessRoiSetup(ctx)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = ctx.orgId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const personId = typeof body.personId === "string" ? body.personId : "";
  const monthlySalary = Number(body.monthlySalary);
  const effectiveStart = parseDate(body.effectiveStart);
  const effectiveEnd = parseDate(body.effectiveEnd);

  if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });
  if (!Number.isFinite(monthlySalary) || monthlySalary < 0) return NextResponse.json({ error: "invalid salary" }, { status: 400 });
  if (!effectiveStart) return NextResponse.json({ error: "invalid effectiveStart" }, { status: 400 });
  if (effectiveEnd && effectiveEnd < effectiveStart) return NextResponse.json({ error: "effectiveEnd before start" }, { status: 400 });

  const person = await prisma.person.findFirst({ where: { id: personId, ...(orgId ? { primaryAgencyId: orgId } : {}) } });
  if (!person) return NextResponse.json({ error: "person not found in org" }, { status: 404 });

  const overlapping = await prisma.roiCompPlan.findFirst({
    where: {
      orgId,
      personId,
      NOT: {
        OR: [
          { effectiveEnd: { lt: effectiveStart } },
          { effectiveStart: { gt: effectiveEnd || new Date("9999-12-31") } },
        ],
      },
    },
  });
  if (overlapping && overlapping.effectiveStart.getTime() !== effectiveStart.getTime()) {
    return NextResponse.json({ error: "overlapping effective period" }, { status: 400 });
  }

  await prisma.roiCompPlan.upsert({
    where: { orgId_personId_effectiveStart: { orgId, personId, effectiveStart } },
    create: { orgId, personId, monthlySalary, effectiveStart, effectiveEnd: effectiveEnd || null },
    update: { monthlySalary, effectiveEnd: effectiveEnd || null },
  });

  const plans = await prisma.roiCompPlan.findMany({
    where: { orgId },
    orderBy: [{ personId: "asc" }, { effectiveStart: "asc" }],
  });
  return NextResponse.json(plans);
}
