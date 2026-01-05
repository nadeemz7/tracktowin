import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { endOfMonth, startOfMonth } from "date-fns";

type LeaderboardResponse = {
  month: string;
  activityTypes: Array<{ id: string; name: string }>;
  people: Array<{
    personId: string;
    personName: string;
    countsByTypeId: Record<string, number>;
    targetsByTypeId: Record<string, number>;
  }>;
};

export async function POST(req: Request) {
  const orgId = req.headers.get("x-org-id")?.trim() || undefined;
  const body = await req.json().catch(() => ({}));
  const month = typeof body.month === "string" ? body.month : "";
  const activityTypeIds = Array.isArray(body.activityTypeIds) ? body.activityTypeIds.filter((v: unknown) => typeof v === "string") : [];
  const personIds = Array.isArray(body.personIds) ? body.personIds.filter((v: unknown) => typeof v === "string") : [];

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month is required in YYYY-MM" }, { status: 400 });
  }
  if (!activityTypeIds.length) {
    return NextResponse.json({ error: "activityTypeIds are required" }, { status: 400 });
  }

  const monthStart = startOfMonth(new Date(`${month}-01T00:00:00`));
  const monthEnd = endOfMonth(monthStart);

  const activityTypes = await prisma.activityType.findMany({
    where: {
      id: { in: activityTypeIds },
      ...(orgId ? { orgId } : {}),
    },
    select: { id: true, name: true, orgId: true },
  });
  if (!activityTypes.length) return NextResponse.json({ error: "No activity types found" }, { status: 404 });
  if (orgId && activityTypes.some((t) => t.orgId && t.orgId !== orgId)) return NextResponse.json({ error: "Activity type not found" }, { status: 404 });

  const events = await prisma.activityEvent.findMany({
    where: {
      activityTypeId: { in: activityTypes.map((t) => t.id) },
      occurredAt: { gte: monthStart, lte: monthEnd },
      ...(personIds.length ? { personId: { in: personIds } } : {}),
    },
  });

  const targets = await prisma.activityTarget.findMany({
    where: {
      activityTypeId: { in: activityTypes.map((t) => t.id) },
      ...(personIds.length ? { personId: { in: personIds } } : {}),
    },
  });

  const people = await prisma.person.findMany({
    where: personIds.length ? { id: { in: personIds } } : {},
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });

  // build maps
  const countsMap = new Map<string, Record<string, number>>();
  events.forEach((e) => {
    const personId = e.personId;
    if (!personId) return;
    if (!countsMap.has(personId)) countsMap.set(personId, {});
    const entry = countsMap.get(personId)!;
    entry[e.activityTypeId] = (entry[e.activityTypeId] || 0) + 1;
  });

  const targetsMap = new Map<string, Record<string, number>>();
  targets.forEach((t) => {
    if (!targetsMap.has(t.personId)) targetsMap.set(t.personId, {});
    const entry = targetsMap.get(t.personId)!;
    entry[t.activityTypeId] = t.monthlyMinimum ?? 0;
  });

  const peopleList =
    people.length > 0
      ? people
      : personIds.length
        ? personIds.map((id) => ({ id, fullName: id }))
        : [];

  const peopleRows = peopleList.map((p) => {
    const countsByTypeId = activityTypes.reduce<Record<string, number>>((acc, t) => {
      acc[t.id] = countsMap.get(p.id)?.[t.id] ?? 0;
      return acc;
    }, {});
    const targetsByTypeId = activityTypes.reduce<Record<string, number>>((acc, t) => {
      acc[t.id] = targetsMap.get(p.id)?.[t.id] ?? 0;
      return acc;
    }, {});
    return {
      personId: p.id,
      personName: p.fullName || p.id,
      countsByTypeId,
      targetsByTypeId,
    };
  });

  const response: LeaderboardResponse = {
    month,
    activityTypes: activityTypes.map((t) => ({ id: t.id, name: t.name })),
    people: peopleRows,
  };

  return NextResponse.json(response);
}
