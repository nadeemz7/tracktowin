"use client";

import { CSSProperties, useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";

type Props = {
  option: EChartsOption;
  height?: number;
  onClick?: (params: unknown) => void;
  onEvents?: Record<string, (params: any) => void>;
  style?: CSSProperties;
  onReady?: (chart: echarts.ECharts) => void;
};

export function Chart({ option, height = 320, onClick, onEvents, style, onReady }: Props) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const boundHandlersRef = useRef<Record<string, (params: any) => void>>({});

  useEffect(() => {
    if (!elRef.current) return;
    const chart = echarts.init(elRef.current);
    chartRef.current = chart;
    if (onReady) onReady(chart);

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);

    return () => {
      const prev = boundHandlersRef.current;
      Object.entries(prev).forEach(([evt, handler]) => chart.off(evt, handler));
      boundHandlersRef.current = {};

      window.removeEventListener("resize", onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.setOption(option, true);

    const prev = boundHandlersRef.current;
    Object.entries(prev).forEach(([evt, handler]) => chart.off(evt, handler));
    boundHandlersRef.current = {};

    const events: Record<string, (params: any) => void> = { ...(onEvents || {}) };
    if (onClick && !events.click) events.click = onClick;

    Object.entries(events).forEach(([evt, handler]) => {
      if (typeof handler !== "function") return;
      chart.on(evt, handler);
      boundHandlersRef.current[evt] = handler;
    });
  }, [option, onEvents, onClick]);

  return <div ref={elRef} style={{ height, width: "100%", ...style }} />;
}
