"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BenchmarksChart } from "./BenchmarksChart";
import { DateRangePicker as DatePicker1 } from "@/components/DateRangePicker";
import { useBenchmarksFilters } from "./hooks/useBenchmarksFilters";
import { expectedToDate, pace, toISODate } from "./lib/benchmarksMath";
import ErrorBoundary from "@/app/components/ErrorBoundary";

type OfficeSummary = {
  hasPlan: boolean;
  planMode: "BUCKET" | "LOB" | null;
  appsActual: number;
  premiumActual: number;
  appsTarget: number | null;
  premiumTarget: number | null;
  appsDelta: number | null;
  premiumDelta: number | null;
  pace: { appsPace: number | null; premiumPace: number | null };
};

type BreakdownRow = {
  key: string;
  category?: string | null;
  appsActual: number;
  premiumActual: number;
  appsTarget: number | null;
  premiumTarget: number | null;
  appsDelta: number | null;
  premiumDelta: number | null;
  pacePremium: number | null;
};

type LobOption = {
  id: string;
  name: string;
  premiumCategory: string;
};

type LobActualRow = {
  lobId: string;
  name: string;
  category?: string | null;
  appsActual: number;
  premiumActual: number;
};

type BucketActualRow = {
  bucket: string;
  appsActual: number;
  premiumActual: number;
};

type PersonRow = {
  personId: string;
  name: string;
  roleName: string | null;
  appsActual: number;
  premiumActual: number;
  appsTarget: number;
  premiumTarget: number;
  appsTargetsByLob: Record<string, number>;
  premiumTargetsByBucket: { PC: number; FS: number; IPS: number };
  activityTargetsByType: Record<string, number>;
  appsDelta: number;
  premiumDelta: number;
  pacePremium: number | null;
  expectationSource: "override" | "role";
};

export type ReportResponse = {
  office: OfficeSummary;
  breakdown: { mode: "BUCKET" | "LOB"; rows: BreakdownRow[] };
  people: PersonRow[];
  lobs?: LobOption[];
  lobActuals?: LobActualRow[];
  bucketActuals?: BucketActualRow[];
  officePlanYear?: number;
  officePlanAppsByLob?: Record<string, number> | null;
  officePlanPremiumByBucket?: { PC: number; FS: number; IPS: number } | null;
  error?: string;
};

type SnapshotListItem = {
  id: string;
  createdAt: string;
  title?: string | null;
  startISO: string;
  endISO: string;
};

type SnapshotResponse = {
  id: string;
  createdAt: string;
  title?: string | null;
  reportType: string;
  startISO: string;
  endISO: string;
  statuses: string[];
  payload: ReportResponse;
};

function fmtInt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function fmtMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function numDelta(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null) return null;
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a - b;
}

