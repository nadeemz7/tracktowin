import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { getViewerContext } from "@/lib/getViewerContext";
import { canAccessRoiReport } from "@/lib/permissions";

type RequestBody = {
  start?: string;
  end?: string;
  statuses?: string[];
  personIds?: string[];
};

const LOBS = ["Auto", "Fire", "Life", "Health", "IPS"];

function parseDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(d: Date) {
  return format(d, "yyyy-MM");
}

function ensureRoiModels() {
  const missing: string[] = [];
  if (!(prisma as any).roiCommissionRate) missing.push("roiCommissionRate");
  if (!(prisma as any).roiMonthlyInputs) missing.push("roiMonthlyInputs");
  if (!(prisma as any).roiCompPlan) missing.push("roiCompPlan");
  if (missing.length) {
    throw new Error(`Prisma client is missing models: ${missing.join(", ")}. Run: npx prisma generate`);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getViewerContext(req);
    if (!ctx || !ctx.orgId || !canAccessRoiReport(ctx)) {
      if (process.env.NODE_ENV !== "production" && !ctx) {
        console.warn("[ROI Report API] Missing viewer context for /api/reports/roi");
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = ctx.orgId;

    ensureRoiModels();

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const start = parseDate(body.start) || startOfMonth(new Date());
    const end = parseDate(body.end) || new Date();
    const statuses = Array.isArray(body.statuses) ? body.statuses.filter((s) => typeof s === "string") : [];
    const personIds = Array.isArray(body.personIds) ? body.personIds.filter((p) => typeof p === "string") : [];

    // rates map: latest effective per lob for the range start
    const rates = await prisma.roiCommissionRate.findMany({
      where: {
        orgId,
        effectiveStart: { lte: start },
        OR: [{ effectiveEnd: null }, { effectiveEnd: { gte: start } }],
      },
      orderBy: [{ lob: "asc" }, { effectiveStart: "desc" }],
    });

    const rateMap = new Map<string, number>();
    rates.forEach((r) => {
      if (!rateMap.has(r.lob)) rateMap.set(r.lob, r.rate ?? 0);
    });

    // pull sold products
    const dateFilter =
      start && end ? { gte: start, lte: end } : start ? { gte: start } : end ? { lte: end } : undefined;

    const sold = await prisma.soldProduct.findMany({
      where: {
        agencyId: orgId,
        ...(dateFilter ? { dateSold: dateFilter } : {}),
        ...(statuses.length ? { status: { in: statuses as any } } : {}),
        ...(personIds.length ? { soldByPersonId: { in: personIds } } : {}),
      },
      include: { product: { include: { lineOfBusiness: true } }, soldByPerson: true },
    });

    // aggregate sold -> lob + people maps
    const lobRowsMap = new Map<string, { lob: string; apps: number; premium: number; rate: number | null; revenue: number }>();
    const peopleMap = new Map<string, { personId: string; personName: string; apps: number; premium: number; revenue: number }>();

    sold.forEach((sp) => {
      const lobRaw = sp.product?.lineOfBusiness?.name || "";
      const lob = LOBS.find((l) => lobRaw.toLowerCase().includes(l.toLowerCase())) || lobRaw || "Unknown";

      const rate = rateMap.has(lob) ? rateMap.get(lob)! : null;
      const premium = sp.premium ?? 0;
      const revenue = rate == null ? 0 : premium * rate;

      const lobRow = lobRowsMap.get(lob) || { lob, apps: 0, premium: 0, rate, revenue: 0 };
      lobRow.apps += 1;
      lobRow.premium += premium;
      lobRow.rate = rate ?? lobRow.rate ?? null;
      lobRow.revenue += revenue;
      lobRowsMap.set(lob, lobRow);

      const pid = sp.soldByPersonId || "unknown";
      const pname = sp.soldByPerson?.fullName || sp.soldByName || pid;
      const personRow = peopleMap.get(pid) || { personId: pid, personName: pname, apps: 0, premium: 0, revenue: 0 };
      personRow.apps += 1;
      personRow.premium += premium;
      personRow.revenue += revenue;
      peopleMap.set(pid, personRow);
    });

    // months in range
    const months: string[] = [];
    let cursor = startOfMonth(start);
    const endMonth = startOfMonth(end);
    while (cursor <= endMonth) {
      months.push(monthKey(cursor));
      cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    }

    const inputs = await prisma.roiMonthlyInputs.findMany({
      where: {
        orgId,
        month: { in: months },
        ...(personIds.length ? { personId: { in: personIds } } : {}),
      },
    });

    const compPlans = await prisma.roiCompPlan.findMany({
      where: {
        orgId,
        effectiveStart: { lte: end },
        OR: [{ effectiveEnd: null }, { effectiveEnd: { gte: start } }],
        ...(personIds.length ? { personId: { in: personIds } } : {}),
      },
    });

    // partial-month fraction per month
    const fractionByMonth = new Map<string, number>();
    months.forEach((m) => {
      const mStart = startOfMonth(new Date(`${m}-01T00:00:00`));
      const mEnd = endOfMonth(mStart);
      const rangeStart = start > mStart ? start : mStart;
      const rangeEnd = end < mEnd ? end : mEnd;
      const days = Math.max(0, (rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24) + 1);
      const daysInMonth = Math.max(1, (mEnd.getTime() - mStart.getTime()) / (1000 * 60 * 60 * 24) + 1);
      fractionByMonth.set(m, days / daysInMonth);
    });

    // comp results (commission paid source of truth)
    const compResults = await prisma.compMonthlyResult.findMany({
      where: {
        agencyId: orgId,
        month: { in: months },
        ...(personIds.length ? { personId: { in: personIds } } : {}),
      },
    });

    const compPaidByPersonMonth = new Map<string, number>();
    compResults.forEach((row) => {
      if (!row.personId || !row.month) return;
      const key = `${row.personId}-${row.month}`;
      compPaidByPersonMonth.set(key, Number(row.totalEarnings) || 0);
    });

    // monthly inputs map
    const inputsByPersonMonth = new Map<
      string,
      { commissionPaid: number; leadSpend: number; otherBonusesManual: number; marketingExpenses: number }
    >();

    inputs.forEach((row) => {
      const key = `${row.personId}-${row.month}`;
      inputsByPersonMonth.set(key, {
        commissionPaid: row.commissionPaid ?? 0,
        leadSpend: row.leadSpend ?? 0,
        otherBonusesManual: row.otherBonusesManual ?? 0,
        marketingExpenses: row.marketingExpenses ?? 0,
      });
    });

    // salary from comp plans (prorated)
    const salaryByPersonMonth = new Map<string, number>();
    compPlans.forEach((plan) => {
      months.forEach((m) => {
        const mStart = startOfMonth(new Date(`${m}-01T00:00:00`));
        if (plan.effectiveStart > end || (plan.effectiveEnd && plan.effectiveEnd < mStart)) return;
        const key = `${plan.personId}-${m}`;
        const fraction = fractionByMonth.get(m) ?? 0;
        const prev = salaryByPersonMonth.get(key) || 0;
        salaryByPersonMonth.set(key, prev + (plan.monthlySalary ?? 0) * fraction);
      });
    });

    // people rows
    const peopleRows = Array.from(peopleMap.values())
      .map((row) => {
        let salary = 0;
        let commissionsPaid = 0;
        let leadSpend = 0;
        let otherBonusesManual = 0;
        let marketingExpenses = 0;
        let commissionPaidFromComp = false;

        months.forEach((m) => {
          const key = `${row.personId}-${m}`;
          const fraction = fractionByMonth.get(m) ?? 1;

          salary += salaryByPersonMonth.get(key) ?? 0;

          // commissions paid: comp results take priority
          if (compPaidByPersonMonth.has(key)) {
            commissionsPaid += (compPaidByPersonMonth.get(key) ?? 0) * fraction;
            commissionPaidFromComp = true;
          } else {
            const input = inputsByPersonMonth.get(key);
            if (input) {
              commissionsPaid += (input.commissionPaid ?? 0) * fraction;
            }
          }

          // always take leadSpend/bonuses/marketing from inputs (if present), regardless of comp presence
          const input = inputsByPersonMonth.get(key);
          if (input) {
            leadSpend += (input.leadSpend ?? 0) * fraction;
            otherBonusesManual += (input.otherBonusesManual ?? 0) * fraction;
            marketingExpenses += (input.marketingExpenses ?? 0) * fraction;
          }
        });

        const otherBonusesAuto = 0; // A6 placeholder for future comp kickers
        const costs = salary + commissionsPaid + leadSpend + otherBonusesAuto + otherBonusesManual + marketingExpenses;
        const net = row.revenue - costs;
        const roi = costs > 0 ? (net / costs) * 100 : 0;

        return {
          ...row,
          salary,
          commissionsPaid,
          commissionPaidFromComp,
          leadSpend,
          otherBonusesManual,
          marketingExpenses,
          net,
          roi,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    // KPI totals (must match people row math)
    const kpis = peopleRows.reduce(
      (acc, p) => {
        acc.revenue += p.revenue;
        acc.salaries += p.salary;
        acc.commissionsPaid += p.commissionsPaid;
        acc.leadSpend += p.leadSpend;
        acc.otherBonusesManual += p.otherBonusesManual ?? 0;
        acc.marketingExpenses += p.marketingExpenses ?? 0;
        return acc;
      },
      { revenue: 0, salaries: 0, commissionsPaid: 0, leadSpend: 0, otherBonusesManual: 0, marketingExpenses: 0, net: 0, roi: 0 }
    );

    const otherBonusesAutoTotal = 0; // A6 placeholder total
    const totalCosts =
      kpis.salaries +
      kpis.commissionsPaid +
      kpis.leadSpend +
      otherBonusesAutoTotal +
      kpis.otherBonusesManual +
      kpis.marketingExpenses;

    kpis.net = kpis.revenue - totalCosts;
    kpis.roi = totalCosts > 0 ? ((kpis.revenue - totalCosts) / totalCosts) * 100 : 0;

    return NextResponse.json({
      kpis,
      lobRows: Array.from(lobRowsMap.values()),
      peopleRows,
    });
  } catch (err: any) {
    const message = err?.message || "Internal error";
    const stack = process.env.NODE_ENV !== "production" ? err?.stack : undefined;
    return NextResponse.json({ error: message, stack }, { status: 500 });
  }
}
