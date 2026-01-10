"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateRangePicker as DatePicker1 } from "@/components/DateRangePicker";

type PresetRange = { key: string; label: string; start: string; end: string };

type Props = {
  start: string;
  end: string;
  label?: string;
  quickPresets?: boolean;
  disableClear?: boolean;
  setRangeParam?: boolean;
  setDateParam?: boolean;
  presets?: PresetRange[];
};

export function DatePicker1RangeClient({
  start,
  end,
  label,
  quickPresets = false,
  disableClear = false,
  setRangeParam = false,
  setDateParam = false,
  presets,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localStart, setLocalStart] = useState(start);
  const [localEnd, setLocalEnd] = useState(end);

  useEffect(() => {
    setLocalStart(start);
    setLocalEnd(end);
  }, [start, end]);

  const handleChange = (nextStart: string, nextEnd: string) => {
    setLocalStart(nextStart);
    setLocalEnd(nextEnd);

    const hasStart = Boolean(nextStart);
    const hasEnd = Boolean(nextEnd);
    if (hasStart !== hasEnd) return;

    const params = new URLSearchParams(searchParams.toString());
    if (!hasStart && !hasEnd) {
      params.delete("start");
      params.delete("end");
      if (setRangeParam) params.delete("range");
      if (setDateParam) params.delete("date");
    } else {
      params.set("start", nextStart);
      params.set("end", nextEnd);
      if (setRangeParam) params.set("range", "custom");
      if (setDateParam) params.set("date", nextStart);
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const applyPreset = (preset: PresetRange) => {
    setLocalStart(preset.start);
    setLocalEnd(preset.end);

    const params = new URLSearchParams(searchParams.toString());
    params.set("start", preset.start);
    params.set("end", preset.end);
    if (setRangeParam) params.set("range", "custom");
    if (setDateParam) params.set("date", preset.start);

    router.push(`${pathname}?${params.toString()}`);
  };

  const picker = (
    <DatePicker1
      label={label}
      start={localStart}
      end={localEnd}
      onChange={handleChange}
      quickPresets={quickPresets}
      disableClear={disableClear}
    />
  );

  if (!presets?.length) return picker;

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {presets.map((preset) => {
          const isActive = preset.start === localStart && preset.end === localEnd;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: isActive ? "1px solid #4338ca" : "1px solid #cbd5e1",
                background: isActive ? "#e0e7ff" : "#f8fafc",
                color: isActive ? "#312e81" : "#0f172a",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      {picker}
    </div>
  );
}

type ResetFiltersButtonProps = {
  start: string;
  end: string;
  clearKeys?: string[];
  label?: string;
};

export function ResetFiltersButton({
  start,
  end,
  clearKeys = [],
  label = "Reset",
}: ResetFiltersButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleReset = () => {
    const params = new URLSearchParams(searchParams.toString());
    clearKeys.forEach((key) => params.delete(key));
    params.set("start", start);
    params.set("end", end);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <button
      type="button"
      onClick={handleReset}
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        background: "#fff",
        color: "#111",
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}
