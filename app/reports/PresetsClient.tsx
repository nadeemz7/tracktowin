"use client";

import { useEffect, useMemo, useState } from "react";
import { Chart } from "@/components/Chart";
import type { EChartsOption } from "echarts";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { deriveEffectiveRange, type Granularity } from "@/lib/reports/deriveEffectiveRange";
import { CANONICAL_LOB_ORDER, normalizeLobName, lobToCategory } from "@/lib/reports/lob";

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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          fontSize: 12,
          color: "#94a3b8",
          marginBottom: 4,
        }}
      >
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

// QA checklist:
// - Trend mode persistence (refresh and confirm)
// - Group toggles persistence (refresh and confirm)
// - Product Mix updates with Apps/Premium toggle
// - Top Movers updates with Apps/Premium + date range
// - Copy CSV works (and failure message on denied clipboard)

const CHART_GROUP_STORAGE_KEY = "ttw:production:chartGroups:v1";
const TREND_MODE_STORAGE_KEY = "ttw:production:trendMode:v1";
const CHART_GROUPS = [
  { id: "exec", label: "Executive Summary", description: "KPIs and headline ratios." },
  { id: "trend", label: "Trend", description: "Time-series performance view." },
  { id: "mix", label: "Mix & Share", description: "Product and line-of-business mix." },
  { id: "people", label: "People / Leaderboard", description: "Top sellers and LoB cards." },
  { id: "drilldowns", label: "Drilldowns", description: "Detail comparisons and drilldowns." },
] as const;

type ChartGroupId = (typeof CHART_GROUPS)[number]["id"];

const DEFAULT_CHART_GROUPS: Record<ChartGroupId, boolean> = {
  exec: true,
  trend: true,
  mix: true,
  people: true,
  drilldowns: true,
};

const CHART_GROUP_MAP: Record<string, ChartGroupId> = {
  trend: "trend",
  products: "mix",
  lob: "mix",
  lobOverview: "drilldowns",
  lobByAgencyGroup: "drilldowns",
  lobCards: "people",
};

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