function formatDelta(value: number | null, formatter: (n: number | null | undefined) => string) {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatter(Math.abs(value))}`;
}

function moneyDelta(a: number | null | undefined, b: number | null | undefined) {
  return formatDelta(numDelta(a, b), fmtMoney);
}

function pctDelta(a: number | null | undefined, b: number | null | undefined) {
  return formatDelta(numDelta(a, b), fmtPct);
}

function parseISODate(value?: string | null) {
  if (!value || value.length !== 10) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return null;
  return date;
}

function parseCsvParam(value?: string | null) {
  if (!value) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  value.split(",").forEach((entry) => {
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    next.push(trimmed);
  });
  return next;
}

function clampDateToYear(date: Date, year: number) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  if (date < start) return start;
  if (date > end) return end;
  return date;
}

function daysInclusive(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

function getOnTrackStatus(onTrackPct: number | null) {
  if (onTrackPct == null || Number.isNaN(onTrackPct)) {
    return { label: "—", color: "#6b7280", background: "#f3f4f6", border: "#e5e7eb" };
  }
  if (onTrackPct >= 1) {
    return { label: "On track", color: "#166534", background: "#dcfce7", border: "#86efac" };
  }
  if (onTrackPct >= 0.9) {
    return { label: "Slightly behind", color: "#92400e", background: "#fef3c7", border: "#fde68a" };
  }
  return { label: "Behind", color: "#991b1b", background: "#fee2e2", border: "#fecaca" };
}

function renderStatusChip(onTrackPct: number | null) {
  const status = getOnTrackStatus(onTrackPct);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        color: status.color,
        background: status.background,
        border: `1px solid ${status.border}`,
      }}
    >
      {status.label}
    </span>
  );
}

type TabButtonProps = {
  active: boolean;
  label: string;
  onClick: () => void;
};

function TabButton({ active, label, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 12px",
        borderRadius: 999,
        border: active ? "1px solid #111827" : "1px solid #e5e7eb",
        background: active ? "#111827" : "#fff",
        color: active ? "#fff" : "#111827",
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  );
}

type SectionProps = {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

function Section({ title, actions, children }: SectionProps) {
  const titleContent = typeof title === "string" ? <div style={{ fontWeight: 700 }}>{title}</div> : title;
  return (
    <div className="surface" style={{ padding: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
        }}
      >
        {titleContent}
        {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  body?: string;
  action?: ReactNode;
};

function EmptyState({ title, body, action }: EmptyStateProps) {
  if (!body && !action) {
    return (
      <div className="surface" style={{ padding: 12 }}>
        {title}
      </div>
    );
  }
  return (
    <div className="surface" style={{ padding: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: body || action ? 4 : 0 }}>{title}</div>
      {body ? <div style={{ color: "#6b7280", marginBottom: action ? 8 : 0 }}>{body}</div> : null}
      {action ? <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{action}</div> : null}
    </div>
  );
}

type BenchmarksReportViewProps = {
  payload: ReportResponse | null;
  startISO: string;
  endISO: string;
  statuses: string[];
  comparePayload?: ReportResponse | null;
  readOnly?: boolean;
  canViewPeopleBenchmarks?: boolean;
};

export function BenchmarksReportView({
  payload,
  startISO,
  endISO,
  statuses,
  comparePayload = null,
  readOnly = false,
  canViewPeopleBenchmarks = true,
}: BenchmarksReportViewProps) {
  const startParsed = parseISODate(startISO);
  const endParsed = parseISODate(endISO);
  const rangeStart = startParsed ?? new Date();
  const rangeEnd = endParsed ?? rangeStart;
  const hasValidRange = Boolean(startParsed && endParsed);
  const showPeopleBenchmarks = Boolean(canViewPeopleBenchmarks);

  const office = payload?.office;
  const breakdown = payload?.breakdown;
  const people = payload?.people || [];
  const compareBreakdown = comparePayload?.breakdown;
  const comparePeople = comparePayload?.people || [];
  const breakdownMode = breakdown?.mode ?? compareBreakdown?.mode ?? "LOB";
  const hasCompare = Boolean(comparePayload);
  const peopleEntries = useMemo(() => {
    if (!hasCompare) return [];
    const byId = new Map<string, { current?: PersonRow; compare?: PersonRow }>();
    people.forEach((person) => {
      byId.set(person.personId, { current: person });
    });
    comparePeople.forEach((person) => {
      const existing = byId.get(person.personId);
      if (existing) {
        existing.compare = person;
      } else {
        byId.set(person.personId, { compare: person });
      }
    });
    const entries = Array.from(byId.entries()).map(([personId, value]) => ({
      personId,
      current: value.current,
      compare: value.compare,
    }));
    entries.sort((a, b) => {
      const nameA = (a.current?.name ?? a.compare?.name ?? a.personId).toLowerCase();
      const nameB = (b.current?.name ?? b.compare?.name ?? b.personId).toLowerCase();
      return nameA.localeCompare(nameB);
    });
    return entries;
  }, [hasCompare, people, comparePeople]);
  const drilldownStatuses = statuses;
  const breakdownRows = useMemo(() => {
    if (!breakdown) return [];
    return [...breakdown.rows].sort((a, b) => a.key.localeCompare(b.key));
  }, [breakdown?.rows]);
  const compareBreakdownRows = useMemo(() => {
    if (!compareBreakdown) return [];
    return [...compareBreakdown.rows].sort((a, b) => a.key.localeCompare(b.key));
  }, [compareBreakdown?.rows]);
  const breakdownRowEntries = useMemo(() => {
    const byKey = new Map<string, { current?: BreakdownRow; compare?: BreakdownRow }>();
    breakdownRows.forEach((row) => {
      byKey.set(row.key, { current: row });
    });
    compareBreakdownRows.forEach((row) => {
      const existing = byKey.get(row.key);
      if (existing) {
        existing.compare = row;
      } else {
        byKey.set(row.key, { compare: row });
      }
    });
    const entries = Array.from(byKey.entries()).map(([key, value]) => ({
      key,
      current: value.current,
      compare: value.compare,
    }));
    entries.sort((a, b) => a.key.localeCompare(b.key));
    return entries;
  }, [breakdownRows, compareBreakdownRows]);
  const peopleRows = hasCompare
    ? peopleEntries
    : people.map((person) => ({ personId: person.personId, current: person as PersonRow }));
  const hasPeopleRows = peopleRows.length > 0;
  const chartRows = useMemo(
    () =>
      breakdownRows.map((r) => ({
        key: r.key,
        premiumActual: r.premiumActual,
        premiumTarget: r.premiumTarget,
      })),
    [breakdownRows]
  );
  const hasNoActivity = office && office.appsActual === 0 && office.premiumActual === 0;
  const warnings: JSX.Element[] = [];
  const addWarning = (key: string, message: string, actions?: JSX.Element) => {
    warnings.push(
      <div key={`warning-${key}`} className="surface" style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: actions ? 6 : 0 }}>{message}</div>
        {actions ? <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div> : null}
      </div>
    );
  };
  const ctaSurfaces: JSX.Element[] = [];
  if (office && office.hasPlan === false) {
    ctaSurfaces.push(
      <div key="cta-office" className="surface" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>Set your Office Plan</div>
        <div style={{ color: "#6b7280", marginBottom: 8 }}>Benchmarks compares production to annual office goals.</div>
        <a href="/people?tab=office" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>Go to Office Plan</a>
      </div>
    );
  }
  if (showPeopleBenchmarks && people.length === 0) {
    ctaSurfaces.push(
      <div key="cta-people" className="surface" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>No people with expectations</div>
        <div style={{ color: "#6b7280", marginBottom: 8 }}>
          Set role defaults or person overrides to include people in Benchmarks.
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/people?tab=roles" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
            Go to Role Defaults
          </a>
          <a href="/people?tab=people" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
            Go to People
          </a>
        </div>
      </div>
    );
  }
  if (hasNoActivity) {
    ctaSurfaces.push(
      <div key="cta-activity" className="surface" style={{ padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 4 }}>No activity in this range.</div>
        <div style={{ color: "#6b7280" }}>Adjust dates or record production in Sold Products.</div>
      </div>
    );
  }

  if (hasValidRange) {
    const startYear = rangeStart.getFullYear();
    const startMonth = rangeStart.getMonth();
    const endYear = rangeEnd.getFullYear();
    const endMonth = rangeEnd.getMonth();
    const isSameMonth = startYear === endYear && startMonth === endMonth;
    const lastDayOfMonth = new Date(startYear, startMonth + 1, 0).getDate();
    const isFullMonth =
      isSameMonth && rangeStart.getDate() === 1 && rangeEnd.getDate() === lastDayOfMonth;
    if (!isFullMonth) {
      addWarning("partial-period", "You are viewing a partial period. Targets and pace are prorated to this range.");
    }
  }

  if (office && office.hasPlan === false) {
    addWarning(
      "missing-office-plan",
      "Office Plan is not set. Benchmarks will show — for office targets.",
      <a href="/people?tab=office" className="btn" style={{ padding: "6px 10px", textDecoration: "none" }}>
        Set Office Plan
      </a>
    );
  }

  const hasMissingExpectations =
    showPeopleBenchmarks &&
    (people.length === 0 ||
      people.some((p) => !p.roleName || !Number.isFinite(p.appsTarget) || !Number.isFinite(p.premiumTarget)));
  if (hasMissingExpectations) {
    addWarning(
      "missing-expectations",
      "Some people have no expectations configured. Set role defaults or person overrides.",
      <>
        <a href="/people?tab=roles" className="btn" style={{ padding: "6px 10px", textDecoration: "none" }}>
          Role Defaults
        </a>
        <a href="/people?tab=people" className="btn" style={{ padding: "6px 10px", textDecoration: "none" }}>
          People
        </a>
      </>
    );
  }

  if (breakdown && office?.hasPlan && office.premiumTarget != null && breakdown.rows.length) {
    const sumTargets = breakdown.rows.reduce((sum, row) => sum + (row.premiumTarget ?? 0), 0);
    const diff = Math.abs(sumTargets - office.premiumTarget);
    const threshold = Math.max(Math.abs(office.premiumTarget) * 0.01, 1);
    if (diff > threshold) {
      addWarning(
        "mismatch-targets",
        "Breakdown targets don’t match office target. Check Office Plan and role/person expectations."
      );
    }
  }

  const officeAppsAnnual = null;
  const officePremiumAnnual = null;
  const officeAppsProrated = office?.appsTarget ?? null;
  const officePremiumProrated = office?.premiumTarget ?? null;
  const officeAppsExpected = hasValidRange ? expectedToDate(officeAppsProrated, rangeStart, rangeEnd) : null;
  const officePremiumExpected = hasValidRange ? expectedToDate(officePremiumProrated, rangeStart, rangeEnd) : null;
  const officeAppsPaceRaw = office?.pace?.appsPace;
  const officePremiumPaceRaw = office?.pace?.premiumPace;
  const officeAppsPace =
    officeAppsExpected != null && officeAppsExpected > 0
      ? Number.isFinite(officeAppsPaceRaw ?? NaN)
        ? officeAppsPaceRaw!
        : pace(office?.appsActual ?? 0, officeAppsExpected)
      : null;
  const officePremiumPace =
    officePremiumExpected != null && officePremiumExpected > 0
      ? Number.isFinite(officePremiumPaceRaw ?? NaN)
        ? officePremiumPaceRaw!
        : pace(office?.premiumActual ?? 0, officePremiumExpected)
      : null;

  return (
    <>
      {warnings}
      {ctaSurfaces}

      {office ? (
        <div className="surface" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Office</div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Apps</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Actual: {fmtInt(office.appsActual)}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Prorated Target: {fmtInt(officeAppsProrated)}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Annual Target: {fmtInt(officeAppsAnnual)}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Expected-to-date: {fmtInt(officeAppsExpected)}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Delta: {fmtInt(office.appsDelta)}</div>
              <div style={{ color: "#2563eb", fontSize: 12 }}>Pace: {fmtPct(officeAppsPace)}</div>
              <div style={{ color: "#9ca3af", fontSize: 11 }}>Pace = Actual ÷ Expected-to-date.</div>
            </div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Premium</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Actual: {fmtMoney(office.premiumActual)}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Prorated Target: {fmtMoney(officePremiumProrated)}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Annual Target: {fmtMoney(officePremiumAnnual)}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Expected-to-date: {fmtMoney(officePremiumExpected)}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>Delta: {fmtMoney(office.premiumDelta)}</div>
              <div style={{ color: "#2563eb", fontSize: 12 }}>Pace: {fmtPct(officePremiumPace)}</div>
              <div style={{ color: "#9ca3af", fontSize: 11 }}>Pace = Actual ÷ Expected-to-date.</div>
            </div>
          </div>
          {!office.hasPlan ? (
            <div style={{ color: "#6b7280", marginTop: 8 }}>No Office Plan set for this year.</div>
          ) : null}
        </div>
      ) : null}

      {breakdown && breakdownRows.length ? (
        <BenchmarksChart rows={chartRows} />
      ) : null}

      {hasNoActivity ? (
        <div className="surface" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>No activity in this range.</div>
          <div style={{ color: "#6b7280" }}>Adjust dates or record production in Sold Products.</div>
        </div>
      ) : null}

      {breakdown || compareBreakdown ? (
        <div className="surface" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Breakdown ({breakdownMode})</div>
          {breakdownRowEntries.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No activity in this range.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: 8 }}>Key</th>
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Apps Actual</th>
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Premium Actual</th>
                    {hasCompare ? (
                      <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Δ Premium Actual</th>
                    ) : null}
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Prorated Premium Target</th>
                    {hasCompare ? (
                      <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Δ Premium Target</th>
                    ) : null}
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Delta</th>
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Pace (to-date)</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownRowEntries.map((row) => {
                    const currentRow = row.current;
                    const compareRow = row.compare;
                    const rowKey = row.key;
                    const rowCategory = currentRow?.category ?? compareRow?.category ?? null;
                    const appsActual = currentRow?.appsActual ?? 0;
                    const premiumActual = currentRow?.premiumActual ?? 0;
                    const premiumTarget = currentRow?.premiumTarget ?? null;
                    const premiumDelta = currentRow?.premiumDelta ?? null;
                    const premiumExpected = hasValidRange ? expectedToDate(premiumTarget ?? null, rangeStart, rangeEnd) : null;
                    const premiumPace =
                      premiumExpected != null && premiumExpected > 0
                        ? Number.isFinite(currentRow?.pacePremium ?? NaN)
                          ? currentRow?.pacePremium
                          : pace(premiumActual, premiumExpected)
                        : null;
                    const premiumActualDelta = hasCompare
                      ? moneyDelta(premiumActual, compareRow?.premiumActual ?? 0)
                      : "—";
                    const premiumTargetDelta = hasCompare
                      ? moneyDelta(premiumTarget, compareRow?.premiumTarget ?? null)
                      : "—";
                    return (
                      <tr key={rowKey} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: 8 }}>
                          <a
                            href={
                              breakdownMode === "BUCKET"
                                ? `/sold-products?premiumCategory=${encodeURIComponent(rowKey)}&dateFrom=${startISO}&dateTo=${endISO}&statuses=${encodeURIComponent(drilldownStatuses.join(","))}`
                                : `/sold-products?lob=${encodeURIComponent(rowKey)}&dateFrom=${startISO}&dateTo=${endISO}&statuses=${encodeURIComponent(drilldownStatuses.join(","))}`
                            }
                            style={{ color: "#111827", textDecoration: "none", fontWeight: 700 }}
                          >
                            {rowKey}
                          </a>
                          {rowCategory ? <div style={{ color: "#6b7280", fontSize: 12 }}>{rowCategory}</div> : null}
                        </td>
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>{fmtInt(appsActual)}</td>
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtMoney(premiumActual)}
                        </td>
                        {hasCompare ? (
                          <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                            {premiumActualDelta}
                          </td>
                        ) : null}
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtMoney(premiumTarget)}
                        </td>
                        {hasCompare ? (
                          <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                            {premiumTargetDelta}
                          </td>
                        ) : null}
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtMoney(premiumDelta)}
                        </td>
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>{fmtPct(premiumPace)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {showPeopleBenchmarks ? (
        !hasPeopleRows ? (
          <div className="surface" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>No people with expectations</div>
            <div style={{ color: "#6b7280", marginBottom: 8 }}>
              Set role defaults or person overrides to include people in Benchmarks.
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="/people?tab=roles" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                Go to Role Defaults
              </a>
              <a href="/people?tab=people" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                Go to People
              </a>
            </div>
          </div>
        ) : (
          <div className="surface" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>People</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: 8 }}>Person</th>
                    <th style={{ padding: 8 }}>Role</th>
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Apps Actual</th>
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Prorated Apps Target</th>
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Premium Actual</th>
                    {hasCompare ? (
                      <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Δ Premium Actual</th>
                    ) : null}
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Prorated Premium Target</th>
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Delta</th>
                    <th style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>Pace (to-date)</th>
                    <th style={{ padding: 8 }}>Expectation Source</th>
                    {!readOnly ? <th style={{ padding: 8 }}>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {peopleRows.map((entry) => {
                    const currentRow = entry.current;
                    const compareRow = entry.compare;
                    const personId = entry.personId;
                    const displayName = currentRow?.name ?? compareRow?.name ?? "—";
                    const roleName = currentRow?.roleName ?? compareRow?.roleName ?? "—";
                    const appsActual = currentRow?.appsActual ?? 0;
                    const appsTarget = currentRow?.appsTarget;
                    const premiumActual = currentRow?.premiumActual ?? 0;
                    const premiumTarget = currentRow?.premiumTarget;
                    const premiumExpected = hasValidRange ? expectedToDate(premiumTarget ?? null, rangeStart, rangeEnd) : null;
                    const premiumPace =
                      premiumExpected != null && premiumExpected > 0
                        ? Number.isFinite(currentRow?.pacePremium ?? NaN)
                          ? currentRow?.pacePremium
                          : pace(premiumActual, premiumExpected)
                        : null;
                    const premiumActualDelta = hasCompare ? moneyDelta(premiumActual, compareRow?.premiumActual ?? 0) : "—";
                    const expectationSource = currentRow?.expectationSource;
                    const expectationLabel = expectationSource
                      ? expectationSource === "override"
                        ? "Override"
                        : "Role default"
                      : "—";
                    return (
                      <tr key={personId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: 8 }}>
                          <a
                            href={`/sold-products?soldByPersonId=${encodeURIComponent(personId)}&dateFrom=${startISO}&dateTo=${endISO}&statuses=${encodeURIComponent(drilldownStatuses.join(","))}`}
                            style={{ color: "#111827", textDecoration: "none" }}
                          >
                            {displayName}
                          </a>
                        </td>
                        <td style={{ padding: 8 }}>{roleName}</td>
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>{fmtInt(appsActual)}</td>
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>{fmtInt(appsTarget)}</td>
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtMoney(premiumActual)}
                        </td>
                        {hasCompare ? (
                          <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                            {premiumActualDelta}
                          </td>
                        ) : null}
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtMoney(premiumTarget)}
                        </td>
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtMoney(currentRow?.premiumDelta)}
                        </td>
                        <td style={{ padding: 8, textAlign: "right", whiteSpace: "nowrap" }}>{fmtPct(premiumPace)}</td>
                        <td style={{ padding: 8 }}>{expectationLabel}</td>
                        {!readOnly ? (
                          <td style={{ padding: 8 }}>
                            {currentRow ? (
                              <a
                                href={`/people?tab=people&personId=${encodeURIComponent(personId)}`}
                                style={{ color: "#2563eb", textDecoration: "none" }}
                              >
                                Edit
                              </a>
                            ) : (
                              <span style={{ color: "#6b7280" }}>—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="surface" style={{ padding: 12, color: "#6b7280" }}>
          Manager-only: You don't have access to view individual benchmarks.
        </div>
      )}
    </>
  );
}

type BenchmarksPageClientProps = {
  canViewPeopleBenchmarks: boolean;
};

function BenchmarksPageClientInner({ canViewPeopleBenchmarks }: BenchmarksPageClientProps) {
  const { start, end, statuses, setRange, setStatuses, allStatuses } = useBenchmarksFilters();
  const router = useRouter();
  const [data, setData] = useState<ReportResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"benchmarks" | "explorer" | "businessPlan">("benchmarks");
  const [businessPlanYear, setBusinessPlanYear] = useState(() => new Date().getFullYear());
  const [businessPlanAsOf, setBusinessPlanAsOf] = useState(() => toISODate(new Date()));
  const [businessPlanData, setBusinessPlanData] = useState<ReportResponse | null>(null);
  const [businessPlanLoading, setBusinessPlanLoading] = useState(false);
  const [businessPlanError, setBusinessPlanError] = useState<string | null>(null);
  const [explorerPeopleIds, setExplorerPeopleIds] = useState<string[]>([]);
  const [explorerLobIds, setExplorerLobIds] = useState<string[]>([]);
  const [explorerShowTargets, setExplorerShowTargets] = useState(true);
  const explorerParamsReady = useRef(false);
  const [explorerData, setExplorerData] = useState<ReportResponse | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotTitle, setSnapshotTitle] = useState("");
  const [compareSnapshotId, setCompareSnapshotId] = useState("");
  const [compareSnapshot, setCompareSnapshot] = useState<SnapshotResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareOptions, setCompareOptions] = useState<SnapshotListItem[]>([]);
  const [compareInitialized, setCompareInitialized] = useState(false);
  const startISO = useMemo(() => toISODate(start), [start]);
  const endISO = useMemo(() => toISODate(end), [end]);
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const businessPlanYears = useMemo(() => {
    const years: number[] = [];
    for (let year = currentYear - 2; year <= currentYear + 2; year++) {
      years.push(year);
    }
    return years;
  }, [currentYear]);
  const businessPlanYearStart = useMemo(() => new Date(businessPlanYear, 0, 1), [businessPlanYear]);
  const businessPlanYearEnd = useMemo(() => new Date(businessPlanYear, 11, 31), [businessPlanYear]);
  const businessPlanYearStartISO = useMemo(() => toISODate(businessPlanYearStart), [businessPlanYearStart]);
  const businessPlanYearEndISO = useMemo(() => toISODate(businessPlanYearEnd), [businessPlanYearEnd]);
  const businessPlanAsOfDate = useMemo(() => {
    const parsed = parseISODate(businessPlanAsOf);
    const base = parsed ?? businessPlanYearEnd;
    return clampDateToYear(base, businessPlanYear);
  }, [businessPlanAsOf, businessPlanYear, businessPlanYearEnd]);
  const businessPlanAsOfISO = useMemo(() => toISODate(businessPlanAsOfDate), [businessPlanAsOfDate]);
  const businessPlanElapsedDays = daysInclusive(businessPlanYearStart, businessPlanAsOfDate);
  const businessPlanTotalDays = daysInclusive(businessPlanYearStart, businessPlanYearEnd);
  const exportUrl = useMemo(
    () =>
      `/api/reports/benchmarks/export?start=${startISO}&end=${endISO}&statuses=${encodeURIComponent(
        statuses.join(",")
      )}`,
    [startISO, endISO, statuses]
  );
  const statusesParam = useMemo(() => encodeURIComponent(statuses.join(",")), [statuses]);

  useEffect(() => {
    const parsed = parseISODate(businessPlanAsOf);
    const base = parsed ?? new Date();
    const clamped = clampDateToYear(base, businessPlanYear);
    const nextISO = toISODate(clamped);
    if (nextISO !== businessPlanAsOf) setBusinessPlanAsOf(nextISO);
  }, [businessPlanAsOf, businessPlanYear]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get("compareSnapshotId") ?? "";
    const storedId = window.localStorage.getItem("benchmarks.compareSnapshotId") ?? "";
    const initialId = urlId || storedId || "";
    if (initialId) setCompareSnapshotId(initialId);
    setCompareInitialized(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (explorerParamsReady.current) return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "explorer") {
      setActiveTab("explorer");
    } else if (tab === "businessPlan") {
      setActiveTab("businessPlan");
    }
    const storedPeopleIds = window.localStorage.getItem("ttw:benchmarks:explorer:peopleIds");
    const storedLobIds = window.localStorage.getItem("ttw:benchmarks:explorer:lobIds");
    const storedShowTargets = window.localStorage.getItem("ttw:benchmarks:explorer:showTargets");
    const storedPresetKey = window.localStorage.getItem("ttw:benchmarks:explorer:activePresetKey");
    if (params.has("peopleIds")) {
      setExplorerPeopleIds(parseCsvParam(params.get("peopleIds")));
    } else if (storedPeopleIds) {
      setExplorerPeopleIds(parseCsvParam(storedPeopleIds));
    }
    if (params.has("lobIds")) {
      setExplorerLobIds(parseCsvParam(params.get("lobIds")));
    } else if (storedLobIds) {
      setExplorerLobIds(parseCsvParam(storedLobIds));
    }
    if (params.has("showTargets")) {
      setExplorerShowTargets(params.get("showTargets") !== "0");
    } else if (storedShowTargets != null) {
      setExplorerShowTargets(storedShowTargets !== "0");
    }
    if (storedPresetKey && ["thisMonth", "lastMonth", "ytd", "last30"].includes(storedPresetKey)) {
      setActivePresetKey(storedPresetKey as "thisMonth" | "lastMonth" | "ytd" | "last30");
    }
    explorerParamsReady.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get("compareSnapshotId") ?? "";
      setCompareSnapshotId((prev) => (prev === urlId ? prev : urlId));
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!explorerParamsReady.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (activeTab === "explorer") {
      params.set("tab", "explorer");
    } else if (activeTab === "businessPlan") {
      params.set("tab", "businessPlan");
    } else {
      params.delete("tab");
    }
    if (explorerPeopleIds.length) {
      params.set("peopleIds", explorerPeopleIds.join(","));
    } else {
      params.delete("peopleIds");
    }
    if (explorerLobIds.length) {
      params.set("lobIds", explorerLobIds.join(","));
    } else {
      params.delete("lobIds");
    }
    params.set("showTargets", explorerShowTargets ? "1" : "0");
    const next = `?${params.toString()}`;
    const current = window.location.search || "";
    if (current !== next) {
      window.history.replaceState({}, "", next);
    }
  }, [activeTab, explorerPeopleIds, explorerLobIds, explorerShowTargets]);

  useEffect(() => {
    if (!explorerParamsReady.current || typeof window === "undefined") return;
    window.localStorage.setItem("ttw:benchmarks:explorer:peopleIds", explorerPeopleIds.join(","));
    window.localStorage.setItem("ttw:benchmarks:explorer:lobIds", explorerLobIds.join(","));
    window.localStorage.setItem("ttw:benchmarks:explorer:showTargets", explorerShowTargets ? "1" : "0");
    if (activePresetKey) {
      window.localStorage.setItem("ttw:benchmarks:explorer:activePresetKey", activePresetKey);
    } else {
      window.localStorage.removeItem("ttw:benchmarks:explorer:activePresetKey");
    }
  }, [activePresetKey, explorerPeopleIds, explorerLobIds, explorerShowTargets]);

  useEffect(() => {
    if (!compareInitialized || typeof window === "undefined") return;
    window.localStorage.setItem("benchmarks.compareSnapshotId", compareSnapshotId);
    const url = new URL(window.location.href);
    const currentId = url.searchParams.get("compareSnapshotId") ?? "";
    if (compareSnapshotId) {
      if (currentId !== compareSnapshotId) {
        url.searchParams.set("compareSnapshotId", compareSnapshotId);
        router.replace(`${url.pathname}${url.search}${url.hash}`);
      }
    } else if (currentId) {
      url.searchParams.delete("compareSnapshotId");
      router.replace(`${url.pathname}${url.search}${url.hash}`);
    }
  }, [compareSnapshotId, compareInitialized, router]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/reports/benchmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dateFrom: startISO,
            dateTo: endISO,
            statuses,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load");
        }
        const json = (await res.json()) as ReportResponse;
        setData(json);
      } catch (err: any) {
        setError(err?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [startISO, endISO, statuses]);

  useEffect(() => {
    if (activeTab !== "businessPlan") return;
    async function loadBusinessPlan() {
      setBusinessPlanLoading(true);
      setBusinessPlanError(null);
      try {
        const res = await fetch("/api/reports/benchmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dateFrom: businessPlanYearStartISO,
            dateTo: businessPlanAsOfISO,
            statuses,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load");
        }
        const json = (await res.json()) as ReportResponse;
        setBusinessPlanData(json);
      } catch (err: any) {
        setBusinessPlanError(err?.message || "Failed to load");
        setBusinessPlanData(null);
      } finally {
        setBusinessPlanLoading(false);
      }
    }
    loadBusinessPlan();
  }, [activeTab, businessPlanYearStartISO, businessPlanAsOfISO, statuses]);

  useEffect(() => {
    if (activeTab !== "explorer") return;
    async function loadExplorer() {
      setExplorerLoading(true);
      setExplorerError(null);
      try {
        const payload: Record<string, any> = {
          dateFrom: startISO,
          dateTo: endISO,
          statuses,
        };
        if (explorerPeopleIds.length) payload.peopleIds = explorerPeopleIds;
        if (explorerLobIds.length) payload.lobIds = explorerLobIds;
        const res = await fetch("/api/reports/benchmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load");
        }
        const json = (await res.json()) as ReportResponse;
        setExplorerData(json);
      } catch (err: any) {
        setExplorerError(err?.message || "Failed to load");
      } finally {
        setExplorerLoading(false);
      }
    }
    loadExplorer();
  }, [activeTab, startISO, endISO, statuses, explorerPeopleIds, explorerLobIds]);

  useEffect(() => {
    let cancelled = false;
    async function loadSnapshots() {
      try {
        const res = await fetch("/api/reports/snapshots?type=benchmarks");
        if (!res.ok) return;
        const json = (await res.json()) as SnapshotListItem[];
        if (!cancelled) setCompareOptions(json);
      } catch {
        if (!cancelled) setCompareOptions([]);
      }
    }
    loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!compareSnapshotId) {
      setCompareSnapshot(null);
      setCompareLoading(false);
      return;
    }
    let cancelled = false;
    async function loadCompareSnapshot() {
      setCompareLoading(true);
      setCompareError(null);
      try {
        const res = await fetch(`/api/reports/snapshots/${encodeURIComponent(compareSnapshotId)}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load compare snapshot");
        }
        const json = (await res.json()) as SnapshotResponse;
        if (json.reportType !== "benchmarks") {
          if (!cancelled) {
            setCompareSnapshot(null);
            setCompareSnapshotId("");
            setCompareError("Selected snapshot is not a benchmarks snapshot.");
          }
          return;
        }
        if (!cancelled) setCompareSnapshot(json);
      } catch (err: any) {
        if (!cancelled) {
          setCompareSnapshot(null);
          setCompareError(err?.message || "Failed to load compare snapshot");
        }
      } finally {
        if (!cancelled) setCompareLoading(false);
      }
    }
    loadCompareSnapshot();
    return () => {
      cancelled = true;
    };
  }, [compareSnapshotId]);

  const [activePresetKey, setActivePresetKey] = useState<
    "thisMonth" | "lastMonth" | "ytd" | "last30" | null
  >(null);

  const applyPreset = (preset: "thisMonth" | "lastMonth" | "ytd" | "last30") => {
    const base = new Date();
    let s = base;
    let e = base;
    if (preset === "thisMonth") {
      s = new Date(base.getFullYear(), base.getMonth(), 1);
      e = base;
    } else if (preset === "lastMonth") {
      s = new Date(base.getFullYear(), base.getMonth() - 1, 1);
      e = new Date(base.getFullYear(), base.getMonth(), 0);
    } else if (preset === "ytd") {
      s = new Date(base.getFullYear(), 0, 1);
      e = base;
    } else if (preset === "last30") {
      s = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 29);
      e = base;
    }
    setActivePresetKey(preset);
    setRange({ start: s, end: e });
  };

  useEffect(() => {
    const base = new Date();
    const presets = [
      { key: "thisMonth", start: new Date(base.getFullYear(), base.getMonth(), 1), end: base },
      { key: "lastMonth", start: new Date(base.getFullYear(), base.getMonth() - 1, 1), end: new Date(base.getFullYear(), base.getMonth(), 0) },
      { key: "ytd", start: new Date(base.getFullYear(), 0, 1), end: base },
      { key: "last30", start: new Date(base.getFullYear(), base.getMonth(), base.getDate() - 29), end: base },
    ];
    let nextKey: "thisMonth" | "lastMonth" | "ytd" | "last30" | null = null;
    for (const preset of presets) {
      if (startISO === toISODate(preset.start) && endISO === toISODate(preset.end)) {
        nextKey = preset.key;
        break;
      }
    }
    setActivePresetKey(nextKey);
  }, [startISO, endISO]);

  function toggleStatus(status: string) {
    const has = statuses.includes(status);
    const next = has ? statuses.filter((s) => s !== status) : [...statuses, status];
    setStatuses(next.length ? next : [...allStatuses]);
  }

  async function saveSnapshot() {
    if (snapshotSaving) return;
    setSnapshotSaving(true);
    setSnapshotError(null);
    try {
      const res = await fetch("/api/reports/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: "benchmarks",
          start: startISO,
          end: endISO,
          statuses,
          title: snapshotTitle,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Snapshot save failed");
      }
      const json = (await res.json()) as { id?: string };
      if (!json?.id) throw new Error("Snapshot save failed");
      setSnapshotTitle("");
      router.push(`/reports/benchmarks/snapshot/${json.id}`);
    } catch (err: any) {
      setSnapshotError(err?.message || "Snapshot save failed");
    } finally {
      setSnapshotSaving(false);
    }
  }

  const compareSnapshotTitle = compareSnapshot
    ? (compareSnapshot.title?.trim() || `Benchmarks: ${compareSnapshot.startISO} to ${compareSnapshot.endISO}`)
    : "";
  const rangeMismatch = Boolean(
    compareSnapshot && (compareSnapshot.startISO !== startISO || compareSnapshot.endISO !== endISO)
  );
  const statusesMismatch = Boolean(
    compareSnapshot &&
      (() => {
        const currentSet = new Set(statuses);
        const snapshotSet = new Set(compareSnapshot.statuses ?? []);
        if (currentSet.size !== snapshotSet.size) return true;
        for (const status of currentSet) {
          if (!snapshotSet.has(status)) return true;
        }
        return false;
      })()
  );
  const mismatchLabels =
    rangeMismatch || statusesMismatch
      ? [rangeMismatch ? "Date range" : null, statusesMismatch ? "Statuses" : null].filter(Boolean)
      : [];
  const formatValue = (value: number | null | undefined, formatter: (n: number | null | undefined) => string) => {
    if (value == null || Number.isNaN(value)) return "—";
    return formatter(value);
  };
  const currentOffice = data?.office;
  const snapshotOffice = compareSnapshot?.payload?.office;
  const showAppsTarget = currentOffice?.appsTarget != null || snapshotOffice?.appsTarget != null;
  const showPremiumTarget = currentOffice?.premiumTarget != null || snapshotOffice?.premiumTarget != null;
  const showAppsPace = currentOffice?.pace?.appsPace != null || snapshotOffice?.pace?.appsPace != null;
  const showPremiumPace = currentOffice?.pace?.premiumPace != null || snapshotOffice?.pace?.premiumPace != null;
  const compareOfficeRows = compareSnapshot
    ? [
        {
          label: "Apps Actual",
          current: formatValue(currentOffice?.appsActual, fmtInt),
          snapshot: formatValue(snapshotOffice?.appsActual, fmtInt),
          delta: formatDelta(numDelta(currentOffice?.appsActual, snapshotOffice?.appsActual), fmtInt),
        },
        {
          label: "Premium Actual",
          current: formatValue(currentOffice?.premiumActual, fmtMoney),
          snapshot: formatValue(snapshotOffice?.premiumActual, fmtMoney),
          delta: moneyDelta(currentOffice?.premiumActual, snapshotOffice?.premiumActual),
        },
        ...(showAppsTarget
          ? [
              {
                label: "Apps Target",
                current: formatValue(currentOffice?.appsTarget, fmtInt),
                snapshot: formatValue(snapshotOffice?.appsTarget, fmtInt),
                delta: formatDelta(numDelta(currentOffice?.appsTarget, snapshotOffice?.appsTarget), fmtInt),
              },
            ]
          : []),
        ...(showPremiumTarget
          ? [
              {
                label: "Premium Target",
                current: formatValue(currentOffice?.premiumTarget, fmtMoney),
                snapshot: formatValue(snapshotOffice?.premiumTarget, fmtMoney),
                delta: moneyDelta(currentOffice?.premiumTarget, snapshotOffice?.premiumTarget),
              },
            ]
          : []),
        ...(showAppsPace
          ? [
              {
                label: "Apps Pace",
                current: formatValue(currentOffice?.pace?.appsPace, fmtPct),
                snapshot: formatValue(snapshotOffice?.pace?.appsPace, fmtPct),
                delta: pctDelta(currentOffice?.pace?.appsPace, snapshotOffice?.pace?.appsPace),
              },
            ]
          : []),
        ...(showPremiumPace
          ? [
              {
                label: "Premium Pace",
                current: formatValue(currentOffice?.pace?.premiumPace, fmtPct),
                snapshot: formatValue(snapshotOffice?.pace?.premiumPace, fmtPct),
                delta: pctDelta(currentOffice?.pace?.premiumPace, snapshotOffice?.pace?.premiumPace),
              },
            ]
          : []),
      ]
    : [];

  const explorerPayload = explorerData;
  const explorerPeople = explorerPayload?.people ?? [];
  const explorerLobActuals = explorerPayload?.lobActuals ?? [];
  const explorerBucketActuals = explorerPayload?.bucketActuals ?? [];
  const businessPlanPayload = businessPlanData;
  const businessPlanLobs = businessPlanPayload?.lobs ?? [];
  const businessPlanLobActuals = businessPlanPayload?.lobActuals ?? [];
  const businessPlanBucketActuals = businessPlanPayload?.bucketActuals ?? [];
  const businessPlanAppsByLob = businessPlanPayload?.officePlanAppsByLob ?? null;
  const businessPlanPremiumByBucket = businessPlanPayload?.officePlanPremiumByBucket ?? null;
  const businessPlanPlanYear = businessPlanPayload?.officePlanYear ?? null;

  const explorerSelectedPeople = useMemo(() => {
    if (!explorerPeopleIds.length) return explorerPeople;
    const selected = new Set(explorerPeopleIds);
    return explorerPeople.filter((person) => selected.has(person.personId));
  }, [explorerPeople, explorerPeopleIds]);

  const peopleOptions = useMemo(() => {
    const base = data?.people?.length ? data.people : explorerPeople;
    const seen = new Set<string>();
    const options = base
      .map((person) => ({ id: person.personId, name: person.name }))
      .filter((person) => {
        if (seen.has(person.id)) return false;
        seen.add(person.id);
        return true;
      });
    options.sort((a, b) => a.name.localeCompare(b.name));
    return options;
  }, [data?.people, explorerPeople]);

  const lobOptions = useMemo(() => {
    const base = data?.lobs?.length ? data.lobs : explorerPayload?.lobs ?? [];
    const seen = new Set<string>();
    const options = base.filter((lob) => {
      if (seen.has(lob.id)) return false;
      seen.add(lob.id);
      return true;
    });
    options.sort((a, b) => a.name.localeCompare(b.name));
    return options;
  }, [data?.lobs, explorerPayload?.lobs]);

  const peopleNameById = useMemo(() => {
    const map = new Map<string, string>();
    peopleOptions.forEach((person) => {
      map.set(person.id, person.name);
    });
    return map;
  }, [peopleOptions]);

  const lobById = useMemo(() => {
    const map = new Map<string, LobOption>();
    lobOptions.forEach((lob) => {
      map.set(lob.id, lob);
    });
    return map;
  }, [lobOptions]);

  const businessPlanLobRows = useMemo(() => {
    const metaById = new Map<string, LobOption>();
    businessPlanLobs.forEach((lob) => {
      metaById.set(lob.id, lob);
    });
    const actualMap = new Map<string, LobActualRow>();
    businessPlanLobActuals.forEach((row) => {
      actualMap.set(row.lobId, row);
    });
    const totalDaysInYear = daysInclusive(businessPlanYearStart, businessPlanYearEnd);
    const elapsedDays = daysInclusive(businessPlanYearStart, businessPlanAsOfDate);
    const ids = new Set<string>();
    if (businessPlanAppsByLob) {
      Object.keys(businessPlanAppsByLob).forEach((lobId) => ids.add(lobId));
    }
    actualMap.forEach((_value, key) => ids.add(key));
    const rows = Array.from(ids).map((lobId) => {
      const actual = actualMap.get(lobId);
      const meta = metaById.get(lobId);
      const targetRaw = businessPlanAppsByLob ? businessPlanAppsByLob[lobId] : null;
      const target = Number.isFinite(targetRaw as number) ? Number(targetRaw) : null;
      const appsActual = actual?.appsActual ?? 0;
      const expected =
        target != null && totalDaysInYear > 0 ? target * (elapsedDays / totalDaysInYear) : null;
      const toGoal = target && target > 0 ? appsActual / target : null;
      const onTrack = expected && expected > 0 ? appsActual / expected : null;
      return {
        lobId,
        name: meta?.name || actual?.name || lobId,
        category: meta?.premiumCategory ?? actual?.category ?? null,
        appsActual,
        target,
        toGoal,
        onTrack,
      };
    });
    const filtered = rows.filter((row) => (row.target ?? 0) > 0 || row.appsActual > 0);
    filtered.sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }, [
    businessPlanLobs,
    businessPlanLobActuals,
    businessPlanAppsByLob,
    businessPlanYearStart,
    businessPlanYearEnd,
    businessPlanAsOfDate,
  ]);

  const businessPlanBucketRows = useMemo(() => {
    const actualMap = new Map<string, BucketActualRow>();
    businessPlanBucketActuals.forEach((row) => {
      actualMap.set(row.bucket, row);
    });
    const totalDaysInYear = daysInclusive(businessPlanYearStart, businessPlanYearEnd);
    const elapsedDays = daysInclusive(businessPlanYearStart, businessPlanAsOfDate);
    const rows = ["PC", "FS", "IPS"].map((bucket) => {
      const actual = actualMap.get(bucket);
      const targetRaw = businessPlanPremiumByBucket ? businessPlanPremiumByBucket[bucket as keyof typeof businessPlanPremiumByBucket] : null;
      const target = Number.isFinite(targetRaw as number) ? Number(targetRaw) : null;
      const premiumActual = actual?.premiumActual ?? 0;
      const expected =
        target != null && totalDaysInYear > 0 ? target * (elapsedDays / totalDaysInYear) : null;
      const toGoal = target && target > 0 ? premiumActual / target : null;
      const onTrack = expected && expected > 0 ? premiumActual / expected : null;
      return { bucket, premiumActual, target, toGoal, onTrack };
    });
    return rows.filter((row) => (row.target ?? 0) > 0 || row.premiumActual > 0);
  }, [
    businessPlanBucketActuals,
    businessPlanPremiumByBucket,
    businessPlanYearStart,
    businessPlanYearEnd,
    businessPlanAsOfDate,
  ]);

  const businessPlanAppsTotals = useMemo(() => {
    const actual = businessPlanLobRows.reduce((sum, row) => sum + (Number.isFinite(row.appsActual) ? row.appsActual : 0), 0);
    const target = businessPlanLobRows.reduce(
      (sum, row) => sum + (Number.isFinite(row.target ?? NaN) ? (row.target ?? 0) : 0),
      0
    );
    const totalDaysInYear = daysInclusive(businessPlanYearStart, businessPlanYearEnd);
    const elapsedDays = daysInclusive(businessPlanYearStart, businessPlanAsOfDate);
    const expected = target != null && totalDaysInYear > 0 ? target * (elapsedDays / totalDaysInYear) : null;
    return {
      actual,
      target,
      toGoal: target && target > 0 ? actual / target : null,
      onTrack: expected && expected > 0 ? actual / expected : null,
    };
  }, [businessPlanLobRows, businessPlanYearStart, businessPlanYearEnd, businessPlanAsOfDate]);

  const businessPlanPremiumTotals = useMemo(() => {
    const actual = businessPlanBucketRows.reduce(
      (sum, row) => sum + (Number.isFinite(row.premiumActual) ? row.premiumActual : 0),
      0
    );
    const target = businessPlanBucketRows.reduce(
      (sum, row) => sum + (Number.isFinite(row.target ?? NaN) ? (row.target ?? 0) : 0),
      0
    );
    const totalDaysInYear = daysInclusive(businessPlanYearStart, businessPlanYearEnd);
    const elapsedDays = daysInclusive(businessPlanYearStart, businessPlanAsOfDate);
    const expected = target != null && totalDaysInYear > 0 ? target * (elapsedDays / totalDaysInYear) : null;
    return {
      actual,
      target,
      toGoal: target && target > 0 ? actual / target : null,
      onTrack: expected && expected > 0 ? actual / expected : null,
    };
  }, [businessPlanBucketRows, businessPlanYearStart, businessPlanYearEnd, businessPlanAsOfDate]);

  const explorerBucketTargets = useMemo(() => {
    return explorerSelectedPeople.reduce(
      (acc, person) => {
        acc.PC += person.premiumTargetsByBucket?.PC ?? 0;
        acc.FS += person.premiumTargetsByBucket?.FS ?? 0;
        acc.IPS += person.premiumTargetsByBucket?.IPS ?? 0;
        return acc;
      },
      { PC: 0, FS: 0, IPS: 0 }
    );
  }, [explorerSelectedPeople]);

  const explorerAppsTargetsByLob = useMemo(() => {
    const selected = explorerLobIds.length ? new Set(explorerLobIds) : null;
    const totals = new Map<string, number>();
    explorerSelectedPeople.forEach((person) => {
      Object.entries(person.appsTargetsByLob || {}).forEach(([lobId, value]) => {
        if (selected && !selected.has(lobId)) return;
        const current = totals.get(lobId) ?? 0;
        totals.set(lobId, current + (Number.isFinite(value) ? value : 0));
      });
    });
    return totals;
  }, [explorerSelectedPeople, explorerLobIds]);

  const explorerLobRows = useMemo(() => {
    const actualMap = new Map<string, LobActualRow>();
    explorerLobActuals.forEach((row) => {
      actualMap.set(row.lobId, row);
    });
    const ids = explorerLobIds.length ? explorerLobIds : Array.from(actualMap.keys());
    const rows = ids.map((lobId) => {
      const actual = actualMap.get(lobId);
      const meta = lobById.get(lobId);
      return {
        lobId,
        name: meta?.name || actual?.name || lobId,
        category: actual?.category ?? meta?.premiumCategory ?? null,
        appsActual: actual?.appsActual ?? 0,
        premiumActual: actual?.premiumActual ?? 0,
      };
    });
    rows.sort((a, b) => {
      if (explorerShowTargets) {
        const targetA = explorerAppsTargetsByLob.get(a.lobId) ?? 0;
        const targetB = explorerAppsTargetsByLob.get(b.lobId) ?? 0;
        const deltaA = (Number.isFinite(a.appsActual) ? a.appsActual : 0) - targetA;
        const deltaB = (Number.isFinite(b.appsActual) ? b.appsActual : 0) - targetB;
        if (deltaA !== deltaB) return deltaA - deltaB;
      } else {
        const actualA = Number.isFinite(a.appsActual) ? a.appsActual : 0;
        const actualB = Number.isFinite(b.appsActual) ? b.appsActual : 0;
        if (actualA !== actualB) return actualB - actualA;
      }
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [explorerAppsTargetsByLob, explorerLobActuals, explorerLobIds, explorerShowTargets, lobById]);

  const explorerBucketRows = useMemo(() => {
    const actualMap = new Map<string, BucketActualRow>();
    explorerBucketActuals.forEach((row) => {
      actualMap.set(row.bucket, row);
    });
    const rows = ["PC", "FS", "IPS"].map((bucket) => {
      const actual = actualMap.get(bucket);
      return {
        bucket,
        appsActual: actual?.appsActual ?? 0,
        premiumActual: actual?.premiumActual ?? 0,
      };
    });
    rows.sort((a, b) => {
      if (explorerShowTargets) {
        const targetA = explorerBucketTargets[a.bucket as keyof typeof explorerBucketTargets] ?? 0;
        const targetB = explorerBucketTargets[b.bucket as keyof typeof explorerBucketTargets] ?? 0;
        const deltaA = (Number.isFinite(a.premiumActual) ? a.premiumActual : 0) - targetA;
        const deltaB = (Number.isFinite(b.premiumActual) ? b.premiumActual : 0) - targetB;
        if (deltaA !== deltaB) return deltaA - deltaB;
      } else {
        const actualA = Number.isFinite(a.premiumActual) ? a.premiumActual : 0;
        const actualB = Number.isFinite(b.premiumActual) ? b.premiumActual : 0;
        if (actualA !== actualB) return actualB - actualA;
      }
      return a.bucket.localeCompare(b.bucket);
    });
    return rows;
  }, [explorerBucketActuals, explorerBucketTargets, explorerShowTargets]);

  const explorerAppsTotals = useMemo(() => {
    const actual = explorerLobRows.reduce(
      (sum, row) => sum + (Number.isFinite(row.appsActual) ? row.appsActual : 0),
      0
    );
    const target = explorerLobRows.reduce((sum, row) => sum + (explorerAppsTargetsByLob.get(row.lobId) ?? 0), 0);
    return { actual, target, delta: actual - target };
  }, [explorerAppsTargetsByLob, explorerLobRows]);

  const explorerPremiumTotals = useMemo(() => {
    const actual = explorerBucketRows.reduce(
      (sum, row) => sum + (Number.isFinite(row.premiumActual) ? row.premiumActual : 0),
      0
    );
    const target = explorerBucketRows.reduce(
      (sum, row) => sum + (explorerBucketTargets[row.bucket as keyof typeof explorerBucketTargets] ?? 0),
      0
    );
    return { actual, target, delta: actual - target };
  }, [explorerBucketRows, explorerBucketTargets]);

  const explorerPeopleRows = useMemo(() => {
    const rows = [...explorerSelectedPeople];
    rows.sort((a, b) => {
      if (explorerShowTargets) {
        const targetA = Number.isFinite(a.premiumTarget) ? a.premiumTarget : 0;
        const targetB = Number.isFinite(b.premiumTarget) ? b.premiumTarget : 0;
        const deltaA = (Number.isFinite(a.premiumActual) ? a.premiumActual : 0) - targetA;
        const deltaB = (Number.isFinite(b.premiumActual) ? b.premiumActual : 0) - targetB;
        if (deltaA !== deltaB) return deltaA - deltaB;
      } else {
        const actualA = Number.isFinite(a.premiumActual) ? a.premiumActual : 0;
        const actualB = Number.isFinite(b.premiumActual) ? b.premiumActual : 0;
        if (actualA !== actualB) return actualB - actualA;
      }
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [explorerSelectedPeople, explorerShowTargets]);

  const explorerPeopleTotals = useMemo(() => {
    return explorerPeopleRows.reduce(
      (acc, person) => {
        acc.appsActual += Number.isFinite(person.appsActual) ? person.appsActual : 0;
        acc.appsTarget += Number.isFinite(person.appsTarget) ? person.appsTarget : 0;
        acc.premiumActual += Number.isFinite(person.premiumActual) ? person.premiumActual : 0;
        acc.premiumTarget += Number.isFinite(person.premiumTarget) ? person.premiumTarget : 0;
        return acc;
      },
      { appsActual: 0, appsTarget: 0, premiumActual: 0, premiumTarget: 0 }
    );
  }, [explorerPeopleRows]);

  const explorerBucketsEmpty = useMemo(
    () => explorerBucketRows.every((row) => row.appsActual === 0 && row.premiumActual === 0),
    [explorerBucketRows]
  );

  const showExplorerEmptyState =
    !explorerLoading &&
    !explorerError &&
    (!explorerPayload ||
      (explorerLobRows.length === 0 && explorerPeopleRows.length === 0 && explorerBucketsEmpty));

  const explorerPersonParam = useMemo(() => {
    if (explorerPeopleIds.length === 1) {
      return `&soldByPersonId=${encodeURIComponent(explorerPeopleIds[0])}`;
    }
    return "";
  }, [explorerPeopleIds]);

  const isExplorer = activeTab === "explorer";
  const isBusinessPlan = activeTab === "businessPlan";
  const isBenchmarks = activeTab === "benchmarks";

  const renderBenchmarksTab = () => (
    <>
      <div className="surface" style={{ padding: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href="/people?tab=office" className="btn" style={{ padding: "8px 12px", textDecoration: "none" }}>
          Edit Office Plan
        </a>
        <a href="/people?tab=roles" className="btn" style={{ padding: "8px 12px", textDecoration: "none" }}>
          Edit Role Defaults
        </a>
        {canViewPeopleBenchmarks ? (
          <a href="/people?tab=people" className="btn" style={{ padding: "8px 12px", textDecoration: "none" }}>
            Edit People
          </a>
        ) : null}
        <button
          type="button"
          className="btn"
          onClick={() => {
            window.location.href = exportUrl;
          }}
          disabled={loading}
          style={{ padding: "8px 12px" }}
        >
          Export CSV
        </button>
        <div style={{ display: "grid", gap: 4, minWidth: 240 }}>
          <label htmlFor="snapshot-title" style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>
            Snapshot title (optional)
          </label>
          <input
            id="snapshot-title"
            type="text"
            value={snapshotTitle}
            onChange={(e) => setSnapshotTitle(e.target.value)}
            placeholder="Benchmarks: YYYY-MM-DD to YYYY-MM-DD"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
        </div>
        <div style={{ display: "grid", gap: 4, minWidth: 260 }}>
          <label htmlFor="compare-snapshot" style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>
            Compare to snapshot
          </label>
          <select
            id="compare-snapshot"
            value={compareSnapshotId}
            onChange={(e) => {
              const nextId = e.target.value;
              setCompareSnapshotId(nextId);
              if (!nextId) setCompareError(null);
            }}
            disabled={compareLoading}
            title={compareSnapshotTitle}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
          >
            <option value="">None</option>
            {compareOptions.map((item) => {
              const rangeLabel = `${item.startISO} → ${item.endISO}`;
              const title = item.title?.trim() || rangeLabel;
              const createdAt = new Date(item.createdAt).toLocaleDateString();
              return (
                <option key={item.id} value={item.id}>
                  {title} · {createdAt}
                </option>
              );
            })}
          </select>
          {compareError ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{compareError}</span> : null}
        </div>
        <button
          type="button"
          className="btn"
          onClick={saveSnapshot}
          disabled={loading || snapshotSaving}
          style={{ padding: "8px 12px" }}
        >
          {snapshotSaving ? "Saving…" : "Save Snapshot"}
        </button>
        {snapshotError ? <span style={{ color: "#b91c1c", fontSize: 12 }}>{snapshotError}</span> : null}
      </div>

      {compareSnapshot ? (
        <div className="surface" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Compared to: {compareSnapshotTitle}</div>
          {mismatchLabels.length ? (
            <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
              Note: Comparing against a snapshot with different filters: {mismatchLabels.map((label) => `[${label}]`).join(" ")}
            </div>
          ) : null}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: 6 }}>Metric</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Current</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Snapshot</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {compareOfficeRows.map((row) => (
                  <tr key={row.label} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: 6 }}>{row.label}</td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{row.current}</td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{row.snapshot}</td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{row.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="surface" style={{ display: "grid", gap: 10, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { key: "thisMonth", label: "This Month" },
            { key: "lastMonth", label: "Last Month" },
            { key: "ytd", label: "YTD" },
            { key: "last30", label: "Last 30 Days" },
          ].map((p) => {
            const active = activePresetKey === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key as any)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: active ? "1px solid #111827" : "1px solid #e5e7eb",
                  background: active ? "#111827" : "#fff",
                  color: active ? "#fff" : "#111827",
                  fontWeight: 700,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gap: 10, alignItems: "start", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Date range</div>
            <DatePicker1
              start={startISO}
              end={endISO}
              onChange={(nextStart, nextEnd) => {
                const parsedStart = parseISODate(nextStart);
                const parsedEnd = parseISODate(nextEnd || nextStart);
                if (!parsedStart || !parsedEnd) return;
                setRange({ start: parsedStart, end: parsedEnd });
              }}
              quickPresets={false}
            />
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Status</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, color: "#111827" }}>
              {allStatuses.map((s) => {
                const checked = statuses.includes(s);
                return (
                  <label key={s} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStatus(s)}
                      style={{ width: 14, height: 14 }}
                    />
                    {s}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div style={{ color: "#6b7280", fontSize: 12, paddingLeft: 4 }}>Targets are prorated to match the selected date range.</div>

      {loading ? <div className="surface" style={{ padding: 12 }}>Loading…</div> : null}
      {error ? <div className="surface" style={{ padding: 12, color: "#b91c1c" }}>{error}</div> : null}
      <BenchmarksReportView
        payload={data}
        startISO={startISO}
        endISO={endISO}
        statuses={statuses}
        comparePayload={compareSnapshot?.payload ?? null}
        readOnly={false}
        canViewPeopleBenchmarks={canViewPeopleBenchmarks}
      />
    </>
  );

  const renderBusinessPlanTab = () => {
    return (
      <>
        <Section title="Summary">
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <div className="surface" style={{ padding: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Apps</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Actual (YTD)</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtInt(businessPlanAppsTotals.actual)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Target (Annual)</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtInt(businessPlanAppsTotals.target)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>% to goal</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtPct(businessPlanAppsTotals.toGoal)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>On-track %</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtPct(businessPlanAppsTotals.onTrack)}</div>
                </div>
              </div>
            </div>
            <div className="surface" style={{ padding: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Premium</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Actual (YTD)</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtMoney(businessPlanPremiumTotals.actual)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Target (Annual)</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtMoney(businessPlanPremiumTotals.target)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>% to goal</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtPct(businessPlanPremiumTotals.toGoal)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>On-track %</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtPct(businessPlanPremiumTotals.onTrack)}</div>
                </div>
              </div>
            </div>
          </div>
        </Section>
        <div className="surface" style={{ padding: 12, display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 12, alignItems: "start", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Year</div>
              <select
                value={businessPlanYear}
                onChange={(e) => setBusinessPlanYear(Number(e.target.value))}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", width: "100%" }}
              >
                {businessPlanYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>As of</div>
              <input
                type="date"
                value={businessPlanAsOf}
                min={businessPlanYearStartISO}
                max={businessPlanYearEndISO}
                onChange={(e) => {
                  const parsed = parseISODate(e.target.value);
                  if (!parsed) return;
                  const clamped = clampDateToYear(parsed, businessPlanYear);
                  setBusinessPlanAsOf(toISODate(clamped));
                }}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", width: "100%" }}
              />
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Status</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, color: "#111827" }}>
                {allStatuses.map((s) => {
                  const checked = statuses.includes(s);
                  return (
                    <label key={s} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStatus(s)}
                        style={{ width: 14, height: 14 }}
                      />
                      {s}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            Targets are annual. On-track compares actuals to expected pace as of the selected date.
          </div>
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            As of {businessPlanAsOfISO} • {businessPlanElapsedDays} of {businessPlanTotalDays} days
          </div>
        </div>

        {businessPlanLoading ? <div className="surface" style={{ padding: 12 }}>Loading…</div> : null}
        {businessPlanError ? <div className="surface" style={{ padding: 12, color: "#b91c1c" }}>{businessPlanError}</div> : null}

        {!businessPlanLoading &&
        !businessPlanError &&
        (businessPlanPlanYear !== businessPlanYear || !businessPlanAppsByLob || !businessPlanPremiumByBucket) ? (
          <EmptyState
            title={`Office Plan targets missing for ${businessPlanYear}`}
            body="Set an Office Plan for this year to view progress vs goal."
            action={
              <a href="/people?tab=office" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                Set Office Plan for {businessPlanYear}
              </a>
            }
          />
        ) : null}

      <Section title="Apps by LoB">
        {businessPlanLobRows.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No activity in this range.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: 6 }}>LoB</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Actual (YTD)</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Target (Annual)</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>% to goal</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>On-track %</th>
                  <th style={{ padding: 6 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {businessPlanLobRows.map((row) => {
                  return (
                    <tr key={row.lobId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 6 }}>
                        <a
                          href={`/sold-products?lobId=${encodeURIComponent(row.lobId)}&lob=${encodeURIComponent(row.name)}&dateFrom=${businessPlanYearStartISO}&dateTo=${businessPlanAsOfISO}&statuses=${statusesParam}`}
                          style={{ color: "#111827", textDecoration: "none", fontWeight: 600 }}
                        >
                          {row.name}
                        </a>
                        {row.category ? <div style={{ color: "#6b7280", fontSize: 12 }}>{row.category}</div> : null}
                      </td>
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmtInt(row.appsActual)}
                      </td>
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{fmtInt(row.target)}</td>
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{fmtPct(row.toGoal)}</td>
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{fmtPct(row.onTrack)}</td>
                      <td style={{ padding: 6 }}>
                        {renderStatusChip(row.onTrack)}
                      </td>
                    </tr>
                  );
                })}
                {businessPlanLobRows.length ? (
                  <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                    <td style={{ padding: 6 }}>Total</td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtInt(businessPlanAppsTotals.actual)}
                    </td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtInt(businessPlanAppsTotals.target)}
                    </td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtPct(businessPlanAppsTotals.toGoal)}
                    </td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtPct(businessPlanAppsTotals.onTrack)}
                    </td>
                    <td style={{ padding: 6 }}>
                      {renderStatusChip(businessPlanAppsTotals.onTrack)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Premium by Bucket">
        {businessPlanBucketRows.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No activity in this range.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: 6 }}>Bucket</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Actual (YTD)</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Target (Annual)</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>% to goal</th>
                  <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>On-track %</th>
                  <th style={{ padding: 6 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {businessPlanBucketRows.map((row) => {
                  return (
                    <tr key={row.bucket} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 6 }}>
                        <a
                          href={`/sold-products?premiumCategory=${encodeURIComponent(row.bucket)}&dateFrom=${businessPlanYearStartISO}&dateTo=${businessPlanAsOfISO}&statuses=${statusesParam}`}
                          style={{ color: "#111827", textDecoration: "none", fontWeight: 600 }}
                        >
                          {row.bucket}
                        </a>
                      </td>
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmtMoney(row.premiumActual)}
                      </td>
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoney(row.target)}</td>
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{fmtPct(row.toGoal)}</td>
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>{fmtPct(row.onTrack)}</td>
                      <td style={{ padding: 6 }}>
                        {renderStatusChip(row.onTrack)}
                      </td>
                    </tr>
                  );
                })}
                {businessPlanBucketRows.length ? (
                  <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                    <td style={{ padding: 6 }}>Total</td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtMoney(businessPlanPremiumTotals.actual)}
                    </td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtMoney(businessPlanPremiumTotals.target)}
                    </td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtPct(businessPlanPremiumTotals.toGoal)}
                    </td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtPct(businessPlanPremiumTotals.onTrack)}
                    </td>
                    <td style={{ padding: 6 }}>
                      {renderStatusChip(businessPlanPremiumTotals.onTrack)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
    );
  };

  const renderExplorerTab = () => {
    const appsStatus = getOnTrackStatus(
      explorerAppsTotals.target > 0 ? explorerAppsTotals.actual / explorerAppsTotals.target : null
    );
    const premiumStatus = getOnTrackStatus(
      explorerPremiumTotals.target > 0 ? explorerPremiumTotals.actual / explorerPremiumTotals.target : null
    );

    return (
      <>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { key: "thisMonth", label: "This Month" },
            { key: "lastMonth", label: "Last Month" },
            { key: "ytd", label: "YTD" },
            { key: "last30", label: "Last 30 Days" },
          ].map((p) => {
            const active = activePresetKey === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key as any)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: active ? "1px solid #111827" : "1px solid #e5e7eb",
                  background: active ? "#111827" : "#fff",
                  color: active ? "#fff" : "#111827",
                  fontWeight: 700,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            alignItems: "start",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Date range</div>
            <DatePicker1
              start={startISO}
              end={endISO}
              onChange={(nextStart, nextEnd) => {
                const parsedStart = parseISODate(nextStart);
                const parsedEnd = parseISODate(nextEnd || nextStart);
                if (!parsedStart || !parsedEnd) return;
                setRange({ start: parsedStart, end: parsedEnd });
              }}
              quickPresets={false}
            />
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Status</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, color: "#111827" }}>
              {allStatuses.map((s) => {
                const checked = statuses.includes(s);
                return (
                  <label key={s} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStatus(s)}
                      style={{ width: 14, height: 14 }}
                    />
                    {s}
                  </label>
                );
              })}
            </div>
          </div>
          {canViewPeopleBenchmarks ? (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>People</div>
              <select
                value=""
                onChange={(e) => {
                  const nextId = e.target.value;
                  if (!nextId) return;
                  setExplorerPeopleIds((prev) => (prev.includes(nextId) ? prev : [...prev, nextId]));
                }}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", width: "100%" }}
              >
                <option value="">Add person…</option>
                {peopleOptions
                  .filter((person) => !explorerPeopleIds.includes(person.id))
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
              </select>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {explorerPeopleIds.length ? (
                  explorerPeopleIds.map((id) => (
                    <span
                      key={id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "#f3f4f6",
                        border: "1px solid #e5e7eb",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {peopleNameById.get(id) || id}
                      <button
                        type="button"
                        onClick={() => setExplorerPeopleIds((prev) => prev.filter((pid) => pid !== id))}
                        style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 700 }}
                      >
                        ×
                      </button>
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>All people</span>
                )}
              </div>
            </div>
          ) : null}
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Lines of Business</div>
            <select
              value=""
              onChange={(e) => {
                const nextId = e.target.value;
                if (!nextId) return;
                setExplorerLobIds((prev) => (prev.includes(nextId) ? prev : [...prev, nextId]));
              }}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", width: "100%" }}
            >
              <option value="">Add LoB…</option>
              {lobOptions
                .filter((lob) => !explorerLobIds.includes(lob.id))
                .map((lob) => (
                  <option key={lob.id} value={lob.id}>
                    {lob.name}
                  </option>
                ))}
            </select>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {explorerLobIds.length ? (
                explorerLobIds.map((id) => (
                  <span
                    key={id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px",
                      borderRadius: 999,
                      background: "#f3f4f6",
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {lobById.get(id)?.name || id}
                    <button
                      type="button"
                      onClick={() => setExplorerLobIds((prev) => prev.filter((lobId) => lobId !== id))}
                      style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 700 }}
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <span style={{ fontSize: 12, color: "#6b7280" }}>All LoBs</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 700 }}>
            <input
              type="checkbox"
              checked={explorerShowTargets}
              onChange={(e) => setExplorerShowTargets(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            Show targets
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setExplorerPeopleIds([]);
              setExplorerLobIds([]);
            }}
            style={{ padding: "6px 10px" }}
          >
            Clear filters
          </button>
        </div>
      </div>

      <div style={{ color: "#6b7280", fontSize: 12, paddingLeft: 4 }}>
        Targets are prorated to match the selected date range.
      </div>

      <Section title="Summary">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div className="surface" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Apps</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Actual</div>
                <div style={{ fontWeight: 800 }}>{fmtInt(explorerAppsTotals.actual)}</div>
              </div>
              {explorerShowTargets ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Target</div>
                    <div style={{ fontWeight: 800 }}>{fmtInt(explorerAppsTotals.target)}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Δ</div>
                    <div style={{ fontWeight: 800 }}>{formatDelta(explorerAppsTotals.delta, fmtInt)}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Status</div>
                    {(() => {
                      const actual = explorerAppsTotals.actual;
                      const target = explorerAppsTotals.target;
                      const onTrackPct = target > 0 ? actual / target : null;
                      return renderStatusChip(onTrackPct);
                    })()}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="surface" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Premium</div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Actual</div>
                <div style={{ fontWeight: 800 }}>{fmtMoney(explorerPremiumTotals.actual)}</div>
              </div>
              {explorerShowTargets ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Target</div>
                    <div style={{ fontWeight: 800 }}>{fmtMoney(explorerPremiumTotals.target)}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Δ</div>
                    <div style={{ fontWeight: 800 }}>{formatDelta(explorerPremiumTotals.delta, fmtMoney)}</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Status</div>
                    {(() => {
                      const actual = explorerPremiumTotals.actual;
                      const target = explorerPremiumTotals.target;
                      const onTrackPct = target > 0 ? actual / target : null;
                      return renderStatusChip(onTrackPct);
                    })()}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </Section>

      {explorerLoading ? <div className="surface" style={{ padding: 12 }}>Loading…</div> : null}
      {explorerError ? (
        <div className="surface" style={{ padding: 12, color: "#b91c1c" }}>
          {explorerError}
        </div>
      ) : null}

      {showExplorerEmptyState ? (
        <EmptyState
          title="No activity in this range."
          body="Adjust the date range or check Sold Products to confirm production was recorded."
          action={
            <a href="/sold-products" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
              Go to Sold Products
            </a>
          }
        />
      ) : null}

      {!showExplorerEmptyState ? (
        <div style={{ display: "grid", gap: 16 }}>
          <Section title="Apps by LoB">
            <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
              {explorerShowTargets ? "Sorted by variance (most behind first)." : "Sorted by actual (highest first)."}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: 6 }}>LoB</th>
                    <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Apps Actual</th>
                    {explorerShowTargets ? (
                      <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Apps Target</th>
                    ) : null}
                    {explorerShowTargets ? (
                      <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Δ</th>
                    ) : null}
                    {explorerShowTargets ? <th style={{ padding: 6 }}>Status</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {explorerLobRows.map((row) => {
                    const target = explorerAppsTargetsByLob.get(row.lobId) ?? 0;
                    const delta = row.appsActual - target;
                    const onTrackPct = target > 0 ? row.appsActual / target : null;
                    return (
                      <tr key={row.lobId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: 6 }}>
                          <a
                            href={`/sold-products?lobId=${encodeURIComponent(row.lobId)}&lob=${encodeURIComponent(row.name)}&dateFrom=${startISO}&dateTo=${endISO}&statuses=${statusesParam}${explorerPersonParam}`}
                            style={{ color: "#111827", textDecoration: "none", fontWeight: 600 }}
                          >
                            {row.name}
                          </a>
                        </td>
                        <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtInt(row.appsActual)}
                        </td>
                        {explorerShowTargets ? (
                          <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                            {fmtInt(target)}
                          </td>
                        ) : null}
                        {explorerShowTargets ? (
                          <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                            {formatDelta(delta, fmtInt)}
                          </td>
                        ) : null}
                        {explorerShowTargets ? (
                          <td style={{ padding: 6 }}>
                            {renderStatusChip(onTrackPct)}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                    <td style={{ padding: 6 }}>Total</td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtInt(explorerAppsTotals.actual)}
                    </td>
                    {explorerShowTargets ? (
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmtInt(explorerAppsTotals.target)}
                      </td>
                    ) : null}
                    {explorerShowTargets ? (
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                        {formatDelta(explorerAppsTotals.delta, fmtInt)}
                      </td>
                    ) : null}
                    {explorerShowTargets ? <td style={{ padding: 6, color: "#6b7280" }}>—</td> : null}
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Premium by Bucket">
            <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
              {explorerShowTargets ? "Sorted by variance (most behind first)." : "Sorted by actual (highest first)."}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: 6 }}>Bucket</th>
                    <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Premium Actual</th>
                    {explorerShowTargets ? (
                      <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Premium Target</th>
                    ) : null}
                    {explorerShowTargets ? (
                      <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Δ</th>
                    ) : null}
                    {explorerShowTargets ? <th style={{ padding: 6 }}>Status</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {explorerBucketRows.map((row) => {
                    const target = explorerBucketTargets[row.bucket as keyof typeof explorerBucketTargets] ?? 0;
                    const delta = row.premiumActual - target;
                    const onTrackPct = target > 0 ? row.premiumActual / target : null;
                    return (
                      <tr key={row.bucket} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: 6 }}>
                          <a
                            href={`/sold-products?premiumCategory=${encodeURIComponent(row.bucket)}&dateFrom=${startISO}&dateTo=${endISO}&statuses=${statusesParam}`}
                            style={{ color: "#111827", textDecoration: "none", fontWeight: 600 }}
                          >
                            {row.bucket}
                          </a>
                        </td>
                        <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtMoney(row.premiumActual)}
                        </td>
                        {explorerShowTargets ? (
                          <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                            {fmtMoney(target)}
                          </td>
                        ) : null}
                        {explorerShowTargets ? (
                          <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                            {formatDelta(delta, fmtMoney)}
                          </td>
                        ) : null}
                        {explorerShowTargets ? (
                          <td style={{ padding: 6 }}>
                            {renderStatusChip(onTrackPct)}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                    <td style={{ padding: 6 }}>Total</td>
                    <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtMoney(explorerPremiumTotals.actual)}
                    </td>
                    {explorerShowTargets ? (
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmtMoney(explorerPremiumTotals.target)}
                      </td>
                    ) : null}
                    {explorerShowTargets ? (
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                        {formatDelta(explorerPremiumTotals.delta, fmtMoney)}
                      </td>
                    ) : null}
                    {explorerShowTargets ? <td style={{ padding: 6, color: "#6b7280" }}>—</td> : null}
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {canViewPeopleBenchmarks ? (
            <Section title="People">
              <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
                {explorerShowTargets
                  ? "Sorted by variance (most behind first)."
                  : "Sorted by premium actual (highest first)."}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                      <th style={{ padding: 6 }}>Person</th>
                      <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Apps Actual</th>
                      {explorerShowTargets ? (
                        <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Apps Target</th>
                      ) : null}
                      <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Premium Actual</th>
                      {explorerShowTargets ? (
                        <th style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>Premium Target</th>
                      ) : null}
                      {explorerShowTargets ? <th style={{ padding: 6 }}>Status</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {explorerPeopleRows.map((person) => {
                      const onTrackPct =
                        person.premiumTarget > 0 ? person.premiumActual / person.premiumTarget : null;
                      return (
                        <tr key={person.personId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: 6 }}>{person.name}</td>
                          <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                            {fmtInt(person.appsActual)}
                          </td>
                          {explorerShowTargets ? (
                            <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                              {fmtInt(person.appsTarget)}
                            </td>
                          ) : null}
                          <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                            {fmtMoney(person.premiumActual)}
                          </td>
                          {explorerShowTargets ? (
                            <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                              {fmtMoney(person.premiumTarget)}
                            </td>
                          ) : null}
                          {explorerShowTargets ? (
                            <td style={{ padding: 6 }}>
                              {renderStatusChip(onTrackPct)}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: "2px solid #e5e7eb", fontWeight: 700 }}>
                      <td style={{ padding: 6 }}>Total</td>
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmtInt(explorerPeopleTotals.appsActual)}
                      </td>
                      {explorerShowTargets ? (
                        <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtInt(explorerPeopleTotals.appsTarget)}
                        </td>
                      ) : null}
                      <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmtMoney(explorerPeopleTotals.premiumActual)}
                      </td>
                      {explorerShowTargets ? (
                        <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                          {fmtMoney(explorerPeopleTotals.premiumTarget)}
                        </td>
                      ) : null}
                      {explorerShowTargets ? <td style={{ padding: 6, color: "#6b7280" }}>—</td> : null}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Section>
          ) : (
            <Section title="People">
              <div style={{ color: "#6b7280" }}>
                Manager-only: You don't have access to view individual benchmarks.
              </div>
            </Section>
          )}
        </div>
      ) : null}
    </>
    );
  };

  const TabsRow = () => (
    <div className="surface" style={{ display: "flex", gap: 8, padding: 8, flexWrap: "wrap" }}>
      <TabButton active={isBenchmarks} label="Benchmarks" onClick={() => setActiveTab("benchmarks")} />
      <TabButton active={isExplorer} label="Benchmarks Explorer" onClick={() => setActiveTab("explorer")} />
      <TabButton active={isBusinessPlan} label="Business Plan Progress" onClick={() => setActiveTab("businessPlan")} />
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <TabsRow />
      {isBenchmarks && renderBenchmarksTab()}
      {isExplorer && renderExplorerTab()}
      {isBusinessPlan && renderBusinessPlanTab()}
    </div>
  );
}

export default function BenchmarksPageClient({ canViewPeopleBenchmarks }: BenchmarksPageClientProps) {
  return (
    <ErrorBoundary>
      <BenchmarksPageClientInner canViewPeopleBenchmarks={canViewPeopleBenchmarks} />
    </ErrorBoundary>
  );
}
