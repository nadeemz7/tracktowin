import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { format, startOfMonth, subMonths } from "date-fns";
import ReportsDashboard from "./ReportsDashboard";
import type { ReportsData } from "./types";
import { revalidatePath } from "next/cache";
import { PremiumCategory, ProductType, TeamType, PolicyStatus } from "@prisma/client";
import ReportsHubClient from "./ReportsHubClient";

export const dynamic = "force-dynamic";

type SeedResult = { created: boolean; message: string };

const DEFAULT_LINES = [
  {
    name: "Auto",
    premiumCategory: PremiumCategory.PC,
    products: [
      { name: "Auto Raw New", productType: ProductType.PERSONAL },
      { name: "Auto Added", productType: ProductType.PERSONAL },
      { name: "Business Raw Auto", productType: ProductType.BUSINESS },
      { name: "Business Added Auto", productType: ProductType.BUSINESS },
    ],
  },
  {
    name: "Fire",
    premiumCategory: PremiumCategory.PC,
    products: [
      { name: "Homeowners", productType: ProductType.PERSONAL },
      { name: "Renters", productType: ProductType.PERSONAL },
      { name: "Condo", productType: ProductType.PERSONAL },
      { name: "PAP", productType: ProductType.PERSONAL },
      { name: "PLUP", productType: ProductType.PERSONAL },
      { name: "Boat", productType: ProductType.PERSONAL },
      { name: "BOP", productType: ProductType.BUSINESS },
      { name: "Apartment", productType: ProductType.BUSINESS },
      { name: "CLUP", productType: ProductType.BUSINESS },
      { name: "Workers Comp", productType: ProductType.BUSINESS },
    ],
  },
  {
    name: "Health",
    premiumCategory: PremiumCategory.FS,
    products: [
      { name: "Short Term Disability", productType: ProductType.PERSONAL },
      { name: "Long Term Disability", productType: ProductType.PERSONAL },
      { name: "Hospital Indemnity", productType: ProductType.PERSONAL },
    ],
  },
  {
    name: "Life",
    premiumCategory: PremiumCategory.FS,
    products: [
      { name: "Term", productType: ProductType.PERSONAL },
      { name: "Whole Life", productType: ProductType.PERSONAL },
    ],
  },
  {
    name: "IPS",
    premiumCategory: PremiumCategory.IPS,
    products: [
      { name: "Advisory Account", productType: ProductType.PERSONAL },
      { name: "Non Advisory Account", productType: ProductType.PERSONAL },
    ],
  },
];

