"use client";

import { useMemo, useState } from "react";
import { PresetProductionOverview, PresetActivityOverview } from "./PresetsClient";

type AgencyOpt = { id: string; name: string };

type Card = {
  id: string;
  title: string;
  desc: string;
  color: string;
  openHref: string;
  render: () => JSX.Element;
};

export default function ReportsHubClient({ agencies }: { agencies: AgencyOpt[] }) {
  const cards: Card[] = useMemo(
    () => [
      {
        id: "production",
        title: "Production Overview",
        desc: "Premium and apps this month by LoB with KPIs.",
        color: "#2563eb",
        openHref: "/reports/production",
        render: () => <PresetProductionOverview agencies={agencies} />,
      },
      {
        id: "products",
        title: "Product Trends",
        desc: "Top products over time with Premium/Apps toggle.",
        color: "#0ea5e9",
        openHref: "/reports/product-trends",
        render: () => (
          <div className="surface" style={{ padding: 12, borderRadius: 12, color: "#6b7280" }}>
            Open to see top-N product trends (line chart) with premium/apps toggle.
          </div>
        ),
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
        render: () => <PresetActivityOverview />,
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
