"use client";

import { useEffect, useMemo, useState } from "react";
import { Chart } from "@/components/Chart";
import type { EChartsOption } from "echarts";
import { addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths, subWeeks } from "date-fns";

type ProductionResponse = {
  labels: string[];
  series: { name: string; data: number[]; color?: string }[];
  totals?: { premium: number; apps: number; businessPremium?: number };
  statuses?: string[];
  lobByAgency?: {
    lobNames: string[];
    series: Array<{
      agencyId: string;
      agencyName: string;
      apps: number[];
      premium: number[];
    }>;
  };
  lobOverview?: {
    lobNames: string[];
    cards: Array<{
      lob: string;
      totalApps: number;
      totalPremium: number;
      trend: { labels: string[]; apps: number[]; premium: number[] };
      agencies: Array<{
        agencyId: string;
        agencyName: string;
        totalApps: number;
        totalPremium: number;
        sellers: Array<{ name: string; apps: number; premium: number }>;
        others: { apps: number; premium: number };
      }>;
    }>;
    statuses?: string[];
  };
  lobCards?: {
    lobNames: string[];
    agencies: Array<{ id: string; name: string }>;
    byLob: Array<{
      lobName: string;
      totalsByAgency: Array<{
        agencyId: string;
        agencyName: string;
        apps: number;
        premium: number;
        topSellers: Array<{ personName: string; apps: number; premium: number }>;
        allOthers: { apps: number; premium: number };
      }>;
      totalsAllAgencies: { apps: number; premium: number };
      premiumCategory?: "PC" | "FS" | "IPS";
    }>;
    monthLabels?: string[];
    lobTrend?: Record<string, { apps: number[]; premium: number[] }>;
  };
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
type LobByAgencySeries = { agencyId: string; agencyName: string; apps: number[]; premium: number[] };
async function fetchProduction(params: Record<string, unknown>) {
  const res = await fetch("/api/reports/production", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return (await res.json()) as ProductionResponse;
}

type ActivityResponse = { labels: string[]; series: number[] };
async function fetchActivity(params: Record<string, unknown>) {
  const res = await fetch("/api/reports/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return (await res.json()) as ActivityResponse;
}

function formatISODate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

type RangeOverlayProps = {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  onClose: () => void;
  onClear: () => void;
};

function generateMonthDays(view: Date) {
  const start = startOfMonth(view);
  const end = endOfMonth(view);
  const days = [];
  for (let d = start.getDate(); d <= end.getDate(); d++) {
    days.push(new Date(view.getFullYear(), view.getMonth(), d));
  }
  return days;
}

function RangeOverlay({ start, end, onChange, onClose, onClear }: RangeOverlayProps) {
  const [viewStart, setViewStart] = useState<Date>(start ? new Date(start) : new Date());
  const [hover, setHover] = useState<string>("");

  useEffect(() => {
    if (start && end) {
      // auto close once both picks are made
      onClose();
    }
  }, [start, end, onClose]);

  const dayIsInRange = (d: string) => {
    if (!start) return false;
    if (!end && hover) {
      return d >= start && d <= hover;
    }
    if (start && end) return d >= start && d <= end;
    return false;
  };

  const handleSelect = (day: string) => {
    if (!start || (start && end)) {
      onChange(day, "");
      setHover("");
      return;
    }
    if (day < start) {
      onChange(day, start);
    } else {
      onChange(start, day);
    }
    setHover("");
  };

  const monthA = generateMonthDays(viewStart);
  const monthB = generateMonthDays(addMonths(viewStart, 1));

  const renderMonth = (days: Date[]) => (
    <div style={{ minWidth: 240 }}>
      <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 6 }}>{format(days[0], "MMMM yyyy")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
          <div key={d} style={{ textAlign: "center" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {Array(days[0].getDay())
          .fill(0)
          .map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
        {days.map((d) => {
          const iso = formatISODate(d);
          const selected = (start && iso === start) || (end && iso === end);
          const inRange = dayIsInRange(iso);
          return (
            <button
              key={iso}
              type="button"
              onMouseEnter={() => setHover(iso)}
              onMouseLeave={() => setHover("")}
              onClick={() => handleSelect(iso)}
              style={{
                padding: "6px 0",
                borderRadius: 8,
                border: selected ? "1px solid #2563eb" : "1px solid transparent",
                background: selected ? "#2563eb" : inRange ? "rgba(37,99,235,0.12)" : "transparent",
                color: selected ? "white" : "#111827",
                cursor: "pointer",
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div
      className="surface"
      style={{
        position: "absolute",
        top: "105%",
        left: 0,
        zIndex: 15,
        padding: 10,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "white",
        boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
        minWidth: 520,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <button className="btn" type="button" onClick={() => setViewStart(addMonths(viewStart, -1))}>
          ←
        </button>
        <div style={{ fontWeight: 700 }}>Select a start and end date</div>
        <button className="btn" type="button" onClick={() => setViewStart(addMonths(viewStart, 1))}>
          →
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
        {renderMonth(monthA)}
        {renderMonth(monthB)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            onClear();
          }}
        >
          Clear
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (start && end) onClose();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

const CHARTS = [
  { id: "trend", label: "Agency trend (line)" },
  { id: "products", label: "Top products (bar)" },
  { id: "lob", label: "Line of business overview" },
  { id: "lobOverview", label: "LoB overview (grouped bar)" },
  { id: "lobByAgencyGroup", label: "LoB Production Overview (compare offices)" },
  { id: "lobCards", label: "LoB overview (cards)" },
] as const;

const DEFAULT_STATUSES = ["WRITTEN", "ISSUED", "PAID"];
const LOB_ORDER = ["Auto", "Fire", "Life", "Health", "IPS"] as const;
const LOB_COLORS: Record<string, string> = {
  Auto: "#F97316",
  Fire: "#F97316",
  Life: "#3B82F6",
  Health: "#DB2777",
  IPS: "#6B21A8",
  Total: "#10B981",
};

type AgencyOption = { id: string; name: string };

export function PresetProductionOverview({ agencies }: { agencies: AgencyOption[] }) {
  const [metric, setMetric] = useState<"premium" | "apps">("premium");
  const [selectedCharts, setSelectedCharts] = useState<string[]>(CHARTS.map((c) => c.id));
  const [granularity, setGranularity] = useState<"month" | "week">("month");
  const [agencyFilter, setAgencyFilter] = useState<string[]>([]);
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [rangeMode, setRangeMode] = useState<"all" | "month" | "week" | "custom">("all");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [showRangePicker, setShowRangePicker] = useState<boolean>(false);
  const [lobTrendSelection, setLobTrendSelection] = useState<string>("");

  const [trend, setTrend] = useState<ProductionResponse>({ labels: [], series: [] });
  const [products, setProducts] = useState<ProductionResponse>({ labels: [], series: [] });
  const [lob, setLob] = useState<ProductionResponse>({ labels: [], series: [] });
  const [trendGroups, setTrendGroups] = useState<{ pc: boolean; fs: boolean; ips: boolean }>({ pc: true, fs: true, ips: false });

  const rangeSelection = useMemo(() => {
    const now = new Date();
    if (rangeMode === "all") {
      return { start: undefined as string | undefined, end: undefined as string | undefined, ready: true };
    }
    if (rangeMode === "month") {
      return { start: formatISODate(subMonths(now, 5)), end: formatISODate(now), ready: true };
    }
    if (rangeMode === "week") {
      return { start: formatISODate(subWeeks(now, 11)), end: formatISODate(now), ready: true };
    }
    const start = customStart || undefined;
    const end = customEnd || undefined;
    return { start, end, ready: Boolean(start && end) };
  }, [rangeMode, customStart, customEnd]);

  // default to all agencies when the list loads (so "All" really means all)
  useEffect(() => {
    if (agencies?.length && agencyFilter.length === 0) {
      setAgencyFilter(agencies.map((a) => a.id));
    }
  }, [agencies, agencyFilter.length]);

  useEffect(() => {
    const { start, end, ready } = rangeSelection;
    if (rangeMode === "custom" && !ready) return;

    const base = { agencyIds: agencyFilter.length ? agencyFilter : undefined, granularity, start, end, metric };
    fetchProduction({ ...base, dimension: "agency" }).then(setTrend);
    fetchProduction({ ...base, dimension: "product" }).then(setProducts);
    fetchProduction({ ...base, dimension: "lob" }).then(setLob);
  }, [agencyFilter, granularity, rangeMode, customStart, customEnd, metric, rangeSelection]);

  const monthOptions = useMemo(() => trend.labels, [trend.labels]);

  const filterSeries = (data: ProductionResponse): ProductionResponse => {
    if (!monthFilter) return data;
    const idx = data.labels.indexOf(monthFilter);
    if (idx === -1) return data;
    const trendByAgencyCategory = data.trendByAgencyCategory
      ? {
          labels: [monthFilter],
          series: data.trendByAgencyCategory.series.map((s) => ({
            ...s,
            apps: [s.apps[idx] ?? 0],
            premium: [s.premium[idx] ?? 0],
          })),
        }
      : undefined;
    return {
      ...data,
      labels: [monthFilter],
      series: data.series.map((s) => ({
        ...s,
        data: [s.data[idx] ?? 0],
      })),
      trendByAgencyCategory,
    };
  };

  const trendFiltered = filterSeries(trend);
  const productsFiltered = filterSeries(products);
  const lobFiltered = filterSeries(lob);
  const lobByAgencyData = lob.lobByAgency ?? null;
  const lobOverviewCards = lob.lobOverview?.cards ?? [];
  const lobCardsData = lob.lobCards ?? null;

  useEffect(() => {
    if (!lobCardsData?.lobNames?.length) return;
    setLobTrendSelection((prev) => {
      if (prev && (lobCardsData.lobNames.includes(prev) || prev === "Total")) return prev;
      return lobCardsData.lobNames[0];
    });
  }, [lobCardsData?.lobNames]);

  // Aggregate agency trend into P&C vs FS (and optional IPS) so the line chart is more meaningful.
  const aggregatedTrend = useMemo(() => {
    if (!lobFiltered.labels.length) return null;

    const labels = lobFiltered.labels;
    const empty = () => Array(labels.length).fill(0);
    const buckets = { pc: empty(), fs: empty(), ips: empty() };

    lobFiltered.series.forEach((s) => {
      const name = s.name.toLowerCase();
      let bucket: "pc" | "fs" | "ips" = "ips";
      if (name.includes("auto") || name.includes("fire") || name.includes("p&c") || name.includes("pc")) bucket = "pc";
      else if (name.includes("health") || name.includes("life") || name.includes("fs")) bucket = "fs";
      else bucket = "ips";
      s.data.forEach((v, idx) => {
        buckets[bucket][idx] += v ?? 0;
      });
    });

    const series: { name: string; data: number[] }[] = [];
    if (trendGroups.pc && buckets.pc.some((v) => v !== 0))
      series.push({ name: metric === "premium" ? "P&C premium" : "P&C apps", data: buckets.pc });
    if (trendGroups.fs && buckets.fs.some((v) => v !== 0))
      series.push({ name: metric === "premium" ? "FS premium" : "FS apps", data: buckets.fs });
    if (trendGroups.ips && buckets.ips.some((v) => v !== 0))
      series.push({ name: metric === "premium" ? "IPS premium" : "IPS apps", data: buckets.ips });

    if (!series.length) return null;
    return { labels, series };
  }, [lobFiltered, trendGroups, metric]);

  const kpiTotals = useMemo(() => {
    // prefer the API totals if present; otherwise derive from whichever dataset we have
    const pickTotals = (d: ProductionResponse | undefined) => d?.totals;
    const totals =
      pickTotals(trendFiltered) ??
      pickTotals(productsFiltered) ??
      pickTotals(lobFiltered);

    if (totals) {
      return {
        total: metric === "premium" ? totals.premium ?? 0 : totals.apps ?? 0,
        business: metric === "premium" ? totals.businessPremium ?? 0 : 0,
      };
    }

    const sumFromSeries = (d: ProductionResponse) =>
      d.series.reduce(
        (acc, s) => {
          const sum = s.data.reduce((a, b) => a + b, 0);
          acc.total += sum;
          if (s.name.toLowerCase().includes("business")) acc.business += sum;
          return acc;
        },
        { total: 0, business: 0 }
      );

    // fall back in order of richness
    const derived =
      sumFromSeries(trendFiltered).total > 0
        ? sumFromSeries(trendFiltered)
        : sumFromSeries(lobFiltered);

    return derived;
  }, [trendFiltered, productsFiltered, lobFiltered, metric]);

  const statusesParam = lob.statuses?.length ? lob.statuses.join(",") : "";
  const navStatuses = useMemo(
    () => (statusesParam ? statusesParam.split(",").filter(Boolean) : DEFAULT_STATUSES),
    [statusesParam]
  );
  const agenciesParam = useMemo(() => (agencyFilter.length ? agencyFilter : agencies.map((a) => a.id)), [agencyFilter, agencies]);
  const parseLabelToDate = (label: string | undefined) => {
    if (!label) return null;
    const normalized = label.length === 7 ? `${label}-01` : label;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const rangeFromLabels = (labels: string[] | undefined, grain: "month" | "week") => {
    if (!labels?.length) return null;
    const first = parseLabelToDate(labels[0]);
    const last = parseLabelToDate(labels[labels.length - 1]);
    if (!first || !last) return null;
    const normalizedStart = grain === "week" ? startOfWeek(first) : startOfMonth(first);
    const normalizedEnd = grain === "week" ? endOfWeek(last) : endOfMonth(last);
    return { start: formatISODate(normalizedStart), end: formatISODate(normalizedEnd) };
  };
  const deriveRangeParams = () => {
    if (rangeSelection.start && rangeSelection.end) return { start: rangeSelection.start, end: rangeSelection.end };
    const fromLobLabels = rangeFromLabels(lob.labels, granularity);
    if (fromLobLabels) return fromLobLabels;
    const fromLobCards = rangeFromLabels(lobCardsData?.monthLabels, "month");
    if (fromLobCards) return fromLobCards;
    const today = new Date();
    return { start: formatISODate(startOfMonth(today)), end: formatISODate(endOfMonth(today)) };
  };
  const currentRangeParams = deriveRangeParams();
  const deriveRangeFromLabels = (labels: string[] | undefined) => {
    if (!labels?.length) return null;
    const first = labels[0];
    const last = labels[labels.length - 1];
    const monthRe = /^\d{4}-\d{2}$/;
    const dayRe = /^\d{4}-\d{2}-\d{2}$/;
    if (monthRe.test(first) && monthRe.test(last)) {
      const start = `${first}-01`;
      const end = formatISODate(endOfMonth(new Date(`${last}-01`)));
      return { start, end };
    }
    if (dayRe.test(first) && dayRe.test(last)) {
      const start = formatISODate(new Date(first));
      const end = formatISODate(endOfWeek(new Date(last)));
      return { start, end };
    }
    return null;
  };
  const rangeShown = useMemo(() => {
    if (currentRangeParams.start || currentRangeParams.end) return currentRangeParams;
    if (rangeSelection.start || rangeSelection.end) return { start: rangeSelection.start, end: rangeSelection.end };
    const fromLobLabels = deriveRangeFromLabels(lob.labels);
    if (fromLobLabels) return fromLobLabels;
    const fromTrendLabels = deriveRangeFromLabels(trendFiltered.labels);
    if (fromTrendLabels) return fromTrendLabels;
    return { start: undefined as string | undefined, end: undefined as string | undefined };
  }, [currentRangeParams, rangeSelection.start, rangeSelection.end, lob.labels, trendFiltered.labels]);
  function goToSoldProducts(args: {
    lobName?: string;
    agencyIds?: string[];
    start?: string;
    end?: string;
    statuses?: string[];
    personId?: string;
    productIds?: string[];
  }) {
    const qs = new URLSearchParams();
    if (args.start) qs.set("start", args.start);
    if (args.end) qs.set("end", args.end);
    if (args.agencyIds?.length) qs.set("agencies", args.agencyIds.join(","));
    if (args.statuses?.length) qs.set("statuses", args.statuses.join(","));
    if (args.lobName) qs.set("lob", args.lobName);
    if (args.personId) qs.set("personId", args.personId);
    if (args.productIds?.length) qs.set("products", args.productIds.join(","));
    window.location.href = `/sold-products?${qs.toString()}`;
  }

  const renderChart = (id: string) => {
    if (id === "trend") {
      const labels =
        trendFiltered.trendByAgencyCategory?.labels?.length ? trendFiltered.trendByAgencyCategory.labels : trendFiltered.labels;
      const rawSeries = trendFiltered.trendByAgencyCategory?.series || [];

      const categoryOrder: ("PC" | "FS" | "IPS")[] = ["PC", "FS", "IPS"];
      const categoryLabels: Record<"PC" | "FS" | "IPS", string> = { PC: "P&C", FS: "FS", IPS: "IPS" };
      const palette: Record<"PC" | "FS" | "IPS", string>[] = [
        { PC: "#1D4ED8", IPS: "#3B82F6", FS: "#93C5FD" },
        { PC: "#C2410C", IPS: "#F97316", FS: "#FDBA74" },
      ];

      const orderedAgencyIds =
        agencyFilter.length > 0
          ? agencyFilter
          : Array.from(
              rawSeries.reduce((set, s) => {
                set.add(s.agencyId);
                return set;
              }, new Set<string>())
            );

      const series = [];
      for (const agencyId of orderedAgencyIds) {
        const agencySeries = rawSeries.filter((s) => s.agencyId === agencyId);
        if (!agencySeries.length) continue;
        const agencyName = agencySeries[0]?.agencyName || agencyId;
        const agencyIdx = orderedAgencyIds.indexOf(agencyId);
        const paletteForAgency = palette[agencyIdx % palette.length] || palette[0];
        for (const cat of categoryOrder) {
          if (!trendGroups[cat.toLowerCase() as "pc" | "fs" | "ips"]) continue;
          const catSeries = agencySeries.find((s) => s.category === cat);
          if (!catSeries) continue;
          const dataPoints = labels.map((_, idx) => {
            const appsVal = catSeries.apps[idx] ?? 0;
            const premiumVal = catSeries.premium[idx] ?? 0;
            return { value: metric === "apps" ? appsVal : premiumVal, apps: appsVal, premium: premiumVal };
          });
          series.push({
            name: `${agencyName} — ${categoryLabels[cat]}`,
            type: "line",
            smooth: true,
            showSymbol: false,
            lineStyle: { width: 3 },
            itemStyle: { color: paletteForAgency[cat] },
            data: dataPoints,
          });
        }
      }

      const trendToggles = (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          {[
            { key: "pc", label: "P&C" },
            { key: "fs", label: "FS" },
            { key: "ips", label: "IPS" },
          ].map((g) => (
            <label key={g.key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <input
                type="checkbox"
                checked={(trendGroups as any)[g.key]}
                onChange={(e) =>
                  setTrendGroups((prev) => ({
                    ...prev,
                    [g.key]: e.target.checked,
                  }))
                }
              />
              {g.label}
            </label>
          ))}
        </div>
      );

      if (!labels.length || series.length === 0) {
        return (
          <div style={{ display: "grid", gap: 6 }}>
            {trendToggles}
            <div style={{ color: "#6b7280", padding: 8 }}>No data for selected filters</div>
          </div>
        );
      }

      const option: EChartsOption = {
        tooltip: {
          trigger: "axis",
          formatter: (params: any) => {
            const list = Array.isArray(params) ? params : [params];
            const axisLabel = list[0]?.axisValueLabel || "";
            const lines = list.map((p) => {
              const datum: any = p?.data ?? {};
              const appsVal = typeof datum === "object" && datum !== null ? datum.apps ?? datum.value ?? 0 : p?.data ?? 0;
              const premiumVal =
                typeof datum === "object" && datum !== null ? datum.premium ?? datum.value ?? 0 : p?.data ?? 0;
              const appsNum = typeof appsVal === "number" ? appsVal : Number(appsVal) || 0;
              const premiumNum = typeof premiumVal === "number" ? premiumVal : Number(premiumVal) || 0;
              return `${p.marker}${p.seriesName}: ${appsNum} apps • $${Math.round(premiumNum)}`;
            });
            return [axisLabel, ...lines].join("<br/>");
          },
        },
        legend: { type: "scroll", data: series.map((s) => s.name) },
        dataZoom: [{ type: "slider" }],
        xAxis: { type: "category", data: labels },
        yAxis: { type: "value" },
        series,
      };
      return (
        <div style={{ display: "grid", gap: 6 }}>
          {trendToggles}
          <Chart option={option} height={280} />
        </div>
      );
    }

    if (id === "products") {
      const topSeries = productsFiltered.series
        .map((s) => ({
          name: s.name,
          value: s.data.reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);
      const option: EChartsOption = {
        tooltip: { trigger: "axis" },
        xAxis: { type: "value" },
        yAxis: { type: "category", data: topSeries.map((s) => s.name) },
        series: [{ type: "bar", data: topSeries.map((s) => s.value), itemStyle: { color: "#2563eb" } }],
      };
      return <Chart option={option} height={320} />;
    }

    if (id === "lobByAgencyGroup") {
      if (!lobByAgencyData?.lobNames?.length || !lobByAgencyData.series?.length) {
        return <div style={{ color: "#6b7280", padding: 8 }}>No data for selected filters</div>;
      }

      const lobNames = lobByAgencyData.lobNames;
      const uniqueSeries: LobByAgencySeries[] = [];
      const seen = new Set<string>();
      lobByAgencyData.series.forEach((s) => {
        if (seen.has(s.agencyId)) return;
        seen.add(s.agencyId);
        uniqueSeries.push(s);
      });

      const series = uniqueSeries.map((row) => ({
        name: row.agencyName,
        type: "bar",
        emphasis: { focus: "series" },
        data: lobNames.map((lob, idx) => {
          const appsVal = row.apps[idx] ?? 0;
          const premiumVal = row.premium[idx] ?? 0;
          return {
            value: metric === "apps" ? appsVal : premiumVal,
            apps: appsVal,
            premium: premiumVal,
            lob,
            agencyId: row.agencyId,
          };
        }),
      }));

      const option: EChartsOption = {
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          formatter: (params: any) => {
            const list = Array.isArray(params) ? params : [params];
            const axisLabel = list[0]?.axisValueLabel || "";
            const lines = list.map((p) => {
              const datum: any = p?.data ?? {};
              const appsVal = typeof datum === "object" ? datum.apps ?? 0 : 0;
              const premiumVal = typeof datum === "object" ? datum.premium ?? 0 : 0;
              return `${p.marker || ""}${p.seriesName}: ${Math.round(appsVal)} apps • $${Math.round(premiumVal)}`;
            });
            return [axisLabel, ...lines].join("<br/>");
          },
        },
        legend: { type: "scroll" },
        grid: { left: 50, right: 20, top: 40, bottom: 40 },
        xAxis: { type: "category", data: lobNames },
        yAxis: { type: "value" },
        series,
      };

      const handleBarClick = (params: any) => {
        const datum: any = params?.data ?? {};
        const lob = datum?.lob || params?.name;
        const agencyId = datum?.agencyId;
        if (!lob || !agencyId) return;
        goToSoldProducts({
          lobName: lob,
          agencyIds: [agencyId],
          statuses: navStatuses,
          start: rangeShown.start,
          end: rangeShown.end,
        });
      };

      return <Chart option={option} height={320} onEvents={{ click: handleBarClick }} />;
    }

    if (id === "lobOverview") {
      const data = lob.lobByAgency ?? null;
      if (!data?.lobNames?.length || !data.series?.length) {
        return <div style={{ color: "#6b7280", padding: 8 }}>No data for selected filters</div>;
      }

      const lobNamesOrdered = [
        ...LOB_ORDER.filter((lob) => data.lobNames.includes(lob)),
        ...data.lobNames.filter((lob) => !LOB_ORDER.includes(lob as (typeof LOB_ORDER)[number])),
      ];

      const selectedAgencyIds = agencyFilter.length ? agencyFilter : data.series.map((s) => s.agencyId);
      const uniqueSeriesMap = new Map<string, (typeof data.series)[number]>();
      data.series.forEach((s) => {
        if (!uniqueSeriesMap.has(s.agencyId)) uniqueSeriesMap.set(s.agencyId, s);
      });
      const orderedAgencyIds = selectedAgencyIds.length ? selectedAgencyIds : Array.from(uniqueSeriesMap.keys());
      const filteredSeries = orderedAgencyIds
        .map((id) => uniqueSeriesMap.get(id))
        .filter(Boolean)
        .sort((a, b) => (a?.agencyName || "").localeCompare(b?.agencyName || ""));

      if (!filteredSeries.length) {
        return <div style={{ color: "#6b7280", padding: 8 }}>No data for selected filters</div>;
      }

      const series = filteredSeries.map((row) => ({
        name: row!.agencyName,
        type: "bar",
        emphasis: { focus: "series" as const },
        data: lobNamesOrdered.map((lobName, idx) => {
          const appsVal = row!.apps[idx] ?? 0;
          const premiumVal = row!.premium[idx] ?? 0;
          return {
            value: metric === "apps" ? appsVal : premiumVal,
            apps: appsVal,
            premium: premiumVal,
            lobName,
            agencyId: row!.agencyId,
            agencyName: row!.agencyName,
          };
        }),
      }));

      const tooltip = (params: any) => {
        const list = Array.isArray(params) ? params : [params];
        const datum0: any = list[0]?.data ?? {};
        const title = datum0?.lobName || list[0]?.axisValueLabel || "";
        const lines = list.map((p) => {
          const datum: any = p?.data ?? {};
          const appsVal = typeof datum === "object" ? datum.apps ?? 0 : 0;
          const premiumVal = typeof datum === "object" ? datum.premium ?? 0 : 0;
          return `${p.marker || ""}${datum.agencyName || p.seriesName}: ${Math.round(appsVal)} apps • $${Math.round(premiumVal)}`;
        });
        return [title, ...lines].join("<br/>");
      };

      const option: EChartsOption = {
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: tooltip },
        legend: { type: "scroll" },
        grid: { left: 40, right: 20, top: 36, bottom: 30 },
        xAxis: { type: "category", data: lobNamesOrdered },
        yAxis: { type: "value" },
        series,
      };

      const handleClick = (params: any) => {
        const datum: any = params?.data ?? {};
        const lobName = datum?.lobName || params?.name;
        if (!lobName) return;
        const agencyId = datum?.agencyId as string | undefined;
        const agenciesForNav = agencyId ? [agencyId] : selectedAgencyIds;
        goToSoldProducts({
          lobName,
          agencyIds: agenciesForNav,
          statuses: navStatuses,
          start: rangeShown.start,
          end: rangeShown.end,
        });
      };

      return (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ color: "#475569", fontSize: 12 }}>
            LoB overview (grouped bar). Toggle Apps/Premium. Click a bar to view policies.
          </div>
          <Chart option={option} height={320} onEvents={{ click: handleClick }} />
        </div>
      );
    }

    if (id === "lobCards") {
      if (!lobCardsData) {
        return <div style={{ color: "#6b7280", padding: 8 }}>LoB overview unavailable (missing data).</div>;
      }
      if (!lobCardsData.byLob.length) {
        return <div style={{ color: "#6b7280", padding: 8 }}>No data for selected filters</div>;
      }

      const agencyOrder = new Map(lobCardsData.agencies.map((a, idx) => [a.id, idx]));
      const selectedAgencyIds = agencyFilter.length
        ? agencyFilter
        : lobCardsData.agencies.map((a) => a.id).filter(Boolean);
      const filterAgencies = (list: typeof lobCardsData.byLob[number]["totalsByAgency"]) => {
        if (!selectedAgencyIds.length) return list;
        const filtered = list.filter((a) => selectedAgencyIds.includes(a.agencyId));
        return filtered.length ? filtered : list;
      };

      const byLobMap = new Map(lobCardsData.byLob.map((l) => [l.lobName, l]));
      const orderedLobNames = [
        ...LOB_ORDER.filter((lobName) => byLobMap.has(lobName)),
        ...lobCardsData.lobNames.filter(
          (lobName) => !LOB_ORDER.includes(lobName as (typeof LOB_ORDER)[number])
        ),
      ];

      const aggregateTotalCard = () => {
        const trendLength = lobCardsData.monthLabels.length;
        const totalTrend = {
          apps: Array(trendLength).fill(0),
          premium: Array(trendLength).fill(0),
        };
        const totalAgenciesMap = new Map<
          string,
          { agencyId: string; agencyName: string; apps: number; premium: number; sellers: Map<string, { apps: number; premium: number }> }
        >();

        lobCardsData.byLob.forEach((lobEntry) => {
          const trend = lobCardsData.lobTrend[lobEntry.lobName];
          if (trend) {
            trend.apps.forEach((v, idx) => {
              totalTrend.apps[idx] = (totalTrend.apps[idx] ?? 0) + (v ?? 0);
            });
            trend.premium.forEach((v, idx) => {
              totalTrend.premium[idx] = (totalTrend.premium[idx] ?? 0) + (v ?? 0);
            });
          }
          lobEntry.totalsByAgency.forEach((agency) => {
            const existing =
              totalAgenciesMap.get(agency.agencyId) || {
                agencyId: agency.agencyId,
                agencyName: agency.agencyName,
                apps: 0,
                premium: 0,
                sellers: new Map<string, { apps: number; premium: number }>(),
              };
            existing.apps += agency.apps;
            existing.premium += agency.premium;
            agency.topSellers.forEach((seller) => {
              const current = existing.sellers.get(seller.personName) || { apps: 0, premium: 0 };
              current.apps += seller.apps;
              current.premium += seller.premium;
              existing.sellers.set(seller.personName, current);
            });
            totalAgenciesMap.set(agency.agencyId, existing);
          });
        });

        const totalAgencies = Array.from(totalAgenciesMap.values())
          .filter((a) => !selectedAgencyIds.length || selectedAgencyIds.includes(a.agencyId))
          .sort((a, b) => {
            const aOrder = agencyOrder.get(a.agencyId) ?? Number.MAX_SAFE_INTEGER;
            const bOrder = agencyOrder.get(b.agencyId) ?? Number.MAX_SAFE_INTEGER;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.agencyName.localeCompare(b.agencyName);
          })
          .map((agency) => {
            const sellersArr = Array.from(agency.sellers.entries()).map(([personName, stats]) => ({
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
              apps: Math.max(0, agency.apps - topTotals.apps),
              premium: Math.max(0, agency.premium - topTotals.premium),
            };
            return {
              agencyId: agency.agencyId,
              agencyName: agency.agencyName,
              apps: agency.apps,
              premium: agency.premium,
              topSellers,
              allOthers,
            };
          });

        const totalTotals = totalAgencies.reduce(
          (acc, agency) => {
            acc.apps += agency.apps;
            acc.premium += agency.premium;
            return acc;
          },
          { apps: 0, premium: 0 }
        );

        return {
          lobName: "Total",
          totalsAllAgencies: totalTotals,
          totalsByAgency: totalAgencies,
          trend: totalTrend,
        };
      };

      const cards = orderedLobNames
        .map((lobName) => {
          const entry = byLobMap.get(lobName);
          if (!entry) return null;
          return {
            lobName,
            totalsAllAgencies: entry.totalsAllAgencies,
            totalsByAgency: filterAgencies(
              [...entry.totalsByAgency].sort((a, b) => {
                const aOrder = agencyOrder.get(a.agencyId) ?? Number.MAX_SAFE_INTEGER;
                const bOrder = agencyOrder.get(b.agencyId) ?? Number.MAX_SAFE_INTEGER;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a.agencyName.localeCompare(b.agencyName);
              })
            ),
            trend: lobCardsData.lobTrend[entry.lobName] || { apps: [], premium: [] },
          };
        })
        .filter(Boolean) as Array<{
          lobName: string;
          totalsAllAgencies: { apps: number; premium: number };
          totalsByAgency: Array<{
            agencyId: string;
            agencyName: string;
            apps: number;
            premium: number;
            topSellers: Array<{ personName: string; apps: number; premium: number }>;
            allOthers: { apps: number; premium: number };
          }>;
          trend: { apps: number[]; premium: number[] };
        }>;

      const totalCard = aggregateTotalCard();
      const cardsToRender = [...cards, totalCard];
      const trendLabels = lobCardsData.monthLabels;
      const trendLobName = lobTrendSelection || cardsToRender[0]?.lobName || "";
      const trendData =
        trendLobName === "Total"
          ? totalCard.trend
          : lobCardsData.lobTrend[trendLobName] || { apps: [], premium: [] };

      const lobBarData = lobByAgencyData;
      const lobBarSeries =
        lobBarData && lobBarData.lobNames.length
          ? (lobBarData.series || [])
              .filter((s) => (selectedAgencyIds.length ? selectedAgencyIds.includes(s.agencyId) : true))
              .sort((a, b) => {
                const aOrder = agencyOrder.get(a.agencyId) ?? Number.MAX_SAFE_INTEGER;
                const bOrder = agencyOrder.get(b.agencyId) ?? Number.MAX_SAFE_INTEGER;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return a.agencyName.localeCompare(b.agencyName);
              })
          : [];

      const lobBarChart =
        lobBarData && lobBarData.lobNames.length && lobBarSeries.length ? (
          <div className="surface" style={{ padding: 10, borderRadius: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Line of Business overview</div>
            <Chart
              height={320}
              option={{
                tooltip: {
                  trigger: "axis",
                  axisPointer: { type: "shadow" },
                  formatter: (params: any) => {
                    const list = Array.isArray(params) ? params : [params];
                    const axisLabel = list[0]?.axisValueLabel || "";
                    const lines = list.map((p) => {
                      const datum: any = p?.data ?? {};
                      const appsVal = typeof datum === "object" && datum !== null ? datum.apps ?? 0 : p?.data ?? 0;
                      const premiumVal = typeof datum === "object" && datum !== null ? datum.premium ?? 0 : p?.data ?? 0;
                      const appsNum = typeof appsVal === "number" ? appsVal : Number(appsVal) || 0;
                      const premiumNum = typeof premiumVal === "number" ? premiumVal : Number(premiumVal) || 0;
                      return `${p.marker}${p.seriesName}: ${appsNum} apps • $${Math.round(premiumNum)}`;
                    });
                    return [axisLabel, ...lines].join("<br/>");
                  },
                },
                legend: { type: lobBarSeries.length > 2 ? "scroll" : "plain" },
                xAxis: { type: "category", data: lobBarData.lobNames },
                yAxis: { type: "value" },
                series: lobBarSeries.map((agency) => ({
                  name: agency.agencyName,
                  type: "bar",
                  emphasis: { focus: "series" as const },
                  data: lobBarData.lobNames.map((_, idx) => {
                    const appsVal = agency.apps[idx] ?? 0;
                    const premiumVal = agency.premium[idx] ?? 0;
                    return {
                      value: metric === "apps" ? appsVal : premiumVal,
                      apps: appsVal,
                      premium: premiumVal,
                    };
                  }),
                })),
              }}
              onEvents={{
                click: (params: any) => {
                  const lobName = params?.name;
                  if (!lobName) return;
                  goToSoldProducts({
                    lobName,
                    agencyIds: selectedAgencyIds,
                    statuses: navStatuses,
                    start: rangeShown.start,
                    end: rangeShown.end,
                  });
                },
              }}
            />
          </div>
        ) : (
          <div className="surface" style={{ padding: 10, borderRadius: 12, border: "1px solid #e5e7eb", color: "#6b7280" }}>
            No data for selected filters
          </div>
        );

      const renderAgencyBlock = (
        agency: (typeof cardsToRender)[number]["totalsByAgency"][number],
        idx: number
      ) => (
        <div key={`${agency.agencyId}-${idx}`} className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{agency.agencyName}</div>
            <div style={{ color: "#475569", fontSize: 12 }}>
              {metric === "premium" ? `$${Math.round(agency.premium)}` : `${Math.round(agency.apps)} apps`}
            </div>
          </div>
          {agency.apps === 0 && agency.premium === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 12 }}>No production</div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {agency.topSellers.slice(0, 4).map((s) => (
                <div key={s.personName} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>{s.personName}</span>
                  <span style={{ color: "#475569" }}>
                    {metric === "premium" ? `$${Math.round(s.premium)}` : `${Math.round(s.apps)} apps`}
                  </span>
                </div>
              ))}
              {agency.allOthers.apps > 0 || agency.allOthers.premium > 0 ? (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280" }}>
                  <span>All others</span>
                  <span>
                    {metric === "premium"
                      ? `$${Math.round(agency.allOthers.premium)}`
                      : `${Math.round(agency.allOthers.apps)} apps`}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      );

      const handleCardNavigate = (lobName: string) => {
        goToSoldProducts({
          lobName,
          agencyIds: selectedAgencyIds,
          statuses: navStatuses,
          start: rangeShown.start,
          end: rangeShown.end,
        });
      };

      const handleTrendPointClick = () => {
        goToSoldProducts({
          lobName: trendLobName,
          agencyIds: selectedAgencyIds,
          statuses: navStatuses,
          start: rangeShown.start,
          end: rangeShown.end,
        });
      };

      const trendOption: EChartsOption = {
        tooltip: {
          trigger: "axis",
          formatter: (params: any) => {
            const item = Array.isArray(params) ? params[0] : params;
            const idx = item?.dataIndex ?? 0;
            const label = trendLabels[idx] || "";
            const appsVal = trendData.apps[idx] ?? 0;
            const premiumVal = trendData.premium[idx] ?? 0;
            return `${label}<br/>Apps: ${appsVal} • $${Math.round(premiumVal)}`;
          },
        },
        legend: { data: ["Apps", "Premium"] },
        xAxis: { type: "category", data: trendLabels },
        yAxis: { type: "value" },
        series: [
          { name: "Apps", type: "line", smooth: true, data: trendData.apps },
          { name: "Premium", type: "line", smooth: true, data: trendData.premium },
        ],
      };

      const trendEvents = { onEvents: { click: handleTrendPointClick } } as any;

      return (
        <div style={{ display: "grid", gap: 12 }}>
          {lobBarChart}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            {cardsToRender.map((card) => {
              const cardValue = metric === "premium" ? card.totalsAllAgencies.premium : card.totalsAllAgencies.apps;
              const headerColor = LOB_COLORS[card.lobName as keyof typeof LOB_COLORS] ?? "#111827";
              const agenciesForCard = card.totalsByAgency;
              const multiAgency = agenciesForCard.length > 1;
              return (
                <div
                  key={card.lobName}
                  className="surface"
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 10,
                    display: "grid",
                    gap: 8,
                    minHeight: 220,
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, cursor: "pointer" }}
                    onClick={() => handleCardNavigate(card.lobName)}
                  >
                    <div style={{ fontWeight: 800, color: headerColor }}>{card.lobName}</div>
                    <div style={{ color: "#475569", fontSize: 12 }}>{metric === "apps" ? "Apps" : "Premium"}</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {metric === "premium" ? `$${Math.round(cardValue)}` : Math.round(cardValue)}
                  </div>
                  {cardValue === 0 ? <div style={{ color: "#6b7280", fontSize: 12 }}>No production</div> : null}
                  <div
                    style={{
                      display: "grid",
                      gap: 8,
                      gridTemplateColumns: multiAgency ? "repeat(auto-fit, minmax(200px, 1fr))" : "1fr",
                    }}
                  >
                    {agenciesForCard.map((agency, idx) => renderAgencyBlock(agency, idx))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="surface" style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>LoB mini trend</div>
              <select
                className="select"
                value={trendLobName}
                onChange={(e) => setLobTrendSelection(e.target.value)}
                style={{ minWidth: 160 }}
              >
                {cardsToRender.map((card) => (
                  <option key={card.lobName} value={card.lobName}>
                    {card.lobName}
                  </option>
                ))}
              </select>
            </div>
            <Chart option={trendOption} height={220} {...trendEvents} />
          </div>
        </div>
      );
    }

    const option: EChartsOption = {
      tooltip: { trigger: "axis" },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: lobFiltered.series.map((s) => s.name) },
      series: [
        {
          type: "bar",
          data: lobFiltered.series.map((s) => s.data.reduce((a, b) => a + b, 0)),
          itemStyle: { color: "#16a34a" },
        },
      ],
    };
    return <Chart option={option} height={280} />;
  };

  const toggleChart = (id: string) =>
    setSelectedCharts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800 }}>Production Overview</div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Toggle charts and filters. Inline preview uses API data.</div>
        </div>
        <div className="surface" style={{ borderRadius: 12, padding: 10, border: "1px solid #e5e7eb", background: "#f8fafc" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: "#475569", fontSize: 12 }}>Apps | Premium</span>
              <label
                style={{
                  position: "relative",
                  width: 90,
                  height: 32,
                  background: metric === "premium" ? "#2563eb" : "#e5e7eb",
                  borderRadius: 999,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  padding: 4,
                  transition: "background 0.2s ease",
                }}
              >
                <input
                  type="checkbox"
                  checked={metric === "apps"}
                  onChange={(e) => setMetric(e.target.checked ? "apps" : "premium")}
                  style={{ display: "none" }}
                />
                <span
                  style={{
                    position: "absolute",
                    left: metric === "premium" ? 4 : 46,
                    top: 4,
                    width: 40,
                    height: 24,
                    background: "white",
                    borderRadius: 999,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                    transition: "left 0.2s ease",
                  }}
                />
                <span style={{ flex: 1, textAlign: "center", fontSize: 12, color: metric === "premium" ? "white" : "#475569", zIndex: 1 }}>
                  Premium
                </span>
                <span style={{ flex: 1, textAlign: "center", fontSize: 12, color: metric === "apps" ? "#2563eb" : "white", zIndex: 1 }}>
                  Apps
                </span>
              </label>
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: "#475569", fontSize: 12 }}>Grain</span>
              <select
                className="select"
                value={granularity}
                onChange={(e) => setGranularity(e.target.value as "month" | "week")}
              >
                <option value="month">Monthly</option>
                <option value="week">Weekly</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center", position: "relative" }}>
              <span style={{ color: "#475569", fontSize: 12 }}>Range</span>
              <select
                className="select"
                value={rangeMode}
                onChange={(e) => {
                  const next = e.target.value as "all" | "month" | "week" | "custom";
                  setRangeMode(next);
                  // clear custom picks when leaving custom
                  if (next !== "custom") {
                    setCustomStart("");
                    setCustomEnd("");
                    setShowRangePicker(false);
                  }
                }}
              >
                <option value="all">All time</option>
                <option value="month">Last 6 months</option>
                <option value="week">Last 12 weeks</option>
                <option value="custom">Custom</option>
              </select>
              {rangeMode === "custom" && (
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowRangePicker((v) => !v)}
                    style={{ minWidth: 200, justifyContent: "space-between", display: "inline-flex", alignItems: "center" }}
                  >
                    {customStart && customEnd ? `${customStart} → ${customEnd}` : "Pick dates"}
                    <span style={{ fontSize: 12, color: "#475569" }}>▼</span>
                  </button>
                  {showRangePicker && (
                    <RangeOverlay
                      start={customStart}
                      end={customEnd}
                      onChange={(s, e) => {
                        setCustomStart(s);
                        setCustomEnd(e);
                      }}
                      onClose={() => {
                        if (customStart && customEnd) setShowRangePicker(false);
                      }}
                      onClear={() => {
                        setCustomStart("");
                        setCustomEnd("");
                      }}
                    />
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: "#475569", fontSize: 12 }}>Month focus</span>
              <select className="select" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
                <option value="">All</option>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span style={{ color: "#475569", fontSize: 12, lineHeight: "24px" }}>Agencies</span>
              <div
                className="surface"
                style={{
                  padding: 8,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  minWidth: 220,
                  maxHeight: 140,
                  overflowY: "auto",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, marginBottom: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={agencyFilter.length === agencies.length}
                    onChange={(e) => setAgencyFilter(e.target.checked ? agencies.map((a) => a.id) : [])}
                  />
                  Select all
                </label>
                <div style={{ display: "grid", gap: 4 }}>
                  {agencies.map((a) => (
                    <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={agencyFilter.includes(a.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAgencyFilter((prev) => (prev.includes(a.id) ? prev : [...prev, a.id]));
                          } else {
                            setAgencyFilter((prev) => prev.filter((id) => id !== a.id));
                          }
                        }}
                      />
                      {a.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, marginBottom: 8 }}>
        {CHARTS.map((c) => (
          <button
            key={c.id}
            className="btn"
            type="button"
            onClick={() => toggleChart(c.id)}
            style={{
              borderColor: selectedCharts.includes(c.id) ? "#2563eb" : "#e5e7eb",
              background: selectedCharts.includes(c.id) ? "rgba(37,99,235,0.12)" : "white",
              color: "#111827",
            }}
          >
            {selectedCharts.includes(c.id) ? "✓ " : ""}{c.label}
          </button>
        ))}
      </div>

      {lobOverviewCards.length > 0 ? (
        <div className="surface" style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>Line of Business Overview</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>LoB-first view with agency comparisons and trends.</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
            {lobOverviewCards.map((card) => {
              const cardTotal = metric === "premium" ? card.totalPremium : card.totalApps;
              const headerColor = LOB_COLORS[card.lob] ?? "#111827";
              const agenciesDisplay = card.agencies;

              const trendSeries = [
                {
                  type: "line",
                  name: metric === "apps" ? "Apps" : "Premium",
                  smooth: true,
                  symbol: "none",
                  lineStyle: { width: 2, color: "#2563eb" },
                  areaStyle: { color: "rgba(37,99,235,0.08)" },
                  data: card.trend.labels.map((label, idx) => ({
                    value: metric === "apps" ? card.trend.apps[idx] ?? 0 : card.trend.premium[idx] ?? 0,
                    label,
                    apps: card.trend.apps[idx] ?? 0,
                    premium: card.trend.premium[idx] ?? 0,
                  })),
                },
              ];

              const trendOption: EChartsOption = {
                tooltip: {
                  trigger: "axis",
                  formatter: (params: any) => {
                    const item = Array.isArray(params) ? params[0] : params;
                    const datum: any = item?.data ?? {};
                    const appsVal = typeof datum === "object" ? datum.apps ?? datum.value ?? 0 : item?.data ?? 0;
                    const premiumVal = typeof datum === "object" ? datum.premium ?? datum.value ?? 0 : item?.data ?? 0;
                    return `${item.axisValue}<br/>Apps: ${appsVal} • $${Math.round(premiumVal)}`;
                  },
                },
                grid: { left: 28, right: 10, top: 10, bottom: 20 },
                xAxis: { type: "category", data: card.trend.labels, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false } },
                yAxis: { type: "value", axisLabel: { show: false }, splitLine: { show: false } },
                series: trendSeries,
              };

              const handleCardClick = () => {
                goToSoldProducts({
                  lobName: card.lob,
                  agencyIds: agencyFilter,
                  statuses: navStatuses,
                  start: rangeShown.start,
                  end: rangeShown.end,
                });
              };

              const handleTrendClick = (params: any) => {
                params?.event?.event?.stopPropagation?.();
                goToSoldProducts({
                  lobName: card.lob,
                  agencyIds: agencyFilter,
                  statuses: navStatuses,
                  start: rangeShown.start,
                  end: rangeShown.end,
                });
              };

              const trendEvents = { onEvents: { click: handleTrendClick } } as any;

              return (
                <div
                  key={card.lob}
                  className="surface"
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 10,
                    display: "grid",
                    gap: 8,
                    cursor: "pointer",
                    minHeight: 240,
                  }}
                  onClick={handleCardClick}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ fontWeight: 800, color: headerColor }}>{card.lob}</div>
                    <div style={{ color: "#475569", fontSize: 12 }}>{metric === "apps" ? "Apps" : "Premium"}</div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {metric === "premium" ? `$${Math.round(cardTotal)}` : Math.round(cardTotal)}
                  </div>
                  {cardTotal === 0 ? <div style={{ color: "#6b7280", fontSize: 12 }}>No production</div> : null}
                  <div>
                    <Chart option={trendOption} height={120} {...trendEvents} />
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {agenciesDisplay.map((agency) => (
                      <div key={agency.agencyId} className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{agency.agencyName}</div>
                          <div style={{ color: "#475569", fontSize: 12 }}>
                            {metric === "premium"
                              ? `$${Math.round(agency.totalPremium)}`
                              : `${Math.round(agency.totalApps)} apps`}
                          </div>
                        </div>
                        <div style={{ display: "grid", gap: 4 }}>
                          {agency.sellers.slice(0, 4).map((s) => (
                            <div key={s.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                              <span>{s.name}</span>
                              <span style={{ color: "#475569" }}>
                                {metric === "premium" ? `$${Math.round(s.premium)}` : `${Math.round(s.apps)} apps`}
                              </span>
                            </div>
                          ))}
                          {agency.others.apps > 0 || agency.others.premium > 0 ? (
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280" }}>
                              <span>All others</span>
                              <span>
                                {metric === "premium"
                                  ? `$${Math.round(agency.others.premium)}`
                                  : `${Math.round(agency.others.apps)} apps`}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <KPI label="Total" value={kpiTotals.total} metric={metric} />
          <KPI label="Business" value={kpiTotals.business} metric={metric} />
        </div>
        {selectedCharts.map((id) => (
          <div key={id} className="surface" style={{ padding: 10, borderRadius: 12, border: "1px solid #e5e7eb" }}>
            {(() => {
              const meta = CHARTS.find((c) => c.id === id);
              return (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontWeight: 700 }}>{meta?.label}</div>
                  {id === "lobByAgencyGroup" ? (
                    <div style={{ color: "#475569", fontSize: 12 }}>
                      Compare offices by LoB. Toggle Apps/Premium. Click a bar to view policies.
                    </div>
                  ) : null}
                  {id === "lobOverview" ? (
                    <div style={{ color: "#475569", fontSize: 12 }}>
                      Grouped bars by agency and LoB. Toggle Apps/Premium. Click to drill into policies.
                    </div>
                  ) : null}
                </div>
              );
            })()}
            {renderChart(id)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PresetActivityOverview() {
  const [data, setData] = useState<{ labels: string[]; series: number[] }>({ labels: [], series: [] });
  useEffect(() => {
    fetchActivity({ granularity: "month" }).then((d) => setData(d));
  }, []);
  const option: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: data.labels },
      yAxis: { type: "value" },
      dataZoom: [{ type: "slider" }],
      series: [{ type: "line", data: data.series, name: "Activities" }],
    }),
    [data]
  );
  return (
    <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Activity Overview</div>
      <Chart option={option} height={240} />
    </div>
  );
}

function KPI({ label, value, metric }: { label: string; value: number; metric: string }) {
  return (
    <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20 }}>{metric === "premium" ? `$${Math.round(value)}` : Math.round(value)}</div>
    </div>
  );
}
