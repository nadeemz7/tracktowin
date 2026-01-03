import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { startOfDay, startOfWeek, startOfMonth, format } from "date-fns";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    start,
    end,
    granularity = "month",
    activityNames = [],
    personIds = [],
    dimension = "activity",
  } = body || {};

  const startDate = start ? new Date(start) : new Date("2000-01-01");
  const endDate = end ? new Date(end) : new Date();

  const rows = await prisma.activityRecord.findMany({
    where: {
      activityDate: { gte: startDate, lte: endDate },
      ...(activityNames.length ? { activityName: { in: activityNames } } : {}),
      ...(personIds.length ? { personId: { in: personIds } } : {}),
    },
    include: { person: true },
  });

  const bucket = (d: Date) => {
    if (granularity === "day") return format(startOfDay(d), "yyyy-MM-dd");
    if (granularity === "week") return format(startOfWeek(d), "yyyy-MM-dd");
    return format(startOfMonth(d), "yyyy-MM");
  };

  const seriesMap = new Map<string, Map<string, number>>();
  const totals = { count: 0 };

  const seriesKey = (r: typeof rows[number]) => {
    if (dimension === "person") return r.person?.fullName || r.personName || "Unassigned";
    return r.activityName || "Unknown";
  };

  for (const r of rows) {
    const timeKey = bucket(r.activityDate);
    const dimKey = seriesKey(r);
    if (!seriesMap.has(dimKey)) seriesMap.set(dimKey, new Map());
    const timeMap = seriesMap.get(dimKey)!;
    timeMap.set(timeKey, (timeMap.get(timeKey) || 0) + r.count);
    totals.count += r.count;
  }

  const labels = Array.from(new Set(Array.from(seriesMap.values()).flatMap((m) => Array.from(m.keys())))).sort();
  const series = Array.from(seriesMap.entries()).map(([name, timeMap]) => ({
    name,
    data: labels.map((l) => timeMap.get(l) || 0),
  }));

  return NextResponse.json({ labels, series, totals });
}