export function PresetProductionOverview({
  agencies,
  variant = "full",
}: {
  agencies: AgencyOption[];
  variant?: "full" | "inline";
}) {
  const compact = variant === "inline";
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
  const [enableChartDrilldown, setEnableChartDrilldown] = useState<boolean>(true);

  const [trend, setTrend] = useState<ProductionResponse>({ labels: [], series: [] });
  const [products, setProducts] = useState<ProductionResponse>({ labels: [], series: [] });
  const [lob, setLob] = useState<ProductionResponse>({ labels: [], series: [] });
  const [previousLob, setPreviousLob] = useState<ProductionResponse | null>(null);
  const [trendGroups, setTrendGroups] = useState<{ pc: boolean; fs: boolean; ips: boolean }>({
    pc: true,
    fs: true,
    ips: false,
  });
  const [trendMode, setTrendMode] = useState<"raw" | "grouped">("grouped");
  const [trendModeFallback, setTrendModeFallback] = useState<boolean>(false);
  const [topMoversCopied, setTopMoversCopied] = useState<boolean>(false);
  const [topMoversCopyError, setTopMoversCopyError] = useState<boolean>(false);
  const [chartGroups, setChartGroups] = useState<Record<ChartGroupId, boolean>>(() => ({ ...DEFAULT_CHART_GROUPS }));

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
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(CHART_GROUP_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Partial<Record<ChartGroupId, boolean>>;
      setChartGroups((prev) => {
        const next = { ...prev };
        CHART_GROUPS.forEach((g) => {
          if (typeof parsed[g.id] === "boolean") next[g.id] = parsed[g.id] as boolean;
        });
        return next;
      });
    } catch {
      // ignore storage parse errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(TREND_MODE_STORAGE_KEY);
    if (stored === "raw" || stored === "grouped") {
      setTrendMode(stored);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TREND_MODE_STORAGE_KEY, trendMode);
  }, [trendMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CHART_GROUP_STORAGE_KEY, JSON.stringify(chartGroups));
  }, [chartGroups]);

  const monthFocusedRange = useMemo(() => {
    if (!monthFilter) return null;
    const base = new Date(`${monthFilter}-01`);
    if (Number.isNaN(base.getTime())) return null;
    return { start: formatISODate(startOfMonth(base)), end: formatISODate(endOfMonth(base)) };
  }, [monthFilter]);

  const comparisonRanges = useMemo(() => {
    if (monthFocusedRange?.start && monthFocusedRange?.end) {
      const currentStart = new Date(monthFocusedRange.start);
      if (!Number.isNaN(currentStart.getTime())) {
        const previousStart = startOfMonth(subMonths(currentStart, 1));
        const previousEnd = endOfMonth(previousStart);
        return {
          current: monthFocusedRange,
          previous: { start: formatISODate(previousStart), end: formatISODate(previousEnd) },
        };
      }
    }

    if (rangeMode === "custom" && !rangeSelection.ready) return null;

    if (rangeSelection.start && rangeSelection.end) {
      const currentStart = new Date(rangeSelection.start);
      const currentEnd = new Date(rangeSelection.end);
      if (!Number.isNaN(currentStart.getTime()) && !Number.isNaN(currentEnd.getTime())) {
        const durationDays = Math.max(1, differenceInCalendarDays(currentEnd, currentStart) + 1);
        const previousEnd = subDays(currentStart, 1);
        const previousStart = subDays(previousEnd, durationDays - 1);
        return {
          current: { start: formatISODate(currentStart), end: formatISODate(currentEnd) },
          previous: { start: formatISODate(previousStart), end: formatISODate(previousEnd) },
        };
      }
    }

    const lastFullMonthStart = startOfMonth(subMonths(new Date(), 1));
    const lastFullMonthEnd = endOfMonth(lastFullMonthStart);
    const previousMonthStart = startOfMonth(subMonths(lastFullMonthStart, 1));
    const previousMonthEnd = endOfMonth(previousMonthStart);
    return {
      current: { start: formatISODate(lastFullMonthStart), end: formatISODate(lastFullMonthEnd) },
      previous: { start: formatISODate(previousMonthStart), end: formatISODate(previousMonthEnd) },
    };
  }, [monthFocusedRange, rangeMode, rangeSelection.start, rangeSelection.end, rangeSelection.ready]);

  const prevRange = comparisonRanges?.previous;
  const prevStart = prevRange?.start;
  const prevEnd = prevRange?.end;
  const hasPrevRange = Boolean(prevStart && prevEnd);

  useEffect(() => {
    const { start, end, ready } = rangeSelection;
    if (rangeMode === "custom" && !ready && !monthFocusedRange) return;

    const effectiveRange = monthFocusedRange ?? { start, end };
    const base = {
      agencyIds: agencyFilter.length ? agencyFilter : undefined,
      granularity,
      start: effectiveRange.start,
      end: effectiveRange.end,
      metric,
    };
    fetchProduction({ ...base, dimension: "agency" }).then(setTrend);
    fetchProduction({ ...base, dimension: "product" }).then(setProducts);
    fetchProduction({ ...base, dimension: "lob" }).then(setLob);
  }, [agencyFilter, granularity, rangeMode, customStart, customEnd, metric, rangeSelection, monthFocusedRange]);

  useEffect(() => {
    if (!prevStart || !prevEnd) {
      setPreviousLob(null);
      return;
    }
    const base = {
      agencyIds: agencyFilter.length ? agencyFilter : undefined,
      granularity,
      start: prevStart,
      end: prevEnd,
      metric,
    };
    fetchProduction({ ...base, dimension: "lob" }).then(setPreviousLob);
  }, [agencyFilter, granularity, metric, prevStart, prevEnd]);

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

  // DO NOT BREAK:
  // - aggregatedTrend must stay wired for grouped trend and Product Mix rendering.
  // - trendMode fallback relies on aggregatedTrend being null/available.
  const aggregatedTrend = useMemo(() => {
    const source = trendFiltered.trendByAgencyCategory;
    if (!source?.labels?.length || !source.series?.length) return null;
    const labels = source.labels;
    const categories = ["PC", "FS", "IPS"] as const;
    const totals: Record<"PC" | "FS" | "IPS", { apps: number[]; premium: number[] }> = {
      PC: { apps: Array(labels.length).fill(0), premium: Array(labels.length).fill(0) },
      FS: { apps: Array(labels.length).fill(0), premium: Array(labels.length).fill(0) },
      IPS: { apps: Array(labels.length).fill(0), premium: Array(labels.length).fill(0) },
    };

    source.series.forEach((entry) => {
      const category = entry.category as "PC" | "FS" | "IPS";
      const bucket = totals[category];
      if (!bucket) return;
      entry.apps.forEach((val, idx) => {
        bucket.apps[idx] = (bucket.apps[idx] ?? 0) + (val ?? 0);
      });
      entry.premium.forEach((val, idx) => {
        bucket.premium[idx] = (bucket.premium[idx] ?? 0) + (val ?? 0);
      });
    });

    return {
      labels,
      series: categories.map((category) => ({
        category,
        apps: totals[category].apps,
        premium: totals[category].premium,
      })),
    };
  }, [trendFiltered.trendByAgencyCategory]);

  useEffect(() => {
    if (trendMode === "grouped" && !aggregatedTrend) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[Production Overview] Grouped trend selected but aggregatedTrend is null; falling back to raw."
        );
      }
      // Guard against grouped mode without data; switch once to avoid loops.
      setTrendMode("raw");
      setTrendModeFallback(true);
    }
  }, [trendMode, aggregatedTrend]);

  useEffect(() => {
    if (trendModeFallback && aggregatedTrend) {
      // Clear the fallback note once grouped data is available again.
      setTrendModeFallback(false);
    }
  }, [trendModeFallback, aggregatedTrend]);

  const productMixData = useMemo(() => {
    // No data to chart yet; return null so the placeholder renders instead.
    if (!aggregatedTrend?.labels?.length || !aggregatedTrend.series?.length) return null;
    const labelMap: Record<"PC" | "FS" | "IPS", string> = { PC: "P&C", FS: "FS", IPS: "IPS" };
    const colorMap: Record<"PC" | "FS" | "IPS", string> = { PC: "#1D4ED8", FS: "#C2410C", IPS: "#7C3AED" };
    const series = aggregatedTrend.series
      .map((entry) => {
        const values = metric === "apps" ? entry.apps : entry.premium;
        return {
          name: labelMap[entry.category],
          type: "bar",
          stack: "mix",
          itemStyle: { color: colorMap[entry.category] },
          data: values.map((v) => v ?? 0),
        };
      })
      .filter((s) => s.data.some((v) => v !== 0));

    if (!series.length) return null;
    return { labels: aggregatedTrend.labels, series };
  }, [aggregatedTrend, metric]);

  useEffect(() => {
    if (!lobCardsData?.lobNames?.length) return;
    setLobTrendSelection((prev) => {
      if (prev && (lobCardsData.lobNames.includes(prev) || prev === "Total")) return prev;
      return lobCardsData.lobNames[0];
    });
  }, [lobCardsData?.lobNames]);

  
  const getUnifiedTotals = () => {
    const preferTotals = lobFiltered.totals ?? trendFiltered.totals ?? productsFiltered.totals;

    if (preferTotals) {
      return {
        totalPremium: preferTotals.premium ?? 0,
        totalApps: preferTotals.apps ?? 0,
        businessPremium: preferTotals.businessPremium ?? 0,
      };
    }

    const fallback = lobFiltered.labels.length ? lobFiltered : trendFiltered.labels.length ? trendFiltered : productsFiltered;
    if (!fallback || !fallback.series?.length) {
      return { totalPremium: 0, totalApps: 0, businessPremium: 0 };
    }
    // Series data reflects the active metric only; sum what we have.
    const summed = fallback.series.reduce(
      (acc, s) => {
        const sum = s.data.reduce((a, b) => a + b, 0);
        acc.total += sum;
        if (s.name.toLowerCase().includes("business")) acc.business += sum;
        return acc;
      },
      { total: 0, business: 0 }
    );

    return {
      totalPremium: metric === "premium" ? summed.total : 0,
      totalApps: metric === "apps" ? summed.total : 0,
      businessPremium: metric === "premium" ? summed.business : 0,
    };
  };

  const unifiedTotals = useMemo(() => getUnifiedTotals(), [metric, lobFiltered, trendFiltered, productsFiltered]);
  const kpiTotals = useMemo(
    () => ({
      total: metric === "premium" ? unifiedTotals.totalPremium : unifiedTotals.totalApps,
      business: metric === "premium" ? unifiedTotals.businessPremium ?? 0 : 0,
    }),
    [metric, unifiedTotals]
  );

  const previousTotals = useMemo(() => {
    const totals = previousLob?.totals;
    return {
      totalPremium: totals?.premium ?? 0,
      totalApps: totals?.apps ?? 0,
      businessPremium: totals?.businessPremium ?? 0,
    };
  }, [previousLob]);

  const previousKpiTotals = useMemo(
    () => ({
      total: metric === "premium" ? previousTotals.totalPremium : previousTotals.totalApps,
      business: metric === "premium" ? previousTotals.businessPremium ?? 0 : 0,
    }),
    [metric, previousTotals]
  );

  const computeCategoryTotals = (lobCards: ProductionResponse["lobCards"] | null | undefined) => {
    if (!lobCards?.byLob?.length) {
      return {
        pcPremium: 0,
        fsPremium: 0,
        ipsPremium: 0,
        pcLobs: [] as string[],
        fsLobs: [] as string[],
        ipsLobs: [] as string[],
      };
    }

    const pcLobs = new Set<string>();
    const fsLobs = new Set<string>();
    const ipsLobs = new Set<string>();
    let pcPremium = 0;
    let fsPremium = 0;
    let ipsPremium = 0;

    lobCards.byLob.forEach((entry) => {
      const canon = normalizeLobName(entry.lobName);
      const category = canon ? lobToCategory(canon) : entry.premiumCategory;
      const premium = entry.totalsAllAgencies?.premium ?? 0;
      if (category === "PC") {
        pcPremium += premium;
        pcLobs.add(entry.lobName);
      } else if (category === "FS") {
        fsPremium += premium;
        fsLobs.add(entry.lobName);
      } else {
        ipsPremium += premium;
        ipsLobs.add(entry.lobName);
      }
    });

    return {
      pcPremium,
      fsPremium,
      ipsPremium,
      pcLobs: Array.from(pcLobs),
      fsLobs: Array.from(fsLobs),
      ipsLobs: Array.from(ipsLobs),
    };
  };

  const categoryTotals = useMemo(() => computeCategoryTotals(lobCardsData), [lobCardsData]);
  const previousCategoryTotals = useMemo(() => computeCategoryTotals(previousLob?.lobCards), [previousLob?.lobCards]);

  const totalPremium = unifiedTotals.totalPremium ?? 0;
  const totalApps = unifiedTotals.totalApps ?? 0;
  const businessPremium = unifiedTotals.businessPremium ?? 0;

  const avgPremiumPerApp = totalApps ? totalPremium / totalApps : 0;
  const businessPremiumShare = totalPremium ? (businessPremium / totalPremium) * 100 : 0;

  const pcFsPremiumTotal = categoryTotals.pcPremium + categoryTotals.fsPremium;
  const pcShare = pcFsPremiumTotal ? (categoryTotals.pcPremium / pcFsPremiumTotal) * 100 : 0;
  const fsShare = pcFsPremiumTotal ? (categoryTotals.fsPremium / pcFsPremiumTotal) * 100 : 0;
  const pcLobParam = categoryTotals.pcLobs.length ? categoryTotals.pcLobs.join(",") : "";
  const fsLobParam = categoryTotals.fsLobs.length ? categoryTotals.fsLobs.join(",") : "";

  const previousTotalPremium = previousTotals.totalPremium ?? 0;
  const previousTotalApps = previousTotals.totalApps ?? 0;
  const previousBusinessPremium = previousTotals.businessPremium ?? 0;

  const previousAvgPremiumPerApp = previousTotalApps ? previousTotalPremium / previousTotalApps : 0;
  const previousBusinessPremiumShare = previousTotalPremium ? (previousBusinessPremium / previousTotalPremium) * 100 : 0;

  const previousPcFsPremiumTotal = previousCategoryTotals.pcPremium + previousCategoryTotals.fsPremium;
  const previousPcShare = previousPcFsPremiumTotal ? (previousCategoryTotals.pcPremium / previousPcFsPremiumTotal) * 100 : 0;
  const previousFsShare = previousPcFsPremiumTotal ? (previousCategoryTotals.fsPremium / previousPcFsPremiumTotal) * 100 : 0;

  const previousPcLobParam = previousCategoryTotals.pcLobs.length ? previousCategoryTotals.pcLobs.join(",") : "";
  const previousFsLobParam = previousCategoryTotals.fsLobs.length ? previousCategoryTotals.fsLobs.join(",") : "";

  const topMoversRows = useMemo(() => {
    // If the previous period is missing, show "No data" without throwing.
    if (!hasPrevRange) return null;
    if (!lobCardsData?.byLob?.length || !previousLob?.lobCards?.byLob?.length) return null;
    const allowedAgencies = agencyFilter.length ? new Set(agencyFilter) : null;

    const buildTotals = (lobCards: ProductionResponse["lobCards"]) => {
      const totals = new Map<string, { apps: number; premium: number }>();
      lobCards.byLob.forEach((entry) => {
        entry.totalsByAgency.forEach((agency) => {
          if (allowedAgencies && !allowedAgencies.has(agency.agencyId)) return;
          agency.topSellers.forEach((seller) => {
            const current = totals.get(seller.personName) || { apps: 0, premium: 0 };
            current.apps += seller.apps ?? 0;
            current.premium += seller.premium ?? 0;
            totals.set(seller.personName, current);
          });
        });
      });
      return totals;
    };

    const currentTotals = buildTotals(lobCardsData);
    const previousTotals = buildTotals(previousLob.lobCards);
    const names = new Set([...currentTotals.keys(), ...previousTotals.keys()]);

    const rows = Array.from(names)
      .map((personName) => {
        const current = currentTotals.get(personName) || { apps: 0, premium: 0 };
        const previous = previousTotals.get(personName) || { apps: 0, premium: 0 };
        const currentValue = metric === "premium" ? current.premium : current.apps;
        const previousValue = metric === "premium" ? previous.premium : previous.apps;
        const delta = currentValue - previousValue;
        const pct = previousValue ? (delta / previousValue) * 100 : null;
        return { personName, currentValue, previousValue, delta, pct };
      })
      .filter((row) => row.currentValue !== 0 || row.previousValue !== 0);

    return rows;
  }, [agencyFilter, hasPrevRange, lobCardsData, metric, previousLob]);

  const topMoversIncreases = useMemo(() => {
    if (!topMoversRows?.length) return [];
    return topMoversRows
      .filter((r) => r.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 5);
  }, [topMoversRows]);

  const topMoversDecreases = useMemo(() => {
    if (!topMoversRows?.length) return [];
    return topMoversRows
      .filter((r) => r.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .slice(0, 5);
  }, [topMoversRows]);

  const topMovers = useMemo(() => {
    if (!topMoversIncreases.length && !topMoversDecreases.length) return null;
    return { increases: topMoversIncreases, decreases: topMoversDecreases };
  }, [topMoversIncreases, topMoversDecreases]);

  const topMoversCsv = useMemo(() => {
    if (!topMovers) return "";
    const lines = ["section,person,current,previous,delta,deltaPercent"];
    const pushRows = (section: string, rows: typeof topMoversIncreases) => {
      rows.forEach((row) => {
        const pct = row.pct === null ? "" : row.pct.toFixed(1);
        lines.push(
          [
            section,
            `"${row.personName.replace(/\"/g, '""')}"`,
            row.currentValue.toFixed(2),
            row.previousValue.toFixed(2),
            row.delta.toFixed(2),
            pct,
          ].join(",")
        );
      });
    };
    pushRows("increase", topMoversIncreases);
    pushRows("decrease", topMoversDecreases);
    return lines.join("\n");
  }, [topMovers, topMoversIncreases, topMoversDecreases]);

  const copyTopMoversCsv = async () => {
    if (!topMoversCsv) return;
    try {
      await navigator.clipboard.writeText(topMoversCsv);
      setTopMoversCopyError(false);
      setTopMoversCopied(true);
      window.setTimeout(() => setTopMoversCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; surface a small inline error.
      setTopMoversCopied(false);
      setTopMoversCopyError(true);
      window.setTimeout(() => setTopMoversCopyError(false), 2000);
    }
  };

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const sumLobCards = () => {
      if (!lobCardsData?.byLob?.length) return null;
      const premium = lobCardsData.byLob.reduce((acc, entry) => acc + (entry.totalsAllAgencies.premium ?? 0), 0);
      const apps = lobCardsData.byLob.reduce((acc, entry) => acc + (entry.totalsAllAgencies.apps ?? 0), 0);
      return { premium, apps };
    };
    const sumLobByAgency = () => {
      if (!lob.lobByAgency?.series?.length) return null;
      const premium = lob.lobByAgency.series.reduce((acc, s) => acc + s.premium.reduce((a, b) => a + (b ?? 0), 0), 0);
      const apps = lob.lobByAgency.series.reduce((acc, s) => acc + s.apps.reduce((a, b) => a + (b ?? 0), 0), 0);
      return { premium, apps };
    };
    const cards = sumLobCards();
    const lobByAgencyTotals = sumLobByAgency();
    if (!cards || !lobByAgencyTotals) return;
    const premiumDiff = Math.abs(cards.premium - lobByAgencyTotals.premium);
    const appsDiff = Math.abs(cards.apps - lobByAgencyTotals.apps);
    if (premiumDiff > 5 || appsDiff > 1) {
      console.warn("[TotalsMismatch]", { cards, lobByAgencyTotals, premiumDiff, appsDiff });
    }
  }, [lobCardsData, lob.lobByAgency]);

  const statusesParam = lob.statuses?.length ? lob.statuses.join(",") : "";
  const navStatuses = useMemo(
    () => (statusesParam ? statusesParam.split(",").filter(Boolean) : DEFAULT_STATUSES),
    [statusesParam]
  );

  const agenciesParam = useMemo(
    () => (agencyFilter.length ? agencyFilter : agencies.map((a) => a.id)),
    [agencyFilter, agencies]
  );

  const isSingleAgencyView = (agenciesParam?.length ?? 0) <= 1;

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

  const navigationRange = useMemo(
    () =>
      deriveEffectiveRange({
        start: customStart || undefined,
        end: customEnd || undefined,
        monthFilter: monthFilter || undefined,
        labels: lob.labels,
        granularity,
      }),
    [customStart, customEnd, monthFilter, lob.labels, granularity]
  );

  const navStart = navigationRange.start ?? rangeShown.start;
  const navEnd = navigationRange.end ?? rangeShown.end;

  const categoryLobMap = useMemo(() => {
    const map: Record<"PC" | "FS" | "IPS", Set<string>> = {
      PC: new Set(categoryTotals.pcLobs),
      FS: new Set(categoryTotals.fsLobs),
      IPS: new Set(categoryTotals.ipsLobs),
    };
    (lobFiltered.series ?? []).forEach((series) => {
      const canon = normalizeLobName(series.name);
      const category = canon ? lobToCategory(canon) : null;
      if (category) map[category].add(series.name);
    });
    return {
      PC: Array.from(map.PC),
      FS: Array.from(map.FS),
      IPS: Array.from(map.IPS),
    };
  }, [categoryTotals.pcLobs, categoryTotals.fsLobs, categoryTotals.ipsLobs, lobFiltered.series]);

  // DO NOT BREAK:
  // - all drilldowns must route through buildSoldProductsUrl for consistent params.
  const buildSoldProductsUrl = (args: {
    lobName?: string;
    category?: "PC" | "FS" | "IPS";
    agencyIds?: string[];
    start?: string;
    end?: string;
    statuses?: string[];
    personId?: string;
    productIds?: string[];
    labels?: string[];
    granularity?: Granularity;
    customStart?: string;
    customEnd?: string;
    monthFilter?: string;
    businessOnly?: boolean;
  }) => {
    const { start: effStart, end: effEnd } = deriveEffectiveRange({
      start: args.customStart,
      end: args.customEnd,
      monthFilter: args.monthFilter,
      labels: args.labels,
      granularity: args.granularity,
    });
    const effectiveStart = args.start ?? effStart;
    const effectiveEnd = args.end ?? effEnd;

    const qs = new URLSearchParams();
    if (effectiveStart) qs.set("start", effectiveStart);
    if (effectiveEnd) qs.set("end", effectiveEnd);
    if (args.agencyIds?.length) qs.set("agencies", args.agencyIds.join(","));
    if (args.statuses?.length) qs.set("statuses", args.statuses.join(","));
    let lobParam = args.lobName;
    if (!lobParam && args.category) {
      const lobsForCategory = categoryLobMap[args.category] ?? [];
      if (!lobsForCategory.length) return null;
      lobParam = lobsForCategory.join(",");
    }
    if (lobParam) qs.set("lob", lobParam);
    if (args.personId) qs.set("personId", args.personId);
    if (args.productIds?.length) qs.set("products", args.productIds.join(","));
    if (args.businessOnly) qs.set("businessOnly", "1");

    if (process.env.NODE_ENV !== "production" && (!effectiveStart || !effectiveEnd)) {
      console.warn("[Production Overview] Drilldown URL built without date range", args);
    }

    return `/sold-products?${qs.toString()}`;
  };

  const goToSoldProducts = (args: Parameters<typeof buildSoldProductsUrl>[0]) => {
    const url = buildSoldProductsUrl(args);
    if (!url) return;
    window.location.href = url;
  };

  const goToPrevSoldProducts = (overrides: Partial<Parameters<typeof goToSoldProducts>[0]> = {}) => {
    if (!prevStart || !prevEnd) return;
    goToSoldProducts({
      agencyIds: agenciesParam,
      statuses: navStatuses,
      start: prevStart,
      end: prevEnd,
      ...overrides,
    });
  };

  const categoryFromSeriesName = (seriesName?: string): "PC" | "FS" | "IPS" | undefined => {
    if (!seriesName) return undefined;
    if (seriesName === "P&C" || seriesName === "PC") return "PC";
    if (seriesName === "FS") return "FS";
    if (seriesName === "IPS") return "IPS";
    return undefined;
  };

  const prevButtonStyle: React.CSSProperties = {
    padding: 0,
    border: "none",
    background: "none",
    fontSize: 12,
    fontWeight: 600,
  };

  const formatSignedMetricValue = (value: number, mode: "premium" | "apps") => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    const rounded = Math.round(Math.abs(value));
    return `${sign}${mode === "premium" ? `$${rounded}` : rounded}`;
  };

  const formatSignedPercent = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}${Math.abs(value).toFixed(1)}%`;
  };

  const formatSignedPoints = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}${Math.abs(value).toFixed(1)}pp`;
  };

  const renderPrevButton = (onPrev?: () => void) => {
    if (!hasPrevRange) return null;
    const disabled = !onPrev;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled || !onPrev) return;
          onPrev();
        }}
        style={{
          ...prevButtonStyle,
          color: disabled ? "#94a3b8" : "#2563eb",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        Prev
      </button>
    );
  };

  const renderMetricDelta = (current: number, previous: number, mode: "premium" | "apps", onPrev?: () => void) => {
    if (!hasPrevRange) return null;
    const delta = current - previous;
    const pct = previous ? (delta / previous) * 100 : null;

    const deltaText =
      pct === null
        ? `${formatSignedMetricValue(delta, mode)} vs prev`
        : `${formatSignedMetricValue(delta, mode)} (${formatSignedPercent(pct)}) vs prev`;

    return (
      <div style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
        <span>{deltaText}</span>
        {renderPrevButton(onPrev)}
      </div>
    );
  };

  const renderShareDelta = (current: number, previous: number, onPrev?: () => void) => {
    if (!hasPrevRange) return null;
    const delta = current - previous;
    return (
      <div style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 6 }}>
        <span>{`${formatSignedPoints(delta)} vs prev`}</span>
        {renderPrevButton(onPrev)}
      </div>
    );
  };

  const renderShareDeltaLine = (label: string, current: number, previous: number, onPrev?: () => void) => {
    if (!hasPrevRange) return null;
    const delta = current - previous;
    return (
      <div
        style={{
          fontSize: 12,
          color: "#6b7280",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>{`${label}: ${formatSignedPoints(delta)} vs prev`}</span>
        {renderPrevButton(onPrev)}
      </div>
    );
  };

  const trendChartData = useMemo(() => {
    const groupedTrend = trendMode === "grouped" ? aggregatedTrend : null;
    const labels = groupedTrend?.labels?.length ? groupedTrend.labels : lobFiltered.labels;
    const series: any[] = [];

    if (groupedTrend && groupedTrend.series?.length) {
      const categoryLabels: Record<"PC" | "FS" | "IPS", string> = { PC: "P&C", FS: "FS", IPS: "IPS" };
      const colorMap: Record<"PC" | "FS" | "IPS", string> = { PC: "#1D4ED8", FS: "#C2410C", IPS: "#7C3AED" };
      groupedTrend.series.forEach((entry) => {
        const categoryKey = entry.category.toLowerCase() as "pc" | "fs" | "ips";
        if (!trendGroups[categoryKey]) return;
        const dataPoints = labels.map((_, idx) => {
          const appsVal = entry.apps[idx] ?? 0;
          const premiumVal = entry.premium[idx] ?? 0;
          return { value: metric === "apps" ? appsVal : premiumVal, apps: appsVal, premium: premiumVal, category: entry.category };
        });
        series.push({
          name: categoryLabels[entry.category],
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3 },
          itemStyle: { color: colorMap[entry.category] },
          data: dataPoints,
        });
      });
    } else {
      (lobFiltered.series ?? []).forEach((s) => {
        const normalized = normalizeLobName(s.name);
        const category = lobToCategory(normalized);
        const categoryKey = category ? (category.toLowerCase() as "pc" | "fs" | "ips") : null;
        if (categoryKey && !trendGroups[categoryKey]) return;
        const dataPoints = labels.map((label, idx) => {
          const value = s.data[idx] ?? 0;
          return {
            value,
            apps: metric === "apps" ? value : 0,
            premium: metric === "premium" ? value : 0,
            label,
            category,
          };
        });
        series.push({
          name: s.name,
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3 },
          itemStyle: { color: LOB_COLORS[normalized] ?? "#2563eb" },
          data: dataPoints,
        });
      });
    }

    // Guard empty labels/series so charts can render a placeholder instead.
    if (!labels.length || series.length === 0) {
      return { labels, option: null as EChartsOption | null };
    }

    const option: EChartsOption = {
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params];
          const axisLabel = list[0]?.axisValueLabel || "";
          const lines = list.map((p) => {
            const datum: any = p?.data ?? {};
            const valueNum = typeof datum === "object" && datum !== null ? Number(datum.value ?? 0) : Number(p?.data) || 0;
            const appsNum =
              typeof datum === "object" && datum !== null && typeof datum.apps === "number"
                ? datum.apps
                : metric === "apps"
                ? valueNum
                : 0;
            const premiumNum =
              typeof datum === "object" && datum !== null && typeof datum.premium === "number"
                ? datum.premium
                : metric === "premium"
                ? valueNum
                : 0;
            return `${p.marker}${p.seriesName}: ${Math.round(appsNum)} apps | $${Math.round(premiumNum)}`;
          });
          return [axisLabel, ...lines].join("<br/>");
        },
      },
      legend: series.length > 1 ? { type: "scroll", data: series.map((s) => s.name) } : undefined,
      dataZoom: [{ type: "slider" }],
      xAxis: { type: "category", data: labels },
      yAxis: { type: "value" },
      series,
    };

    return { labels, option };
  }, [trendMode, aggregatedTrend, lobFiltered.labels, lobFiltered.series, trendGroups, metric]);

  const productsChartOption = useMemo(() => {
    const TOP_PRODUCTS_N = 8;
    const topSeries = productsFiltered.series
      .map((s) => {
        const total = s.data.reduce((a, b) => a + b, 0);
        return {
          name: s.name,
          value: total,
          apps: metric === "apps" ? total : undefined,
          premium: metric === "premium" ? total : undefined,
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_PRODUCTS_N);

    const option: EChartsOption = {
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          const item = Array.isArray(params) ? params[0] : params;
          const datum: any = item?.data ?? {};
          const appsVal = datum.apps ?? datum.value ?? 0;
          const premiumVal = datum.premium ?? datum.value ?? 0;
          return `${item.name}<br/>Apps: ${Math.round(appsVal)} • $${Math.round(premiumVal)}`;
        },
      },
      xAxis: { type: "value" },
      yAxis: { type: "category", data: topSeries.map((s) => s.name) },
      series: [
        {
          type: "bar",
          data: topSeries.map((s) => ({ value: s.value, apps: s.apps, premium: s.premium, name: s.name })),
          itemStyle: { color: "#2563eb" },
        },
      ],
    };

    return option;
  }, [productsFiltered.series, metric]);

  const lobByAgencyGroupChart = useMemo(() => {
    if (!lobByAgencyData?.lobNames?.length || !lobByAgencyData.series?.length) {
      return null;
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
      legend: isSingleAgencyView ? undefined : { type: "scroll" },
      grid: { left: 50, right: 20, top: 40, bottom: 40 },
      xAxis: { type: "category", data: lobNames },
      yAxis: { type: "value" },
      series,
    };

    return { option };
  }, [lobByAgencyData, metric, isSingleAgencyView]);

  const lobOverviewChart = useMemo(() => {
    const data = lob.lobByAgency ?? null;
    if (!data?.lobNames?.length || !data.series?.length) {
      return null;
    }

    const canonicalToOriginal = new Map<string, string>();
    data.lobNames.forEach((label) => {
      const canon = normalizeLobName(label);
      if (canon) canonicalToOriginal.set(canon, label);
    });
    const orderedCanonical = CANONICAL_LOB_ORDER.filter((c) => canonicalToOriginal.has(c)).map((c) => canonicalToOriginal.get(c)!);
    const used = new Set(orderedCanonical);
    const extras = data.lobNames.filter((l) => !used.has(l));
    const lobNamesOrdered = [...orderedCanonical, ...extras];

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
      return null;
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

    const tooltipFixed = (params: any) => {
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
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: tooltipFixed },
      legend: isSingleAgencyView ? undefined : { type: "scroll" },
      grid: { left: 40, right: 20, top: 36, bottom: 30 },
      xAxis: { type: "category", data: lobNamesOrdered },
      yAxis: { type: "value" },
      series,
    };

    return { option, selectedAgencyIds };
  }, [lob.lobByAgency, agencyFilter, metric, isSingleAgencyView]);

  const lobSummaryOption = useMemo(() => {
    return {
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
    } as EChartsOption;
  }, [lobFiltered.series]);

  // ---------- renderChart (unchanged except product tooltip fix) ----------
  const renderChart = (id: string) => {
    if (id === "trend") {
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

      if (!trendChartData.option) {
        return (
          <div style={{ display: "grid", gap: 6 }}>
            {trendToggles}
            <div style={{ color: "#6b7280", padding: 8 }}>No data for selected filters</div>
          </div>
        );
      }

      const handleTrendPointClick = (params: any) => {
        if (!enableChartDrilldown) return;
        const datum: any = params?.data ?? {};
        const agencyId = datum?.agencyId as string | undefined;
        const agenciesForNav = agencyId ? [agencyId] : agenciesParam;
        const seriesName = typeof params?.seriesName === "string" ? params.seriesName : undefined;
        const isGroupedMode = trendMode === "grouped";
        const category = isGroupedMode ? ((datum?.category as "PC" | "FS" | "IPS" | undefined) ?? categoryFromSeriesName(seriesName)) : undefined;
        const lobName = !isGroupedMode ? seriesName : undefined;
        if (isGroupedMode && !category) return;
        if (!isGroupedMode && !lobName) return;
        goToSoldProducts({
          lobName,
          category,
          agencyIds: agenciesForNav,
          statuses: navStatuses,
          start: navStart,
          end: navEnd,
          labels: trendChartData.labels,
          granularity,
          customStart,
          customEnd,
          monthFilter,
        });
      };

      return (
        <div style={{ display: "grid", gap: 6 }}>
          {trendToggles}
          <Chart option={trendChartData.option} height={280} onEvents={{ click: handleTrendPointClick }} />
          {enableChartDrilldown ? <div style={{ fontSize: 12, color: "#6b7280" }}>Tip: click a series to drill down</div> : null}
        </div>
      );
    }

    if (id === "products") {
      const handleProductClick = (_params: any) => {
        if (!enableChartDrilldown) return;
        goToSoldProducts({
          agencyIds: agenciesParam,
          statuses: navStatuses,
          start: navStart,
          end: navEnd,
          customStart,
          customEnd,
          monthFilter,
          labels: productsFiltered.labels,
          granularity,
        });
      };

      return <Chart option={productsChartOption} height={320} onEvents={{ click: handleProductClick }} />;
    }

    if (id === "lobByAgencyGroup") {
      if (!lobByAgencyGroupChart) {
        return <div style={{ color: "#6b7280", padding: 8 }}>No data for selected filters</div>;
      }

      const handleBarClick = (params: any) => {
        if (!enableChartDrilldown) return;
        const datum: any = params?.data ?? {};
        const lob = datum?.lob || params?.name;
        const agencyId = datum?.agencyId;
        if (!lob || !agencyId) return;
        goToSoldProducts({
          lobName: lob,
          agencyIds: [agencyId],
          statuses: navStatuses,
          start: navStart,
          end: navEnd,
          customStart,
          customEnd,
          monthFilter,
        });
      };

      return <Chart option={lobByAgencyGroupChart.option} height={320} onEvents={{ click: handleBarClick }} />;
    }

    if (id === "lobOverview") {
      if (!lobOverviewChart) {
        return <div style={{ color: "#6b7280", padding: 8 }}>No data for selected filters</div>;
      }

      const handleClick = (params: any) => {
        if (!enableChartDrilldown) return;
        const datum: any = params?.data ?? {};
        const lobName = datum?.lobName || params?.name;
        if (!lobName) return;
        const agencyId = datum?.agencyId as string | undefined;
        const agenciesForNav = agencyId ? [agencyId] : lobOverviewChart.selectedAgencyIds;
        goToSoldProducts({
          lobName,
          agencyIds: agenciesForNav,
          statuses: navStatuses,
          start: navStart,
          end: navEnd,
          customStart,
          customEnd,
          monthFilter,
        });
      };

      return (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ color: "#475569", fontSize: 12 }}>
            LoB overview (grouped bar). Toggle Apps/Premium. Click a bar to view policies.
          </div>
          <Chart option={lobOverviewChart.option} height={320} onEvents={{ click: handleClick }} />
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
                    customStart,
                    customEnd,
                    monthFilter,
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
              {agency.topSellers
                .slice()
                .sort((a, b) =>
                  metric === "premium" ? (b.premium ?? 0) - (a.premium ?? 0) : (b.apps ?? 0) - (a.apps ?? 0)
                )
                .slice(0, 4)
                .map((s) => {
                  const value = metric === "premium" ? Math.round(s.premium) : Math.round(s.apps);
                  const muted = value === 0;
                  return (
                    <div
                      key={s.personName}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 12,
                        color: muted ? "#9ca3af" : undefined,
                      }}
                    >
                      <span>{s.personName}</span>
                      <span style={{ color: muted ? "#9ca3af" : "#475569" }}>
                        {metric === "premium" ? `$${value}` : `${value} apps`}
                      </span>
                    </div>
                  );
                })}
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

      const handleTrendPointClick = (params: any) => {
        if (!enableChartDrilldown) return;
        const idx = typeof params?.dataIndex === "number" ? params.dataIndex : null;
        if (idx === null) return;
        const label = trendLabels[idx];
        if (!label || label.length !== 7) return;
        const start = `${label}-01`;
        const end = formatISODate(endOfMonth(new Date(`${label}-01T00:00:00`)));
        goToSoldProducts({
          lobName: trendLobName,
          agencyIds: selectedAgencyIds,
          statuses: navStatuses,
          start,
          end,
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
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCardNavigate(card.lobName);
                      }
                    }}
                  >
                    <div style={{ fontWeight: 800, color: headerColor }}>{card.lobName}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#475569", fontSize: 12 }}>
                      <span>{metric === "apps" ? "Apps" : "Premium"}</span>
                      <span style={{ color: "#2563eb", fontWeight: 700 }}>View policies →</span>
                    </div>
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

    return <Chart option={lobSummaryOption} height={280} />;
  };

  const toggleChart = (id: string) =>
    setSelectedCharts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const chartsByGroup = useMemo(() => {
    const grouped: Record<ChartGroupId, string[]> = {
      exec: [],
      trend: [],
      mix: [],
      people: [],
      drilldowns: [],
    };
    CHARTS.forEach((chart) => {
      if (!selectedCharts.includes(chart.id)) return;
      const groupId = CHART_GROUP_MAP[chart.id] ?? "mix";
      grouped[groupId].push(chart.id);
    });
    return grouped;
  }, [selectedCharts]);

  const renderChartCard = (id: string) => {
    const meta = CHARTS.find((c) => c.id === id);
    return (
      <div key={id} className="surface" style={{ padding: 10, borderRadius: 12, border: "1px solid #e5e7eb" }}>
        <div
          style={{
            marginBottom: 6,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div>
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
        </div>
        {renderChart(id)}
      </div>
    );
  };

  const trendModeControl = (
    <div style={{ display: "inline-flex", border: "1px solid #e5e7eb", borderRadius: 999, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => {
          setTrendModeFallback(false);
          setTrendMode("grouped");
        }}
        style={{
          border: "none",
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 600,
          background: trendMode === "grouped" ? "#2563eb" : "white",
          color: trendMode === "grouped" ? "white" : "#475569",
          cursor: "pointer",
        }}
      >
        Grouped (PC/FS/IPS)
      </button>
      <button
        type="button"
        onClick={() => {
          setTrendModeFallback(false);
          setTrendMode("raw");
        }}
        style={{
          border: "none",
          padding: "4px 10px",
          fontSize: 12,
          fontWeight: 600,
          background: trendMode === "raw" ? "#2563eb" : "white",
          color: trendMode === "raw" ? "white" : "#475569",
          cursor: "pointer",
        }}
      >
        Raw (LoB)
      </button>
    </div>
  );

  const trendHeaderRight = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {trendModeFallback ? (
        <span style={{ fontSize: 12, color: "#b45309" }}>Grouped unavailable for this selection; showing Raw.</span>
      ) : null}
      {trendModeControl}
    </div>
  );

  const productMixOption: EChartsOption | null = useMemo(() => {
    if (!productMixData) return null;
    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any) => {
          const list = Array.isArray(params) ? params : [params];
          const axisLabel = list[0]?.axisValueLabel || "";
          const lines = list.map((p) => `${p.marker}${p.seriesName}: ${Math.round(p.value ?? 0)}`);
          return [axisLabel, ...lines].join("<br/>");
        },
      },
      legend: { data: productMixData.series.map((s) => s.name) },
      dataZoom: [{ type: "slider" }],
      xAxis: { type: "category", data: productMixData.labels },
      yAxis: { type: "value" },
      series: productMixData.series,
    };
  }, [productMixData]);

  const handleProductMixClick = (params: any) => {
    if (!enableChartDrilldown) return;
    const seriesName = typeof params?.seriesName === "string" ? params.seriesName : undefined;
    const category = categoryFromSeriesName(seriesName);
    if (!category) return;
    goToSoldProducts({
      category,
      agencyIds: agenciesParam,
      statuses: navStatuses,
      start: navStart,
      end: navEnd,
      customStart,
      customEnd,
      monthFilter,
    });
  };

  const formatMoverValue = (value: number) => (metric === "premium" ? `$${Math.round(value)}` : `${Math.round(value)}`);
  const formatMoverDelta = (delta: number, pct: number | null) => {
    const pctText = pct === null ? "n/a" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    return `${formatSignedMetricValue(delta, metric)} (${pctText})`;
  };

  return (
    <div className="surface" style={{ padding: compact ? 8 : 12, borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: compact ? 15 : 16 }}>Production Overview</div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Toggle charts and filters. Inline preview uses API data.</div>
        </div>
        <div
          className="surface"
          style={{ borderRadius: 12, padding: compact ? 8 : 10, border: "1px solid #e5e7eb", background: "#f8fafc" }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 8 : 12, alignItems: "center" }}>
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

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ color: "#475569", fontSize: 12 }}>Chart drilldown</span>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                <input type="checkbox" checked={enableChartDrilldown} onChange={(e) => setEnableChartDrilldown(e.target.checked)} />
              </label>
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

      <div
        className="surface"
        style={{
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid #e5e7eb",
          marginBottom: 12,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          background: "#f8fafc",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 12, color: "#475569" }}>Groups</span>
        {CHART_GROUPS.map((group) => (
          <label key={group.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={chartGroups[group.id]}
              onChange={(e) =>
                setChartGroups((prev) => ({
                  ...prev,
                  [group.id]: e.target.checked,
                }))
              }
            />
            {group.label}
          </label>
        ))}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {chartGroups.exec ? (
          <ChartGroup id="exec" title="Executive Summary">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <KPI
                label="Total"
                value={kpiTotals.total}
                metric={metric}
                delta={renderMetricDelta(kpiTotals.total, previousKpiTotals.total, metric, () => goToPrevSoldProducts())}
                onClick={() =>
                  goToSoldProducts({
                    agencyIds: agenciesParam,
                    statuses: navStatuses,
                    start: rangeShown.start,
                    end: rangeShown.end,
                    customStart,
                    customEnd,
                    monthFilter,
                  })
                }
              />
              <KPI
                label="Business"
                value={kpiTotals.business}
                metric={metric}
                delta={renderMetricDelta(kpiTotals.business, previousKpiTotals.business, metric, () => goToPrevSoldProducts({ businessOnly: true }))}
                onClick={() =>
                  goToSoldProducts({
                    agencyIds: agenciesParam,
                    statuses: navStatuses,
                    start: rangeShown.start,
                    end: rangeShown.end,
                    customStart,
                    customEnd,
                    monthFilter,
                    businessOnly: true,
                  })
                }
              />
              <KPI
                label="Avg premium per app"
                value={avgPremiumPerApp}
                metric="premium"
                delta={renderMetricDelta(avgPremiumPerApp, previousAvgPremiumPerApp, "premium", () => goToPrevSoldProducts())}
                onClick={() =>
                  goToSoldProducts({
                    agencyIds: agenciesParam,
                    statuses: navStatuses,
                    start: rangeShown.start,
                    end: rangeShown.end,
                    customStart,
                    customEnd,
                    monthFilter,
                  })
                }
              />
              <div className="surface" style={{ padding: 12, borderRadius: 12, display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!pcLobParam) return;
                      goToSoldProducts({
                        agencyIds: agenciesParam,
                        statuses: navStatuses,
                        start: rangeShown.start,
                        end: rangeShown.end,
                        customStart,
                        customEnd,
                        monthFilter,
                        lobName: pcLobParam,
                      });
                    }}
                    disabled={!pcLobParam}
                    style={{
                      padding: 0,
                      border: "none",
                      background: "none",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#6b7280",
                      cursor: pcLobParam ? "pointer" : "not-allowed",
                    }}
                  >
                    PC share
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!fsLobParam) return;
                      goToSoldProducts({
                        agencyIds: agenciesParam,
                        statuses: navStatuses,
                        start: rangeShown.start,
                        end: rangeShown.end,
                        customStart,
                        customEnd,
                        monthFilter,
                        lobName: fsLobParam,
                      });
                    }}
                    disabled={!fsLobParam}
                    style={{
                      padding: 0,
                      border: "none",
                      background: "none",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#6b7280",
                      cursor: fsLobParam ? "pointer" : "not-allowed",
                    }}
                  >
                    FS share
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 20 }}>
                  <span>{pcShare.toFixed(1)}%</span>
                  <span>{fsShare.toFixed(1)}%</span>
                </div>
                {hasPrevRange ? (
                  <div style={{ display: "grid", gap: 4 }}>
                    {renderShareDeltaLine(
                      "PC",
                      pcShare,
                      previousPcShare,
                      previousPcLobParam ? () => goToPrevSoldProducts({ lobName: previousPcLobParam }) : undefined
                    )}
                    {renderShareDeltaLine(
                      "FS",
                      fsShare,
                      previousFsShare,
                      previousFsLobParam ? () => goToPrevSoldProducts({ lobName: previousFsLobParam }) : undefined
                    )}
                  </div>
                ) : null}
              </div>
              <KPI
                label="Business premium share"
                value={businessPremiumShare}
                metric="premium"
                valueDisplay={`${businessPremiumShare.toFixed(1)}%`}
                delta={renderShareDelta(businessPremiumShare, previousBusinessPremiumShare, () => goToPrevSoldProducts({ businessOnly: true }))}
                onClick={() =>
                  goToSoldProducts({
                    agencyIds: agenciesParam,
                    statuses: navStatuses,
                    start: rangeShown.start,
                    end: rangeShown.end,
                    customStart,
                    customEnd,
                    monthFilter,
                    businessOnly: true,
                  })
                }
              />
            </div>
          </ChartGroup>
        ) : null}

        {chartGroups.trend ? (
          <ChartGroup id="trend" title="Trend" right={trendHeaderRight}>
            {chartsByGroup.trend.length ? (
              chartsByGroup.trend.map((id) => renderChartCard(id))
            ) : (
              <div style={{ color: "#6b7280", fontSize: 12 }}>Trend chart hidden by chart toggles.</div>
            )}
          </ChartGroup>
        ) : null}

        {chartGroups.mix ? (
          <ChartGroup id="mix" title="Mix & Share">
            {productMixOption ? (
              <div className="surface" style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Product Mix</div>
                <Chart option={productMixOption} height={280} onEvents={{ click: handleProductMixClick }} />
                {enableChartDrilldown ? (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>Tip: click a series to drill down</div>
                ) : null}
              </div>
            ) : (
              <div style={{ color: "#6b7280", fontSize: 12 }}>No data for Product Mix.</div>
            )}
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
                          return `${item.axisValue}<br/>Apps: ${appsVal} ? $${Math.round(premiumVal)}`;
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
                        customStart,
                        customEnd,
                        monthFilter,
                      });
                    };

                    const handleTrendClick = (params: any) => {
                      if (!enableChartDrilldown) return;
                      params?.event?.event?.stopPropagation?.();
                      goToSoldProducts({
                        lobName: card.lob,
                        agencyIds: agencyFilter,
                        statuses: navStatuses,
                        start: rangeShown.start,
                        end: rangeShown.end,
                        labels: card.trend.labels,
                        granularity: "month",
                        customStart,
                        customEnd,
                        monthFilter,
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
            {chartsByGroup.mix.map((id) => renderChartCard(id))}
          </ChartGroup>
        ) : null}

        {chartGroups.people ? (
          <ChartGroup
            id="people"
            title="People / Leaderboard"
            right={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" className="btn" onClick={copyTopMoversCsv} disabled={!topMovers}>
                  Copy Top Movers CSV
                </button>
                {topMoversCopied ? <span style={{ fontSize: 12, color: "#166534" }}>Copied</span> : null}
                {topMoversCopyError ? <span style={{ fontSize: 12, color: "#b91c1c" }}>Copy failed</span> : null}
              </div>
            }
          >
            {topMovers ? (
              <div className="surface" style={{ padding: 12, borderRadius: 12, border: "1px solid #e5e7eb", display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Top Movers (vs previous period)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
                  {[
                    { title: "Biggest increases", rows: topMovers.increases, color: "#166534" },
                    { title: "Biggest decreases", rows: topMovers.decreases, color: "#b91c1c" },
                  ].map((section) => (
                    <div key={section.title}>
                      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: section.color }}>{section.title}</div>
                      {section.rows.length ? (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ textAlign: "left", color: "#6b7280" }}>
                              <th style={{ padding: "4px 0" }}>Person</th>
                              <th style={{ padding: "4px 0" }}>Current</th>
                              <th style={{ padding: "4px 0" }}>Previous</th>
                              <th style={{ padding: "4px 0" }}>Delta</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map((row) => (
                              <tr key={row.personName}>
                                <td
                                  title="Open sold-products drilldown"
                                  style={{ padding: "6px 0", fontWeight: 600, cursor: "pointer", textDecoration: "none" }}
                                  role="button"
                                  tabIndex={0}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.textDecoration = "underline";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.textDecoration = "none";
                                  }}
                                  onClick={() =>
                                    goToSoldProducts({
                                      personId: row.personName,
                                      agencyIds: agenciesParam,
                                      statuses: navStatuses,
                                      start: navStart,
                                      end: navEnd,
                                      customStart,
                                      customEnd,
                                      monthFilter,
                                    })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      goToSoldProducts({
                                        personId: row.personName,
                                        agencyIds: agenciesParam,
                                        statuses: navStatuses,
                                        start: navStart,
                                        end: navEnd,
                                        customStart,
                                        customEnd,
                                        monthFilter,
                                      });
                                    }
                                  }}
                                >
                                  {row.personName}
                                </td>
                                <td style={{ padding: "6px 0" }}>{formatMoverValue(row.currentValue)}</td>
                                <td style={{ padding: "6px 0" }}>{formatMoverValue(row.previousValue)}</td>
                                <td style={{ padding: "6px 0", color: row.delta >= 0 ? "#166534" : "#b91c1c" }}>
                                  {formatMoverDelta(row.delta, row.pct)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ color: "#6b7280", fontSize: 12 }}>No data.</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: "#6b7280", fontSize: 12 }}>No data for Top Movers.</div>
            )}
            {chartsByGroup.people.length ? (
              chartsByGroup.people.map((id) => renderChartCard(id))
            ) : (
              <div style={{ color: "#6b7280", fontSize: 12 }}>No charts selected for this group.</div>
            )}
          </ChartGroup>
        ) : null}

        {chartGroups.drilldowns ? (
          <ChartGroup id="drilldowns" title="Drilldowns">
            {chartsByGroup.drilldowns.length ? (
              chartsByGroup.drilldowns.map((id) => renderChartCard(id))
            ) : (
              <div style={{ color: "#6b7280", fontSize: 12 }}>No charts selected for this group.</div>
            )}
          </ChartGroup>
        ) : null}
      </div>
    </div>
  );
}

