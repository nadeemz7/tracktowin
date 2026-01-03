import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { PolicyStatus, ProductType } from "@prisma/client";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import ProductTrendsClient from "./ProductTrendsClient";
import { RangePicker } from "../production/RangePicker";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function currentRange() {
  const now = new Date();
  return { start: startOfMonth(subMonths(now, 5)), end: endOfMonth(now) };
}

function rangeFromQuick(quick?: string) {
  const now = new Date();
  if (quick === "quarter") return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
  if (quick === "year") return { start: startOfMonth(new Date(now.getFullYear(), 0, 1)), end: endOfMonth(now) };
  return currentRange();
}

export default async function ProductTrendsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const metric = (sp.metric as "premium" | "apps") || "premium";
  const quick = sp.quickRange;
  const startParam = sp.start ? new Date(sp.start) : null;
  const endParam = sp.end ? new Date(sp.end) : null;
  const topN = sp.top ? Math.max(1, Number(sp.top)) : 8;
  const agencyIds = sp.agencies ? sp.agencies.split(",").filter(Boolean) : [];
  const productIds = (() => {
    if (Array.isArray(sp.products)) {
      return sp.products.flatMap((p) => p.split(",")).filter(Boolean);
    }
    if (typeof sp.products === "string") {
      return sp.products.split(",").filter(Boolean);
    }
    return [];
  })();
  const statusesParam = sp.statuses ? sp.statuses.split(",").filter(Boolean) : [];
  const statuses: PolicyStatus[] = statusesParam.length
    ? (statusesParam as PolicyStatus[])
    : [PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID];

  const agencies = await prisma.agency.findMany({ orderBy: { name: "asc" } });
  const allProducts = await prisma.product.findMany({
    include: { lineOfBusiness: true },
    orderBy: [{ lineOfBusiness: { name: "asc" } }, { name: "asc" }],
  });

  const productGroups = (() => {
    const map = new Map<string, { label: string; ids: string[]; lob: string }>();
    allProducts.forEach((p) => {
      const lob = p.lineOfBusiness?.name || "Unknown";
      const label = `${p.name} (${lob})`;
      if (!map.has(label)) map.set(label, { label, ids: [], lob });
      map.get(label)!.ids.push(p.id);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  })();
  const productGroupsByLob = productGroups.reduce<Record<string, typeof productGroups>>((acc, group) => {
    const lob = group.lob || "Unknown";
    if (!acc[lob]) acc[lob] = [];
    acc[lob].push(group);
    return acc;
  }, {});
  const lobNames = Object.keys(productGroupsByLob).sort((a, b) => a.localeCompare(b));
  const selectedLabels = productGroups.filter((g) => g.ids.some((id) => productIds.includes(id)));

  let range = rangeFromQuick(quick);
  if (startParam && endParam) range = { start: startParam, end: endParam };

  const sold = await prisma.soldProduct.findMany({
    where: {
      dateSold: { gte: range.start, lte: range.end },
      status: { in: statuses },
      ...(agencyIds.length ? { agencyId: { in: agencyIds } } : {}),
      ...(productIds.length ? { productId: { in: productIds } } : {}),
    },
    include: { product: { include: { lineOfBusiness: true } }, agency: true },
  });

  const monthLabels: string[] = [];
  const monthsBack = 6;
  for (let i = monthsBack - 1; i >= 0; i--) {
    const m = startOfMonth(subMonths(range.end, i));
    monthLabels.push(format(m, "yyyy-MM"));
  }

  const productSeries = new Map<
    string,
    { name: string; data: number[]; totalPremium: number; totalApps: number; category: string; type: ProductType | null }
  >();

  for (const spd of sold) {
    const key = `${spd.product?.name || "Unknown"} (${spd.product?.lineOfBusiness?.name || "Unknown"})`;
    if (!productSeries.has(key)) {
      productSeries.set(key, {
        name: key,
        data: Array(monthLabels.length).fill(0),
        totalPremium: 0,
        totalApps: 0,
        category: spd.product?.lineOfBusiness.name || "Unknown",
        type: spd.product?.productType || null,
      });
    }
    const serie = productSeries.get(key)!;
    const idx = monthLabels.indexOf(format(startOfMonth(spd.dateSold), "yyyy-MM"));
    if (idx === -1) continue;
    if (metric === "apps") serie.data[idx] += 1;
    else serie.data[idx] += spd.premium;
    serie.totalPremium += spd.premium;
    serie.totalApps += 1;
  }

  // top N by chosen metric
  const sorted = Array.from(productSeries.values()).sort((a, b) =>
    metric === "apps" ? b.totalApps - a.totalApps : b.totalPremium - a.totalPremium
  );
  const top = sorted.slice(0, topN);
  const other = sorted.slice(topN);
  if (other.length) {
    const o = {
      name: "Other",
      data: Array(monthLabels.length).fill(0),
      totalPremium: 0,
      totalApps: 0,
      category: "Other",
      type: null,
    };
    for (const s of other) {
      o.data = o.data.map((v, i) => v + s.data[i]);
      o.totalPremium += s.totalPremium;
      o.totalApps += s.totalApps;
    }
    top.push(o);
  }

  const series = top.map((t) => ({ name: t.name, data: t.data, total: metric === "apps" ? t.totalApps : t.totalPremium }));

  return (
    <AppShell title="Product Trends" subtitle="Top products over time with Premium/Apps toggle and top-N selection.">
      <form method="get" style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
            <a className="btn" href="/reports" style={{ textDecoration: "none" }}>
              ← Back to Reports
            </a>
            <span style={{ color: "#6b7280" }}>Range: {format(range.start, "MMM d, yyyy")} → {format(range.end, "MMM d, yyyy")}</span>
          </div>
          <button type="submit" className="btn" style={{ background: "#fff", borderColor: "#d1d5db", color: "#111827" }}>
            Apply
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <label style={{ display: "grid", gap: 4, minWidth: 140, fontSize: 13 }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Metric</span>
            <select name="metric" defaultValue={metric} className="select" style={{ minHeight: 34 }}>
              <option value="premium">Premium</option>
              <option value="apps">Apps</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 160, fontSize: 13 }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Quick range</span>
            <select name="quickRange" defaultValue={quick || ""} className="select" style={{ minHeight: 34 }}>
              <option value="">Last 6 months</option>
              <option value="quarter">Last 3 months</option>
              <option value="year">This year</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, width: 140, fontSize: 13 }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Top N</span>
            <input type="number" name="top" defaultValue={topN} className="input" min={1} style={{ minHeight: 34 }} />
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 220, fontSize: 13 }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Custom range</span>
            <RangePicker
              nameStart="start"
              nameEnd="end"
              initialStart={format(range.start, "yyyy-MM-dd")}
              initialEnd={format(range.end, "yyyy-MM-dd")}
            />
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 180, fontSize: 13 }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Statuses</span>
            <details style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "#fff" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Statuses ▾</summary>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {[PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID, PolicyStatus.STATUS_CHECK, PolicyStatus.CANCELLED].map((st) => (
                  <label key={st} style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 12 }}>
                    <input type="checkbox" name="statuses" value={st} defaultChecked={statuses.includes(st)} />
                    {st}
                  </label>
                ))}
              </div>
            </details>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 200, fontSize: 13 }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Agencies</span>
            <select name="agencies" multiple className="select" style={{ minHeight: 60, fontSize: 13 }}>
              {agencies.map((a) => (
                <option key={a.id} value={a.id} selected={agencyIds.includes(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 220, fontSize: 13 }}>
            <span style={{ fontWeight: 600, fontSize: 12 }}>Products</span>
            <details className="surface" style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "#fff" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span>Products ▾</span>
                <span style={{ fontSize: 12, color: "#475569", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selectedLabels.length ? selectedLabels.map((g) => g.label).join(", ") : "Top products"}
                </span>
              </summary>
              <div style={{ maxHeight: 220, overflow: "auto", marginTop: 8, display: "grid", gap: 10 }}>
                {lobNames.map((lob) => (
                  <div key={lob} style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1f2937" }}>{lob}</div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {productGroupsByLob[lob].map((group) => {
                        const checked = group.ids.some((id) => productIds.includes(id));
                        return (
                          <div key={group.label} style={{ display: "grid", gap: 4 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                              <input type="checkbox" name="products" value={group.ids.join(",")} defaultChecked={checked} />
                              <span style={{ fontWeight: 600 }}>{group.label}</span>
                              <span style={{ fontSize: 12, color: "#475569" }}>({group.ids.length})</span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </label>
        </div>
      </form>

      <ProductTrendsClient metric={metric} labels={monthLabels} series={series} />
    </AppShell>
  );
}
