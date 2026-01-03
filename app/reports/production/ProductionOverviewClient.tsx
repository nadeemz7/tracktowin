"use client";

import { useMemo, useState } from "react";
import { Chart } from "@/components/Chart";
import { SmallFilters } from "./SmallFilters";

type PremiumCategory = "PC" | "FS" | "IPS";

type ProductionResponse = {
  meta: { rangeLabel: string; statuses: string[]; topProductsApplied?: boolean; topProductIds?: string[]; topN?: number };
  lobNames: string[];
  persons: {
    name: string;
    totalApps: number;
    totalPremium: number;
    lobCounts: Record<string, { apps: number; premium: number }>;
  }[];
  totals: { totalApps: number; totalPremium: number; businessApps: number; businessPremium: number };
  monthLabels: string[];
  series: { name: string; data: number[] }[];
  lobTotals: { name: string; apps: number; premium: number }[];
  trendByAgencyCategory?: {
    labels: string[];
    series: {
      agencyId: string;
      agencyName: string;
      category: "PC" | "FS" | "IPS";
      apps: number[];
      premium: number[];
    }[];
  };
};

type Props = {
  metric: "premium" | "apps";
  data: ProductionResponse;
  agencyFilter: string[];
  productFilter: string[];
  selectedAgencyIds: string[];
};

const MODULES = [
  { id: "kpi", label: "KPIs" },
  { id: "table", label: "Team vs LoB table" },
  { id: "lobmix", label: "LoB mix bar" },
  { id: "trend", label: "Trend line" },
  { id: "agencytrend", label: "Agency-category trend" },
  { id: "drill", label: "Drilldown" },
  { id: "spotlight", label: "LoB spotlight" },
  { id: "topsellers", label: "Top sellers by LoB" },
  { id: "momentum", label: "LoB momentum" },
] as const;

const CATEGORY_ORDER: PremiumCategory[] = ["PC", "FS", "IPS"];
const CATEGORY_LABELS: Record<PremiumCategory, string> = {
  PC: "P&C",
  FS: "FS",
  IPS: "IPS",
};
const AGENCY_CATEGORY_COLORS: Record<PremiumCategory, string>[] = [
  { PC: "#1D4ED8", FS: "#93C5FD", IPS: "#3B82F6" },
  { PC: "#C2410C", FS: "#FDBA74", IPS: "#F97316" },
];