async function upsertAgencyWithData(name: string, profileName: string): Promise<SeedResult> {
  let agency = await prisma.agency.findFirst({ where: { name } });
  if (!agency) {
    agency = await prisma.agency.create({ data: { name, profileName } });
  }

  // Lines + products
  const productMap = new Map<string, { id: string; category: PremiumCategory; type: ProductType }>();
  for (const line of DEFAULT_LINES) {
    let lob = await prisma.lineOfBusiness.findFirst({ where: { agencyId: agency.id, name: line.name } });
    if (!lob) {
      lob = await prisma.lineOfBusiness.create({
        data: { agencyId: agency.id, name: line.name, premiumCategory: line.premiumCategory },
      });
    }
    for (const prod of line.products) {
      let product = await prisma.product.findFirst({
        where: { lineOfBusinessId: lob.id, name: prod.name },
      });
      if (!product) {
        product = await prisma.product.create({
          data: { lineOfBusinessId: lob.id, name: prod.name, productType: prod.productType },
        });
      }
      productMap.set(prod.name, { id: product.id, category: line.premiumCategory, type: prod.productType });
    }
  }

  // Premium buckets
  const buckets = [
    { name: "P&C Premium", includesLobs: ["Auto", "Fire"] },
    { name: "Financial Services Premium", includesLobs: ["Health", "Life"] },
    { name: "IPS Premium", includesLobs: ["IPS"] },
    {
      name: "Business Premium",
      includesProducts: ["Business Raw Auto", "Business Added Auto", "BOP", "Apartment", "CLUP", "Workers Comp"],
    },
  ];
  for (const b of buckets) {
    const existing = await prisma.premiumBucket.findFirst({ where: { agencyId: agency.id, name: b.name } });
    if (!existing) {
      await prisma.premiumBucket.create({
        data: {
          agencyId: agency.id,
          name: b.name,
          includesLobs: b.includesLobs ?? [],
          includesProducts: b.includesProducts ?? [],
        },
      });
    }
  }

  // Teams + roles
  const teams = ["Sales", "Customer Service"];
  const teamMap = new Map<string, string>();
  for (const t of teams) {
    let team = await prisma.team.findFirst({ where: { orgId: agency.orgId, name: t } });
    if (!team) {
      team = await prisma.team.create({ data: { orgId: agency.orgId, name: t } });
    }
    teamMap.set(t, team.id);
    const defaultRoles = t === "Sales" ? ["Sales Associate", "Senior Sales"] : ["CS Rep", "CS Specialist"];
    for (const r of defaultRoles) {
      const roleExists = await prisma.role.findFirst({ where: { teamId: team.id, name: r } });
      if (!roleExists) {
        await prisma.role.create({ data: { teamId: team.id, name: r } });
      }
    }
  }

  // People
  const people = [
    { name: "Shea Harrell", teamType: TeamType.SALES, team: "Sales" },
    { name: "Nadeem Moustafa", teamType: TeamType.SALES, team: "Sales" },
    { name: "Tina Ho", teamType: TeamType.CS, team: "Customer Service" },
    { name: "Alex Kim", teamType: TeamType.CS, team: "Customer Service" },
  ];
  const personMap = new Map<string, string>();
  for (const p of people) {
    const existing = await prisma.person.findFirst({ where: { fullName: p.name, primaryAgencyId: agency.id } });
    let person = existing;
    if (!person) {
      person = await prisma.person.create({
        data: {
          fullName: p.name,
          teamType: p.teamType,
          primaryAgencyId: agency.id,
          teamId: teamMap.get(p.team),
        },
      });
    }
    personMap.set(p.name, person.id);
  }

  // Activity types (minimal set)
  const activityNames = ["Outbounds", "Inbounds", "Quotes", "FS Appointments Held", "IFRs", "Walk-ins", "Reviews"];
  const activityMap = new Map<string, string>();
  for (const n of activityNames) {
    let a = await prisma.activityType.findFirst({ where: { agencyId: agency.id, name: n } });
    if (!a) {
      a = await prisma.activityType.create({
        data: { agencyId: agency.id, name: n, inputMode: "COUNT", trackOnly: true },
      });
    }
    activityMap.set(n, a.id);
  }

  // Households
  const households = [
    { firstName: "Ann", lastName: "Ric", marketingSource: "Outbound" },
    { firstName: "Ben", lastName: "From", marketingSource: "Referral" },
    { firstName: "Nad", lastName: "Mou", marketingSource: "Inbound" },
  ];
  const hhMap = new Map<string, string>();
  for (const hh of households) {
    const existing = await prisma.household.findFirst({
      where: { agencyId: agency.id, firstName: hh.firstName, lastName: hh.lastName },
    });
    let household = existing;
    if (!household) {
      household = await prisma.household.create({
        data: { agencyId: agency.id, firstName: hh.firstName, lastName: hh.lastName, marketingSource: hh.marketingSource },
      });
    }
    hhMap.set(`${hh.firstName} ${hh.lastName}`, household.id);
  }

  // Sold products (spread across months)
  const now = new Date();
  const sampleSales = [
    { product: "Auto Raw New", person: "Shea Harrell", premium: 1800, status: PolicyStatus.PAID, monthsAgo: 1 },
    { product: "Auto Added", person: "Shea Harrell", premium: 900, status: PolicyStatus.ISSUED, monthsAgo: 2 },
    { product: "Homeowners", person: "Nadeem Moustafa", premium: 2200, status: PolicyStatus.PAID, monthsAgo: 3 },
    { product: "Term", person: "Nadeem Moustafa", premium: 1400, status: PolicyStatus.WRITTEN, monthsAgo: 4 },
    { product: "Short Term Disability", person: "Tina Ho", premium: 700, status: PolicyStatus.PAID, monthsAgo: 1 },
    { product: "Workers Comp", person: "Alex Kim", premium: 5200, status: PolicyStatus.ISSUED, monthsAgo: 2 },
    { product: "BOP", person: "Alex Kim", premium: 3100, status: PolicyStatus.WRITTEN, monthsAgo: 5 },
    { product: "PLUP", person: "Shea Harrell", premium: 480, status: PolicyStatus.PAID, monthsAgo: 0 },
  ];

  for (const sale of sampleSales) {
    const prod = productMap.get(sale.product);
    if (!prod) continue;
    const sellerId = personMap.get(sale.person);
    const householdId = Array.from(hhMap.values())[0];
    const dateSold = subMonths(now, sale.monthsAgo);
    const exists = await prisma.soldProduct.findFirst({
      where: { agencyId: agency.id, productId: prod.id, soldByPersonId: sellerId ?? undefined, dateSold: { gte: startOfMonth(dateSold) } },
    });
    if (!exists) {
      await prisma.soldProduct.create({
        data: {
          agencyId: agency.id,
          productId: prod.id,
          householdId: householdId,
          soldByPersonId: sellerId,
          soldByName: sale.person,
          dateSold,
          premium: sale.premium,
          status: sale.status,
        },
      });
    }
  }

  // Activity records
  const activitySamples = [
    { name: "Outbounds", person: "Shea Harrell", count: 80, monthsAgo: 0 },
    { name: "Outbounds", person: "Shea Harrell", count: 120, monthsAgo: 1 },
    { name: "Quotes", person: "Shea Harrell", count: 6, monthsAgo: 0 },
    { name: "Inbounds", person: "Tina Ho", count: 30, monthsAgo: 0 },
    { name: "IFRs", person: "Alex Kim", count: 4, monthsAgo: 1 },
    { name: "Walk-ins", person: "Alex Kim", count: 8, monthsAgo: 2 },
    { name: "FS Appointments Held", person: "Nadeem Moustafa", count: 3, monthsAgo: 0 },
    { name: "Reviews", person: "Tina Ho", count: 5, monthsAgo: 0 },
  ];

  for (const a of activitySamples) {
    const actId = activityMap.get(a.name);
    const personId = personMap.get(a.person);
    const date = subMonths(now, a.monthsAgo);
    if (!actId || !personId) continue;
    try {
      await prisma.activityRecord.create({
        data: {
          activityName: a.name,
          personId,
          personName: a.person,
          activityDate: date,
          count: a.count,
        },
      });
    } catch {
      // ignore duplicates in seed
    }
  }

  return { created: true, message: `${name} ready with faux data.` };
}

