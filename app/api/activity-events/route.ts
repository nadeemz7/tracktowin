import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const orgId = req.headers.get("x-org-id")?.trim() || undefined;
  const body = await req.json().catch(() => ({}));
  const activityTypeId = typeof body.activityTypeId === "string" ? body.activityTypeId : "";
  const personId = typeof body.personId === "string" ? body.personId : "";
  const occurredAtInput = typeof body.occurredAt === "string" ? body.occurredAt : null;

  if (!activityTypeId || !personId) {
    return NextResponse.json({ error: "activityTypeId and personId are required" }, { status: 400 });
  }

  const activityType = await prisma.activityType.findFirst({
    where: { id: activityTypeId, ...(orgId ? { orgId } : {}) },
    select: { id: true, orgId: true },
  });
  if (!activityType) return NextResponse.json({ error: "Activity type not found" }, { status: 404 });
  if (orgId && activityType.orgId && activityType.orgId !== orgId) return NextResponse.json({ error: "Activity type not found" }, { status: 404 });

  const occurredAt = occurredAtInput ? new Date(occurredAtInput) : new Date();

  const created = await prisma.activityEvent.create({
    data: {
      activityTypeId,
      personId,
      occurredAt,
    },
    select: { id: true, activityTypeId: true, personId: true, occurredAt: true },
  });

  return NextResponse.json(created, { status: 201 });
}
