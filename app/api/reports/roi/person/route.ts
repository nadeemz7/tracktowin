import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { getViewerContext } from "@/lib/getViewerContext";
import { canAccessRoiReport } from "@/lib/permissions";

type RequestBody = {
  personId?: string;
  monthsBack?: number;
  statuses?: string[];
};

type MonthRow = {
  month: string;
  apps: number;
  premium: number;
  revenue: number;
  salary: number;
  commissionsPaid: number;
  commissionPaidFromComp: boolean;
  leadSpend: number;
  otherBonusesAuto: number;
  otherBonusesManual: number;
  marketingExpenses: number;
  net: number;
  roi: number; // percent
};

const DEFAULT_STATUSES = ["WRITTEN", "ISSUED", "PAID"];
const LOBS = ["Auto", "Fire", "Life", "Health", "IPS"];

function ensureRoiModels() {
  const missing: string[] = [];
  if (!(prisma as any).roiCommissionRate) missing.push("roiCommissionRate");
  if (!(prisma as any).roiMonthlyInputs) missing.push("roiMonthlyInputs");
  if (!(prisma as any).roiCompPlan) missing.push("roiCompPlan");
  if (missing.length) {
    throw new Error(`Prisma client is missing models: ${missing.join(", ")}. Run: npx prisma generate`);
  }
}

function normalizeLob(lobRaw: string) {
  const raw = (lobRaw || "").toLowerCase();
  return LOBS.find((l) => raw.includes(l.toLowerCase())) || lobRaw || "Unknown";
}

