import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { addMonths, format, startOfMonth } from "date-fns";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { activityTypeId, personIds = [], start, end, granularity = "month" } = body || {};

  if (granularity !== "month") {
    return NextResponse.json({ error: "Only monthly granularity is supported" }, { status: 400 });
  }

  // orgId lookup placeholder (aligns with existing patterns that may pass an org header)
  const orgId = req.headers.get("x-org-id")?.trim() || undefined;

  const startDate = start ? new Date(start) : startOfMonth(addMonths(new Date(), -11));
  const endDate = end ? new Date(end) : new Date();

  if (!activityTypeId) {
    // Legacy fallback: aggregate ActivityRecord counts monthly into a single series
    const records = await prisma.activityRecord.findMany({
      where: {
        activityDate: { gte: startOfMonth(startDate), lte: endDate },
        ...(Array.isArray(personIds) && personIds.length ? { personId: { in: personIds } } : {}),
      },
    });
    const totals = Array(labels.length).fill(0);
    records.forEach((r) => {
      const key = format(startOfMonth(r.activityDate), "yyyy-MM");
      const idx = labels.indexOf(key);
      if (idx !== -1) totals[idx] = (totals[idx] || 0) + (r.count || 0);
    });
    return NextResponse.json({ labels, series: totals });
  }

  const activityType = await prisma.activityType.findFirst({
    where: {
      id: activityTypeId,
      ...(orgId ? { orgId } : {}),
      OR: [{ isActive: true }, { active: true }],
    },
  });
  if (activityType && orgId && activityType.orgId && activityType.orgId !== orgId) {
    return NextResponse.json({ error: "Activity type not found" }, { status: 404 });
  }
  if (!activityType) return NextResponse.json({ error: "Activity type not found" }, { status: 404 });

  const labels: string[] = [];
  let cursor = startOfMonth(startDate);
  const endMonth = startOfMonth(endDate);
  while (cursor <= endMonth) {
    labels.push(format(cursor, "yyyy-MM"));
    cursor = addMonths(cursor, 1);
  }

  const peopleFilter = Array.isArray(personIds) ? personIds.filter(Boolean) : [];

  const events = await prisma.activityEvent.findMany({
    where: {
      activityTypeId: activityType.id,
      occurredAt: { gte: startOfMonth(startDate), lte: endDate },
      ...(peopleFilter.length ? { personId: { in: peopleFilter } } : {}),
    },
    include: { person: true },
  });

  const personIdsSet = new Set<string>(peopleFilter);
  events.forEach((e) => personIdsSet.add(e.personId));

  const people =
    personIdsSet.size > 0
      ? await prisma.person.findMany({
          where: { id: { in: Array.from(personIdsSet) } },
          select: { id: true, fullName: true },
        })
      : [];
  const personNameMap = new Map<string, string>();
  people.forEach((p) => personNameMap.set(p.id, p.fullName));

  const seriesMap = new Map<string, number[]>();
  personIdsSet.forEach((pid) => seriesMap.set(pid, Array(labels.length).fill(0)));
  events.forEach((event) => {
    const key = format(startOfMonth(event.occurredAt), "yyyy-MM");
    const idx = labels.indexOf(key);
    if (idx === -1) return;
    const arr = seriesMap.get(event.personId) || Array(labels.length).fill(0);
    arr[idx] = (arr[idx] || 0) + 1;
    seriesMap.set(event.personId, arr);
  });

  const targets = await prisma.activityTarget.findMany({
    where: {
      activityTypeId: activityType.id,
      ...(personIdsSet.size ? { personId: { in: Array.from(personIdsSet) } } : {}),
    },
  });
  const targetsMap = targets.reduce<Record<string, number>>((acc, t) => {
    acc[t.personId] = t.monthlyMinimum ?? 0;
    return acc;
  }, {});

  const series = Array.from(seriesMap.entries()).map(([personId, data]) => ({
    personId,
    personName: personNameMap.get(personId) || personId,
    data,
  }));

  return NextResponse.json({
    labels,
    series,
    targets: targetsMap,
    activityType: { id: activityType.id, name: activityType.name },
  });
}
