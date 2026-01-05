import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import { canAccessRoiSetup } from "@/lib/permissions";

function isMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

export async function GET(req: Request) {
  const ctx = await getViewerContext(req);
  if (!ctx || !ctx.orgId) {
    return NextResponse.json([]);
  }
  const orgId = ctx.orgId;
  const url = new URL(req.url);
  let startMonth = url.searchParams.get("startMonth");
  let endMonth = url.searchParams.get("endMonth");
  const month = url.searchParams.get("month");
  if (!startMonth && !endMonth && month) {
    startMonth = month;
    endMonth = month;
  }
  if (!startMonth || !endMonth) {
    return NextResponse.json({ error: "startMonth and endMonth are required (YYYY-MM)" }, { status: 400 });
  }
  if (!isMonth(startMonth) || !isMonth(endMonth)) {
    return NextResponse.json({ error: "month format YYYY-MM required" }, { status: 400 });
  }

  const rows = await prisma.roiMonthlyInputs.findMany({
    where: {
      orgId,
      month: { gte: startMonth, lte: endMonth },
    },
    orderBy: [{ personId: "asc" }, { month: "asc" }],
  });
  return NextResponse.json(rows);
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
  const month = typeof body.month === "string" ? body.month : "";
  const commissionPaid = Number(body.commissionPaid);
  const leadSpend = body.leadSpend === null || body.leadSpend === undefined ? null : Number(body.leadSpend);
  const notes = typeof body.notes === "string" ? body.notes : null;
  const otherBonusesManual =
    body.otherBonusesManual === null || body.otherBonusesManual === undefined ? null : Number(body.otherBonusesManual);
  const marketingExpenses = body.marketingExpenses === null || body.marketingExpenses === undefined ? null : Number(body.marketingExpenses);

  if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });
  if (!isMonth(month)) return NextResponse.json({ error: "month format YYYY-MM required" }, { status: 400 });
  if (!Number.isFinite(commissionPaid) || commissionPaid < 0) return NextResponse.json({ error: "invalid commissionPaid" }, { status: 400 });
  if (leadSpend !== null && (!Number.isFinite(leadSpend) || leadSpend < 0))
    return NextResponse.json({ error: "invalid leadSpend" }, { status: 400 });
  if (otherBonusesManual !== null && (!Number.isFinite(otherBonusesManual) || otherBonusesManual < 0))
    return NextResponse.json({ error: "invalid otherBonusesManual" }, { status: 400 });
  if (marketingExpenses !== null && (!Number.isFinite(marketingExpenses) || marketingExpenses < 0))
    return NextResponse.json({ error: "invalid marketingExpenses" }, { status: 400 });

  const person = await prisma.person.findFirst({ where: { id: personId, ...(orgId ? { primaryAgencyId: orgId } : {}) } });
  if (!person) return NextResponse.json({ error: "person not found in org" }, { status: 404 });

  const row = await prisma.roiMonthlyInputs.upsert({
    where: { orgId_personId_month: { orgId, personId, month } },
    create: { orgId, personId, month, commissionPaid, leadSpend, notes, otherBonusesManual, marketingExpenses },
    update: { commissionPaid, leadSpend, notes, otherBonusesManual, marketingExpenses },
  });

  return NextResponse.json(row);
}
