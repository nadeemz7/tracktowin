import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const orgId = req.headers.get("x-org-id")?.trim() || undefined;
  const url = new URL(req.url);
  const activityTypeId = url.searchParams.get("activityTypeId") || "";
  if (!activityTypeId) return NextResponse.json({ error: "activityTypeId is required" }, { status: 400 });

  const activityType = await prisma.activityType.findFirst({
    where: { id: activityTypeId, ...(orgId ? { orgId } : {}) },
    select: { id: true, orgId: true },
  });
  if (!activityType) return NextResponse.json({ error: "Activity type not found" }, { status: 404 });
  if (orgId && activityType.orgId && activityType.orgId !== orgId) return NextResponse.json({ error: "Activity type not found" }, { status: 404 });

  const targets = await prisma.activityTarget.findMany({
    where: { activityTypeId },
    select: { personId: true, monthlyMinimum: true },
    orderBy: { personId: "asc" },
  });

  return NextResponse.json(targets);
}

export async function POST(req: Request) {
  const orgId = req.headers.get("x-org-id")?.trim() || undefined;
  const body = await req.json().catch(() => ({}));
  const activityTypeId = typeof body.activityTypeId === "string" ? body.activityTypeId : "";
  const personId = typeof body.personId === "string" ? body.personId : "";
  const monthlyMinimumRaw = Number(body.monthlyMinimum);
  const monthlyMinimum = Number.isFinite(monthlyMinimumRaw) ? Math.max(0, Math.floor(monthlyMinimumRaw)) : 0;

  if (!activityTypeId) return NextResponse.json({ error: "activityTypeId is required" }, { status: 400 });
  if (!personId) return NextResponse.json({ error: "personId is required" }, { status: 400 });

  const activityType = await prisma.activityType.findFirst({
    where: { id: activityTypeId, ...(orgId ? { orgId } : {}) },
    select: { id: true, orgId: true },
  });
  if (!activityType) return NextResponse.json({ error: "Activity type not found" }, { status: 404 });
  if (orgId && activityType.orgId && activityType.orgId !== orgId) return NextResponse.json({ error: "Activity type not found" }, { status: 404 });

  const target = await prisma.activityTarget.upsert({
    where: { activityTypeId_personId: { activityTypeId, personId } },
    create: { activityTypeId, personId, monthlyMinimum },
    update: { monthlyMinimum },
    select: { activityTypeId: true, personId: true, monthlyMinimum: true },
  });

  return NextResponse.json(target, { status: 201 });
}
