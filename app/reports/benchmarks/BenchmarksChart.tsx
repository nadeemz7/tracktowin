"use client";

type BreakdownRow = {
  key: string;
  premiumActual: number;
  premiumTarget: number | null;
};

type Props = {
  rows: BreakdownRow[];
};

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function BenchmarksChart({ rows }: Props) {
  if (!rows.length) return null;

  const chartWidth = 640;
  const chartHeight = 260;
  const padding = { top: 16, right: 16, bottom: 60, left: 40 };

  const sorted = [...rows].sort((a, b) => a.key.localeCompare(b.key));
  const maxY =
    Math.max(
      ...sorted.map((r) => Math.max(r.premiumActual || 0, r.premiumTarget || 0))
    ) || 1;

  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const barWidth = innerWidth / sorted.length;

  const hasAnyTarget = sorted.some((r) => r.premiumTarget != null);

  return (
    <div className="surface" style={{ padding: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Premium vs Goal</div>
      {hasAnyTarget ? (
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 12, color: "#4b5563", marginBottom: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, background: "#2563eb", display: "inline-block", borderRadius: 2 }} />
            Bar = Actual
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 2, background: "#f59e0b", display: "inline-block" }} />
            Line = Goal
          </span>
        </div>
      ) : null}
      <svg width={chartWidth} height={chartHeight} role="img" aria-label="Premium vs Goal chart">
        {/* axes */}
        <line
          x1={padding.left}
          y1={chartHeight - padding.bottom}
          x2={chartWidth - padding.right}
          y2={chartHeight - padding.bottom}
          stroke="#e5e7eb"
        />
        {/* bars and goal lines */}
        {sorted.map((row, idx) => {
          const x = padding.left + idx * barWidth + barWidth * 0.2;
          const usableWidth = barWidth * 0.6;
          const barH = innerHeight * ((row.premiumActual || 0) / maxY);
          const y = chartHeight - padding.bottom - barH;

          const goalY =
            row.premiumTarget != null
              ? chartHeight - padding.bottom - innerHeight * ((row.premiumTarget || 0) / maxY)
              : null;

          return (
            <g key={row.key}>
              <rect
                x={x}
                y={y}
                width={usableWidth}
                height={barH}
                fill="#2563eb"
                opacity={0.9}
              >
                <title>
                  {row.key}: {fmtMoney(row.premiumActual)}
                  {row.premiumTarget != null ? ` • Goal ${fmtMoney(row.premiumTarget)}` : ""}
                </title>
              </rect>
              {goalY != null ? (
                <line
                  x1={x}
                  x2={x + usableWidth}
                  y1={goalY}
                  y2={goalY}
                  stroke="#f59e0b"
                  strokeWidth={3}
                />
              ) : null}
              <text
                x={x + usableWidth / 2}
                y={chartHeight - padding.bottom + 16}
                textAnchor="middle"
                style={{ fontSize: 12, fill: "#374151" }}
              >
                {row.key}
              </text>
            </g>
          );
        })}
        {/* max label */}
        <text
          x={padding.left - 4}
          y={padding.top + 4}
          textAnchor="end"
          style={{ fontSize: 11, fill: "#6b7280" }}
        >
          {fmtMoney(maxY)}
        </text>
        <text
          x={padding.left - 4}
          y={chartHeight - padding.bottom}
          textAnchor="end"
          style={{ fontSize: 11, fill: "#6b7280", dominantBaseline: "hanging" }}
        >
          $0
        </text>
      </svg>
      {!hasAnyTarget ? (
        <div style={{ color: "#6b7280", fontSize: 13, marginTop: 6 }}>
          No premium targets available for this mode yet.
        </div>
      ) : null}
    </div>
  );
}
