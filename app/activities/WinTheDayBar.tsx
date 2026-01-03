"use client";

import { WinTheDayPlan } from "@prisma/client";

type Result = {
  points: number;
  target: number;
  win: boolean;
  breakdown: { ruleId: string; points: number; detail: string }[];
} | null;

export function WinTheDayBar({
  plan,
  result,
  personName,
  dateLabel,
}: {
  plan: WinTheDayPlan | null;
  result: Result;
  personName: string;
  dateLabel: string;
}) {
  if (!plan) {
    return (
      <div className="surface" style={{ marginTop: 12, padding: 14 }}>
        <div style={{ fontWeight: 700 }}>Win The Day</div>
        <div style={{ color: "#555" }}>No Win The Day plan assigned yet.</div>
      </div>
    );
  }

  const pct = result ? Math.min(100, Math.round((result.points / Math.max(1, result.target)) * 100)) : 0;
  const win = result?.win;

  return (
    <div className="surface" style={{ marginTop: 12, padding: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Win The Day — {plan.name}</div>
          <div style={{ color: "#555" }}>
            {personName} • {dateLabel}
          </div>
        </div>
        <div style={{ fontWeight: 800, color: win ? "#15803d" : "#b45309" }}>{win ? "WIN" : "NOT YET"}</div>
      </div>

      <div style={{ background: "#f1f5f9", borderRadius: 999, overflow: "hidden", height: 14, border: "1px solid #e5e7eb" }}>
        <div
          style={{
            width: `${pct}%`,
            background: win ? "#15803d" : "#2563eb",
            height: "100%",
            transition: "width 0.2s ease",
          }}
        />
      </div>
      <div style={{ color: "#555" }}>
        {result?.points ?? 0} / {result?.target ?? plan.pointsToWin} points
      </div>

      {result && result.breakdown.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Breakdown</div>
          {result.breakdown.map((b) => (
            <div key={b.ruleId} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#f8f9fa" }}>
              <div style={{ fontWeight: 700 }}>{b.detail}</div>
              <div style={{ color: "#555" }}>{b.points} point(s)</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
