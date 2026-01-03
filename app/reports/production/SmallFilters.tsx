"use client";

export function SmallFilters({ summary }: { summary: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: "#475569",
        padding: "6px 8px",
        borderRadius: 10,
        background: "#f8fafc",
        maxWidth: 320,
        textAlign: "right",
      }}
      title={summary}
    >
      {summary}
    </div>
  );
}
