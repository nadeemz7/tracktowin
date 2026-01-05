"use client";

import { useEffect, useMemo, useState } from "react";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import ProductTrendsClient from "./product-trends/ProductTrendsClient";
import { PresetProductionOverview } from "./PresetsClient";
import ActivityDashboard from "./activity/ActivityDashboard";

type AgencyOpt = { id: string; name: string };

type Card = {
  id: string;
  title: string;
  desc: string;
  color: string;
  openHref: string;
  render: () => JSX.Element;
};

const STATUS_OPTIONS = ["WRITTEN", "ISSUED", "PAID", "STATUS_CHECK", "CANCELLED"] as const;

function ProductTrendsInlinePreview({ agencies }: { agencies: AgencyOpt[] }) {
  const [metric, setMetric] = useState<"premium" | "apps">("premium");
  const [quickRange, setQuickRange] = useState<"" | "quarter" | "year">("");
  const [topN, setTopN] = useState(8);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(["WRITTEN", "ISSUED", "PAID"]);
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
  const [data, setData] = useState<{ labels: string[]; series: { name: string; data: number[] }[] }>({ labels: [], series: [] });
  const [loading, setLoading] = useState(true);

  const computeRange = () => {
    const now = new Date();
    if (quickRange === "quarter") {
      return { start: startOfMonth(subMonths(now, 2)).toISOString(), end: endOfMonth(now).toISOString() };
    }
    if (quickRange === "year") {
      return { start: startOfMonth(new Date(now.getFullYear(), 0, 1)).toISOString(), end: endOfMonth(now).toISOString() };
    }
    return { start: startOfMonth(subMonths(now, 5)).toISOString(), end: endOfMonth(now).toISOString() };
  };

  useEffect(() => {
    setLoading(true);
    const { start, end } = computeRange();
    fetch("/api/reports/production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dimension: "product",
        granularity: "month",
        metric,
        start,
        end,
        statuses: selectedStatuses,
        topN,
        agencies: selectedAgencies.length ? selectedAgencies : undefined,
      }),
    })
      .then((r) => r.json())
      .then((res) => {
        setData({ labels: res.labels || [], series: res.series || [] });
      })
      .catch(() => {
        setData({ labels: [], series: [] });
      })
      .finally(() => setLoading(false));
  }, [metric, quickRange, topN, selectedStatuses, selectedAgencies]);

  if (loading) {
    return (
      <div className="surface" style={{ padding: 12, borderRadius: 12, color: "#6b7280" }}>
        Loading product trends…
      </div>
    );
  }

  const safeSeries = Array.isArray((data as any)?.series) ? (data as any).series : [];
  const seriesWithTotals = safeSeries.map((s: { name: string; data: number[] }) => ({
    ...s,
    total: (Array.isArray(s.data) ? s.data : []).reduce((a, b) => a + b, 0),
  }));

  const toggleStatus = (st: string) =>
    setSelectedStatuses((prev) => (prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]));

  const toggleAgency = (id: string) =>
    setSelectedAgencies((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));

  return (
    <div className="surface" style={{ padding: 12, borderRadius: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ color: "#475569" }}>Metric</span>
          <select className="select" value={metric} onChange={(e) => setMetric(e.target.value as "premium" | "apps")} style={{ minHeight: 30 }}>
            <option value="premium">Premium</option>
            <option value="apps">Apps</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ color: "#475569" }}>Quick range</span>
          <select className="select" value={quickRange} onChange={(e) => setQuickRange(e.target.value as any)} style={{ minHeight: 30 }}>
            <option value="">Last 6 months</option>
            <option value="quarter">Last 3 months</option>
            <option value="year">This year</option>
          </select>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span style={{ color: "#475569" }}>Top N</span>
          <input
            className="input"
            type="number"
            min={1}
            value={topN}
            onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 1))}
            style={{ width: 70, minHeight: 30 }}
          />
        </label>
        <details style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, fontSize: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "#111827" }}>Statuses</summary>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {STATUS_OPTIONS.map((st) => (
              <label key={st} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={selectedStatuses.includes(st)} onChange={() => toggleStatus(st)} />
                {st}
              </label>
            ))}
          </div>
        </details>
        <details style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, fontSize: 12 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "#111827" }}>Agencies</summary>
          <div style={{ display: "grid", gap: 4, marginTop: 6, maxHeight: 200, overflow: "auto" }}>
            {agencies.map((a) => (
              <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={selectedAgencies.includes(a.id)} onChange={() => toggleAgency(a.id)} />
                {a.name}
              </label>
            ))}
          </div>
        </details>
      </div>
      <ProductTrendsClient metric={metric} labels={data?.labels || []} series={seriesWithTotals} />
    </div>
  );
}

