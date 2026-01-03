"use client";

import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { useMemo, useState } from "react";

type Props = {
  nameStart: string;
  nameEnd: string;
  initialStart: string;
  initialEnd: string;
  onChange?: (start: string, end: string) => void;
};

export function RangePicker({ nameStart, nameEnd, initialStart, initialEnd, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<string>(initialStart);
  const [end, setEnd] = useState<string>(initialEnd);
  const [hover, setHover] = useState<string>("");
  const [viewStart, setViewStart] = useState<Date>(new Date(initialStart || new Date()));

  const monthA = useMemo(() => generateMonthDays(viewStart), [viewStart]);
  const monthB = useMemo(() => generateMonthDays(addMonths(viewStart, 1)), [viewStart]);

  const dayIsInRange = (d: string) => {
    if (!start) return false;
    if (!end && hover) return d >= start && d <= hover;
    if (start && end) return d >= start && d <= end;
    return false;
  };

  const handleSelect = (day: string) => {
    if (!start || (start && end)) {
      setStart(day);
      setEnd("");
      setHover("");
      onChange?.(day, "");
      return;
    }
    if (day < start) {
      setEnd(start);
      setStart(day);
      onChange?.(day, start);
    } else {
      setEnd(day);
      onChange?.(start, day);
    }
    setHover("");
  };

  const renderMonth = (days: Date[]) => (
    <div style={{ minWidth: 240 }}>
      <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 6 }}>{format(days[0], "MMMM yyyy")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
          <div key={d} style={{ textAlign: "center" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {Array(days[0].getDay())
          .fill(0)
          .map((_, i) => (
            <div key={`blank-${i}`} />
          ))}
        {days.map((d) => {
          const iso = formatISODate(d);
          const selected = (start && iso === start) || (end && iso === end);
          const inRange = dayIsInRange(iso);
          return (
            <button
              key={iso}
              type="button"
              onMouseEnter={() => setHover(iso)}
              onMouseLeave={() => setHover("")}
              onClick={() => handleSelect(iso)}
              style={{
                padding: "6px 0",
                borderRadius: 8,
                border: selected ? "1px solid #2563eb" : "1px solid transparent",
                background: selected ? "#2563eb" : inRange ? "rgba(37,99,235,0.12)" : "transparent",
                color: selected ? "white" : "#111827",
                cursor: "pointer",
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ position: "relative" }}>
      <input type="hidden" name={nameStart} value={start} />
      <input type="hidden" name={nameEnd} value={end} />
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
        style={{ minWidth: 220, justifyContent: "space-between", display: "inline-flex", alignItems: "center" }}
      >
        {start && end ? `${start} → ${end}` : "Pick dates"}
        <span style={{ fontSize: 12, color: "#475569" }}>▼</span>
      </button>
      {open && (
        <div
          className="surface"
          style={{
            position: "absolute",
            top: "105%",
            left: 0,
            zIndex: 20,
            padding: 10,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "white",
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            minWidth: 520,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button className="btn" type="button" onClick={() => setViewStart(addMonths(viewStart, -1))}>
              ←
            </button>
            <div style={{ fontWeight: 700 }}>Select a start and end date</div>
            <button className="btn" type="button" onClick={() => setViewStart(addMonths(viewStart, 1))}>
              →
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
            {renderMonth(monthA)}
            {renderMonth(monthB)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setStart("");
                setEnd("");
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (start && end) setOpen(false);
                if (start && end) onChange?.(start, end);
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatISODate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function generateMonthDays(view: Date) {
  const start = startOfMonth(view);
  const end = endOfMonth(view);
  const days = [];
  for (let d = start.getDate(); d <= end.getDate(); d++) {
    days.push(new Date(view.getFullYear(), view.getMonth(), d));
  }
  return days;
}