export function PresetActivityOverview() {
  const [data, setData] = useState<{ labels: string[]; series: number[] }>({ labels: [], series: [] });
  useEffect(() => {
    fetchActivity({ granularity: "month" }).then((d) => setData(d));
  }, []);
  const activityTotals = useMemo(() => {
    const total = (data.series ?? []).reduce((a, b) => a + b, 0);
    const latest = data.series.length ? data.series[data.series.length - 1] ?? 0 : 0;
    return { total, latest };
  }, [data.series]);
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 8 }}>
        <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <div style={{ color: "#6b7280", fontSize: 12 }}>Total activities</div>
          <div style={{ fontWeight: 800 }}>{activityTotals.total}</div>
        </div>
        <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
          <div style={{ color: "#6b7280", fontSize: 12 }}>Latest period</div>
          <div style={{ fontWeight: 800 }}>{activityTotals.latest}</div>
        </div>
      </div>
      <Chart option={option} height={240} />
    </div>
  );
}

function KPI({
  label,
  value,
  metric,
  onClick,
  valueDisplay,
  delta,
}: {
  label: string;
  value: number;
  metric: string;
  onClick?: () => void;
  valueDisplay?: string;
  delta?: React.ReactNode;
}) {
  const displayValue = valueDisplay ?? (metric === "premium" ? `$${Math.round(value)}` : Math.round(value));
  return (
    <div
      className="surface"
      style={{ padding: 12, borderRadius: 12, cursor: onClick ? "pointer" : undefined }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div style={{ color: "#6b7280", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20 }}>{displayValue}</div>
      {delta ? <div style={{ marginTop: 6 }}>{delta}</div> : null}
    </div>
  );
}

function ChartGroup({
  id,
  title,
  right,
  children,
}: {
  id: ChartGroupId;
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const description = CHART_GROUPS.find((g) => g.id === id)?.description;
  return (
    <div
      className="surface"
      style={{
        padding: 12,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#fff",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800 }}>{title}</div>
          {description ? <div style={{ color: "#6b7280", fontSize: 12 }}>{description}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      {children}
    </div>
  );
}
