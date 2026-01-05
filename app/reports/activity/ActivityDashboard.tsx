"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import type * as echarts from "echarts";
import { format, startOfYear } from "date-fns";
import { Chart } from "@/components/Chart";

type Option = { value: string; label: string };

type ActivitySeries = { personId: string; personName: string; data: number[] };
type ActivityResponse = { labels: string[]; series: ActivitySeries[]; targets?: Record<string, number>; activityType?: any };
type LeaderboardResponse = {
  month: string;
  activityTypes: Array<{ id: string; name: string }>;
  people: Array<{
    personId: string;
    personName: string;
    countsByTypeId: Record<string, number>;
    targetsByTypeId: Record<string, number>;
  }>;
};

const STORAGE_KEY = "ttw.activityDashboard.v1";

function formatISODate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export default function ActivityDashboard({ variant = "full" }: { variant?: "full" | "inline" }) {
  const [activityOptions, setActivityOptions] = useState<Option[]>([]);
  const [peopleOptions, setPeopleOptions] = useState<Option[]>([]);
  const [presetIds, setPresetIds] = useState<{ outbound?: string; quotes?: string; referrals?: string; reviews?: string; inbounds?: string; appointments?: string }>({});
  const [mixSelectedIds, setMixSelectedIds] = useState<string[]>([]);
  const [mixLabels, setMixLabels] = useState<string[]>([]);
  const [mixSeries, setMixSeries] = useState<{ name: string; data: number[] }[]>([]);
  const [mixLoading, setMixLoading] = useState<boolean>(false);

  const [start] = useState<string>(formatISODate(startOfYear(new Date())));
  const [end] = useState<string>(formatISODate(new Date()));
  const [activityTypeId, setActivityTypeId] = useState<string>("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ActivityResponse>({ labels: [], series: [], targets: {} });
  const [newTypeName, setNewTypeName] = useState<string>("");
  const [newTypeCategory, setNewTypeCategory] = useState<string>("");
  const [targetEdits, setTargetEdits] = useState<Record<string, number>>({});
  const [savingTargetId, setSavingTargetId] = useState<string | null>(null);
  const [editingTarget, setEditingTarget] = useState<{ personId: string; personName: string; currentValue: number } | null>(null);
  const [editingValue, setEditingValue] = useState<number>(0);
  const [editTargetsMode, setEditTargetsMode] = useState<boolean>(false);
  const [quickLogPersonId, setQuickLogPersonId] = useState<string>("");
  const [quickLogDate, setQuickLogDate] = useState<string>(formatISODate(new Date()));
  const [quickLogSaving, setQuickLogSaving] = useState<boolean>(false);
  const [chartReadyTick, setChartReadyTick] = useState<number>(0);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const initializedRef = useRef<boolean>(false);
  const [lbMonth, setLbMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [lbTypes, setLbTypes] = useState<string[]>([]);
  const [lbData, setLbData] = useState<LeaderboardResponse | null>(null);
  const [lbLoading, setLbLoading] = useState<boolean>(false);
  const [lbSortKey, setLbSortKey] = useState<string>("total");
  const [lbSortDir, setLbSortDir] = useState<"asc" | "desc">("desc");

  const funnelTotals = useMemo(() => {
    const outboundId = presetIds.outbound;
    const quotesId = presetIds.quotes;
    const referralsId = presetIds.referrals;
    if (!mixSeries.length || !outboundId || !quotesId || !referralsId) return null;
    const findSum = (nameMatch: string) => {
      const series = mixSeries.find((s) => s.name.toLowerCase() === nameMatch.toLowerCase());
      if (!series) return 0;
      return series.data.reduce((a, b) => a + (b ?? 0), 0);
    };
    const outbound = findSum("Outbound");
    const quotes = findSum("Quotes");
    const referrals = findSum("Referrals");
    const quoteRate = outbound > 0 ? (quotes / outbound) * 100 : 0;
    const referralRate = quotes > 0 ? (referrals / quotes) * 100 : 0;
    return { outbound, quotes, referrals, quoteRate, referralRate };
  }, [mixSeries, presetIds]);

  const csFunnelTotals = useMemo(() => {
    const inboundsId = presetIds.inbounds;
    const apptId = presetIds.appointments;
    const reviewsId = presetIds.reviews;
    if (!mixSeries.length || !inboundsId || !apptId || !reviewsId) return null;
    const findSum = (nameMatch: string) => {
      const series = mixSeries.find((s) => s.name.toLowerCase() === nameMatch.toLowerCase());
      if (!series) return 0;
      return series.data.reduce((a, b) => a + (b ?? 0), 0);
    };
    const inbounds = findSum("Inbounds");
    const appts = findSum("Appointments");
    const reviews = findSum("Reviews");
    const apptRate = inbounds > 0 ? (appts / inbounds) * 100 : 0;
    const reviewRate = appts > 0 ? (reviews / appts) * 100 : 0;
    return { inbounds, appts, reviews, apptRate, reviewRate };
  }, [mixSeries, presetIds]);

  const attainment = useMemo(() => {
    if (!data.labels.length) return null;
    const currentLabel = formatISODate(new Date()).slice(0, 7);
    const idx = data.labels.indexOf(currentLabel);
    const monthIdx = idx === -1 ? data.labels.length - 1 : idx;

    const selectedIds = selectedPeople.length ? selectedPeople : peopleOptions.map((p) => p.value);
    const seriesByPerson = new Map<string, number[]>();
    data.series.forEach((s) => seriesByPerson.set(s.personId, s.data));

    const targets = data.targets || {};

    if (selectedIds.length <= 1) {
      const pid = selectedIds[0];
      const actual = pid && seriesByPerson.has(pid) ? seriesByPerson.get(pid)![monthIdx] ?? 0 : 0;
      const target = pid ? targets[pid] ?? 0 : 0;
      const ytdAvg =
        pid && seriesByPerson.has(pid)
          ? (seriesByPerson.get(pid)!.reduce((a, b) => a + (b ?? 0), 0) ?? 0) / (data.labels.length || 1)
          : 0;
      return {
        scope: "single",
        actual,
        target,
        pct: target > 0 ? (actual / target) * 100 : null,
        ytdAvg,
        ytdPct: target > 0 ? (ytdAvg / target) * 100 : null,
      };
    }

    let teamActual = 0;
    let teamTarget = 0;
    let teamTotal = 0;
    selectedIds.forEach((pid) => {
      const series = seriesByPerson.get(pid);
      if (series) {
        teamActual += series[monthIdx] ?? 0;
        teamTotal += series.reduce((a, b) => a + (b ?? 0), 0);
        teamTarget += targets[pid] ?? 0;
      }
    });
    const ytdAvg = teamTotal / (data.labels.length || 1);
    return {
      scope: "team",
      actual: teamActual,
      target: teamTarget,
      pct: teamTarget > 0 ? (teamActual / teamTarget) * 100 : null,
      ytdAvg,
      ytdPct: teamTarget > 0 ? (ytdAvg / teamTarget) * 100 : null,
    };
  }, [data.labels, data.series, data.targets, selectedPeople, peopleOptions]);

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/activity-types");
      const types = (await res.json()) as any[];
      const opts = types.map((t) => ({ value: t.id, label: t.name }));
      setActivityOptions(opts);
      const lowerMap = new Map(types.map((t) => [String(t.name || "").trim().toLowerCase(), t.id]));
      setPresetIds({
        outbound: lowerMap.get("outbound"),
        quotes: lowerMap.get("quotes"),
        referrals: lowerMap.get("referrals"),
        reviews: lowerMap.get("reviews"),
        inbounds: lowerMap.get("inbounds"),
        appointments: lowerMap.get("appointments set"),
      });
      if (!activityTypeId && opts.length) {
        const outbound = opts.find((o) => o.label.toLowerCase() === "outbound");
        setActivityTypeId(outbound?.value || opts[0].value);
      }
      if (!mixSelectedIds.length && opts.length) {
        const standardNames = ["outbound", "quotes", "referrals", "reviews", "inbounds", "appointments set"];
        const defaults = opts.filter((o) => standardNames.includes(o.label.toLowerCase())).map((o) => o.value);
        setMixSelectedIds(defaults.length ? defaults : [opts[0].value]);
      }
    } catch {
      setActivityOptions([]);
    }
  }, [activityTypeId, mixSelectedIds.length]);

  const fetchPeople = useCallback(async () => {
    try {
      const res = await fetch("/api/org/people");
      const people = (await res.json()) as any[];
      const opts = people.map((p) => ({ value: p.id, label: p.name }));
      setPeopleOptions(opts);
    } catch {
      setPeopleOptions([]);
    }
  }, []);

  useEffect(() => {
    // attempt to hydrate from localStorage before fetching
    if (!initializedRef.current) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            if (Array.isArray(parsed.selectedPeople)) setSelectedPeople(parsed.selectedPeople.filter((v) => typeof v === "string"));
            if (Array.isArray(parsed.mixSelectedIds)) setMixSelectedIds(parsed.mixSelectedIds.filter((v) => typeof v === "string"));
            if (typeof parsed.activityTypeId === "string") setActivityTypeId(parsed.activityTypeId);
            if (typeof parsed.editTargetsMode === "boolean") setEditTargetsMode(parsed.editTargetsMode);
          }
        }
      } catch {
        // ignore corrupt storage
      }
      initializedRef.current = true;
    }

    fetchTypes();
    fetchPeople();
  }, [fetchTypes, fetchPeople]);

  useEffect(() => {
    if (!lbTypes.length && mixSelectedIds.length) {
      setLbTypes(mixSelectedIds);
    } else if (!lbTypes.length && activityOptions.length) {
      setLbTypes(activityOptions.slice(0, 6).map((o) => o.value));
    }
  }, [lbTypes.length, mixSelectedIds, activityOptions]);

  const fetchData = useCallback(async () => {
    if (!activityTypeId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/reports/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start,
          end,
          granularity: "month",
          activityTypeId,
          personIds: selectedPeople,
        }),
      });
      const json = (await res.json()) as ActivityResponse;
      setData(json);
    } catch (err) {
      console.error("Failed to load activity report", err);
      setData({ labels: [], series: [], targets: {} });
    } finally {
      setLoading(false);
    }
  }, [start, end, activityTypeId, selectedPeople]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const payload = {
      activityTypeId,
      selectedPeople,
      mixSelectedIds,
      editTargetsMode,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [activityTypeId, selectedPeople, mixSelectedIds, editTargetsMode]);

  useEffect(() => {
    const fetchMix = async () => {
      if (!mixSelectedIds.length) return;
      setMixLoading(true);
      try {
        const responses: Array<{ id: string; name: string; labels: string[]; values: number[] }> = [];
        for (const id of mixSelectedIds) {
          const res = await fetch("/api/reports/activity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              start,
              end,
              granularity: "month",
              activityTypeId: id,
              personIds: selectedPeople,
            }),
          });
          const json = (await res.json()) as ActivityResponse;
          const labels = Array.isArray(json.labels) ? json.labels : [];
          const series = Array.isArray(json.series) ? json.series : [];
          const values = labels.map((_, idx) =>
            series.reduce((sum, s) => sum + (Array.isArray(s.data) ? s.data[idx] ?? 0 : 0), 0)
          );
          const name = activityOptions.find((o) => o.value === id)?.label || "Activity";
          responses.push({ id, name, labels, values });
        }
        const labelSet = new Set<string>();
        responses.forEach((r) => r.labels.forEach((l) => labelSet.add(l)));
        const mergedLabels = Array.from(labelSet).sort();
        const stackedSeries = responses.map((r) => {
          const map = new Map<string, number>();
          r.labels.forEach((l, idx) => map.set(l, r.values[idx] ?? 0));
          return { name: r.name, data: mergedLabels.map((l) => map.get(l) ?? 0) };
        });
        setMixLabels(mergedLabels);
        setMixSeries(stackedSeries);
      } catch (err) {
        console.error("Failed to load activity mix", err);
        setMixLabels([]);
        setMixSeries([]);
      } finally {
        setMixLoading(false);
      }
    };
    fetchMix();
  }, [mixSelectedIds, activityOptions, start, end, selectedPeople]);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      if (!lbMonth || !lbTypes.length) return;
      setLbLoading(true);
      try {
        const res = await fetch("/api/reports/activity-leaderboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            month: lbMonth,
            activityTypeIds: lbTypes,
            personIds: selectedPeople,
          }),
        });
        const json = (await res.json()) as LeaderboardResponse;
        setLbData(json);
      } catch (err) {
        console.error("Failed to load leaderboard", err);
        setLbData(null);
      } finally {
        setLbLoading(false);
      }
    };
    fetchLeaderboard();
  }, [lbMonth, lbTypes, selectedPeople]);

  const totalsBySeries = useMemo(
    () =>
      data.series.map((s) => ({
        name: s.personName || s.personId,
        total: s.data.reduce((a, b) => a + b, 0),
        last: s.data[s.data.length - 1] || 0,
      })),
    [data.series]
  );

  const grandTotal = useMemo(
    () => data.series.reduce((sum, s) => sum + s.data.reduce((a, b) => a + b, 0), 0),
    [data.series]
  );

  const targetPersonId = selectedPeople.length === 1 ? selectedPeople[0] : null;
  const targetValue = targetPersonId ? data.targets?.[targetPersonId] : undefined;
  const targetsForSelectedType = data.targets || {};
  const seriesPeople = useMemo(
    () => data.series.map((s) => ({ personId: s.personId, personName: s.personName || s.personId })),
    [data.series]
  );
  const targetsMapCombined = useMemo(() => ({ ...(data.targets || {}), ...(targetEdits || {}) }), [data.targets, targetEdits]);

  const option: EChartsOption = useMemo(() => {
    const targetsMap = targetsMapCombined;
    const chart = chartInstanceRef.current;
    const graphic =
      editTargetsMode && chart
        ? seriesPeople
            .map((p) => {
              const target = targetsMap[p.personId];
              if (target === undefined || target === null) return null;
              if (!data.labels.length) return null;
              try {
                const px = chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [data.labels.length - 1, target]) as number[];
                const [x, y] = px || [];
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return {
                  type: "circle",
                  position: [x, y],
                  shape: { r: 6 },
                  draggable: true,
                  z: 90,
                  style: { fill: "#2563eb", cursor: "grab" },
                  ondrag: (ev: any) => {
                    const pos = ev?.target?.position || [x, y];
                    const coord = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pos) as number[];
                    const val = Math.max(0, Math.round((coord?.[1] ?? 0) as number));
                    setTargetEdits((prev) => ({ ...prev, [p.personId]: val }));
                  },
                  ondragend: async (ev: any) => {
                    const pos = ev?.target?.position || [x, y];
                    const coord = chart.convertFromPixel({ xAxisIndex: 0, yAxisIndex: 0 }, pos) as number[];
                    const val = Math.max(0, Math.round((coord?.[1] ?? 0) as number));
                    setTargetEdits((prev) => ({ ...prev, [p.personId]: val }));
                    await fetch("/api/activity-targets", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ activityTypeId, personId: p.personId, monthlyMinimum: val }),
                    }).catch(() => console.warn("Failed to save target"));
                  },
                };
              } catch {
                return null;
              }
            })
            .filter(Boolean)
        : undefined;
    return {
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          if (!Array.isArray(params)) return "";
          const lines = params.map((p) => {
            const name = p.seriesName || "";
            const value = p.data ?? 0;
            const personId = seriesPeople[p.seriesIndex]?.personId || "";
            const target = targetsMap[personId];
            const targetText = target ? ` (Min: ${target})` : "";
            return `${name}: ${value}${targetText}`;
          });
          return [params[0]?.axisValue, ...lines].join("<br/>");
        },
      },
      legend: { top: 0 },
      xAxis: { type: "category", data: data.labels },
      yAxis: { type: "value" },
      dataZoom: data.labels.length > 12 && variant === "full" ? [{ type: "slider" }] : undefined,
      graphic,
      series: data.series.map((s) => {
        const target = targetsMap[s.personId];
        return {
          type: "bar",
          name: s.personName || s.personId,
          data: s.data,
          emphasis: { focus: "series" },
          markLine:
            target && target > 0
              ? {
                  symbol: "none",
                  lineStyle: { width: 2, type: "solid" },
                  label: { show: true, formatter: `Min: ${target}` },
                  data: [{ yAxis: target }],
                }
              : undefined,
        };
      }),
    };
  }, [data, variant, editTargetsMode, seriesPeople, targetsMapCombined, activityTypeId, chartReadyTick]);

  const mixOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: { type: "category", data: mixLabels },
      yAxis: { type: "value" },
      series: mixSeries.map((s) => ({
        type: "bar",
        stack: "mix",
        name: s.name,
        data: s.data,
        emphasis: { focus: "series" },
      })),
    }),
    [mixLabels, mixSeries]
  );

  const renderLeaderboard = () => {
    const tableContent =
      lbLoading || !lbData ? (
        <div style={{ color: "#6b7280" }}>Loading leaderboard…</div>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: variant === "inline" ? 260 : "none", overflowY: variant === "inline" ? "auto" : undefined }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #e5e7eb", cursor: "pointer" }} onClick={() => setLbSortKey("person")}>
                  Person
                </th>
                {lbData.activityTypes.map((t) => (
                  <th
                    key={t.id}
                    style={{ textAlign: "right", padding: 6, borderBottom: "1px solid #e5e7eb", cursor: "pointer" }}
                    onClick={() => setLbSortKey(t.id)}
                  >
                    {t.name}
                  </th>
                ))}
                <th style={{ textAlign: "right", padding: 6, borderBottom: "1px solid #e5e7eb", cursor: "pointer" }} onClick={() => setLbSortKey("total")}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {lbData.people
                .slice()
                .sort((a, b) => {
                  const dir = lbSortDir === "asc" ? 1 : -1;
                  if (lbSortKey === "person") return dir * a.personName.localeCompare(b.personName);
                  if (lbSortKey === "total") {
                    const ta = Object.values(a.countsByTypeId).reduce((s, v) => s + (v ?? 0), 0);
                    const tb = Object.values(b.countsByTypeId).reduce((s, v) => s + (v ?? 0), 0);
                    return dir * (ta - tb);
                  }
                  const va = a.countsByTypeId[lbSortKey] ?? 0;
                  const vb = b.countsByTypeId[lbSortKey] ?? 0;
                  return dir * (va - vb);
                })
                .map((p) => (
                  <tr key={p.personId}>
                    <td style={{ padding: 6, borderBottom: "1px solid #f1f5f9" }}>{p.personName}</td>
                    {lbData.activityTypes.map((t) => (
                      <td key={t.id} style={{ padding: 6, borderBottom: "1px solid #f1f5f9", textAlign: "right", whiteSpace: "nowrap" }}>
                        {p.countsByTypeId[t.id] ?? 0}
                        {p.targetsByTypeId[t.id] ? ` / ${p.targetsByTypeId[t.id]}` : ""}
                      </td>
                    ))}
                    <td style={{ padding: 6, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>
                      {Object.values(p.countsByTypeId).reduce((s, v) => s + (v ?? 0), 0)}
                    </td>
                  </tr>
                ))}
              <tr>
                <td style={{ padding: 6, borderTop: "1px solid #e5e7eb", fontWeight: 700 }}>Total</td>
                {lbData.activityTypes.map((t) => (
                  <td key={t.id} style={{ padding: 6, borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 700 }}>
                    {lbData.people.reduce((sum, p) => sum + (p.countsByTypeId[t.id] ?? 0), 0)}
                  </td>
                ))}
                <td style={{ padding: 6, borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 700 }}>
                  {lbData.people.reduce((sum, p) => sum + Object.values(p.countsByTypeId).reduce((s, v) => s + (v ?? 0), 0), 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      );

    return (
      <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>Monthly Leaderboard</div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ color: "#475569" }}>Month</span>
            <select className="select" value={lbMonth} onChange={(e) => setLbMonth(e.target.value)}>
              {Array.from(new Set([format(new Date(), "yyyy-MM"), ...mixLabels]))
                .sort()
                .map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
            </select>
          </label>
          <details style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, fontSize: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "#111827" }}>Activity types</summary>
            <div style={{ display: "grid", gap: 4, marginTop: 6, maxHeight: 180, overflow: "auto" }}>
              {activityOptions.map((opt) => (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={lbTypes.includes(opt.value)}
                    onChange={() =>
                      setLbTypes((prev) => (prev.includes(opt.value) ? prev.filter((id) => id !== opt.value) : [...prev, opt.value]))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </details>
          {variant === "full" && lbData ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                if (!lbData) return;
                const headers = ["Person", ...lbData.activityTypes.map((t) => t.name), "Total"];
                const sorted = lbData.people
                  .slice()
                  .sort((a, b) => {
                    const dir = lbSortDir === "asc" ? 1 : -1;
                    if (lbSortKey === "person") return dir * a.personName.localeCompare(b.personName);
                    if (lbSortKey === "total") {
                      const ta = Object.values(a.countsByTypeId).reduce((s, v) => s + (v ?? 0), 0);
                      const tb = Object.values(b.countsByTypeId).reduce((s, v) => s + (v ?? 0), 0);
                      return dir * (ta - tb);
                    }
                    const va = a.countsByTypeId[lbSortKey] ?? 0;
                    const vb = b.countsByTypeId[lbSortKey] ?? 0;
                    return dir * (va - vb);
                  });
                const rows = sorted.map((p) => {
                  const counts = lbData.activityTypes.map((t) => p.countsByTypeId[t.id] ?? 0);
                  const total = counts.reduce((s, v) => s + (v ?? 0), 0);
                  return [p.personName, ...counts, total];
                });
                const csv = [headers, ...rows]
                  .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
                  .join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `activity-leaderboard-${lbMonth}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export CSV
            </button>
          ) : null}
        </div>
        {tableContent}
      </div>
    );
  };
  const handleChartClick = (params: any) => {
    if (params?.componentType === "markLine") {
      const idx = typeof params.seriesIndex === "number" ? params.seriesIndex : null;
      if (idx === null || !data.series[idx]) return;
      const s = data.series[idx];
      const current = targetsMapCombined[s.personId] ?? 0;
      setEditingTarget({ personId: s.personId, personName: s.personName || s.personId, currentValue: current });
      setEditingValue(current);
    }
  };

  const toggleSelection = (value: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  const selectAllPeople = () => setSelectedPeople(peopleOptions.map((o) => o.value));
  const clearPeople = () => setSelectedPeople([]);

  const kpiThisMonth = useMemo(() => {
    if (!data.labels.length) return 0;
    const lastIdx = data.labels.length - 1;
    return data.series.reduce((acc, s) => acc + (s.data[lastIdx] ?? 0), 0);
  }, [data]);

  useEffect(() => {
    if (!activityTypeId) {
      setTargetEdits({});
      return;
    }
    fetch(`/api/activity-targets?activityTypeId=${encodeURIComponent(activityTypeId)}`)
      .then((r) => r.json())
      .then((rows: any[]) => {
        const map: Record<string, number> = {};
        rows.forEach((row) => {
          if (row?.personId) map[row.personId] = Number(row.monthlyMinimum) || 0;
        });
        setTargetEdits(map);
      })
      .catch(() => setTargetEdits({}));
  }, [activityTypeId]);

  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    const res = await fetch("/api/activity-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTypeName.trim(), category: newTypeCategory.trim() || undefined }),
    });
    const created = await res.json();
    setNewTypeName("");
    setNewTypeCategory("");
    await fetchTypes();
    if (created?.id) setActivityTypeId(created.id);
  };

  const handleTargetChange = (personId: string, value: number) => {
    setTargetEdits((prev) => ({ ...prev, [personId]: value }));
  };

  const handleSaveTarget = async (personId: string) => {
    if (!activityTypeId) return;
    setSavingTargetId(personId);
    const monthlyMinimum = Number.isFinite(targetEdits[personId]) ? targetEdits[personId] : 0;
    await fetch("/api/activity-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityTypeId, personId, monthlyMinimum }),
    }).catch(() => {});
    setSavingTargetId(null);
    fetch(`/api/activity-targets?activityTypeId=${encodeURIComponent(activityTypeId)}`)
      .then((r) => r.json())
      .then((rows: any[]) => {
        const map: Record<string, number> = {};
        rows.forEach((row) => {
          if (row?.personId) map[row.personId] = Number(row.monthlyMinimum) || 0;
        });
        setTargetEdits(map);
      })
      .catch(() => {});
    fetchData();
  };

  const closeEditor = () => {
    setEditingTarget(null);
  };

  const saveEditingTarget = async () => {
    if (!activityTypeId || !editingTarget) return;
    setTargetEdits((prev) => ({ ...prev, [editingTarget.personId]: editingValue }));
    await fetch("/api/activity-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityTypeId, personId: editingTarget.personId, monthlyMinimum: editingValue }),
    }).catch(() => {});
    closeEditor();
    // refresh targets
    fetch(`/api/activity-targets?activityTypeId=${encodeURIComponent(activityTypeId)}`)
      .then((r) => r.json())
      .then((rows: any[]) => {
        const map: Record<string, number> = {};
        rows.forEach((row) => {
          if (row?.personId) map[row.personId] = Number(row.monthlyMinimum) || 0;
        });
        setTargetEdits(map);
      })
      .catch(() => {});
    fetchData();
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {editingTarget ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div className="surface" style={{ padding: 16, borderRadius: 12, minWidth: 300, background: "white" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Edit target</div>
            <div style={{ color: "#475569", marginBottom: 8 }}>
              {editingTarget.personName} — {activityOptions.find((a) => a.value === activityTypeId)?.label || "Activity"}
            </div>
            <label style={{ display: "grid", gap: 4, marginBottom: 12 }}>
              <span style={{ color: "#6b7280", fontSize: 12 }}>Monthly minimum</span>
              <input
                className="input"
                type="number"
                min={0}
                value={editingValue}
                onChange={(e) => setEditingValue(Number(e.target.value))}
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" type="button" onClick={closeEditor}>
                Cancel
              </button>
              <button className="btn primary" type="button" onClick={saveEditingTarget}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Date range</div>
            <div style={{ color: "#475569", fontSize: 13 }}>
              Year to date: {start} to {end}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Activity type</div>
            <select className="select" value={activityTypeId} onChange={(e) => setActivityTypeId(e.target.value)}>
              {activityOptions.length === 0 ? <option value="">Loading…</option> : null}
              {activityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {presetIds.outbound ? (
                <button
                  type="button"
                  className="btn"
                  style={{
                    borderColor: activityTypeId === presetIds.outbound ? "#2563eb" : "#e5e7eb",
                    background: activityTypeId === presetIds.outbound ? "rgba(37,99,235,0.12)" : "white",
                  }}
                  onClick={() => setActivityTypeId(presetIds.outbound!)}
                >
                  Outbound
                </button>
              ) : null}
              {presetIds.quotes ? (
                <button
                  type="button"
                  className="btn"
                  style={{
                    borderColor: activityTypeId === presetIds.quotes ? "#2563eb" : "#e5e7eb",
                    background: activityTypeId === presetIds.quotes ? "rgba(37,99,235,0.12)" : "white",
                  }}
                  onClick={() => setActivityTypeId(presetIds.quotes!)}
                >
                  Quotes
                </button>
              ) : null}
              {presetIds.referrals ? (
                <button
                  type="button"
                  className="btn"
                  style={{
                    borderColor: activityTypeId === presetIds.referrals ? "#2563eb" : "#e5e7eb",
                    background: activityTypeId === presetIds.referrals ? "rgba(37,99,235,0.12)" : "white",
                  }}
                  onClick={() => setActivityTypeId(presetIds.referrals!)}
                >
                  Referrals
                </button>
              ) : null}
              {presetIds.reviews ? (
                <button
                  type="button"
                  className="btn"
                  style={{
                    borderColor: activityTypeId === presetIds.reviews ? "#2563eb" : "#e5e7eb",
                    background: activityTypeId === presetIds.reviews ? "rgba(37,99,235,0.12)" : "white",
                  }}
                  onClick={() => setActivityTypeId(presetIds.reviews!)}
                >
                  Reviews
                </button>
              ) : null}
              {presetIds.inbounds ? (
                <button
                  type="button"
                  className="btn"
                  style={{
                    borderColor: activityTypeId === presetIds.inbounds ? "#2563eb" : "#e5e7eb",
                    background: activityTypeId === presetIds.inbounds ? "rgba(37,99,235,0.12)" : "white",
                  }}
                  onClick={() => setActivityTypeId(presetIds.inbounds!)}
                >
                  Inbounds
                </button>
              ) : null}
              {presetIds.appointments ? (
                <button
                  type="button"
                  className="btn"
                  style={{
                    borderColor: activityTypeId === presetIds.appointments ? "#2563eb" : "#e5e7eb",
                    background: activityTypeId === presetIds.appointments ? "rgba(37,99,235,0.12)" : "white",
                  }}
                  onClick={() => setActivityTypeId(presetIds.appointments!)}
                >
                  Appointments
                </button>
              ) : null}
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 13 }}>
              <input type="checkbox" checked={editTargetsMode} onChange={(e) => setEditTargetsMode(e.target.checked)} />
              Edit targets
            </label>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontWeight: 700 }}>Team members</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn" onClick={selectAllPeople}>
                  Select all
                </button>
                <button type="button" className="btn" onClick={clearPeople}>
                  Clear
                </button>
              </div>
            </div>
            <div className="surface" style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: 8, maxHeight: 180, overflow: "auto" }}>
              {peopleOptions.length === 0 ? <div style={{ color: "#6b7280" }}>No people found.</div> : null}
              {peopleOptions.map((opt) => (
                <label key={opt.value} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={selectedPeople.includes(opt.value)}
                    onChange={() => toggleSelection(opt.value, selectedPeople, setSelectedPeople)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
        {variant === "inline" ? null : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            {funnelTotals ? (
              <>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Outbound</div>
                  <div style={{ fontWeight: 800 }}>{funnelTotals.outbound}</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Quotes</div>
                  <div style={{ fontWeight: 800 }}>{funnelTotals.quotes}</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Referrals</div>
                  <div style={{ fontWeight: 800 }}>{funnelTotals.referrals}</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Quote Rate</div>
                  <div style={{ fontWeight: 800 }}>{funnelTotals.quoteRate.toFixed(1)}%</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Referral Rate</div>
                  <div style={{ fontWeight: 800 }}>{funnelTotals.referralRate.toFixed(1)}%</div>
                </div>
              </>
            ) : (
              <div style={{ color: "#6b7280" }}>Loading funnel…</div>
            )}
          </div>
        )}

        {variant === "inline" ? null : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            {csFunnelTotals ? (
              <>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Inbounds</div>
                  <div style={{ fontWeight: 800 }}>{csFunnelTotals.inbounds}</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Appointments</div>
                  <div style={{ fontWeight: 800 }}>{csFunnelTotals.appts}</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Reviews</div>
                  <div style={{ fontWeight: 800 }}>{csFunnelTotals.reviews}</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Appt Rate</div>
                  <div style={{ fontWeight: 800 }}>{csFunnelTotals.apptRate.toFixed(1)}%</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Review Rate</div>
                  <div style={{ fontWeight: 800 }}>{csFunnelTotals.reviewRate.toFixed(1)}%</div>
                </div>
              </>
            ) : (
              <div style={{ color: "#6b7280" }}>Loading funnel…</div>
            )}
          </div>
        )}

        {variant === "inline" ? null : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
            {csFunnelTotals ? (
              <>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Inbounds</div>
                  <div style={{ fontWeight: 800 }}>{csFunnelTotals.inbounds}</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Appointments</div>
                  <div style={{ fontWeight: 800 }}>{csFunnelTotals.appts}</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Reviews</div>
                  <div style={{ fontWeight: 800 }}>{csFunnelTotals.reviews}</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Appt Rate</div>
                  <div style={{ fontWeight: 800 }}>{csFunnelTotals.apptRate.toFixed(1)}%</div>
                </div>
                <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Review Rate</div>
                  <div style={{ fontWeight: 800 }}>{csFunnelTotals.reviewRate.toFixed(1)}%</div>
                </div>
              </>
            ) : (
              <div style={{ color: "#6b7280" }}>Loading funnel…</div>
            )}
          </div>
        )}

        <div style={{ fontWeight: 800, marginBottom: 6 }}>Activities by month (per person)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 8 }}>
          <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Total</div>
            <div style={{ fontWeight: 800 }}>{grandTotal}</div>
          </div>
          <div className="surface" style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}>
            <div style={{ color: "#6b7280", fontSize: 12 }}>This month</div>
            <div style={{ fontWeight: 800 }}>{kpiThisMonth}</div>
          </div>
        </div>
        {loading ? (
          <div style={{ color: "#6b7280" }}>Loading…</div>
        ) : (
          <Chart
            option={option}
            height={variant === "inline" ? 240 : 340}
            onEvents={{ click: handleChartClick }}
            onReady={(chart) => {
              chartInstanceRef.current = chart;
              setChartReadyTick((v) => v + 1);
            }}
          />
        )}
      </div>

      <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800 }}>Activity Mix (Monthly)</div>
            <div style={{ color: "#6b7280", fontSize: 12 }}>Stacked counts by activity type.</div>
          </div>
          <details style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, fontSize: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "#111827" }}>Select types</summary>
            <div style={{ display: "grid", gap: 4, marginTop: 6, maxHeight: 180, overflow: "auto" }}>
              {activityOptions.map((opt) => (
                <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={mixSelectedIds.includes(opt.value)}
                    onChange={() =>
                      setMixSelectedIds((prev) => (prev.includes(opt.value) ? prev.filter((id) => id !== opt.value) : [...prev, opt.value]))
                    }
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </details>
        </div>
        {mixLoading ? <div style={{ color: "#6b7280" }}>Loading…</div> : <Chart option={mixOption} height={260} />}
      </div>

      {renderLeaderboard()}

      {variant === "inline" ? null : (
        <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800 }}>Monthly Leaderboard</div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ color: "#475569" }}>Month</span>
              <select className="select" value={lbMonth} onChange={(e) => setLbMonth(e.target.value)}>
                {Array.from(new Set([format(new Date(), "yyyy-MM"), ...mixLabels]))
                  .sort()
                  .map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
              </select>
            </label>
            <details style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, fontSize: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, color: "#111827" }}>Activity types</summary>
              <div style={{ display: "grid", gap: 4, marginTop: 6, maxHeight: 180, overflow: "auto" }}>
                {activityOptions.map((opt) => (
                  <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={lbTypes.includes(opt.value)}
                      onChange={() =>
                        setLbTypes((prev) => (prev.includes(opt.value) ? prev.filter((id) => id !== opt.value) : [...prev, opt.value]))
                      }
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </details>
          </div>
          {lbLoading || !lbData ? (
            <div style={{ color: "#6b7280" }}>Loading leaderboard…</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #e5e7eb", cursor: "pointer" }} onClick={() => setLbSortKey("person")}>
                      Person
                    </th>
                    {lbData.activityTypes.map((t) => (
                      <th
                        key={t.id}
                        style={{ textAlign: "right", padding: 6, borderBottom: "1px solid #e5e7eb", cursor: "pointer" }}
                        onClick={() => setLbSortKey(t.id)}
                      >
                        {t.name}
                      </th>
                    ))}
                    <th
                      style={{ textAlign: "right", padding: 6, borderBottom: "1px solid #e5e7eb", cursor: "pointer" }}
                      onClick={() => setLbSortKey("total")}
                    >
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lbData.people
                    .slice()
                    .sort((a, b) => {
                      const dir = lbSortDir === "asc" ? 1 : -1;
                      if (lbSortKey === "person") return dir * a.personName.localeCompare(b.personName);
                      if (lbSortKey === "total") {
                        const ta = Object.values(a.countsByTypeId).reduce((s, v) => s + (v ?? 0), 0);
                        const tb = Object.values(b.countsByTypeId).reduce((s, v) => s + (v ?? 0), 0);
                        return dir * (ta - tb);
                      }
                      const va = a.countsByTypeId[lbSortKey] ?? 0;
                      const vb = b.countsByTypeId[lbSortKey] ?? 0;
                      return dir * (va - vb);
                    })
                    .map((p) => (
                      <tr key={p.personId}>
                        <td style={{ padding: 6, borderBottom: "1px solid #f1f5f9" }}>{p.personName}</td>
                        {lbData.activityTypes.map((t) => (
                          <td key={t.id} style={{ padding: 6, borderBottom: "1px solid #f1f5f9", textAlign: "right", whiteSpace: "nowrap" }}>
                            {p.countsByTypeId[t.id] ?? 0}
                            {p.targetsByTypeId[t.id] ? ` / ${p.targetsByTypeId[t.id]}` : ""}
                          </td>
                        ))}
                        <td style={{ padding: 6, borderBottom: "1px solid #f1f5f9", textAlign: "right" }}>
                          {Object.values(p.countsByTypeId).reduce((s, v) => s + (v ?? 0), 0)}
                        </td>
                      </tr>
                    ))}
                  <tr>
                    <td style={{ padding: 6, borderTop: "1px solid #e5e7eb", fontWeight: 700 }}>Total</td>
                    {lbData.activityTypes.map((t) => (
                      <td key={t.id} style={{ padding: 6, borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 700 }}>
                        {lbData.people.reduce((sum, p) => sum + (p.countsByTypeId[t.id] ?? 0), 0)}
                      </td>
                    ))}
                    <td style={{ padding: 6, borderTop: "1px solid #e5e7eb", textAlign: "right", fontWeight: 700 }}>
                      {lbData.people.reduce((sum, p) => sum + Object.values(p.countsByTypeId).reduce((s, v) => s + (v ?? 0), 0), 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {variant === "inline" ? null : (
        <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Quick Log Activity</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ color: "#475569", fontSize: 12 }}>Activity type</span>
              <select className="select" value={activityTypeId} onChange={(e) => setActivityTypeId(e.target.value)}>
                {activityOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ color: "#475569", fontSize: 12 }}>Person</span>
              <select
                className="select"
                value={quickLogPersonId || selectedPeople[0] || peopleOptions[0]?.value || ""}
                onChange={(e) => setQuickLogPersonId(e.target.value)}
              >
                {peopleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ color: "#475569", fontSize: 12 }}>Date</span>
              <input className="input" type="date" value={quickLogDate} onChange={(e) => setQuickLogDate(e.target.value)} />
            </label>
            <div>
              <button
                className="btn primary"
                type="button"
                disabled={quickLogSaving || !activityTypeId || !(quickLogPersonId || selectedPeople[0] || peopleOptions[0])}
                onClick={async () => {
                  const personId = quickLogPersonId || selectedPeople[0] || peopleOptions[0]?.value;
                  if (!activityTypeId || !personId) return;
                  setQuickLogSaving(true);
                  await fetch("/api/activity-events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ activityTypeId, personId, occurredAt: quickLogDate }),
                  }).catch(() => {});
                  setQuickLogSaving(false);
                  fetchData();
                }}
              >
                {quickLogSaving ? "Logging…" : "Log"}
              </button>
            </div>
          </div>
        </div>
      )}

      {variant === "inline" ? null : (
        <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Summary</div>
          <div style={{ display: "grid", gap: 6 }}>
            {totalsBySeries.length === 0 ? (
              <div style={{ color: "#6b7280" }}>No data for the selected filters.</div>
            ) : (
              totalsBySeries.map((row) => (
                <div
                  key={row.name}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{row.name}</div>
                  <div style={{ color: "#475569" }}>Total: {row.total}</div>
                  <div style={{ color: "#475569" }}>Last bucket: {row.last}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {variant === "inline" ? null : (
        <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Manage activities & targets</div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Add activity type</div>
              <div style={{ display: "grid", gap: 6 }}>
                <input
                  className="input"
                  placeholder="Name (e.g., Outbound)"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                />
                <input
                  className="input"
                  placeholder="Category (optional)"
                  value={newTypeCategory}
                  onChange={(e) => setNewTypeCategory(e.target.value)}
                />
                <button className="btn primary" type="button" onClick={handleAddType} disabled={!newTypeName.trim()}>
                  Create type
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Targets</div>
              <div style={{ display: "grid", gap: 6, marginBottom: 6 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <span style={{ color: "#475569" }}>Activity type</span>
                  <select className="select" value={activityTypeId} onChange={(e) => setActivityTypeId(e.target.value)}>
                    {activityOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, maxHeight: 240, overflow: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", padding: 8, fontWeight: 700, background: "#f8fafc" }}>
                  <span>Person</span>
                  <span>Monthly min</span>
                </div>
                <div style={{ display: "grid", gap: 0 }}>
                  {peopleOptions.map((p) => (
                    <div
                      key={p.value}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr auto",
                        padding: 8,
                        borderTop: "1px solid #e5e7eb",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span>{p.label}</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={targetEdits[p.value] ?? ""}
                        onChange={(e) => handleTargetChange(p.value, Number(e.target.value))}
                      />
                      <button
                        className="btn"
                        type="button"
                        onClick={() => handleSaveTarget(p.value)}
                        disabled={savingTargetId === p.value}
                        style={{ minWidth: 80 }}
                      >
                        {savingTargetId === p.value ? "Saving..." : "Save"}
                      </button>
                    </div>
                  ))}
                  {peopleOptions.length === 0 ? (
                    <div style={{ padding: 8, color: "#6b7280" }}>No team members found.</div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
