import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const orgId = req.headers.get("x-org-id")?.trim() || undefined;
  const defaults = [
    { name: "Outbound", category: "SALES" },
    { name: "Quotes", category: "SALES" },
    { name: "Referrals", category: "SALES" },
    { name: "Reviews", category: "CS" },
    { name: "Inbounds", category: "SALES" },
    { name: "Appointments Set", category: "SALES" },
  ];

  const existing = await prisma.activityType.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      OR: [{ isActive: true }, { active: true }],
    },
    select: { id: true, name: true, category: true, isActive: true, active: true },
  });

  const existingLower = new Set(existing.map((t) => (t.name || "").trim().toLowerCase()));
  const missing = defaults.filter((d) => !existingLower.has(d.name.trim().toLowerCase()));
  if (missing.length) {
    await prisma.activityType.createMany({
      data: missing.map((m) => ({ name: m.name, category: m.category, orgId, isActive: true, active: true })),
      skipDuplicates: true,
    });
  }

  const types = await prisma.activityType.findMany({
    where: {
      ...(orgId ? { orgId } : {}),
      OR: [{ isActive: true }, { active: true }],
    },
    select: { id: true, name: true, category: true, isActive: true, active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(types.map((t) => ({ id: t.id, name: t.name, category: t.category, isActive: t.isActive ?? t.active })));
}

export async function POST(req: Request) {
  const orgId = req.headers.get("x-org-id")?.trim() || undefined;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : undefined;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const created = await prisma.activityType.create({
    data: { name, category, orgId, isActive: true, active: true },
    select: { id: true, name: true, category: true, isActive: true, active: true },
  });

  return NextResponse.json(
    { id: created.id, name: created.name, category: created.category, isActive: created.isActive ?? created.active },
    { status: 201 }
  );
}