export default function ReportsHubClient({ agencies }: { agencies: AgencyOpt[] }) {
  const cards: Card[] = useMemo(
    () => [
      {
        id: "production",
        title: "Production Overview",
        desc: "Premium and apps this month by LoB with KPIs.",
        color: "#2563eb",
        openHref: "/reports/production",
        render: () => <PresetProductionOverview agencies={agencies} variant="inline" />,
      },
      {
        id: "products",
        title: "Product Trends",
        desc: "Top products over time with Premium/Apps toggle.",
        color: "#0ea5e9",
        openHref: "/reports/product-trends",
        render: () => <ProductTrendsInlinePreview agencies={agencies} />,
      },
      {
        id: "business",
        title: "Specific Product Growth",
        desc: "Business premium/apps over time and by product.",
        color: "#22c55e",
        openHref: "/reports/production",
        render: () => (
          <div className="surface" style={{ padding: 12, borderRadius: 12, color: "#6b7280" }}>
            Business premium dashboard coming soon.
          </div>
        ),
      },
      {
        id: "seller",
        title: "Team Member Performance",
        desc: "Leaderboard by seller with trend sparkline.",
        color: "#a855f7",
        openHref: "/reports/production",
        render: () => (
          <div className="surface" style={{ padding: 12, borderRadius: 12, color: "#6b7280" }}>
            Seller leaderboard coming soon.
          </div>
        ),
      },
      {
        id: "activity",
        title: "Activity & KPI Tracking",
        desc: "Team/person activities with totals and time series.",
        color: "#f97316",
        openHref: "/reports/activity",
        render: () => <ActivityDashboard variant="inline" />,
      },
      {
        id: "wtd",
        title: "Win The Day Compliance",
        desc: "Win rate, calendar heatmap, and wins + points leaderboard.",
        color: "#e11d48",
        openHref: "/reports/production",
        render: () => (
          <div className="surface" style={{ padding: 12, borderRadius: 12, color: "#6b7280" }}>
            WTD compliance report coming soon.
          </div>
        ),
      },
    ],
    [agencies]
  );

  const [selected, setSelected] = useState<string[]>([]); // start clean until user clicks

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectAll = () => setSelected(cards.map((c) => c.id));
  const clearAll = () => setSelected([]);
  const activeCards = selected.length ? cards.filter((c) => selected.includes(c.id)) : [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "#475569", fontSize: 13 }}>Tip: click cards to stack multiple previews.</span>
        <button className="btn" type="button" onClick={selectAll}>
          Select all
        </button>
        <button className="btn" type="button" onClick={clearAll}>
          Clear
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.id}
            className="surface"
            style={{
              padding: 14,
              borderRadius: 12,
              border: `2px solid ${selected.includes(card.id) ? card.color : "#e5e7eb"}`,
              cursor: "pointer",
              background: selected.includes(card.id) ? `${card.color}14` : "white",
              transition: "border-color 0.15s ease, background 0.15s ease",
            }}
            onClick={() => toggle(card.id)}
          >
            <div style={{ fontWeight: 800 }}>{card.title}</div>
            <div style={{ color: "#6b7280", marginTop: 6 }}>{card.desc}</div>
            <a
              href={card.openHref}
              style={{
                marginTop: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "#2563eb",
                fontWeight: 700,
                textDecoration: "none",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              Open →
            </a>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {activeCards.length === 0 ? (
          <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
            <div style={{ fontWeight: 700 }}>No previews selected.</div>
            <div style={{ color: "#6b7280" }}>Click a card above or select all to stack charts.</div>
          </div>
        ) : (
          activeCards.map((card) => (
            <div
              key={card.id}
              className="surface"
              style={{ padding: 12, borderRadius: 12, border: `2px solid ${card.color}` }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8 }}>{card.title} — inline preview</div>
              {card.render()}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
