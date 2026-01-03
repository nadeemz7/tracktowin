"use client";

import dynamic from "next/dynamic";
import { CSSProperties, useMemo } from "react";
import type { EChartsOption } from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type Props = {
  option: EChartsOption;
  height?: number;
  onClick?: (params: unknown) => void;
  style?: CSSProperties;
};

export function Chart({ option, height = 320, onClick, style }: Props) {
  const opts = useMemo(() => option, [option]);
  return (
    <ReactECharts
      option={opts}
      style={{ height, width: "100%", ...style }}
      onEvents={onClick ? { click: onClick } : undefined}
      notMerge
      lazyUpdate
    />
  );
}
