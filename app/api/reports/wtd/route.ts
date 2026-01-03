import { prisma } from "@/lib/prisma";
import { PolicyStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { startOfDay, format } from "date-fns";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { start, end, personIds = [], granularity = "month" } = body || {};
  const startDate = start ? new Date(start) : new Date("2000-01-01");
  const endDate = end ? new Date(end) : new Date();

  // Very lightweight fallback: treat written apps + simple activity points
  const sold = await prisma.soldProduct.findMany({
    where: {
      dateSold: { gte: startDate, lte: endDate },
      ...(personIds.length ? { soldByPersonId: { in: personIds } } : {}),
      status: { in: [PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID] },
    },
    include: { soldByPerson: true },
  });
  const acts = await prisma.activityRecord.findMany({
    where: {
      activityDate: { gte: startDate, lte: endDate },
      ...(personIds.length ? { personId: { in: personIds } } : {}),
    },
    include: { person: true },
  });

  const personMap = new Map<string, { name: string; days: Map<string, { points: number }> }>();
  const ensure = (id: string, name: string) => {
    let p = personMap.get(id);
    if (!p) {
      p = { name, days: new Map() };
      personMap.set(id, p);
    }
    return p;
  };

  const addPoints = (id: string, name: string, date: Date, pts: number) => {
    const p = ensure(id, name);
    const key = format(startOfDay(date), "yyyy-MM-dd");
    const d = p.days.get(key) || { points: 0 };
    d.points += pts;
    p.days.set(key, d);
  };

  // simple default scoring
  for (const sp of sold) {
    addPoints(sp.soldByPersonId || sp.soldByName || "unknown", sp.soldByPerson?.fullName || sp.soldByName || "Unknown", sp.dateSold, 1);
  }
  for (const a of acts) {
    const name = a.person?.fullName || a.personName || "Unknown";
    const id = a.personId || a.personName || "unknown";
    const pts = a.activityName.toLowerCase().includes("outbound") ? a.count / 40 : a.count;
    addPoints(id, name, a.activityDate, pts);
  }

  const results = Array.from(personMap.entries()).map(([id, p]) => {
    const days = Array.from(p.days.entries()).map(([day, val]) => ({ day, points: val.points, win: val.points >= 6 }));
    const wins = days.filter((d) => d.win).length;
    const winRate = days.length ? wins / days.length : 0;
    const buckets = new Map<string, { wins: number; total: number }>();
    for (const d of days) {
      const key = granularity === "month" ? d.day.slice(0, 7) : d.day;
      const b = buckets.get(key) || { wins: 0, total: 0 };
      b.total += 1;
      if (d.win) b.wins += 1;
      buckets.set(key, b);
    }
    const series = Array.from(buckets.entries()).map(([bucketKey, val]) => ({
      bucket: bucketKey,
      winRate: val.total ? val.wins / val.total : 0,
      wins: val.wins,
    }));
    return { personId: id, personName: p.name, days, wins, winRate, series };
  });

  return NextResponse.json({ results });
}
