import { NextResponse } from "next/server";
import { endOfMonth, eachMonthOfInterval, format, startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import type { PolicyStatus, PremiumCategory } from "@prisma/client";

type RequestBody = {
  agencyId?: string;
  start?: string;
  end?: string;
  statuses?: PolicyStatus[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    const today = new Date();
    const startDate = body.start ? new Date(body.start) : startOfMonth(today);
    const endDate = body.end ? new Date(body.end) : endOfMonth(today);
    const agencyId = body.agencyId?.trim() || undefined;
    const statuses: PolicyStatus[] = Array.isArray(body.statuses) && body.statuses.length > 0
      ? body.statuses
      : ["WRITTEN", "ISSUED", "PAID"];

    // Base people list (used for salary inputs)
    const basePeople = await prisma.person.findMany({
      where: agencyId ? { primaryAgencyId: agencyId } : {},
      select: { id: true, fullName: true, teamType: true, primaryAgencyId: true },
      orderBy: { fullName: "asc" },
    });

    // Sold products in range
    const sold = await prisma.soldProduct.findMany({
      where: {
        dateSold: { gte: startDate, lte: endDate },
        status: { in: statuses },
        ...(agencyId ? { agencyId } : {}),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            lineOfBusiness: {
              select: { id: true, name: true, premiumCategory: true },
            },
          },
        },
        soldByPerson: {
          select: { id: true, fullName: true, teamType: true, primaryAgencyId: true },
        },
      },
    });

    // Ensure all referenced people are represented
    const peopleMap = new Map<string, { id: string; fullName: string; teamType: string | null; primaryAgencyId: string | null }>();
    basePeople.forEach((p) => peopleMap.set(p.id, { id: p.id, fullName: p.fullName, teamType: p.teamType, primaryAgencyId: p.primaryAgencyId }));

    for (const sp of sold) {
      const person = sp.soldByPerson;
      if (person && !peopleMap.has(person.id)) {
        // If agency filter exists, only include if matches; otherwise include all referenced
        if (!agencyId || person.primaryAgencyId === agencyId) {
          peopleMap.set(person.id, {
            id: person.id,
            fullName: person.fullName,
            teamType: person.teamType,
            primaryAgencyId: person.primaryAgencyId,
          });
        }
      }
    }

    // Unassigned bucket for sales without a person
    const includeUnassigned = sold.some((sp) => !sp.soldByPersonId);
    if (includeUnassigned) {
      peopleMap.set("unassigned", { id: "unassigned", fullName: "Unassigned", teamType: null, primaryAgencyId: null });
    }

    const persons = Array.from(peopleMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));

    // Metrics per person
    const personMetrics: Record<
      string,
      {
        premium: number;
        apps: number;
        byLob: Record<string, { premium: number; apps: number; name: string; premiumCategory: PremiumCategory }>;
      }
    > = {};

    const lobTotalsMap = new Map<
      string,
      { id: string; name: string; premiumCategory: PremiumCategory; premium: number; apps: number }
    >();

    for (const sp of sold) {
      const lob = sp.product.lineOfBusiness;
      if (!lobTotalsMap.has(lob.id)) {
        lobTotalsMap.set(lob.id, { id: lob.id, name: lob.name, premiumCategory: lob.premiumCategory, premium: 0, apps: 0 });
      }
      const lobAgg = lobTotalsMap.get(lob.id)!;
      lobAgg.premium += sp.premium ?? 0;
      lobAgg.apps += 1;

      const personId = sp.soldByPersonId && peopleMap.has(sp.soldByPersonId) ? sp.soldByPersonId : includeUnassigned ? "unassigned" : null;
      if (!personId) continue;
      if (!personMetrics[personId]) {
        personMetrics[personId] = { premium: 0, apps: 0, byLob: {} };
      }
      const pm = personMetrics[personId];
      pm.premium += sp.premium ?? 0;
      pm.apps += 1;
      pm.byLob[lob.id] = pm.byLob[lob.id] || { premium: 0, apps: 0, name: lob.name, premiumCategory: lob.premiumCategory };
      pm.byLob[lob.id].premium += sp.premium ?? 0;
      pm.byLob[lob.id].apps += 1;
    }

    const lobTotals = Array.from(lobTotalsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    // Compensation (commission) already paid from CompMonthlyResult
    const personIds = persons.map((p) => p.id).filter((id) => id !== "unassigned");
    let compByPerson: Record<string, number> = {};
    if (personIds.length) {
      const months = eachMonthOfInterval({ start: startDate, end: endDate }).map((d) => format(d, "yyyy-MM"));
      const comp = await prisma.compMonthlyResult.findMany({
        where: {
          month: { in: months },
          personId: { in: personIds },
          ...(agencyId ? { agencyId } : {}),
        },
        select: { personId: true, totalEarnings: true },
      });
      compByPerson = comp.reduce<Record<string, number>>((acc, row) => {
        acc[row.personId] = (acc[row.personId] || 0) + (row.totalEarnings ?? 0);
        return acc;
      }, {});
    }

    return NextResponse.json({
      persons,
      personMetrics,
      lobTotals,
      compByPerson,
    });
  } catch (err) {
    console.error("ROI report error", err);
    return NextResponse.json({ error: "Failed to load ROI report" }, { status: 500 });
  }
}
