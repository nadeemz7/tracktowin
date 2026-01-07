import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { getLastViewerDebug, getViewerContext } from "@/lib/getViewerContext";

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

    const viewer = await getViewerContext(req);
    const isAllowed = viewer && (viewer.isAdmin || viewer.isManager || viewer.isOwner);
    // IMPORTANT: ROI API auth must match client viewer context.
    // Do not use next/headers cookies here.
    if (!isAllowed) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          debug: {
            viewer,
            hasCookieHeader: Boolean(req.headers.get("cookie")),
            viewerDebug: process.env.NODE_ENV !== "production" ? getLastViewerDebug() : undefined,
          },
        },
        { status: 401 }
      );
    }

    const orgId = viewer?.orgId;

    ensureRoiModels();

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const start = parseDate(body.start) || startOfMonth(new Date());
    const end = parseDate(body.end) || new Date();
    const statuses = Array.isArray(body.statuses) ? body.statuses.filter((s) => typeof s === "string") : [];
    const personIds = Array.isArray(body.personIds) ? body.personIds.filter((p) => typeof p === "string") : [];

    // Pull all commission rates that could touch the selected range.
    const rates = await prisma.roiCommissionRate.findMany({
      where: {
        orgId,
        effectiveStart: { lte: end },
        OR: [{ effectiveEnd: null }, { effectiveEnd: { gte: start } }],
      },
      orderBy: [{ lob: "asc" }, { effectiveStart: "desc" }],
    });

    const ratesByLob = new Map<string, typeof rates>();
    rates.forEach((r) => {
      const list = ratesByLob.get(r.lob) || [];
      list.push(r);
      ratesByLob.set(r.lob, list);
    });

    // rates map: latest effective per lob for the range start (preserves current behavior)
    const rateMap = new Map<string, number>();
    ratesByLob.forEach((list, lob) => {
      const match = list.find(
        (r) =>
          r.effectiveStart <= start &&
          (r.effectiveEnd === null || r.effectiveEnd === undefined || r.effectiveEnd >= start)
      );
      if (match) {
        rateMap.set(lob, match.rate ?? 0);
      }
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
    const monthBounds: Array<{ key: string; monthStart: Date; monthEnd: Date; rangeStart: Date; rangeEnd: Date }> = [];
    let cursor = startOfMonth(start);
    const endMonth = startOfMonth(end);
    while (cursor <= endMonth) {
      const monthStart = cursor;
      const monthEnd = endOfMonth(monthStart);
      const rangeStart = start > monthStart ? start : monthStart;
      const rangeEnd = end < monthEnd ? end : monthEnd;
      monthBounds.push({
        key: monthKey(monthStart),
        monthStart,
        monthEnd,
        rangeStart,
        rangeEnd,
      });
      cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    }
    const months = monthBounds.map((m) => m.key);

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
    monthBounds.forEach(({ key, monthStart, monthEnd, rangeStart, rangeEnd }) => {
      const days = Math.max(0, (rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24) + 1);
      const daysInMonth = Math.max(1, (monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24) + 1);
      fractionByMonth.set(key, days / daysInMonth);
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

    // Diagnostics only. Do NOT modify ROI math based on these warnings.
    const diagnostics = {
      missingCommissionRates: [] as Array<{ lob: string; months: string[] }>,
      missingSalaryPlans: [] as Array<{ personId: string; personName: string }>,
      missingMonthlyInputs: [] as Array<{ personId: string; personName: string; month: string }>,
      reconciliation: {
        agencyVsPeople: [] as Array<{ field: "revenue" | "salary" | "commission" | "net"; agencyTotal: number; peopleTotal: number; delta: number }>,
        personBreakdown: [] as Array<{ personId: string; field: "revenue" | "net"; expected: number; actual: number; delta: number }>,
      },
    };

    // Missing commission rates by lob/month within the selected range
    Array.from(lobRowsMap.keys()).forEach((lob) => {
      const lobRates = ratesByLob.get(lob) || [];
      const missingMonths: string[] = [];
      monthBounds.forEach(({ key, rangeStart, rangeEnd }) => {
        const hasCoveringRate = lobRates.some(
          (r) =>
            r.effectiveStart <= rangeStart &&
            (r.effectiveEnd === null || r.effectiveEnd === undefined || r.effectiveEnd >= rangeEnd)
        );
        if (!hasCoveringRate) missingMonths.push(key);
      });
      if (missingMonths.length) diagnostics.missingCommissionRates.push({ lob, months: missingMonths });
    });

    // Missing comp plans per person for the selected window
    const compPlansByPerson = new Map<string, typeof compPlans>();
    compPlans.forEach((plan) => {
      const list = compPlansByPerson.get(plan.personId) || [];
      list.push(plan);
      compPlansByPerson.set(plan.personId, list);
    });

    Array.from(peopleMap.values()).forEach((person) => {
      const plans = compPlansByPerson.get(person.personId) || [];
      const hasCoveringPlan = plans.some(
        (plan) =>
          plan.effectiveStart <= end &&
          (plan.effectiveEnd === null || plan.effectiveEnd === undefined || plan.effectiveEnd >= start)
      );
      if (!hasCoveringPlan) {
        diagnostics.missingSalaryPlans.push({ personId: person.personId, personName: person.personName });
      }
    });

    // Missing monthly inputs per person/month (lightweight)
    Array.from(peopleMap.values()).forEach((person) => {
      monthBounds.forEach(({ key }) => {
        const inputKey = `${person.personId}-${key}`;
        if (!inputsByPersonMonth.has(inputKey)) {
          diagnostics.missingMonthlyInputs.push({ personId: person.personId, personName: person.personName, month: key });
        }
      });
    });

    const reconciliationAgency: Array<{ field: "revenue" | "salary" | "commission" | "net"; agencyTotal: number; peopleTotal: number; delta: number }> =
      [];
    const agg = {
      revenue: kpis.revenue ?? 0,
      salary: kpis.salaries ?? 0,
      commission: kpis.commissionsPaid ?? 0,
      net: kpis.net ?? 0,
    };
    const peopleAgg = peopleRows.reduce(
      (acc, p) => {
        acc.revenue += p.revenue ?? 0;
        acc.salary += p.salary ?? 0;
        acc.commission += p.commissionsPaid ?? 0;
        acc.net += p.net ?? 0;
        return acc;
      },
      { revenue: 0, salary: 0, commission: 0, net: 0 }
    );
    (["revenue", "salary", "commission", "net"] as const).forEach((field) => {
      const agencyTotal = agg[field];
      const peopleTotal = peopleAgg[field];
      const delta = agencyTotal - peopleTotal;
      if (Math.abs(delta) > 0.01) {
        reconciliationAgency.push({ field, agencyTotal, peopleTotal, delta });
      }
    });
    diagnostics.reconciliation.agencyVsPeople = reconciliationAgency;

    const reconciliationPeople: Array<{ personId: string; field: "revenue" | "net"; expected: number; actual: number; delta: number }> = [];
    peopleRows.forEach((p) => {
      const recomputedRevenue = p.revenue ?? 0;
      const recomputedNet = p.revenue - (p.salary + p.commissionsPaid + p.leadSpend + (p.otherBonusesManual ?? 0) + (p.marketingExpenses ?? 0));
      const revenueDelta = (p.revenue ?? 0) - recomputedRevenue;
      const netDelta = (p.net ?? 0) - recomputedNet;
      if (Math.abs(revenueDelta) > 0.01) {
        reconciliationPeople.push({ personId: p.personId, field: "revenue", expected: recomputedRevenue, actual: p.revenue ?? 0, delta: revenueDelta });
      }
      if (Math.abs(netDelta) > 0.01) {
        reconciliationPeople.push({ personId: p.personId, field: "net", expected: recomputedNet, actual: p.net ?? 0, delta: netDelta });
      }
    });
    diagnostics.reconciliation.personBreakdown = reconciliationPeople;

    const hasDiagnostics =
      diagnostics.missingCommissionRates.length > 0 ||
      diagnostics.missingSalaryPlans.length > 0 ||
      diagnostics.missingMonthlyInputs.length > 0 ||
      (diagnostics.reconciliation?.agencyVsPeople?.length || 0) > 0 ||
      (diagnostics.reconciliation?.personBreakdown?.length || 0) > 0;

    const payload: any = {
      kpis,
      lobRows: Array.from(lobRowsMap.values()),
      peopleRows,
    };

    if (hasDiagnostics) {
      payload.diagnostics = diagnostics;
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error("[ROI report] error", err);
    return NextResponse.json(
      {
        error: "ROI report failed",
        detail: String(err?.message ?? err),
      },
      { status: 500 }
    );
  }
}