export default function ProductionOverviewClient({ metric, data, agencyFilter, productFilter, selectedAgencyIds }: Props) {
  const [visible, setVisible] = useState<Record<string, boolean>>({
    kpi: true,
    table: true,
    lobmix: true,
    trend: true,
    agencytrend: true,
    drill: true,
    spotlight: true,
    topsellers: true,
    momentum: true,
  });

  const [drill, setDrill] = useState<{ lob?: string; month?: string; value?: number } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<Record<PremiumCategory, boolean>>({
    PC: true,
    FS: true,
    IPS: true,
  });

  const toggle = (id: string) => setVisible((v) => ({ ...v, [id]: !v[id] }));
  const toggleCategory = (cat: PremiumCategory) =>
    setCategoryFilter((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const visibleSeries = useMemo(() => data.series.filter((s) => s.data.some((d) => d !== 0)), [data.series]);
  const agencyCategorySeries = useMemo(() => {
    if (!data.trendByAgencyCategory?.series?.length) {
      return { labels: [] as string[], series: [] as any[] };
    }

    const labels = data.trendByAgencyCategory.labels || [];
    const rawSeries = data.trendByAgencyCategory.series
      .filter((s) => !selectedAgencyIds.length || selectedAgencyIds.includes(s.agencyId))
      .map((s) => ({
        ...s,
        category: (s.category as PremiumCategory) || "PC",
      }));
    const agencyNameById = new Map(rawSeries.map((s) => [s.agencyId, s.agencyName]));
    const order = selectedAgencyIds.length
      ? new Map(selectedAgencyIds.map((id, idx) => [id, idx]))
      : rawSeries.reduce((map, s) => {
          if (!map.has(s.agencyId)) map.set(s.agencyId, map.size);
          return map;
        }, new Map<string, number>());

    const agencyIdsInOrder = Array.from(order.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id)
      .filter(Boolean);
    const seenAgencyIds = new Set(agencyIdsInOrder);
    if (!selectedAgencyIds.length) {
      rawSeries.forEach((s) => {
        if (!seenAgencyIds.has(s.agencyId)) {
          agencyIdsInOrder.push(s.agencyId);
          seenAgencyIds.add(s.agencyId);
        }
      });
    }

    const rawKeyed = new Map(rawSeries.map((s) => [`${s.agencyId}-${s.category}`, s]));

    const pickColor = (agencyId: string, category: PremiumCategory) => {
      const agencyIdx = order.get(agencyId) ?? agencyIdsInOrder.indexOf(agencyId);
      const palette = AGENCY_CATEGORY_COLORS[(agencyIdx >= 0 ? agencyIdx : 0) % AGENCY_CATEGORY_COLORS.length] || AGENCY_CATEGORY_COLORS[0];
      return palette[category];
    };

    const mapped: any[] = [];
    for (const agencyId of agencyIdsInOrder) {
      const agencyName = agencyNameById.get(agencyId) || agencyId;
      for (const cat of CATEGORY_ORDER) {
        if (!categoryFilter[cat]) continue;
        const existing = rawKeyed.get(`${agencyId}-${cat}`);
        const apps = existing?.apps || Array(labels.length).fill(0);
        const premium = existing?.premium || Array(labels.length).fill(0);
        mapped.push({
          name: `${agencyName} — ${CATEGORY_LABELS[cat]}`,
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3 },
          itemStyle: { color: pickColor(agencyId, cat) },
          data: labels.map((_, idx) => {
            const appsVal = apps[idx] ?? 0;
            const premiumVal = premium[idx] ?? 0;
            return {
              value: metric === "apps" ? appsVal : premiumVal,
              apps: appsVal,
              premium: premiumVal,
            };
          }),
        });
      }
    }

    return { labels, series: mapped };
  }, [data.trendByAgencyCategory, categoryFilter, metric, selectedAgencyIds]);

  const agencyTrendChartKey = useMemo(
    () =>
      `agencytrend-${metric}-${selectedAgencyIds.join("|")}-${CATEGORY_ORDER.map((c) =>
        categoryFilter[c] ? "1" : "0"
      ).join("")}-${agencyCategorySeries.series.map((s) => s.name).join("|")}-${agencyCategorySeries.labels.join("|")}`,
    [metric, selectedAgencyIds, categoryFilter, agencyCategorySeries]
  );
  const hasAnyData = useMemo(() => {
    const hasPersons = data.persons.length > 0;
    const hasLobTotals = data.lobTotals.some((l) => l.apps > 0 || l.premium > 0);
    const hasLobSeries = data.series.some((s) => s.data.some((d) => d !== 0));
    const hasAgencyCategorySeries =
      data.trendByAgencyCategory?.series?.some(
        (s) => s.apps.some((v) => v !== 0) || s.premium.some((v) => v !== 0)
      ) || false;
    return hasPersons || hasLobTotals || hasLobSeries || hasAgencyCategorySeries;
  }, [data]);
  const summaryText = useMemo(() => {
    const parts = [
      `Range: ${data.meta.rangeLabel}`,
      `Statuses: ${data.meta.statuses.join(", ")}`,
      `Metric: ${metric === "apps" ? "Apps" : "Premium"}`,
    ];
    if (agencyFilter.length) parts.push(`Agencies: ${agencyFilter.join(", ")}`);
    if (productFilter.length) parts.push(`Products: ${productFilter.join(", ")}`);
    return parts.join(" • ");
  }, [data.meta.rangeLabel, data.meta.statuses, metric, agencyFilter, productFilter]);

  const drillRows = useMemo(() => {
    const rows = data.persons
      .flatMap((p) =>
        data.lobNames.map((lob) => ({
          person: p.name,
          lob,
          apps: p.lobCounts[lob]?.apps || 0,
          premium: p.lobCounts[lob]?.premium || 0,
        }))
      )
      .filter((r) => (drill?.lob ? r.lob === drill.lob : true))
      .filter((r) => r.apps > 0 || r.premium > 0)
      .sort((a, b) => {
        const aVal = metric === "apps" ? a.apps : a.premium;
        const bVal = metric === "apps" ? b.apps : b.premium;
        return bVal - aVal;
      });
    return rows;
  }, [data.persons, data.lobNames, drill, metric]);

  const drillTotal = useMemo(
    () => drillRows.reduce((acc, r) => acc + (metric === "apps" ? r.apps : r.premium), 0),
    [drillRows, metric]
  );

  const downloadDrillCsv = () => {
    if (!drillRows.length) return;
    const header = ["Person", "LoB", "Apps", "Premium"];
    const lines = drillRows.map((r) => [r.person, r.lob, r.apps, Math.round(r.premium)]);
    const csv = [header, ...lines].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drilldown-${drill?.lob || "all"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const emptyText = "No data for selected filters";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Filters</div>
        <div style={{ color: "#6b7280", marginBottom: 8, fontSize: 13 }}>
          {summaryText}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {MODULES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className="btn"
              style={{
                borderColor: visible[m.id] ? "#2563eb" : "#e5e7eb",
                background: visible[m.id] ? "rgba(37,99,235,0.12)" : "white",
                color: "#111827",
              }}
            >
              {visible[m.id] ? "✓ " : ""}{m.label}
            </button>
          ))}
        </div>
      </div>

      {!hasAnyData ? (
        <div className="surface" style={{ padding: 12, borderRadius: 12, textAlign: "center", color: "#6b7280" }}>
          {emptyText}
        </div>
      ) : (
        <>
          {visible.kpi && (
            <section
              className="surface"
              style={{ padding: 12, borderRadius: 12, border: "2px solid #2563eb" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
                <div style={{ fontWeight: 800 }}>KPIs (apps + premium visible)</div>
                <SmallFilters summary={summaryText} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <KPI label="Total Premium" value={data.totals.totalPremium} isCurrency />
                <KPI label="Total Apps" value={data.totals.totalApps} />
                <KPI label="Business Premium" value={data.totals.businessPremium} isCurrency />
                <KPI label="Business Apps" value={data.totals.businessApps} />
              </div>
            </section>
          )}

          {visible.table && (
            <section
              className="surface"
              style={{ padding: 12, borderRadius: 12, border: "2px solid #2563eb" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                <div style={{ fontWeight: 800 }}>Team member vs Line of Business</div>
                <SmallFilters summary={summaryText} />
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f8fafc" }}>
                      <th style={{ textAlign: "left", padding: "10px 8px", fontSize: 12, color: "#475569" }}>Team Member</th>
                      {data.lobNames.map((lob) => (
                        <th key={lob} style={{ padding: "10px 8px", fontSize: 12, color: "#475569" }}>
                          {lob}
                        </th>
                      ))}
                      <th style={{ padding: "10px 8px", fontSize: 12, color: "#475569" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.persons.map((row) => (
                      <tr key={row.name} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 8px", fontWeight: 700 }}>{row.name}</td>
                        {data.lobNames.map((lob) => {
                          const cell = row.lobCounts[lob] || { apps: 0, premium: 0 };
                          return (
                            <td key={`${row.name}-${lob}`} style={{ padding: "10px 8px", textAlign: "center", color: "#111" }}>
                              <div style={{ fontWeight: 700 }}>{cell.apps}</div>
                              <div style={{ color: "#6b7280" }}>${Math.round(cell.premium)}</div>
                            </td>
                          );
                        })}
                        <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 800 }}>
                          <div>{row.totalApps}</div>
                          <div style={{ color: "#6b7280" }}>${Math.round(row.totalPremium)}</div>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f8fafc", fontWeight: 800 }}>
                      <td style={{ padding: "10px 8px" }}>Total</td>
                      {data.lobNames.map((lob) => {
                        const totApps = data.persons.reduce((acc, r) => acc + ((r.lobCounts[lob]?.apps) || 0), 0);
                        const totPrem = data.persons.reduce((acc, r) => acc + ((r.lobCounts[lob]?.premium) || 0), 0);
                        return (
                          <td key={`tot-${lob}`} style={{ padding: "10px 8px", textAlign: "center" }}>
                            <div>{totApps}</div>
                            <div style={{ color: "#6b7280" }}>${Math.round(totPrem)}</div>
                          </td>
                        );
                      })}
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        <div>{data.totals.totalApps}</div>
                        <div style={{ color: "#6b7280" }}>${Math.round(data.totals.totalPremium)}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

      {visible.lobmix && (
        <section
          className="surface"
          style={{ padding: 12, borderRadius: 12, border: "2px solid #2563eb" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <div style={{ fontWeight: 800 }}>LoB mix this period ({metric === "apps" ? "Apps" : "Premium"})</div>
            <SmallFilters summary={summaryText} />
          </div>
          <Chart
            height={300}
            option={{
              tooltip: { trigger: "axis" },
              dataZoom: [{ type: "slider" }],
              xAxis: { type: "category", data: data.lobTotals.map((l) => l.name) },
              yAxis: { type: "value" },
              series: [
                {
                  name: metric === "apps" ? "Apps" : "Premium",
                  type: "bar",
                  label: { show: true, position: "top" },
                  data: data.lobTotals.map((l) => (metric === "apps" ? l.apps : Math.round(l.premium))),
                  itemStyle: { color: "#2563eb" },
                },
              ],
            }}
            onEvents={{
              click: (params: any) => {
                if (!params?.name) return;
                setDrill({ lob: params.name as string, value: Number(params.value) || 0 });
              },
            }}
          />
        </section>
      )}

      {visible.spotlight && (
        <section
          className="surface"
          style={{ padding: 12, borderRadius: 12, border: "2px solid #2563eb" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <div style={{ fontWeight: 800 }}>LoB spotlight (share + quick stats)</div>
            <SmallFilters summary={summaryText} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12, alignItems: "stretch" }}>
            <Chart
              height={260}
              option={{
                tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
                legend: { bottom: 0 },
                series: [
                  {
                    name: "LoB share",
                    type: "pie",
                    radius: ["40%", "70%"],
                    avoidLabelOverlap: false,
                    label: { show: true, position: "outside", formatter: "{b}\n{d}%" },
                    data: data.lobTotals.map((lob) => ({
                      name: lob.name,
                      value: metric === "apps" ? lob.apps : Math.round(lob.premium),
                    })),
                  },
                ],
              }}
            />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              {data.lobTotals.map((lob) => {
                const totalPremium = data.totals.totalPremium || 1;
                const totalApps = data.totals.totalApps || 1;
                const sharePrem = (lob.premium / totalPremium) * 100;
                const shareApps = (lob.apps / totalApps) * 100;
                return (
                  <div key={lob.name} className="surface" style={{ padding: 10, borderRadius: 10 }}>
                    <div style={{ fontWeight: 800, marginBottom: 4 }}>{lob.name}</div>
                    <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 6 }}>
                      Share (premium): {sharePrem.toFixed(1)}% • Share (apps): {shareApps.toFixed(1)}%
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                      <span>Premium</span>
                      <span>${Math.round(lob.premium)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#2563eb" }}>
                      <span>Apps</span>
                      <span>{lob.apps}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {visible.trend && (
        <section
          className="surface"
          style={{ padding: 12, borderRadius: 12, border: "2px solid #2563eb" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <div style={{ fontWeight: 800 }}>
              Trend: {metric === "apps" ? "Apps" : "Premium"} by LoB (hover to see breakdown)
            </div>
            <SmallFilters summary={summaryText} />
          </div>
          <Chart
            height={340}
            option={{
              tooltip: { trigger: "axis" },
              legend: { type: "scroll" },
              dataZoom: [{ type: "slider" }],
              xAxis: { type: "category", data: data.monthLabels },
              yAxis: { type: "value" },
              series: visibleSeries.map((s) => ({
                name: s.name,
                type: "line",
                stack: "all",
                areaStyle: { opacity: 0.08 },
                data: s.data.map((d) => (metric === "apps" ? d : Math.round(d))),
              })),
            }}
            onEvents={{
              click: (params: any) => {
                if (!params?.seriesName || !params?.name) return;
                setDrill({
                  lob: params.seriesName as string,
                  month: String(params.name),
                  value: Number(params.value) || 0,
                });
              },
            }}
          />
        </section>
      )}

      {visible.agencytrend && (
        <section
          className="surface"
          style={{ padding: 12, borderRadius: 12, border: "2px solid #2563eb" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <div style={{ fontWeight: 800 }}>Agency-category trend ({metric === "apps" ? "Apps" : "Premium"})</div>
            <SmallFilters summary={summaryText} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {CATEGORY_ORDER.map((cat) => (
              <label key={cat} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={categoryFilter[cat]}
                  onChange={() => toggleCategory(cat)}
                />
                {CATEGORY_LABELS[cat]}
              </label>
            ))}
          </div>
          {agencyCategorySeries.series.length === 0 ? (
            <div style={{ color: "#6b7280", padding: 8 }}>{emptyText}</div>
          ) : (
            <Chart
              key={agencyTrendChartKey}
              height={340}
              option={{
                tooltip: {
                  trigger: "axis",
                  formatter: (params: any) => {
                    const list = Array.isArray(params) ? params : [params];
                    const axisLabel = list[0]?.axisValueLabel || "";
                    const lines = list.map((p) => {
                      const datum: any = p?.data ?? {};
                      const appsVal =
                        typeof datum === "object" && datum !== null ? datum.apps ?? datum.value ?? 0 : p?.data ?? 0;
                      const premiumVal =
                        typeof datum === "object" && datum !== null ? datum.premium ?? datum.value ?? 0 : p?.data ?? 0;
                      const appsNum = typeof appsVal === "number" ? appsVal : Number(appsVal) || 0;
                      const premiumNum = typeof premiumVal === "number" ? premiumVal : Number(premiumVal) || 0;
                      return `${p.marker}${p.seriesName}: ${appsNum} apps • $${Math.round(premiumNum)}`;
                    });
                    return [axisLabel, ...lines].join("<br/>");
                  },
                },
                legend: { type: "scroll", data: agencyCategorySeries.series.map((s) => s.name) },
                dataZoom: [{ type: "slider" }],
                xAxis: { type: "category", data: agencyCategorySeries.labels },
                yAxis: { type: "value" },
                series: agencyCategorySeries.series,
              }}
            />
          )}
        </section>
      )}

      {visible.drill && (
        <section
          className="surface"
          style={{ padding: 12, borderRadius: 12, border: "2px solid #2563eb" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div>
              <div style={{ fontWeight: 800 }}>Drilldown</div>
              <div style={{ color: "#6b7280", fontSize: 12 }}>
                {drill?.lob
                  ? `Focusing on ${drill.lob}${drill.month ? ` • ${drill.month}` : ""}`
                  : "Click a chart to drill into a line of business and month."}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <SmallFilters summary={summaryText} />
              {drillRows.length > 0 && (
                <button className="btn" type="button" onClick={downloadDrillCsv}>
                  Export CSV
                </button>
              )}
              <button className="btn" type="button" onClick={() => setDrill(null)}>Clear</button>
            </div>
          </div>
          {!drill && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {data.lobTotals.slice(0, 3).map((lob) => (
                <button
                  key={lob.name}
                  type="button"
                  className="btn"
                  onClick={() => setDrill({ lob: lob.name, value: metric === "apps" ? lob.apps : lob.premium })}
                >
                  Drill into {lob.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f8fafc" }}>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontSize: 12, color: "#475569" }}>Person</th>
                  <th style={{ textAlign: "left", padding: "10px 8px", fontSize: 12, color: "#475569" }}>LoB</th>
                  <th style={{ padding: "10px 8px", fontSize: 12, color: "#475569", textAlign: "right" }}>Apps</th>
                  <th style={{ padding: "10px 8px", fontSize: 12, color: "#475569", textAlign: "right" }}>Premium</th>
                  <th style={{ padding: "10px 8px", fontSize: 12, color: "#475569", textAlign: "right" }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {drillRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "12px 8px", color: "#6b7280" }}>
                      No data for the current drilldown.
                    </td>
                  </tr>
                ) : (
                  drillRows.map((r) => (
                    <tr key={`${r.person}-${r.lob}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 8px", fontWeight: 700 }}>{r.person}</td>
                      <td style={{ padding: "10px 8px" }}>{r.lob}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right" }}>{r.apps}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right" }}>${Math.round(r.premium)}</td>
                      <td style={{ padding: "10px 8px", textAlign: "right", color: "#2563eb", fontWeight: 700 }}>
                        {drillTotal ? `${(((metric === "apps" ? r.apps : r.premium) / drillTotal) * 100).toFixed(1)}%` : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {visible.topsellers && (
        <section
          className="surface"
          style={{ padding: 12, borderRadius: 12, border: "2px solid #2563eb" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <div style={{ fontWeight: 800 }}>Top sellers by LoB</div>
            <SmallFilters summary={summaryText} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {data.lobNames.map((lob) => {
              const people = data.persons
                .map((p) => ({
                  name: p.name,
                  apps: p.lobCounts[lob]?.apps || 0,
                  premium: p.lobCounts[lob]?.premium || 0,
                }))
                .filter((p) => p.apps > 0 || p.premium > 0)
                .sort((a, b) => (metric === "apps" ? b.apps - a.apps : b.premium - a.premium))
                .slice(0, 3);

              const total = metric === "apps"
                ? people.reduce((acc, p) => acc + p.apps, 0)
                : people.reduce((acc, p) => acc + p.premium, 0);

              return (
                <div key={lob} className="surface" style={{ padding: 10, borderRadius: 10 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>{lob}</div>
                  {people.length === 0 ? (
                    <div style={{ color: "#6b7280", fontSize: 12 }}>No production this period.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      {people.map((p, idx) => (
                        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <div>
                            <span style={{ fontWeight: 700 }}>{idx + 1}. {p.name}</span>
                            <span style={{ color: "#6b7280", marginLeft: 6 }}>
                              {metric === "apps" ? `${p.apps} apps` : `$${Math.round(p.premium)}`}
                            </span>
                          </div>
                          <div style={{ color: "#2563eb", fontWeight: 700 }}>
                            {total ? `${Math.round(((metric === "apps" ? p.apps : p.premium) / total) * 100)}%` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {visible.momentum && (
        <section
          className="surface"
          style={{ padding: 12, borderRadius: 12, border: "2px solid #2563eb" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <div style={{ fontWeight: 800 }}>LoB momentum (last period vs prior)</div>
            <SmallFilters summary={summaryText} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {data.series.map((s) => {
              const n = s.data.length;
              const cur = n ? s.data[n - 1] : 0;
              const prev = n > 1 ? s.data[n - 2] : 0;
              const delta = cur - prev;
              const deltaPct = prev ? (delta / prev) * 100 : 0;
              return (
                <div key={s.name} className="surface" style={{ padding: 10, borderRadius: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{s.name}</div>
                    <span style={{ color: delta >= 0 ? "#15803d" : "#b91c1c", fontWeight: 700 }}>
                      {delta >= 0 ? "▲" : "▼"} {Math.round(delta)} ({deltaPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 4 }}>
                    Current {metric === "apps" ? "apps" : "premium"}: {metric === "apps" ? cur : `$${Math.round(cur)}`}
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>
                    Prev: {metric === "apps" ? prev : `$${Math.round(prev)}`}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
        </>
      )}
    </div>
  );
}

function KPI({ label, value, isCurrency = false }: { label: string; value: number; isCurrency?: boolean }) {
  return (
    <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20 }}>{isCurrency ? `$${Math.round(value)}` : value}</div>
    </div>
  );
}
