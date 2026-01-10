"use client";

import { addMonths, eachDayOfInterval, endOfMonth, format, startOfMonth } from "date-fns";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type RangePreset = "today" | "week" | "month" | "custom";
type Query = Record<string, string | undefined>;

function parseLocal(iso: string) {
  if (!iso) return new Date();
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function DateRangePicker({
  preset,
  baseDate,
  start,
  end,
  query,
  basePath,
}: {
  preset: RangePreset;
  baseDate: string;
  start?: string;
  end?: string;
  query: Query;
  basePath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const path = basePath ?? pathname;
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<string | undefined>(start);
  const [draftEnd, setDraftEnd] = useState<string | undefined>(end);

  const displayLabel = useMemo(() => {
    if (preset !== "custom") return format(parseLocal(baseDate), "MMM d");
    if (start && end) return `${format(parseLocal(start), "MMM d")} — ${format(parseLocal(end), "MMM d")}`;
    if (start) return `${format(parseLocal(start), "MMM d")} —`;
    return "Select dates";
  }, [preset, baseDate, start, end]);

  function buildHref(overrides: Query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    Object.entries(overrides).forEach(([k, v]) => {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    });
    if (overrides.range && overrides.range !== "custom") {
      params.delete("start");
      params.delete("end");
    }
    return `${path}?${params.toString()}`;
  }

  function applyCustom(nextStart?: string, nextEnd?: string) {
    if (!nextStart || !nextEnd) return;
    setOpen(false);
    router.push(
      buildHref({
        range: "custom",
        start: nextStart,
        end: nextEnd,
        date: nextStart,
      }),
    );
  }

  function onDayClick(day: Date) {
    const dayIso = toDateISO(day);
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(dayIso);
      setDraftEnd(undefined);
      return;
    }
    // second click sets end
    const startDate = parseLocal(draftStart);
    if (day < startDate) {
      setDraftStart(dayIso);
      setDraftEnd(draftStart);
      applyCustom(dayIso, draftStart);
    } else {
      setDraftEnd(dayIso);
      applyCustom(draftStart, dayIso);
    }
  }

  const monthStart = startOfMonth(parseLocal(baseDate));
  const monthNext = startOfMonth(addMonths(parseLocal(baseDate), 1));
  const calendars = [monthStart, monthNext];

  function renderMonth(month: Date) {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const days = eachDayOfInterval({ start, end });
    const empty = start.getDay(); // 0-6
    return (
      <div key={format(month, "yyyy-MM")} style={{ minWidth: 220 }}>
        <div style={{ textAlign: "center", fontWeight: 700, marginBottom: 8 }}>{format(month, "MMMM yyyy")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 12, color: "#555", marginBottom: 6, textAlign: "center" }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={`${d}-${i}`}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {Array.from({ length: empty }).map((_, idx) => (
            <div key={`empty-${idx}`} />
          ))}
          {days.map((day) => {
            const iso = toDateISO(day);
            const isStart = draftStart && iso === draftStart;
            const isEnd = draftEnd && iso === draftEnd;
            const isInRange =
              draftStart &&
              draftEnd &&
              day >= parseLocal(draftStart) &&
              day <= parseLocal(draftEnd);
            return (
              <button
                key={iso}
                onClick={() => onDayClick(day)}
                style={{
                  padding: "8px 0",
                  borderRadius: isStart || isEnd ? 999 : 6,
                  border: isStart || isEnd ? "1px solid #b91c1c" : "1px solid #e5e7eb",
                  background: isInRange ? "#fef2f2" : "#fff",
                  color: isStart || isEnd ? "#b91c1c" : "#111",
                  fontWeight: isStart || isEnd ? 800 : 600,
                }}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #d1d5db",
          background: "#fff",
          fontWeight: 700,
          minWidth: 180,
          justifyContent: "space-between",
        }}
      >
        <span>{displayLabel}</span>
        <span role="img" aria-label="calendar">
          📅
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 20,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 14,
            boxShadow: "0 20px 50px rgba(0,0,0,0.15)",
            minWidth: 460,
            maxWidth: "min(95vw, 680px)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", gap: 16, justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => {
                const prev = startOfMonth(addMonths(monthStart, -1));
                const href = buildHref({ date: toDateISO(prev) });
                router.push(href);
              }}
              style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 10px" }}
            >
              ←
            </button>
            <div style={{ display: "flex", gap: 20 }}>{calendars.map(renderMonth)}</div>
            <button
              type="button"
              onClick={() => {
                const next = startOfMonth(addMonths(monthStart, 1));
                const href = buildHref({ date: toDateISO(next) });
                router.push(href);
              }}
              style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "6px 10px" }}
            >
              →
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                const iso = toDateISO(today);
                setDraftStart(iso);
                setDraftEnd(iso);
                router.push(buildHref({ range: "today", date: iso, start: undefined, end: undefined }));
                setOpen(false);
              }}
              style={{ border: "none", background: "transparent", color: "#2563eb", fontWeight: 700 }}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftStart(undefined);
                setDraftEnd(undefined);
                router.push(buildHref({ range: "today", start: undefined, end: undefined }));
                setOpen(false);
              }}
              style={{ border: "none", background: "transparent", color: "#2563eb", fontWeight: 700 }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                if (draftStart && draftEnd) applyCustom(draftStart, draftEnd);
                setOpen(false);
              }}
              style={{ border: "1px solid #2563eb", background: "#2563eb", color: "#fff", padding: "8px 14px", borderRadius: 10, fontWeight: 800 }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
