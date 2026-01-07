"use client";

import { useEffect, useMemo, useState } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";

type LobOption = { id: string; name: string; premiumCategory: string };

type MissingCommissionRateDiag = { lob: string; months: string[] };
type MissingSalaryPlanDiag = { personId: string; personName?: string };
type MissingMonthlyInputDiag = { personId: string; personName?: string; month: string };

type RoiDiagnostics = {
  missingCommissionRates?: MissingCommissionRateDiag[];
  missingSalaryPlans?: MissingSalaryPlanDiag[];
  missingMonthlyInputs?: MissingMonthlyInputDiag[];
  reconciliation?: {
    agencyVsPeople?: Array<{ field: "revenue" | "salary" | "commission" | "net"; agencyTotal: number; peopleTotal: number; delta: number }>;
    personBreakdown?: Array<{ personId: string; field: "revenue" | "net"; expected: number; actual: number; delta: number }>;
  };
};

type RoiApiResponse = {
  kpis: {
    revenue: number;
    salaries: number;
    commissionsPaid: number;
    leadSpend: number;
    net: number;
    roi: number;
  };
  lobRows: Array<{ lob: string; apps: number; premium: number; rate: number | null; revenue: number }>;
  peopleRows: Array<{
    personId: string;
    personName: string;
    apps: number;
    premium: number;
    revenue: number;
    salary: number;
    commissionsPaid: number;
    commissionPaidFromComp?: boolean;
    leadSpend: number;
    otherBonusesManual?: number;
    marketingExpenses?: number;
    net: number;
    roi: number;
  }>;
  diagnostics?: RoiDiagnostics;
};

const STATUS_OPTIONS = ["WRITTEN", "ISSUED", "PAID", "STATUS_CHECK", "CANCELLED"] as const;
const ROI_API_PATH = "/api/reports/roi"; // keep relative so browser sends cookies

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function decimalToPercent(decimal: number): string {
  if (!decimal || isNaN(decimal)) return "";
  const pct = decimal * 100;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2);
}

function percentInputToDecimal(input: string): number {
  if (!input) return 0;
  const cleaned = input.replace("%", "").trim();
  const n = Number(cleaned);
  if (isNaN(n)) return 0;
  return n / 100;
}

// IMPORTANT: All ROI requests must include credentials for viewer auth
async function fetchRoi(payload: any) {
  // IMPORTANT: credentials must be included or cookies will not be sent (viewer will be null)
  console.log("[ROIClient] document.cookie present?", Boolean(document.cookie && document.cookie.length));
  console.log("[ROIClient] ROI_API_PATH", ROI_API_PATH);
  return fetch(ROI_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
    mode: "same-origin",
    cache: "no-store",
  });
}

