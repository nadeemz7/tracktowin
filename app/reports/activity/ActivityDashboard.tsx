"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { format, startOfMonth, subMonths } from "date-fns";
import { Chart } from "@/components/Chart";

type Option = { value: string; label: string };

type ActivitySeries = { name: string; data: number[] };
type ActivityResponse = { labels: string[]; series: ActivitySeries[]; totals?: { count: number } };

type Props = {
  activityOptions: Option[];
  peopleOptions: Option[];
};

function formatISODate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export default function ActivityDashboard({ activityOptions, peopleOptions }: Props) {
  const [start, setStart] = useState<string>(formatISODate(subMonths(new Date(), 1)));
  const [end, setEnd] = useState<string>(formatISODate(new Date()));
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("week");
  const [dimension, setDimension] = useState<"activity" | "person">("activity");
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ActivityResponse>({ labels: [], series: [], totals: { count: 0 } });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start,
          end,
          granularity,
          dimension,
          activityNames: selectedActivities,
          personIds: selectedPeople,
        }),
      });
      const json = (await res.json()) as ActivityResponse;
      setData(json);
    } catch (err) {
      console.error("Failed to load activity report", err);
      setData({ labels: [], series: [], totals: { count: 0 } });
    } finally {
      setLoading(false);
    }
  }, [start, end, granularity, dimension, selectedActivities, selectedPeople]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const option: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      legend: { top: 0 },
      xAxis: { type: "category", data: data.labels },
      yAxis: { type: "value" },
      dataZoom: [{ type: "slider" }],
      series: data.series.map((s) => ({
        type: "line",
        name: s.name,
        smooth: true,
        showSymbol: false,
        data: s.data,
      })),
    }),
    [data]
  );

  const presets = [
    { label: "Last 30d", start: formatISODate(subMonths(new Date(), 1)), end: formatISODate(new Date()) },
    { label: "Last 90d", start: formatISODate(subMonths(new Date(), 3)), end: formatISODate(new Date()) },
    {
      label: "YTD",
      start: formatISODate(startOfMonth(new Date(new Date().getFullYear(), 0, 1))),
      end: formatISODate(new Date()),
    },
  ];

  const totalsBySeries = useMemo(
    () =>
      data.series.map((s) => ({
        name: s.name,
        total: s.data.reduce((a, b) => a + b, 0),
        last: s.data[s.data.length - 1] || 0,
      })),
    [data.series]
  );

  const toggleSelection = (value: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  const selectAllActivities = () => setSelectedActivities(activityOptions.map((o) => o.value));
  const clearActivities = () => setSelectedActivities([]);
  const selectAllPeople = () => setSelectedPeople(peopleOptions.map((o) => o.value));
  const clearPeople = () => setSelectedPeople([]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Date range</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb", flex: 1 }}
              />
              <span style={{ color: "#6b7280" }}>to</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb", flex: 1 }}
              />
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="btn"
                  onClick={() => {
                    setStart(p.start);
                    setEnd(p.end);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Granularity</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["day", "week", "month"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`btn ${granularity === g ? "primary" : ""}`}
                  onClick={() => setGranularity(g)}
                >
                  {g[0].toUpperCase() + g.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Group by</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["activity", "person"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`btn ${dimension === d ? "primary" : ""}`}
                  onClick={() => setDimension(d)}
                >
                  {d === "activity" ? "Activity" : "Person"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginTop: 12 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontWeight: 700 }}>Activities</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" className="btn" onClick={selectAllActivities}>
                  Select all
                </button>
                <button type="button" className="btn" onClick={clearActivities}>
                  Clear
                </button>
              </div>
            </div>
            <div className="surface" style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: 8, maxHeight: 180, overflow: "auto" }}>
              {activityOptions.length === 0 ? <div style={{ color: "#6b7280" }}>No activities found.</div> : null}
              {activityOptions.map((opt) => (
                <label key={opt.value} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={selectedActivities.includes(opt.value)}
                    onChange={() => toggleSelection(opt.value, selectedActivities, setSelectedActivities)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontWeight: 700 }}>People</div>
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
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Time series</div>
        {loading ? <div style={{ color: "#6b7280" }}>Loading…</div> : <Chart option={option} height={320} />}
      </div>

      <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Summary</div>
        <div style={{ color: "#6b7280", marginBottom: 8 }}>
          Total count: <strong>{data.totals?.count ?? 0}</strong>
        </div>
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
    </div>
  );
}
