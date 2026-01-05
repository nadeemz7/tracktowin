import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import { canAccessRoiSetup } from "@/lib/permissions";

const LOBS = ["Auto", "Fire", "Life", "Health", "IPS"];

function parseDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  const ctx = await getViewerContext(req);
  // 1) Safe empty for missing context/org (prevents crashes, supports empty UI state)
  if (!ctx || !ctx.orgId) {
    return NextResponse.json([]);
  }

  const orgId = ctx.orgId;
  const url = new URL(req.url);
  const activeOn = url.searchParams.get("activeOn");
  const activeDate = parseDate(activeOn);

  if (activeOn && !activeDate) {
    return NextResponse.json([]);
  }

  if (activeDate) {
    // Return the latest effective rate per lob for the active date
    const rates = await prisma.roiCommissionRate.findMany({
      where: {
        orgId,
        effectiveStart: { lte: activeDate },
        OR: [{ effectiveEnd: null }, { effectiveEnd: { gte: activeDate } }],
      },
      orderBy: [{ lob: "asc" }, { effectiveStart: "desc" }],
    });
    const latestByLob = new Map<string, typeof rates[number]>();
    rates.forEach((r) => {
      if (!latestByLob.has(r.lob)) latestByLob.set(r.lob, r);
    });
    return NextResponse.json(Array.from(latestByLob.values()));
  }
  else {
    const rates = await prisma.roiCommissionRate.findMany({
      where: { orgId },
      orderBy: [{ lob: "asc" }, { effectiveStart: "asc" }],
    });
    return NextResponse.json(rates);
  }
}

export async function POST(req: Request) {
  const ctx = await getViewerContext(req);
  if (!ctx || !canAccessRoiSetup(ctx)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = ctx.orgId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const lob = typeof body.lob === "string" ? body.lob.trim() : "";
  const rate = Number(body.rate);
  const effectiveStart = parseDate(body.effectiveStart);
  const effectiveEnd = parseDate(body.effectiveEnd);

  if (!LOBS.includes(lob)) return NextResponse.json({ error: "invalid lob" }, { status: 400 });
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    const msg = rate > 1 ? "Rate must be a decimal between 0 and 1 (e.g. 0.08 for 8%)" : "invalid rate";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (!effectiveStart) return NextResponse.json({ error: "invalid effectiveStart" }, { status: 400 });
  if (effectiveEnd && effectiveEnd < effectiveStart) return NextResponse.json({ error: "effectiveEnd before start" }, { status: 400 });

  // overlap check
  const overlapping = await prisma.roiCommissionRate.findFirst({
    where: {
      orgId,
      lob,
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

  const existing = await prisma.roiCommissionRate.findFirst({
    where: { orgId, lob, effectiveStart },
    select: { id: true },
  });

  if (existing) {
    await prisma.roiCommissionRate.update({
      where: { id: existing.id },
      data: { rate, effectiveEnd: effectiveEnd || null },
    });
  } else {
    await prisma.roiCommissionRate.create({
      data: { orgId, lob, rate, effectiveStart, effectiveEnd: effectiveEnd || null },
    });
  }

  const rates = await prisma.roiCommissionRate.findMany({
    where: { orgId },
    orderBy: [{ lob: "asc" }, { effectiveStart: "asc" }],
  });
  return NextResponse.json(rates);
}
