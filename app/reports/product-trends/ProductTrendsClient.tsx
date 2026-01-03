"use client";

import { Chart } from "@/components/Chart";
import type { EChartsOption } from "echarts";

type Series = { name: string; data: number[]; total: number };

export default function ProductTrendsClient({
  metric,
  labels,
  series,
}: {
  metric: "premium" | "apps";
  labels: string[];
  series: Series[];
}) {
  const metricLabel = metric === "apps" ? "Apps" : "Premium";
  const option: EChartsOption = {
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        if (!Array.isArray(params)) return "";
        const axisLabel = params[0]?.axisValueLabel ?? "";
        const lines = [axisLabel];
        params.forEach((p) => {
          const val = typeof p.data === "number" ? p.data : Array.isArray(p.data) ? p.data[1] : 0;
          lines.push(`${p.marker || ""}${p.seriesName}: ${Math.round(val)} ${metricLabel}`);
        });
        return lines.join("<br/>");
      },
    },
    legend: { type: "scroll" },
    dataZoom: [{ type: "slider" }],
    xAxis: { type: "category", data: labels },
    yAxis: { type: "value" },
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      data: s.data.map((v) => (metric === "apps" ? Math.round(v) : Math.round(v))),
    })),
  };

  return (
    <div className="surface" style={{ padding: 12, borderRadius: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Product trends ({metricLabel})</div>
      <Chart option={option} height={360} />
      <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13, color: "#475569" }}>
        <div>Top products are shown; others grouped into “Other”.</div>
      </div>
    </div>
  );
}
