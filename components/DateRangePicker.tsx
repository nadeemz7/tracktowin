"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  startOfQuarter,
} from "date-fns";

type QuickKey = "today" | "thisWeek" | "thisMonth" | "lastMonth" | "qtd" | "ytd";

export interface DateRangePickerProps {
  label?: string;
  start: string | "";
  end: string | "";
  onChange: (start: string, end: string) => void;
  quickPresets?: boolean;
  disableClear?: boolean;
}

const quickConfigs: Record<
  QuickKey,
  { label: string; derive: (base: Date) => { start: Date; end: Date } }
> = {
  today: { label: "Today", derive: (base) => ({ start: base, end: base }) },
  thisWeek: {
    label: "This Week",
    derive: (base) => ({ start: startOfWeek(base, { weekStartsOn: 0 }), end: endOfWeek(base, { weekStartsOn: 0 }) }),
  },
  thisMonth: { label: "This Month", derive: (base) => ({ start: startOfMonth(base), end: endOfMonth(base) }) },
  lastMonth: {
    label: "Last Month",
    derive: (base) => {
      const last = subMonths(base, 1);
      return { start: startOfMonth(last), end: endOfMonth(last) };
    },
  },
  qtd: {
    label: "QTD",
    derive: (base) => ({ start: startOfQuarter(base), end: base }),
  },
  ytd: {
    label: "YTD",
    derive: (base) => ({ start: startOfYear(base), end: base }),
  },
};

function fmtDisplay(dateStr?: string) {
  if (!dateStr) return "";
  const d = parseISO(dateStr);
  if (isNaN(d.getTime())) return "";
  return format(d, "MM/dd/yyyy");
}

function toISODate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function buildMonthDays(month: Date) {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days: Date[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return days;
}

export function DateRangePicker({
  label = "Written range",
  start,
  end,
  onChange,
  quickPresets = true,
  disableClear = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<Date | null>(null);
  const [monthLeft, setMonthLeft] = useState<Date>(start ? parseISO(start) : new Date());
  const containerRef = useRef<HTMLDivElement | null>(null);

  const startDate = start ? parseISO(start) : null;
  const endDate = end ? parseISO(end) : null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const monthRight = useMemo(() => addMonths(monthLeft, 1), [monthLeft]);

  const selectDay = (day: Date) => {
    // first click sets start only; second click sets end (and closes)
    if (!startDate || (startDate && endDate)) {
      onChange(toISODate(day), "");
      return;
    }
    const newStart = isBefore(day, startDate) ? day : startDate;
    const newEnd = isBefore(day, startDate) ? startDate : day;
    onChange(toISODate(newStart), toISODate(newEnd));
    setOpen(false);
  };

  const applyQuick = (key: QuickKey) => {
    const { start: s, end: e } = quickConfigs[key].derive(new Date());
    onChange(toISODate(s), toISODate(e));
    setMonthLeft(s);
    setOpen(false);
  };

  const inRange = (d: Date) => {
    if (startDate && endDate) return (isAfter(d, startDate) || isSameDay(d, startDate)) && (isBefore(d, endDate) || isSameDay(d, endDate));
    if (startDate && hover) {
      const low = isBefore(hover, startDate) ? hover : startDate;
      const high = isAfter(hover, startDate) ? hover : startDate;
      return (isAfter(d, low) || isSameDay(d, low)) && (isBefore(d, high) || isSameDay(d, high));
    }
    return false;
  };

  const renderMonth = (month: Date) => {
    const days = buildMonthDays(month);
    const label = format(month, "MMMM yyyy");
    return (
      <div style={{ padding: 8, width: 220 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, color: "#0f172a" }}>
          <span style={{ fontWeight: 600 }}>{label}</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 4,
            fontSize: 12,
            color: "#475569",
            textAlign: "center",
          }}
        >
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d}>{d}</div>
          ))}
          {Array(new Date(month.getFullYear(), month.getMonth(), 1).getDay())
            .fill(null)
            .map((_, idx) => (
              <div key={`pad-${idx}`} />
            ))}
          {days.map((day) => {
            const iso = toISODate(day);
            const selectedStart = start === iso;
            const selectedEnd = end === iso;
            const active = selectedStart || selectedEnd;
            const inSelRange = inRange(day);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => selectDay(day)}
                onMouseEnter={() => setHover(day)}
                style={{
                  height: 30,
                  borderRadius: 6,
                  border: active ? "1px solid #2563eb" : "1px solid transparent",
                  background: active ? "#dbeafe" : inSelRange ? "#e2e8f0" : "transparent",
                  color: "#0f172a",
                  cursor: "pointer",
                }}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const displayValue =
    start && end ? `${fmtDisplay(start)} -> ${fmtDisplay(end)}` : start ? `${fmtDisplay(start)} ->` : "Pick dates";

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <label style={{ display: "block", fontSize: 12, color: "#475569", marginBottom: 4 }}>{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          minWidth: 240,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #cbd5e1",
          background: "#fff",
          color: "#0f172a",
          cursor: "pointer",
          boxShadow: open ? "0 4px 12px rgba(15, 23, 42, 0.08)" : "none",
        }}
      >
        <span style={{ fontSize: 14 }}>{displayValue}</span>
        <span style={{ color: "#64748b" }}>📅</span>
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            marginTop: 8,
            padding: 12,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(15, 23, 42, 0.15)",
          }}
        >
          {quickPresets && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {(Object.keys(quickConfigs) as QuickKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyQuick(key)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#0f172a",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {quickConfigs[key].label}
                </button>
              ))}
              {!disableClear && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("", "");
                    setOpen(false);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #fca5a5",
                    background: "#fff1f2",
                    color: "#b91c1c",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <button
                  type="button"
                  onClick={() => setMonthLeft((m) => subMonths(m, 1))}
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "#0f172a" }}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => setMonthLeft((m) => addMonths(m, 1))}
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "#0f172a" }}
                >
                  →
                </button>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                {renderMonth(monthLeft)}
                {renderMonth(monthRight)}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