async function fetchReportData(): Promise<ReportsData> {
  const end = new Date();
  const start = startOfMonth(subMonths(end, 11));

  const soldProducts = await prisma.soldProduct.findMany({
    where: { dateSold: { gte: start }, status: { not: PolicyStatus.CANCELLED } },
    include: {
      product: { include: { lineOfBusiness: true } },
      agency: true,
      soldByPerson: true,
    },
  });

  const activities = await prisma.activityRecord.findMany({
    where: { activityDate: { gte: start } },
    include: { person: true },
  });

  const monthKey = (d: Date) => format(d, "yyyy-MM");
  const ensureSeries = <T extends Record<string, unknown>>(map: Map<string, T>, key: string, factory: () => T) => {
    let val = map.get(key);
    if (!val) {
      val = factory();
      map.set(key, val);
    }
    return val;
  };

  // Agency series
  const agencySeries = new Map<
    string,
    { id: string; name: string; monthly: { month: string; apps: number; premium: number }[] }
  >();
  for (const sp of soldProducts) {
    const month = monthKey(sp.dateSold);
    const agencyId = sp.agency?.id ?? "unknown";
    const agencyName = sp.agency?.name ?? "Unknown Agency";
    const series = ensureSeries(agencySeries, agencyId, () => ({ id: agencyId, name: agencyName, monthly: [] }));
    const entry = series.monthly.find((m) => m.month === month);
    if (entry) {
      entry.apps += 1;
      entry.premium += sp.premium;
    } else {
      series.monthly.push({ month, apps: 1, premium: sp.premium });
    }
  }

  // Lob breakdown
  const lobMap = new Map<string, { name: string; apps: number; premium: number }>();
  const prodTypeMap = new Map<string, { name: string; apps: number; premium: number }>();
  const productMap = new Map<string, { name: string; apps: number; premium: number; category: string; type: string }>();
  const personMap = new Map<string, { name: string; teamType?: TeamType | null; monthly: { month: string; apps: number; premium: number }[] }>();

  for (const sp of soldProducts) {
    const month = monthKey(sp.dateSold);
    const lobName = sp.product?.lineOfBusiness.name ?? "Unknown";
    const type = sp.product?.productType ?? ProductType.PERSONAL;
    const category = sp.product?.lineOfBusiness.premiumCategory ?? PremiumCategory.PC;
    const personName = sp.soldByPerson?.fullName ?? sp.soldByName ?? "Unassigned";

    const lob = ensureSeries(lobMap, lobName, () => ({ name: lobName, apps: 0, premium: 0 }));
    lob.apps += 1;
    lob.premium += sp.premium;

    const ptype = ensureSeries(prodTypeMap, type, () => ({ name: type, apps: 0, premium: 0 }));
    ptype.apps += 1;
    ptype.premium += sp.premium;

    const prod = ensureSeries(productMap, sp.product?.name ?? "Unknown", () => ({
      name: sp.product?.name ?? "Unknown",
      apps: 0,
      premium: 0,
      category,
      type,
    }));
    prod.apps += 1;
    prod.premium += sp.premium;

    const person = ensureSeries(personMap, personName, () => ({ name: personName, teamType: sp.soldByPerson?.teamType, monthly: [] }));
    const entry = person.monthly.find((m) => m.month === month);
    if (entry) {
      entry.apps += 1;
      entry.premium += sp.premium;
    } else {
      person.monthly.push({ month, apps: 1, premium: sp.premium });
    }
  }

  // Activities
  const activityMap = new Map<string, { name: string; total: number; monthly: { month: string; value: number }[] }>();
  for (const a of activities) {
    const month = monthKey(a.activityDate);
    const entry = ensureSeries(activityMap, a.activityName, () => ({ name: a.activityName, total: 0, monthly: [] }));
    entry.total += a.count;
    const monthEntry = entry.monthly.find((m) => m.month === month);
    if (monthEntry) monthEntry.value += a.count;
    else entry.monthly.push({ month, value: a.count });
  }

  // Simple WTD estimate: quotes + outbound/40 + apps (written) vs target
  const wtdMap: ReportsData["winTheDay"] = [];
  for (const [personName, p] of personMap.entries()) {
    const recentMonth = p.monthly.sort((a, b) => (a.month < b.month ? 1 : -1))[0];
    const outbounds = activityMap.get("Outbounds")?.monthly.find((m) => m.month === recentMonth?.month)?.value ?? 0;
    const quotes = activityMap.get("Quotes")?.monthly.find((m) => m.month === recentMonth?.month)?.value ?? 0;
    const apps = recentMonth?.apps ?? 0;
    const points = Math.round(quotes + outbounds / 40 + apps);
    const target = p.teamType === TeamType.CS ? 32 : 6;
    wtdMap.push({ person: personName, month: recentMonth?.month ?? "", points, target, win: points >= target });
  }

  return {
    timeframe: { start: start.toISOString(), end: end.toISOString(), today: new Date().toISOString() },
    agencies: Array.from(agencySeries.values()),
    lobBreakdown: Array.from(lobMap.values()),
    productTypeBreakdown: Array.from(prodTypeMap.values()),
    productBreakdown: Array.from(productMap.values()),
    personTrend: Array.from(personMap.values()),
    activitySummary: Array.from(activityMap.values()),
    winTheDay: wtdMap,
  };
}