export async function POST(req: Request) {
  try {
    const ctx = await getViewerContext(req);
    if (!ctx || !ctx.orgId || !canAccessRoiReport(ctx)) {
      if (process.env.NODE_ENV !== "production" && !ctx) {
        console.warn("[ROI Report API] Missing viewer context for /api/reports/roi/person");
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = ctx.orgId;

    ensureRoiModels();

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const personId = body.personId?.trim();
    if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });

    const monthsBack =
      Number.isFinite(body.monthsBack) && Number(body.monthsBack) > 0 ? Number(body.monthsBack) : 12;
    const statuses =
      Array.isArray(body.statuses) && body.statuses.length
        ? body.statuses.filter((s) => typeof s === "string")
        : DEFAULT_STATUSES;

    const months: string[] = [];
    const monthBounds: Array<{ key: string; start: Date; end: Date }> = [];
    const todayStart = startOfMonth(new Date());

    for (let i = 0; i < monthsBack; i++) {
      const mStart = startOfMonth(subMonths(todayStart, i));
      const mEnd = endOfMonth(mStart);
      const key = format(mStart, "yyyy-MM");
      months.push(key);
      monthBounds.push({ key, start: mStart, end: mEnd });
    }

    const person = await prisma.person.findFirst({
      where: { id: personId, primaryAgencyId: orgId },
      select: { id: true, fullName: true },
    });
    if (!person) return NextResponse.json({ error: "Person not found" }, { status: 404 });

    // Pull all rates that could apply to our month range (use oldest month start).
    const oldestMonthStart = monthBounds.length ? monthBounds[monthBounds.length - 1].start : todayStart;

    const rates = await prisma.roiCommissionRate.findMany({
      where: {
        orgId,
        effectiveStart: { lte: todayStart },
        OR: [{ effectiveEnd: null }, { effectiveEnd: { gte: oldestMonthStart } }],
      },
      orderBy: [{ lob: "asc" }, { effectiveStart: "desc" }],
    });

    // Group rates by lob once; we'll pick latest effective per month below.
    const ratesByLob = new Map<string, typeof rates>();
    rates.forEach((r) => {
      const arr = ratesByLob.get(r.lob) || [];
      arr.push(r);
      ratesByLob.set(r.lob, arr);
    });

    const compResults = await prisma.compMonthlyResult.findMany({
      where: { agencyId: orgId, personId, month: { in: months } },
    });

    const inputs = await prisma.roiMonthlyInputs.findMany({
      where: { orgId, personId, month: { in: months } },
    });

    const compPlans = await prisma.roiCompPlan.findMany({
      where: { orgId, personId },
      orderBy: [{ effectiveStart: "desc" }],
    });

    const compPaidByMonth = new Map<string, number>();
    compResults.forEach((row) => {
      if (!row.month) return;
      compPaidByMonth.set(row.month, Number(row.totalEarnings) || 0);
    });

    const inputsByMonth = new Map<
      string,
      { commissionPaid: number; leadSpend: number; otherBonusesManual: number; marketingExpenses: number }
    >();
    inputs.forEach((row) => {
      inputsByMonth.set(row.month, {
        commissionPaid: row.commissionPaid ?? 0,
        leadSpend: row.leadSpend ?? 0,
        otherBonusesManual: row.otherBonusesManual ?? 0,
        marketingExpenses: row.marketingExpenses ?? 0,
      });
    });

    const rows: MonthRow[] = [];

    for (const { key, start, end } of monthBounds) {
      // Build rate map for this month start: latest effective record per lob.
      const rateMapByLob = new Map<string, number>();
      LOBS.forEach((lob) => {
        const list = ratesByLob.get(lob) || [];
        const match = list.find(
          (r) =>
            r.effectiveStart <= start &&
            (r.effectiveEnd === null || r.effectiveEnd === undefined || r.effectiveEnd >= start)
        );
        rateMapByLob.set(lob, match?.rate ?? 0);
      });

      const sold = await prisma.soldProduct.findMany({
        where: {
          agencyId: orgId,
          soldByPersonId: personId,
          dateSold: { gte: start, lte: end },
          ...(statuses.length ? { status: { in: statuses as any } } : {}),
        },
        include: { product: { include: { lineOfBusiness: true } } },
      });

      let apps = 0;
      let premium = 0;
      let revenue = 0;

      sold.forEach((sp) => {
        const lobRaw = sp.product?.lineOfBusiness?.name || "";
        const lob = normalizeLob(lobRaw);
        const rate = rateMapByLob.get(lob) ?? 0;

        apps += 1;
        const prem = sp.premium ?? 0;
        premium += prem;
        revenue += prem * rate;
      });

      const salary = compPlans
        .filter((p) => p.effectiveStart <= end && (!p.effectiveEnd || p.effectiveEnd >= start))
        .reduce((sum, p) => sum + (p.monthlySalary ?? 0), 0);

      const compPaid = compPaidByMonth.has(key) ? compPaidByMonth.get(key)! : inputsByMonth.get(key)?.commissionPaid ?? 0;
      const commissionPaidFromComp = compPaidByMonth.has(key);

      const leadSpend = inputsByMonth.get(key)?.leadSpend ?? 0;
      const otherBonusesManual = inputsByMonth.get(key)?.otherBonusesManual ?? 0;
      const marketingExpenses = inputsByMonth.get(key)?.marketingExpenses ?? 0;

      const otherBonusesAuto = 0; // placeholder for future kickers
      const costs = salary + compPaid + leadSpend + otherBonusesAuto + otherBonusesManual + marketingExpenses;
      const net = revenue - costs;
      const roi = costs > 0 ? (net / costs) * 100 : 0;

      rows.push({
        month: key,
        apps,
        premium,
        revenue,
        salary,
        commissionsPaid: compPaid,
        commissionPaidFromComp,
        leadSpend,
        otherBonusesAuto,
        otherBonusesManual,
        marketingExpenses,
        net,
        roi,
      });
    }

    rows.sort((a, b) => b.month.localeCompare(a.month));

    return NextResponse.json({
      personId,
      personName: person.fullName,
      months: rows,
    });
  } catch (err: any) {
    const message = err?.message || "Internal error";
    const stack = process.env.NODE_ENV !== "production" ? err?.stack : undefined;
    return NextResponse.json({ error: message, stack }, { status: 500 });
  }
}
