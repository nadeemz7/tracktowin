import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PolicyStatus, PremiumCategory, ProductType } from "@prisma/client";
import { eachWeekOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";

type Granularity = "month" | "week";

function parseDate(value: string | null, fallback?: Date): Date | undefined {
  if (!value) return fallback;
  const d = new Date(value);
  return isNaN(d.getTime()) ? fallback : d;
}

function humanRange(start: Date, end: Date) {
  return `${format(start, "MMM d, yyyy")} → ${format(end, "MMM d, yyyy")}`;
}

function buildLabels(start?: Date, end?: Date, granularity: Granularity = "month") {
  if (!start || !end) return [];
  if (granularity === "week") {
    return eachWeekOfInterval(
      { start: startOfWeek(start), end: endOfWeek(end) },
      { weekStartsOn: 0 }
    ).map((d) => format(d, "yyyy-MM-dd"));
  }
  const labels: string[] = [];
  let cursor = startOfMonth(start);
  while (cursor <= end) {
    labels.push(format(cursor, "yyyy-MM"));
    cursor = startOfMonth(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  }
  return labels;
}

function bucketKey(date: Date, granularity: Granularity) {
  return granularity === "week" ? format(startOfWeek(date), "yyyy-MM-dd") : format(startOfMonth(date), "yyyy-MM");
}

const LOB_ORDER = ["Auto", "Fire", "Life", "Health", "IPS"] as const;
const TOP_PRODUCTS_DEFAULT = 8;

function canonicalLobName(name?: string | null) {
  const raw = (name || "Unknown").trim();
  const lower = raw.toLowerCase();
  if (lower.includes("auto")) return "Auto";
  if (lower.includes("fire")) return "Fire";
  if (lower.includes("life")) return "Life";
  if (lower.includes("health")) return "Health";
  if (lower.includes("ips")) return "IPS";
  return raw || "Unknown";
}

function lobCategory(lobName: string, fallback?: PremiumCategory | null) {
  const lower = lobName.toLowerCase();
  if (lower.includes("auto") || lower.includes("fire")) return PremiumCategory.PC;
  if (lower.includes("life") || lower.includes("health")) return PremiumCategory.FS;
  if (lower.includes("ips")) return PremiumCategory.IPS;
  return fallback || PremiumCategory.IPS;
}

function pickTopProductIds(
  sold: Awaited<ReturnType<typeof prisma.soldProduct.findMany>>,
  metric: "apps" | "premium",
  topN: number = TOP_PRODUCTS_DEFAULT
) {
  const totals = new Map<string, { apps: number; premium: number }>();
  for (const s of sold) {
    if (!s.productId) continue;
    const entry = totals.get(s.productId) || { apps: 0, premium: 0 };
    entry.apps += 1;
    entry.premium += s.premium;
    totals.set(s.productId, entry);
  }
  return Array.from(totals.entries())
    .sort((a, b) => (metric === "apps" ? b[1].apps - a[1].apps : b[1].premium - a[1].premium))
    .slice(0, topN)
    .map(([id]) => id);
}

function calcSeries(
  sold: Awaited<ReturnType<typeof prisma.soldProduct.findMany>>,
  metric: "apps" | "premium",
  labels: string[],
  dimension: "agency" | "product" | "lob",
  granularity: Granularity
) {
  const seriesMap = new Map<string, number[]>();

  const getKey = (s: (typeof sold)[number]) => {
    if (dimension === "agency") return s.agency?.name || "Unknown agency";
    if (dimension === "product") return s.product?.name || "Unknown product";
    return s.product?.lineOfBusiness.name || "Unknown LoB";
  };

  for (const s of sold) {
    const key = getKey(s);
    if (!seriesMap.has(key)) {
      seriesMap.set(key, Array(labels.length).fill(0));
    }
    const idx = labels.indexOf(bucketKey(s.dateSold, granularity));
    if (idx === -1) continue;
    const arr = seriesMap.get(key)!;
    arr[idx] += metric === "apps" ? 1 : s.premium;
  }

  return Array.from(seriesMap.entries()).map(([name, data]) => ({ name, data }));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const metric = (searchParams.get("metric") as "apps" | "premium") || "premium";
  const start = parseDate(searchParams.get("start") || null);
  const end = parseDate(searchParams.get("end") || null);
  const statusParam = searchParams.get("statuses");
  const agencyParam = searchParams.get("agencies");
  const productParam = searchParams.get("products");
  const businessOnly = searchParams.get("businessOnly") === "1";
  const mustBeIssued = searchParams.get("mustBeIssued") === "1";
  const topParam = Number(searchParams.get("top"));
  const topN = Number.isFinite(topParam) && topParam > 0 ? Math.floor(topParam) : TOP_PRODUCTS_DEFAULT;

  const statuses: PolicyStatus[] = statusParam
    ? (statusParam.split(",").filter(Boolean) as PolicyStatus[])
    : [PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID];

  const statusFilter = mustBeIssued
    ? [PolicyStatus.ISSUED, PolicyStatus.PAID]
    : statuses.length
    ? statuses
    : [PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID];

  const agencyIds = agencyParam ? agencyParam.split(",").filter(Boolean) : [];
  const productIds = productParam ? productParam.split(",").filter(Boolean) : [];

  const dateFilter =
    start && end ? { gte: start, lte: end } : start ? { gte: start } : end ? { lte: end } : undefined;

  let sold = await prisma.soldProduct.findMany({
    where: {
      ...(dateFilter ? { dateSold: dateFilter } : {}),
      status: { in: statusFilter },
      ...(agencyIds.length ? { agencyId: { in: agencyIds } } : {}),
      ...(productIds.length ? { productId: { in: productIds } } : {}),
      ...(businessOnly
        ? {
            product: {
              productType: ProductType.BUSINESS,
            },
          }
        : {}),
    },
    include: { product: { include: { lineOfBusiness: true } }, soldByPerson: true, agency: true },
  });
  let appliedTopProductIds: string[] = [];
  if (productIds.length === 0) {
    appliedTopProductIds = pickTopProductIds(sold, metric, topN);
    if (appliedTopProductIds.length) {
      sold = sold.filter((s) => s.productId && appliedTopProductIds.includes(s.productId));
    }
  }

  const lobNames = Array.from(
    new Set(sold.map((s) => s.product?.lineOfBusiness.name || "Unknown"))
  ).sort();

  const personsMap = new Map<
    string,
    { name: string; lobCounts: Map<string, { apps: number; premium: number }>; totalApps: number; totalPremium: number }
  >();

  let totalApps = 0;
  let totalPremium = 0;
  let businessApps = 0;
  let businessPremium = 0;

  for (const s of sold) {
    const name = s.soldByPerson?.fullName || s.soldByName || "Unassigned";
    if (!personsMap.has(name)) {
      personsMap.set(name, { name, lobCounts: new Map(), totalApps: 0, totalPremium: 0 });
    }
    const row = personsMap.get(name)!;
    const lob = s.product?.lineOfBusiness.name || "Unknown";
    const cell = row.lobCounts.get(lob) || { apps: 0, premium: 0 };
    cell.apps += 1;
    cell.premium += s.premium;
    row.lobCounts.set(lob, cell);
    row.totalApps += 1;
    row.totalPremium += s.premium;
    totalApps += 1;
    totalPremium += s.premium;
    if (s.product?.productType === ProductType.BUSINESS) {
      businessApps += 1;
      businessPremium += s.premium;
    }
  }

  const persons = Array.from(personsMap.values()).map((row) => ({
    name: row.name,
    totalApps: row.totalApps,
    totalPremium: row.totalPremium,
    lobCounts: Object.fromEntries(Array.from(row.lobCounts.entries())),
  }));

  const dateVals = sold.map((s) => s.dateSold.getTime());
  const minDate = dateVals.length ? new Date(Math.min(...dateVals)) : startOfMonth(new Date());
  const maxDate = dateVals.length ? new Date(Math.max(...dateVals)) : endOfMonth(new Date());
  const labelStart = start || startOfMonth(minDate);
  const labelEnd = end || endOfMonth(maxDate);

  const monthLabels: string[] = buildLabels(labelStart, labelEnd);
  const monthLabelIndex = new Map(monthLabels.map((l, i) => [l, i]));
  const monthSeries = new Map<string, number[]>();

  for (const lob of lobNames) {
    monthSeries.set(lob, Array(monthLabels.length).fill(0));
  }

  const trendByAgencyCategoryMap = new Map<
    string,
    {
      agencyId: string;
      agencyName: string;
      category: PremiumCategory;
      apps: number[];
      premium: number[];
    }
  >();

  for (const s of sold) {
    const key = format(startOfMonth(s.dateSold), "yyyy-MM");
    const idx = monthLabelIndex.get(key);
    if (idx === undefined) continue;
    const lob = canonicalLobName(s.product?.lineOfBusiness.name);
    const arr = monthSeries.get(lob);
    if (!arr) continue;
    arr[idx] += metric === "apps" ? 1 : s.premium;

    const agencyId = s.agencyId;
    const category = s.product?.lineOfBusiness.premiumCategory;
    if (agencyId && category) {
      const seriesKey = `${agencyId}-${category}`;
      if (!trendByAgencyCategoryMap.has(seriesKey)) {
        trendByAgencyCategoryMap.set(seriesKey, {
          agencyId,
          agencyName: s.agency?.name || "Unknown agency",
          category,
          apps: Array(monthLabels.length).fill(0),
          premium: Array(monthLabels.length).fill(0),
        });
      }
      const row = trendByAgencyCategoryMap.get(seriesKey)!;
      row.apps[idx] += 1;
      row.premium[idx] += s.premium;
    }
  }

  const lobTotals = lobNames.map((lob) => {
    const apps = persons.reduce((acc, r) => acc + ((r.lobCounts[lob]?.apps) || 0), 0);
    const premium = persons.reduce((acc, r) => acc + ((r.lobCounts[lob]?.premium) || 0), 0);
    return { name: lob, apps, premium };
  });
  const agencyOrder = new Map(agencyIds.map((id, idx) => [id, idx]));
  const categoryOrder = new Map<PremiumCategory, number>([
    [PremiumCategory.PC, 0],
    [PremiumCategory.FS, 1],
    [PremiumCategory.IPS, 2],
  ]);

  const agencyNameMap = new Map<string, string>();
  for (const s of sold) {
    if (s.agencyId) agencyNameMap.set(s.agencyId, s.agency?.name || "Unknown agency");
  }
  const agencyList =
    agencyIds.length > 0
      ? agencyIds.map((id) => ({ id, name: agencyNameMap.get(id) || "Unknown agency" }))
      : Array.from(agencyNameMap.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name));

  const lobSet = new Set<string>();
  sold.forEach((s) => {
    lobSet.add(canonicalLobName(s.product?.lineOfBusiness?.name));
  });
  const lobNamesOrdered = Array.from(lobSet).sort((a, b) => {
    const rank = (lob: string) => {
      const idx = LOB_ORDER.indexOf(lob as (typeof LOB_ORDER)[number]);
      return idx === -1 ? LOB_ORDER.length : idx;
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });

  const lobCardsByLobMap = new Map<
    string,
    {
      premiumCategory: PremiumCategory;
      totalsAll: { apps: number; premium: number };
      totalsByAgency: Map<
        string,
        {
          agencyId: string;
          agencyName: string;
          apps: number;
          premium: number;
          sellers: Map<string, { apps: number; premium: number }>;
        }
      >;
      trend: { apps: number[]; premium: number[] };
    }
  >();

  for (const name of lobNamesOrdered) {
    lobCardsByLobMap.set(name, {
      premiumCategory: lobCategory(name, null),
      totalsAll: { apps: 0, premium: 0 },
      totalsByAgency: new Map(),
      trend: { apps: Array(monthLabels.length).fill(0), premium: Array(monthLabels.length).fill(0) },
    });
  }

  for (const s of sold) {
    const lobName = canonicalLobName(s.product?.lineOfBusiness?.name);
    const card = lobCardsByLobMap.get(lobName);
    if (!card) continue;
    const agencyId = s.agencyId || "unknown";
    const agencyName = s.agency?.name || "Unknown agency";
    if (!card.totalsByAgency.has(agencyId)) {
      card.totalsByAgency.set(agencyId, {
        agencyId,
        agencyName,
        apps: 0,
        premium: 0,
        sellers: new Map(),
      });
    }
    const agencyEntry = card.totalsByAgency.get(agencyId)!;
    agencyEntry.apps += 1;
    agencyEntry.premium += s.premium;
    card.totalsAll.apps += 1;
    card.totalsAll.premium += s.premium;

    const sellerName = s.soldByPerson?.fullName || s.soldByName || "Unassigned";
    const seller = agencyEntry.sellers.get(sellerName) || { apps: 0, premium: 0 };
    seller.apps += 1;
    seller.premium += s.premium;
    agencyEntry.sellers.set(sellerName, seller);

    const idx = monthLabelIndex.get(format(startOfMonth(s.dateSold), "yyyy-MM"));
    if (idx !== undefined) {
      card.trend.apps[idx] += 1;
      card.trend.premium[idx] += s.premium;
    }
  }

  const lobCardsByLob = lobNamesOrdered.map((lobName) => {
    const data = lobCardsByLobMap.get(lobName)!;
    const totalsByAgency = agencyList.map((a) => {
      const entry =
        data.totalsByAgency.get(a.id) || { agencyId: a.id, agencyName: a.name, apps: 0, premium: 0, sellers: new Map() };
      const sellersArr = Array.from(entry.sellers.entries()).map(([personName, stats]) => ({
        personName,
        apps: stats.apps,
        premium: stats.premium,
      }));
      const topSellers = sellersArr
        .sort((x, y) => (metric === "apps" ? y.apps - x.apps : y.premium - x.premium))
        .slice(0, 4);
      const topTotals = topSellers.reduce(
        (acc, s) => {
          acc.apps += s.apps;
          acc.premium += s.premium;
          return acc;
        },
        { apps: 0, premium: 0 }
      );
      const allOthers = {
        apps: entry.apps - topTotals.apps,
        premium: entry.premium - topTotals.premium,
      };
      return {
        agencyId: entry.agencyId,
        agencyName: entry.agencyName,
        apps: entry.apps,
        premium: entry.premium,
        topSellers,
        allOthers,
      };
    });
    return {
      lobName,
      premiumCategory: data.premiumCategory as any,
      totalsByAgency,
      totalsAllAgencies: data.totalsAll,
    };
  });

  const lobTrend: Record<string, { apps: number[]; premium: number[] }> = {};
  for (const [lobName, data] of lobCardsByLobMap.entries()) {
    lobTrend[lobName] = { apps: data.trend.apps, premium: data.trend.premium };
  }

  return NextResponse.json({
    meta: {
      rangeLabel: start && end ? humanRange(start, end) : "All time",
      statuses: statusFilter,
      topProductsApplied: productIds.length === 0 && appliedTopProductIds.length > 0,
      topProductIds: appliedTopProductIds,
      topN,
    },
    lobNames,
    persons,
    totals: { totalApps, totalPremium, businessApps, businessPremium },
    monthLabels,
    series: Array.from(monthSeries.entries()).map(([name, data]) => ({ name, data })),
    lobTotals,
    lobCards: {
      lobNames: lobNamesOrdered,
      agencies: agencyList,
      byLob: lobCardsByLob,
      monthLabels,
      lobTrend,
    },
    trendByAgencyCategory: {
      labels: monthLabels,
      series: Array.from(trendByAgencyCategoryMap.values())
        .sort((a, b) => {
          const aOrder = agencyOrder.get(a.agencyId);
          const bOrder = agencyOrder.get(b.agencyId);
          if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) return aOrder - bOrder;
          if (aOrder !== undefined && bOrder === undefined) return -1;
          if (aOrder === undefined && bOrder !== undefined) return 1;
          const agencyCompare = a.agencyName.localeCompare(b.agencyName);
          if (agencyCompare !== 0) return agencyCompare;
          const aCat = categoryOrder.get(a.category) ?? 0;
          const bCat = categoryOrder.get(b.category) ?? 0;
          return aCat - bCat;
        })
        .map((s) => ({
          ...s,
          category: s.category as string,
        })),
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const metric: "apps" | "premium" = body.metric === "apps" ? "apps" : "premium";
  const start = parseDate(body.start || null);
  const end = parseDate(body.end || null);
  const granularity: Granularity = body.granularity === "week" ? "week" : "month";
  const statuses: PolicyStatus[] =
    body.statuses && Array.isArray(body.statuses) && body.statuses.length
      ? (body.statuses as PolicyStatus[])
      : [PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID];
  const mustBeIssued = body.mustBeIssued === true;
  const statusFilter = mustBeIssued
    ? [PolicyStatus.ISSUED, PolicyStatus.PAID]
    : statuses.length
    ? statuses
    : [PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID];

  const agencyIds: string[] = Array.isArray(body.agencyIds) ? body.agencyIds.filter(Boolean) : [];
  const productIds: string[] = Array.isArray(body.productIds) ? body.productIds.filter(Boolean) : [];
  const businessOnly = body.businessOnly === true;
  const dimension: "agency" | "product" | "lob" =
    body.dimension === "agency" || body.dimension === "product" ? body.dimension : "lob";
  const agencyOrder = new Map(agencyIds.map((id, idx) => [id, idx]));
  const topN = Number.isFinite(body.topN) && body.topN > 0 ? Math.floor(body.topN) : TOP_PRODUCTS_DEFAULT;

  const dateFilter =
    start && end ? { gte: start, lte: end } : start ? { gte: start } : end ? { lte: end } : undefined;

  let sold = await prisma.soldProduct.findMany({
    where: {
      ...(dateFilter ? { dateSold: dateFilter } : {}),
      status: { in: statusFilter },
      ...(agencyIds.length ? { agencyId: { in: agencyIds } } : {}),
      ...(productIds.length ? { productId: { in: productIds } } : {}),
      ...(businessOnly
        ? {
            product: {
              productType: ProductType.BUSINESS,
            },
          }
        : {}),
    },
    include: { product: { include: { lineOfBusiness: true } }, soldByPerson: true, agency: true },
  });
  let appliedTopProductIds: string[] = [];
  if (productIds.length === 0) {
    appliedTopProductIds = pickTopProductIds(sold, metric, topN);
    if (appliedTopProductIds.length) {
      sold = sold.filter((s) => s.productId && appliedTopProductIds.includes(s.productId));
    }
  }

  const dateVals = sold.map((s) => s.dateSold.getTime());
  const minDate = dateVals.length ? new Date(Math.min(...dateVals)) : startOfMonth(new Date());
  const maxDate = dateVals.length ? new Date(Math.max(...dateVals)) : endOfMonth(new Date());
  const labelStart = start || (granularity === "week" ? startOfWeek(minDate) : startOfMonth(minDate));
  const labelEnd = end || (granularity === "week" ? endOfWeek(maxDate) : endOfMonth(maxDate));

  const labels = buildLabels(labelStart, labelEnd, granularity);
  const labelIndex = new Map(labels.map((l, i) => [l, i]));
  const series = calcSeries(sold, metric, labels, dimension, granularity);

  const totals = sold.reduce(
    (acc, s) => {
      acc.apps += 1;
      acc.premium += s.premium;
      if (s.product?.productType === ProductType.BUSINESS) {
        acc.businessPremium += s.premium;
      }
      return acc;
    },
    { premium: 0, apps: 0, businessPremium: 0 }
  );

  // Build per-agency per-category trend so client can plot 6 lines (per agency x PC/FS/IPS)
  const trendByAgencyCategoryMap = new Map<
    string,
    {
      agencyId: string;
      agencyName: string;
      category: PremiumCategory;
      apps: number[];
      premium: number[];
    }
  >();

  for (const s of sold) {
    const agencyId = s.agencyId;
    const category = s.product?.lineOfBusiness.premiumCategory;
    if (!agencyId || !category) continue;
    const idx = labelIndex.get(bucketKey(s.dateSold, granularity));
    if (idx === undefined) continue;
    const key = `${agencyId}-${category}`;
    if (!trendByAgencyCategoryMap.has(key)) {
      trendByAgencyCategoryMap.set(key, {
        agencyId,
        agencyName: s.agency?.name || "Unknown agency",
        category,
        apps: Array(labels.length).fill(0),
        premium: Array(labels.length).fill(0),
      });
    }
    const row = trendByAgencyCategoryMap.get(key)!;
    row.apps[idx] += 1;
    row.premium[idx] += s.premium;
  }

  const lobNameSet = new Set<string>();
  const agencyNameMap = new Map<string, string>();
  for (const s of sold) {
    const lobName = canonicalLobName(s.product?.lineOfBusiness?.name);
    lobNameSet.add(lobName);
    if (s.agencyId) {
      agencyNameMap.set(s.agencyId, s.agency?.name || "Unknown agency");
    }
  }

  const lobByAgencyNames = LOB_ORDER.filter((lob) => lobNameSet.has(lob));

  const lobNames = Array.from(lobNameSet).sort((a, b) => {
    const rank = (lob: string) => {
      const idx = LOB_ORDER.indexOf(lob as (typeof LOB_ORDER)[number]);
      return idx === -1 ? LOB_ORDER.length : idx;
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });

  const zero = () => Array(lobNames.length).fill(0);
  const zeroLobByAgency = () => Array(lobByAgencyNames.length).fill(0);
  const agencySelection =
    agencyIds.length > 0
      ? agencyIds.map((id) => ({ id, name: agencyNameMap.get(id) ?? "Unknown agency" }))
      : Array.from(agencyNameMap.entries())
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name));

  const lobByAgencyMap = new Map<
    string,
    { agencyId: string; agencyName: string; apps: number[]; premium: number[] }
  >();

  for (const agency of agencySelection) {
    lobByAgencyMap.set(agency.id, {
      agencyId: agency.id,
      agencyName: agency.name,
      apps: zeroLobByAgency(),
      premium: zeroLobByAgency(),
    });
  }

  for (const s of sold) {
    const agencyId = s.agencyId || "unknown";
    const agencyName = s.agency?.name || "Unknown agency";
    if (!lobByAgencyMap.has(agencyId)) {
      lobByAgencyMap.set(agencyId, { agencyId, agencyName, apps: zeroLobByAgency(), premium: zeroLobByAgency() });
    }
    const lobName = canonicalLobName(s.product?.lineOfBusiness?.name);
    const lobIdx = lobByAgencyNames.indexOf(lobName);
    if (lobIdx === -1) continue;
    const entry = lobByAgencyMap.get(agencyId)!;
    entry.apps[lobIdx] += 1;
    entry.premium[lobIdx] += s.premium;
  }

  const lobByAgencySeries = [
    ...agencySelection.map((a) => lobByAgencyMap.get(a.id) || { agencyId: a.id, agencyName: a.name, apps: zero(), premium: zero() }),
    ...Array.from(lobByAgencyMap.values()).filter((row) => !agencySelection.find((a) => a.id === row.agencyId)),
  ];

  const lobCardsByLobMap = new Map<
    string,
    {
      premiumCategory: PremiumCategory;
      totalsAll: { apps: number; premium: number };
      totalsByAgency: Map<
        string,
        {
          agencyId: string;
          agencyName: string;
          apps: number;
          premium: number;
          sellers: Map<string, { apps: number; premium: number }>;
        }
      >;
      trend: { apps: number[]; premium: number[] };
    }
  >();

  for (const name of lobNames) {
    lobCardsByLobMap.set(name, {
      premiumCategory: lobCategory(name, null),
      totalsAll: { apps: 0, premium: 0 },
      totalsByAgency: new Map(),
      trend: { apps: Array(labels.length).fill(0), premium: Array(labels.length).fill(0) },
    });
  }

  for (const s of sold) {
    const lobName = canonicalLobName(s.product?.lineOfBusiness?.name);
    const card = lobCardsByLobMap.get(lobName);
    if (!card) continue;
    const agencyId = s.agencyId || "unknown";
    const agencyName = s.agency?.name || "Unknown agency";
    if (!card.totalsByAgency.has(agencyId)) {
      card.totalsByAgency.set(agencyId, {
        agencyId,
        agencyName,
        apps: 0,
        premium: 0,
        sellers: new Map(),
      });
    }
    const agencyEntry = card.totalsByAgency.get(agencyId)!;
    agencyEntry.apps += 1;
    agencyEntry.premium += s.premium;
    card.totalsAll.apps += 1;
    card.totalsAll.premium += s.premium;

    const sellerName = s.soldByPerson?.fullName || s.soldByName || "Unassigned";
    const seller = agencyEntry.sellers.get(sellerName) || { apps: 0, premium: 0 };
    seller.apps += 1;
    seller.premium += s.premium;
    agencyEntry.sellers.set(sellerName, seller);

    const idx = labelIndex.get(bucketKey(s.dateSold, granularity));
    if (idx !== undefined) {
      card.trend.apps[idx] += 1;
      card.trend.premium[idx] += s.premium;
    }
  }

  const lobCardsByLob = lobNames.map((lobName) => {
    const data = lobCardsByLobMap.get(lobName)!;
    const totalsByAgency = agencySelection.map((a) => {
      const entry =
        data.totalsByAgency.get(a.id) || { agencyId: a.id, agencyName: a.name, apps: 0, premium: 0, sellers: new Map() };
      const sellersArr = Array.from(entry.sellers.entries()).map(([personName, stats]) => ({
        personName,
        apps: stats.apps,
        premium: stats.premium,
      }));
      const topSellers = sellersArr
        .sort((x, y) => (metric === "apps" ? y.apps - x.apps : y.premium - x.premium))
        .slice(0, 4);
      const topTotals = topSellers.reduce(
        (acc, s) => {
          acc.apps += s.apps;
          acc.premium += s.premium;
          return acc;
        },
        { apps: 0, premium: 0 }
      );
      const allOthers = {
        apps: entry.apps - topTotals.apps,
        premium: entry.premium - topTotals.premium,
      };
      return {
        agencyId: entry.agencyId,
        agencyName: entry.agencyName,
        apps: entry.apps,
        premium: entry.premium,
        topSellers,
        allOthers,
      };
    });
    return {
      lobName,
      premiumCategory: data.premiumCategory as any,
      totalsByAgency,
      totalsAllAgencies: data.totalsAll,
    };
  });

  const lobTrend: Record<string, { apps: number[]; premium: number[] }> = {};
  for (const [lobName, data] of lobCardsByLobMap.entries()) {
    lobTrend[lobName] = { apps: data.trend.apps, premium: data.trend.premium };
  }

  const trendSeries = Array.from(trendByAgencyCategoryMap.values()).sort((a, b) => {
    const agencyCompare = a.agencyName.localeCompare(b.agencyName);
    if (agencyCompare !== 0) return agencyCompare;
    return a.category.localeCompare(b.category);
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("[production api] trendByAgencyCategory", {
      agencyIds,
      range: { start: labelStart?.toISOString(), end: labelEnd?.toISOString() },
      statuses: statusFilter,
      seriesCount: trendSeries.length,
      labelsSample: labels.slice(0, 3),
    });
  }

  return NextResponse.json({
    labels,
    series,
    totals,
    statuses: statusFilter,
    topProductsApplied: productIds.length === 0 && appliedTopProductIds.length > 0,
    topProductIds: appliedTopProductIds,
    lobCards: {
      lobNames,
      agencies: agencySelection,
      byLob: lobCardsByLob,
      monthLabels: labels,
      lobTrend,
    },
    lobByAgency: { lobNames: lobByAgencyNames, series: lobByAgencySeries },
    trendByAgencyCategory: {
      labels,
      series: trendSeries.map((s) => ({
        ...s,
        category: s.category as string,
      })),
    },
    meta: {
      topProductsApplied: productIds.length === 0 && appliedTopProductIds.length > 0,
      topProductIds: appliedTopProductIds,
      topN,
    },
  });
}