export async function createSampleData() {
  "use server";
  await upsertAgencyWithData("Sample Legacy Agency", "Legacy");
  await upsertAgencyWithData("Sample MOA Agency", "MOA");
  revalidatePath("/reports");
}

export default async function ReportsIndex() {
  const data = await fetchReportData();
  const saved: Awaited<ReturnType<typeof prisma.reportPreset.findMany>> =
    (await (prisma as typeof prisma & { reportPreset?: typeof prisma["reportPreset"] }).reportPreset?.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
    })) || [];
  return (
    <AppShell
      title="Reports"
      subtitle="Production, activities, and Win The Day at a glance. Toggle metrics, timeframes, and agencies."
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/reports/builder" className="btn primary" style={{ textDecoration: "none" }}>
            Build a report
          </a>
          <a href="/reports/saved" className="btn" style={{ textDecoration: "none" }}>
            Saved reports
          </a>
        </div>
        <div style={{ color: "#475569", fontSize: 13, marginTop: -4 }}>
          LoB-first reporting. Click cards to preview. Open for full report.
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const titleMap = {
                  "Business Premium Focus": "Specific Product Growth",
                  "Seller Production": "Team Member Performance",
                  "Activity Report": "Activity & KPI Tracking"
                };
                const updateText = () => {
                  document.querySelectorAll("*").forEach((el) => {
                    if (el.children.length) return;
                    const txt = (el.textContent || "").trim();
                    if (!txt) return;
                    if (titleMap[txt]) {
                      el.textContent = titleMap[txt];
                    }
                    if (txt === "Win The Day Compliance") {
                      const parent = el.parentElement;
                      if (parent) {
                        const descEl = Array.from(parent.children).find((child) => child !== el && child.children.length === 0);
                        if (descEl) {
                          descEl.textContent = "Track wins + points for compliance.";
                        }
                      }
                    }
                  });
                };
                if (document.readyState === "loading") {
                  document.addEventListener("DOMContentLoaded", updateText, { once: true });
                } else {
                  updateText();
                }
              })();
            `,
          }}
        />
        <ReportsHubClient agencies={data.agencies.map((a) => ({ id: a.id, name: a.name }))} />

        <ReportsDashboard data={data} seedAction={createSampleData} />

        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Saved reports</div>
          {saved.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>No saved presets yet. Build one in the Report Builder.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
              {saved.map((p) => (
                <a
                  key={p.id}
                  href={`/reports/view/${p.id}`}
                  className="surface"
                  style={{ padding: 12, borderRadius: 12, textDecoration: "none", color: "inherit", border: "1px solid #e5e7eb" }}
                >
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>{p.description || "No description"}</div>
                  <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
                    Updated {p.updatedAt.toLocaleDateString()}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