export default function ROIClient({ lobs }: { lobs: LobOption[] }) {
  const goToSoldProducts = (personId: string, start: string, end: string, statuses: string[]) => {
    const qs = new URLSearchParams();
    if (personId) qs.set("personId", personId);
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);
    if (statuses?.length) statuses.forEach((s) => qs.append("statuses", s));
    window.location.href = `/sold-products?${qs.toString()}`;
  };

  const today = useMemo(() => new Date(), []);
  const startDefault = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const endDefault = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const [start, setStart] = useState<string>(startDefault);
  const [end, setEnd] = useState<string>(endDefault);
  const [statuses, setStatuses] = useState<string[]>(["WRITTEN", "ISSUED", "PAID"]);
  const [lobRates, setLobRates] = useState<Record<string, number>>({});
  const lastSavedRef = useMemo(() => new Map<string, number>(), []);
  const [monthlyInputs, setMonthlyInputs] = useState<
    Record<string, { commissionPaid: number; otherBonusesManual: number; marketingExpenses: number }>
  >({});
  const [data, setData] = useState<RoiApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch commission rates for the start date
  useEffect(() => {
    async function loadRates() {
      try {
        const res = await fetch(`/api/roi/rates?activeOn=${encodeURIComponent(start)}`);
        const rows = await res.json();
        if (Array.isArray(rows)) {
          const map: Record<string, number> = {};
          rows.forEach((r: any) => {
            const lobName = String(r.lob || "").trim();
            const match = lobs.find((l) => l.name === lobName);
            if (match) {
              const decimal = Number(r.rate) || 0;
              map[match.id] = Math.round(decimal * 10000) / 10000; // store as decimal
            }
          });

          // fill defaults for missing
          lobs.forEach((l) => {
            if (map[l.id] === undefined) {
              const base = l.premiumCategory === "FS" ? 0.15 : l.premiumCategory === "IPS" ? 0.12 : 0.1;
              map[l.id] = base;
            }
          });

          setLobRates(map);
        }
      } catch (err) {
        console.error("Failed to load ROI rates", err);
      }
    }

    loadRates();
  }, [start, lobs]);

  // Fetch ROI report data
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchRoi({ start, end, statuses });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`${res.status}: ${text}`);
        }
        const json = (await res.json()) as RoiApiResponse;
        setData(json);

        // seed monthly inputs from peopleRows
        setMonthlyInputs((prev) => {
          const next = { ...prev };
          json.peopleRows.forEach((p) => {
            if (!next[p.personId]) {
              next[p.personId] = {
                commissionPaid: p.commissionsPaid ?? 0,
                otherBonusesManual: p.otherBonusesManual ?? 0,
                marketingExpenses: p.marketingExpenses ?? 0,
              };
            }
          });
          return next;
        });
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [start, end, statuses]);

  const computed = useMemo(() => {
    if (!data) return null;

    const lobTable = data.lobRows.map((lob) => {
      const rateDecimal = lobRates[lob.lob] ?? lob.rate ?? 0;
      return {
        ...lob,
        rate: rateDecimal,
        revenue: lob.premium * rateDecimal,
      };
    });

    const kpis = data.kpis;

    const rows = data.peopleRows.map((p) => {
      const extras = monthlyInputs[p.personId] || {
        commissionPaid: p.commissionsPaid ?? 0,
        otherBonusesManual: p.otherBonusesManual ?? 0,
        marketingExpenses: p.marketingExpenses ?? 0,
      };

      const otherBonusesAuto = 0; // A6 placeholder (future comp kickers)

      const costs =
        p.salary +
        (extras.commissionPaid ?? 0) +
        p.leadSpend +
        otherBonusesAuto +
        (extras.otherBonusesManual ?? 0) +
        (extras.marketingExpenses ?? 0);

      const net = p.revenue - costs;
      const roi = costs > 0 ? (net / costs) * 100 : 0;

      return {
        ...p,
        commissionsPaid: extras.commissionPaid ?? 0,
        otherBonusesManual: extras.otherBonusesManual ?? 0,
        marketingExpenses: extras.marketingExpenses ?? 0,
        net,
        roi,
      };
    });

    return { lobTable, kpis, rows };
  }, [data, lobRates, monthlyInputs]);

  const toggleStatus = (s: string) => {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  if (loading && !data) {
    return <div style={{ padding: 16 }}>Loading ROI…</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          alignItems: "end",
        }}
      >
        <div style={{ display: "grid", gap: 6, position: "relative" }}>
          <DateRangePicker
            label="Written range"
            start={start}
            end={end}
            onChange={(s, e) => {
              setStart(s);
              setEnd(e || "");
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <span style={{ fontWeight: 700 }}>Statuses</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STATUS_OPTIONS.map((s) => {
              const active = statuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: active ? "2px solid #2563eb" : "1px solid #d1d5db",
                    background: active ? "#eff6ff" : "#fff",
                    fontWeight: 700,
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <div
          style={{
            color: "#b91c1c",
            whiteSpace: "pre-wrap",
            fontSize: 13,
            padding: 8,
            border: "1px solid #fecdd3",
            borderRadius: 8,
          }}
        >
          {error.slice(0, 500)}
        </div>
      )}

      {!loading && !data && !error && (
        <div style={{ padding: 12, background: "#f1f5f9", borderRadius: 10 }}>No data for the selected range.</div>
      )}

      {data?.diagnostics && <DiagnosticsBanner diagnostics={data.diagnostics} />}

      {computed && (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <StatCard label="Revenue" value={computed.kpis.revenue} color="#166534" />
            <StatCard label="Salaries" value={-computed.kpis.salaries} color="#b45309" />
            <StatCard label="Commissions" value={-computed.kpis.commissionsPaid} color="#b45309" />
            <StatCard label="Net" value={computed.kpis.net} color={computed.kpis.net >= 0 ? "#166534" : "#b91c1c"} />
            <StatCard label="ROI" value={(computed.kpis.roi ?? 0) * 100} suffix="%" color="#2563eb" />
          </div>

          <section style={{ display: "grid", gap: 8 }}>
            <h3 style={{ margin: 0 }}>Line of business revenue</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>LoB</th>
                    <th style={thStyle}>Premium</th>
                    <th style={thStyle}>Apps</th>
                    <th style={thStyle}>Rate</th>
                    <th style={thStyle}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.lobTable.map((lob) => (
                    <tr key={lob.lob}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700 }}>{lob.lob}</div>
                      </td>
                      <td style={tdStyle}>{formatMoney(lob.premium)}</td>
                      <td style={tdStyle}>{lob.apps}</td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          step="0.1"
                          value={decimalToPercent(lobRates[lob.lob] ?? lob.rate ?? 0)}
                          onChange={(e) => {
                            const decimal = percentInputToDecimal(e.target.value);
                            setLobRates({ ...lobRates, [lob.lob]: decimal });
                          }}
                          onBlur={async (e) => {
                            const decimal = percentInputToDecimal(e.target.value);
                            const lastSaved = lastSavedRef.get(lob.lob);
                            if (lastSaved !== undefined && Math.abs(lastSaved - decimal) < 1e-6) return;
                            try {
                              await fetch("/api/roi/rates", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  lob: lob.lob,
                                  rate: decimal,
                                  effectiveStart: start,
                                  effectiveEnd: null,
                                }),
                              });
                              lastSavedRef.set(lob.lob, decimal);
                            } catch (err) {
                              console.error("Failed to save rate", err);
                            }
                          }}
                          style={{ ...inputStyle, maxWidth: 90 }}
                        />
                      </td>
                      <td style={tdStyle}>{formatMoney(lob.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

      <section style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Per-person ROI</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
                  <tr>
                    <th style={thStyle}>Person</th>
                    <th style={thStyle}>Apps</th>
                    <th style={thStyle}>Premium</th>
                    <th style={thStyle}>Revenue</th>
                    <th style={thStyle}>Salary</th>
                    <th style={thStyle}>Commission Paid</th>
                    <th style={thStyle} title="System-calculated bonuses">Other bonuses (auto)</th>
                    <th style={thStyle} title="Manually entered bonuses">Other bonuses (manual)</th>
                    <th style={thStyle} title="Allocated marketing costs">Marketing expenses</th>
                    <th style={thStyle}>Net</th>
                    <th style={thStyle}>ROI</th>
              </tr>
            </thead>
            <tbody>
              {computed.rows.length === 0 && (
                <tr>
                  <td colSpan={11} style={{ ...tdStyle, textAlign: "left" }}>
                    {(() => {
                      const hasTotalsActivity =
                        Math.abs(computed.kpis.revenue || 0) > 0.01 ||
                        Math.abs(computed.kpis.salaries || 0) > 0.01 ||
                        Math.abs(computed.kpis.commissionsPaid || 0) > 0.01 ||
                        Math.abs(computed.kpis.net || 0) > 0.01;
                      const hasLobActivity = computed.lobTable.some((l) => (l.apps || 0) > 0 || Math.abs(l.premium || 0) > 0.01);
                      const trulyEmpty = !hasTotalsActivity && !hasLobActivity;

                      if (trulyEmpty) {
                        return (
                          <div
                            style={{
                              border: "1px solid #e5e7eb",
                              borderRadius: 12,
                              padding: 12,
                              background: "#f8fafc",
                              color: "#475569",
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            <div style={{ fontWeight: 800 }}>No ROI data for this range</div>
                            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                              <li>Try expanding the written range or including additional statuses.</li>
                              <li>Confirm ROI Setup is configured (commission rates, salary plans, monthly inputs).</li>
                              <li>If you recently changed setup, refresh the page.</li>
                            </ul>
                            <a
                              href="/admin-tools/roi-setup"
                              style={{
                                width: "fit-content",
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "1px solid #2563eb",
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                fontWeight: 800,
                                textDecoration: "none",
                              }}
                            >
                              Go to ROI Setup
                            </a>
                          </div>
                        );
                      }

                      return (
                        <div style={{ color: "#475569" }}>
                          Agency totals exist, but no people matched the current filters.
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              )}

                  {computed.rows.map((r) => (
                    <tr key={r.personId}>
                      <td style={tdStyle}>
                        <div
                          style={{ fontWeight: 800, cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => {
                            window.location.href = `/reports/roi/person/${encodeURIComponent(r.personId)}`;
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              window.location.href = `/reports/roi/person/${encodeURIComponent(r.personId)}`;
                            }
                          }}
                        >
                          {r.personName}
                        </div>
                      </td>

                      <td
                        style={{ ...tdStyle, cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => goToSoldProducts(r.personId, start, end, statuses)}
                      >
                        {r.apps}
                      </td>

                      <td style={tdStyle}>{formatMoney(r.premium)}</td>

                      <td
                        style={{ ...tdStyle, cursor: "pointer", textDecoration: "underline" }}
                        onClick={() => goToSoldProducts(r.personId, start, end, statuses)}
                      >
                        {formatMoney(r.revenue)}
                      </td>

                      <td style={tdStyle}>{formatMoney(r.salary)}</td>

                      <td style={tdStyle}>
                        <div>{formatMoney(r.commissionsPaid)}</div>
                        {r.commissionPaidFromComp ? (
                          <div style={{ color: "#475569", fontSize: 12, marginTop: 2 }}>(from comp)</div>
                        ) : null}
                      </td>

                      <td style={tdStyle}>{formatMoney(0)}</td>

                      <td style={tdStyle}>
                        <input
                          type="number"
                          value={monthlyInputs[r.personId]?.otherBonusesManual ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setMonthlyInputs((prev) => ({
                              ...prev,
                              [r.personId]: {
                                ...(prev[r.personId] || {}),
                                otherBonusesManual: val,
                                commissionPaid: prev[r.personId]?.commissionPaid ?? r.commissionsPaid,
                                marketingExpenses: prev[r.personId]?.marketingExpenses ?? 0,
                              },
                            }));
                          }}
                          onBlur={async (e) => {
                            const val = Number(e.target.value) || 0;
                            try {
                              await fetch("/api/roi/monthly-inputs", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  personId: r.personId,
                                  month: start.slice(0, 7),
                                  commissionPaid: monthlyInputs[r.personId]?.commissionPaid ?? r.commissionsPaid,
                                  otherBonusesManual: val,
                                  marketingExpenses: monthlyInputs[r.personId]?.marketingExpenses ?? 0,
                                }),
                              });
                            } catch (err) {
                              console.error("Failed to save monthly input", err);
                            }
                          }}
                          style={{ ...inputStyle, maxWidth: 110 }}
                        />
                      </td>

                      <td style={tdStyle}>
                        <input
                          type="number"
                          value={monthlyInputs[r.personId]?.marketingExpenses ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setMonthlyInputs((prev) => ({
                              ...prev,
                              [r.personId]: {
                                ...(prev[r.personId] || {}),
                                marketingExpenses: val,
                                commissionPaid: prev[r.personId]?.commissionPaid ?? r.commissionsPaid,
                                otherBonusesManual: prev[r.personId]?.otherBonusesManual ?? 0,
                              },
                            }));
                          }}
                          onBlur={async (e) => {
                            const val = Number(e.target.value) || 0;
                            try {
                              await fetch("/api/roi/monthly-inputs", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  personId: r.personId,
                                  month: start.slice(0, 7),
                                  commissionPaid: monthlyInputs[r.personId]?.commissionPaid ?? r.commissionsPaid,
                                  otherBonusesManual: monthlyInputs[r.personId]?.otherBonusesManual ?? 0,
                                  marketingExpenses: val,
                                }),
                              });
                            } catch (err) {
                              console.error("Failed to save monthly input", err);
                            }
                          }}
                          style={{ ...inputStyle, maxWidth: 110 }}
                        />
                      </td>

                      <td style={{ ...tdStyle, fontWeight: 800, color: r.net >= 0 ? "#166534" : "#b91c1c" }}>
                        {formatMoney(r.net)}
                        {r.net === 0 && data?.diagnostics && hasMissingDiagnostics(data.diagnostics) ? (
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>ROI may be zero until setup is complete.</div>
                        ) : null}
                      </td>

                      <td style={tdStyle}>
                        {r.roi.toFixed(1)}%
                        {r.roi === 0 && data?.diagnostics && hasMissingDiagnostics(data.diagnostics) ? (
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>ROI may be zero until setup is complete.</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function DiagnosticsBanner({ diagnostics }: { diagnostics?: RoiDiagnostics }) {
  if (!diagnostics) return null;

  const missingRates = diagnostics.missingCommissionRates || [];
  const missingPlans = diagnostics.missingSalaryPlans || [];
  const missingInputs = diagnostics.missingMonthlyInputs || [];
  const reconciliation = diagnostics.reconciliation;
  const hasMissing = missingRates.length > 0 || missingPlans.length > 0 || missingInputs.length > 0;
  const hasReconciliation =
    (reconciliation?.agencyVsPeople?.length || 0) > 0 || (reconciliation?.personBreakdown?.length || 0) > 0;
  if (!hasMissing && !hasReconciliation) return null;

  const sectionLabelStyle: React.CSSProperties = { fontWeight: 700, color: "#92400e" };

  return (
    <div
      style={{
        border: "1px solid #f59e0b",
        background: "#fffbeb",
        borderRadius: 12,
        padding: 12,
        display: "grid",
        gap: 8,
        marginBottom: 8,
      }}
    >
      <div style={{ fontWeight: 800, color: "#92400e" }}>ROI setup is incomplete</div>
      <div style={{ color: "#b45309", fontSize: 13 }}>Some ROI calculations may be incomplete until missing setup data is added.</div>

      <ul style={{ margin: 0, paddingLeft: 18, color: "#92400e", display: "grid", gap: 6 }}>
        {missingRates.length > 0 && (
          <li>
            <span style={sectionLabelStyle}>Missing commission rates for: </span>
            {missingRates
              .map((r) => {
                const months = r.months || [];
                const head = months.slice(0, 3).join(", ");
                const extra = months.length > 3 ? ` (+${months.length - 3} more)` : "";
                return `${r.lob}${head ? ` (${head}${extra})` : ""}`;
              })
              .join("; ")}
          </li>
        )}

        {missingPlans.length > 0 && (
          <li>
            <span style={sectionLabelStyle}>Missing salary plans for: </span>
            {(() => {
              const names = missingPlans.map((p) => p.personName || p.personId);
              const head = names.slice(0, 5).join(", ");
              const extra = names.length > 5 ? ` (+${names.length - 5} more)` : "";
              return `${head}${extra}`;
            })()}
          </li>
        )}

        {missingInputs.length > 0 && (
          <li>
            <span style={sectionLabelStyle}>Missing monthly inputs for: </span>
            {missingInputs.length} entr{missingInputs.length === 1 ? "y" : "ies"}
          </li>
        )}
        {hasReconciliation && (
          <li>
            <span style={sectionLabelStyle}>ROI totals do not fully reconcile: </span>
            <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
              {[...(reconciliation?.agencyVsPeople || []), ...(reconciliation?.personBreakdown || [])]
                .slice(0, 5)
                .map((r, idx) => (
                  <div key={`rec-${idx}`} style={{ fontSize: 13 }}>
                    {"agencyTotal" in r
                      ? `Agency vs people (${r.field}): agency=${r.agencyTotal.toFixed(2)} people=${r.peopleTotal.toFixed(2)} delta=${r.delta.toFixed(2)}`
                      : `${r.personId} (${r.field}): expected=${r.expected.toFixed(2)} actual=${r.actual.toFixed(2)} delta=${r.delta.toFixed(2)}`}
                  </div>
                ))}
              {((reconciliation?.agencyVsPeople?.length || 0) + (reconciliation?.personBreakdown?.length || 0) > 5) && (
                <div style={{ fontSize: 13, color: "#92400e" }}>
                  +{(reconciliation?.agencyVsPeople?.length || 0) + (reconciliation?.personBreakdown?.length || 0) - 5} more mismatches
                </div>
              )}
            </div>
          </li>
        )}
      </ul>

      <a
        href="/admin-tools/roi-setup"
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #f59e0b",
          background: "#fef3c7",
          color: "#92400e",
          fontWeight: 800,
          textDecoration: "none",
          width: "fit-content",
        }}
      >
        Go to ROI Setup
      </a>
    </div>
  );
}

function hasMissingDiagnostics(diag: RoiDiagnostics): boolean {
  return (
    (diag.missingCommissionRates && diag.missingCommissionRates.length > 0) ||
    (diag.missingSalaryPlans && diag.missingSalaryPlans.length > 0) ||
    (diag.missingMonthlyInputs && diag.missingMonthlyInputs.length > 0)
  );
}

function StatCard({ label, value, color, suffix = "" }: { label: string; value: number; color: string; suffix?: string }) {
  const display = suffix === "%" ? `${value.toFixed(1)}%` : formatMoney(value);
  const tooltip =
    label === "Revenue"
      ? "Premium × commission rate (by LoB)"
      : label === "Salaries"
        ? "Salary plan costs in range"
        : label === "Commissions"
          ? "Commission payouts in range"
          : label === "Net"
            ? "Revenue − salaries − commissions − expenses"
            : label === "ROI"
              ? "Net ÷ total cost"
              : undefined;
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        background: "#fff",
        boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
      }}
      title={tooltip}
    >
      <div style={{ fontSize: 13, color: "#475569", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{display}</div>
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#fff",
  borderRadius: 12,
  overflow: "hidden",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  background: "#f8fafc",
  fontSize: 13,
  color: "#475569",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  verticalAlign: "top",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "8px 10px",
  fontWeight: 700,
};
