"use client";

import { useMemo, useState } from "react";
import { parseISO, isAfter, subDays, startOfYear, startOfQuarter, isBefore } from "date-fns";
import type { ReportsData } from "./types";

// Lightweight, dependency-free SVG charts for simple viewing
function LineChart({
  series,
  metric,
  height = 240,
  chartType = "line",
}: {
  series: { name: string; color: string; points: { month: string; value: number }[] }[];
  metric: "apps" | "premium";
  height?: number;
  chartType?: "line" | "area" | "column";
}) {
  const width = 760;
  const padding = 30;

  const allPoints = series.flatMap((s) => s.points);
  const maxVal = Math.max(...allPoints.map((p) => p.value), 1);
  const months = Array.from(new Set(allPoints.map((p) => p.month))).sort();
  const xStep = months.length > 1 ? (width - padding * 2) / (months.length - 1) : width / 2;

  const monthToX = (m: string) => padding + months.indexOf(m) * xStep;
  const valToY = (v: number) => height - padding - (v / maxVal) * (height - padding * 2);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Line chart showing ${metric}`}>
      <g>
        {months.map((m, i) => {
          const x = monthToX(m);
          return (
            <g key={m}>
              <line x1={x} x2={x} y1={padding / 2} y2={height - padding} stroke="#e5e7eb" strokeDasharray="4 4" />
              <text x={x} y={height - 8} textAnchor="middle" fontSize="11" fill="#475569">
                {m.slice(5)}
              </text>
              {i === 0 && (
                <text x={x} y={height - 22} textAnchor="start" fontSize="11" fill="#94a3b8">
                  {m.slice(0, 4)}
                </text>
              )}
            </g>
          );
        })}
      </g>
      {series.map((s, sIdx) => {
        const sortedPts = s.points.sort((a, b) => (a.month < b.month ? -1 : 1));

        if (chartType === "column") {
          const band = months.length > 1 ? xStep : width / 4;
          const barWidth = Math.min(28, band / (series.length || 1) - 4);
          const offset = ((sIdx - (series.length - 1) / 2) * barWidth);
          return (
            <g key={s.name}>
              {sortedPts.map((p) => {
                const x = monthToX(p.month) + offset - barWidth / 2;
                const y = valToY(p.value);
                const h = height - padding - y;
                return (
                  <rect
                    key={`${s.name}-${p.month}`}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    fill={s.color}
                    rx={3}
                  />
                );
              })}
            </g>
          );
        }

        const path = sortedPts
          .map((p, idx) => `${idx === 0 ? "M" : "L"}${monthToX(p.month)},${valToY(p.value)}`)
          .join(" ");

        return (
          <g key={s.name}>
            {chartType === "area" ? (
              <path
                d={`${path} L${monthToX(sortedPts.at(-1)?.month || "")},${height - padding} L${monthToX(
                  sortedPts[0].month
                )},${height - padding} Z`}
                fill={`${s.color}33`}
                stroke="none"
              />
            ) : null}
            <path d={path} fill="none" stroke={s.color} strokeWidth={2} />
            {sortedPts.map((p) => (
              <g key={`${s.name}-${p.month}`}>
                <circle cx={monthToX(p.month)} cy={valToY(p.value)} r={4} fill={s.color} />
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function BarList({
  items,
  metric,
  maxItems = 8,
}: {
  items: { name: string; apps: number; premium: number }[];
  metric: "apps" | "premium";
  maxItems?: number;
}) {
  const sorted = items
    .slice()
    .sort((a, b) => (metric === "apps" ? b.apps - a.apps : b.premium - a.premium))
    .slice(0, maxItems);
  const maxVal = Math.max(...sorted.map((i) => (metric === "apps" ? i.apps : i.premium)), 1);

  return (
    <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
      <div style={{ display: "grid", gap: 8 }}>
        {sorted.map((i) => {
          const val = metric === "apps" ? i.apps : i.premium;
          return (
            <div key={i.name} style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{i.name}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "#475569" }}>
                  {metric === "apps" ? `${val} apps` : `$${val.toFixed(0)}`}
                </span>
              </div>
              <div style={{ background: "#e2e8f0", height: 8, borderRadius: 999 }}>
                <div
                  style={{
                    width: `${(val / maxVal) * 100}%`,
                    background: "linear-gradient(90deg, #2563eb, #1e40af)",
                    height: "100%",
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
      <div style={{ color: "#475569", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 20 }}>{value}</div>
      {hint && <div style={{ color: "#94a3b8", fontSize: 12 }}>{hint}</div>}
    </div>
  );
}

function TimeFilters({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = [
    { key: "30d", label: "30d" },
    { key: "90d", label: "90d" },
    { key: "qtd", label: "QTD" },
    { key: "ytd", label: "YTD" },
    { key: "all", label: "All" },
  ];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button
          key={o.key}
          className={`btn ${value === o.key ? "primary" : ""}`}
          type="button"
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MetricToggle({ value, onChange }: { value: "apps" | "premium"; onChange: (v: "apps" | "premium") => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button className={`btn ${value === "apps" ? "primary" : ""}`} type="button" onClick={() => onChange("apps")}>
        Apps
      </button>
      <button
        className={`btn ${value === "premium" ? "primary" : ""}`}
        type="button"
        onClick={() => onChange("premium")}
      >
        Premium
      </button>
    </div>
  );
}

function filterByRange<T extends { month: string }>(points: T[], range: string, todayISO: string): T[] {
  const today = parseISO(todayISO);
  const start = (() => {
    if (range === "30d") return subDays(today, 30);
    if (range === "90d") return subDays(today, 90);
    if (range === "qtd") return startOfQuarter(today);
    if (range === "ytd") return startOfYear(today);
    return null;
  })();

  if (!start) return points;
  return points.filter((p) => {
    const d = parseISO(p.month + "-01");
    return !isBefore(d, start) && !isAfter(d, today);
  });
}

export default function ReportsDashboard({ data, seedAction }: { data: ReportsData; seedAction: () => Promise<void> }) {
  const [metric, setMetric] = useState<"apps" | "premium">("apps");
  const [range, setRange] = useState<string>("ytd");
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [momentumChartType, setMomentumChartType] = useState<"line" | "area" | "column">("line");

  const agencySeries = useMemo(() => {
    return data.agencies
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((a) => agencyFilter === "all" || a.name === agencyFilter)
      .map((a, idx) => {
        const points = filterByRange(
          a.monthly.map((m) => ({ month: m.month, value: metric === "apps" ? m.apps : m.premium })),
          range,
          data.timeframe.today
        );
        return {
          name: a.name,
          color: ["#2563eb", "#22c55e", "#8b5cf6", "#f97316"][idx % 4],
          points,
        };
      });
  }, [data, metric, range, agencyFilter]);

  const lobBreakdown = useMemo(() => data.lobBreakdown, [data]);
  const productTypeBreakdown = useMemo(() => data.productTypeBreakdown, [data]);
  const productBreakdown = useMemo(() => data.productBreakdown, [data]);
  const personTrend = useMemo(() => data.personTrend, [data]);

  const totalApps = useMemo(() => data.agencies.reduce((acc, a) => acc + a.monthly.reduce((s, m) => s + m.apps, 0), 0), [data]);
  const totalPremium = useMemo(
    () => data.agencies.reduce((acc, a) => acc + a.monthly.reduce((s, m) => s + m.premium, 0), 0),
    [data]
  );

  const topProduct = useMemo(() => productBreakdown.sort((a, b) => b.apps - a.apps)[0], [productBreakdown]);
  const topPerson = useMemo(
    () =>
      personTrend
        .map((p) => ({
          name: p.name,
          apps: p.monthly.reduce((s, m) => s + m.apps, 0),
          premium: p.monthly.reduce((s, m) => s + m.premium, 0),
        }))
        .sort((a, b) => b.apps - a.apps)[0],
    [personTrend]
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Filters</div>
          <TimeFilters value={range} onChange={setRange} />
          <MetricToggle value={metric} onChange={setMetric} />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Agency view</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={`btn ${agencyFilter === "all" ? "primary" : ""}`} type="button" onClick={() => setAgencyFilter("all")}>
              All
            </button>
            {data.agencies.map((a) => (
              <button
                key={a.name}
                className={`btn ${agencyFilter === a.name ? "primary" : ""}`}
                type="button"
                onClick={() => setAgencyFilter(a.name)}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700 }}>Sample data</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <StatCard label="Total apps" value={totalApps.toString()} hint="Across selected timeframe" />
        <StatCard label="Total premium" value={`$${totalPremium.toFixed(0)}`} hint="All agencies" />
        {topProduct && <StatCard label="Top product" value={topProduct.name} hint={`${topProduct.apps} apps`} />}
        {topPerson && <StatCard label="Top performer" value={topPerson.name} hint={`${topPerson.apps} apps`} />}
      </div>

      <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Agency trends</div>
            <div style={{ color: "#475569", fontSize: 12 }}>Apps or premium by month</div>
          </div>
        </div>
        <LineChart
          metric={metric}
          series={agencySeries.map((s) => ({ ...s, points: s.points.sort((a, b) => (a.month < b.month ? -1 : 1)) }))}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Top products</div>
          <BarList items={productBreakdown} metric={metric} />
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>By line of business</div>
            <BarList items={lobBreakdown} metric={metric} maxItems={6} />
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>By product type</div>
            <BarList items={productTypeBreakdown} metric={metric} maxItems={4} />
          </div>
        </div>
      </div>

      <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 700 }}>Team member momentum</div>
            <div style={{ color: "#475569", fontSize: 12 }}>Compare month-over-month apps/premium</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#475569", fontSize: 12 }}>
            <span>Chart type</span>
            <select
              value={momentumChartType}
              onChange={(e) => setMomentumChartType(e.target.value as any)}
              style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 12 }}
            >
              <option value="line">Line</option>
              <option value="column">Columns</option>
              <option value="area">Area</option>
            </select>
          </div>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          {personTrend.map((p, idx) => {
            const pts = filterByRange(
              p.monthly.map((m) => ({ month: m.month, value: metric === "apps" ? m.apps : m.premium })),
              range,
              data.timeframe.today
            ).sort((a, b) => (a.month < b.month ? -1 : 1));
            return (
              <div key={p.name} style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>{p.name}</strong>
                  <span style={{ color: "#475569", fontSize: 12 }}>{p.teamType ?? ""}</span>
                </div>
                <LineChart
                  metric={metric}
                  height={160}
                  series={[
                    {
                      name: p.name,
                      color: ["#0ea5e9", "#f97316", "#10b981", "#6366f1"][idx % 4],
                      points: pts,
                    },
                  ]}
                  chartType={momentumChartType}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
        <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Activity summary</div>
          <div style={{ display: "grid", gap: 10 }}>
            {data.activitySummary.map((a) => (
              <div key={a.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{a.name}</div>
                  <div style={{ color: "#475569", fontSize: 12 }}>{a.total} logged</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {a.monthly.slice(-3).map((m) => (
                    <div key={m.month} className="pill">
                      {m.month.slice(5)}: {m.value}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Win The Day (latest month)</div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.winTheDay.map((w) => {
              const pct = Math.min(100, Math.round((w.points / w.target) * 100));
              return (
                <div key={w.person} style={{ display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{w.person}</strong>
                    <span style={{ color: w.win ? "#15803d" : "#b91c1c", fontWeight: 700 }}>
                      {w.points}/{w.target} {w.win ? "WIN" : "Not yet"}
                    </span>
                  </div>
                  <div style={{ background: "#e2e8f0", height: 10, borderRadius: 999 }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        borderRadius: 999,
                        background: w.win ? "linear-gradient(90deg, #22c55e, #15803d)" : "#f97316",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
