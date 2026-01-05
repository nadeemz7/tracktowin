"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

const LOBS = ["Auto", "Fire", "Life", "Health", "IPS"] as const;

type RateRow = {
  lob: string;
  rate: number;
};

type PersonRow = { id: string; name: string };
type CompPlanRow = { personId: string; monthlySalary: number; effectiveStart: string; effectiveEnd?: string | null };

function formatISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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

export default function RoiRatesSetupClient() {
  const today = useMemo(() => new Date(), []);
  const defaultActiveOn = useMemo(() => formatISODate(new Date(today.getFullYear(), today.getMonth(), 1)), [today]);
  const defaultMonth = useMemo(() => formatMonthKey(today), [today]);
  const [activeOn, setActiveOn] = useState<string>(defaultActiveOn);
  const [rateByLob, setRateByLob] = useState<Record<string, number>>({});
  const [statusByLob, setStatusByLob] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const lastSavedRef = useRef<Map<string, number>>(new Map());
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [compPlanByPerson, setCompPlanByPerson] = useState<
    Record<string, { monthlySalary: number; effectiveStart: string; effectiveEnd: string }>
  >({});
  const [statusByPerson, setStatusByPerson] = useState<Record<string, string>>({});
  const [compError, setCompError] = useState<string | null>(null);
  const lastCompSavedRef = useRef<Map<string, string>>(new Map());
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [inputsByPerson, setInputsByPerson] = useState<
    Record<string, { commissionPaid: number; leadSpend: number; otherBonusesManual: number; marketingExpenses: number }>
  >({});
  const [statusByPersonMonth, setStatusByPersonMonth] = useState<Record<string, string>>({});
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const lastMonthlySavedRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    async function loadRates() {
      setError(null);
      setStatusByLob({});
      try {
        const res = await fetch(`/api/roi/rates?activeOn=${encodeURIComponent(activeOn)}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load rates");
        }
        const rows = (await res.json()) as RateRow[];
        const next: Record<string, number> = {};
        LOBS.forEach((lob) => {
          const row = Array.isArray(rows) ? rows.find((r) => r.lob === lob) : undefined;
          next[lob] = row ? Number(row.rate) || 0 : 0;
        });
        setRateByLob(next);
      } catch (err: any) {
        setError(err?.message || "Failed to load rates");
      }
    }

    loadRates();
  }, [activeOn]);

  useEffect(() => {
    async function loadPeople() {
      try {
        const res = await fetch("/api/org/people");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load people");
        }
        const raw = (await res.json()) as any[];
        const mapped = Array.isArray(raw)
          ? raw
              .map((r) => ({
                id: String(r?.id || ""),
                name: String(r?.name || r?.fullName || r?.displayName || ""),
              }))
              .filter((p) => p.id)
              .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
          : [];
        setPeople(mapped);
      } catch (err: any) {
        setCompError(err?.message || "Failed to load people");
      }
    }

    loadPeople();
  }, []);

  useEffect(() => {
    async function loadCompPlans() {
      if (!activeOn) return;
      setCompError(null);
      setStatusByPerson({});
      try {
        const res = await fetch("/api/roi/comp-plans");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load comp plans");
        }
        const rows = (await res.json()) as CompPlanRow[];
        const activeDate = parseDate(activeOn);
        if (!activeDate) return;
        const next: Record<string, { monthlySalary: number; effectiveStart: string; effectiveEnd: string }> = {};
        const saved = new Map<string, string>();
        people.forEach((p) => {
          const plans = Array.isArray(rows) ? rows.filter((r) => r.personId === p.id) : [];
          const activePlan = plans
            .map((r) => ({
              row: r,
              start: parseDate(r.effectiveStart),
              end: parseDate(r.effectiveEnd || undefined),
            }))
            .filter((r) => r.start && r.start <= activeDate && (!r.end || r.end >= activeDate))
            .sort((a, b) => (a.start && b.start ? b.start.getTime() - a.start.getTime() : 0))[0];

          const effectiveStart = activePlan?.start ? formatISODate(activePlan.start) : activeOn;
          const effectiveEnd = activePlan?.end ? formatISODate(activePlan.end) : "";
          const monthlySalary = activePlan?.row ? Number(activePlan.row.monthlySalary) || 0 : 0;
          next[p.id] = { monthlySalary, effectiveStart, effectiveEnd };
          saved.set(p.id, JSON.stringify({ monthlySalary, effectiveStart, effectiveEnd }));
        });
        setCompPlanByPerson(next);
        lastCompSavedRef.current = saved;
      } catch (err: any) {
        setCompError(err?.message || "Failed to load comp plans");
      }
    }

    loadCompPlans();
  }, [activeOn, people]);

  useEffect(() => {
    async function loadMonthlyInputs() {
      if (!selectedMonth) return;
      setMonthlyError(null);
      setStatusByPersonMonth({});
      try {
        const res = await fetch(
          `/api/roi/monthly-inputs?startMonth=${encodeURIComponent(selectedMonth)}&endMonth=${encodeURIComponent(selectedMonth)}`
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load monthly inputs");
        }
        const rows = (await res.json()) as any[];
        const byPerson: Record<
          string,
          { commissionPaid: number; leadSpend: number; otherBonusesManual: number; marketingExpenses: number }
        > = {};
        if (Array.isArray(rows)) {
          rows.forEach((r) => {
            const personId = String(r?.personId || "");
            if (!personId) return;
            byPerson[personId] = {
              commissionPaid: Number(r?.commissionPaid) || 0,
              leadSpend: Number(r?.leadSpend) || 0,
              otherBonusesManual: Number(r?.otherBonusesManual) || 0,
              marketingExpenses: Number(r?.marketingExpenses) || 0,
            };
          });
        }
        const next: Record<
          string,
          { commissionPaid: number; leadSpend: number; otherBonusesManual: number; marketingExpenses: number }
        > = {};
        const saved = new Map<string, string>();
        people.forEach((p) => {
          const row = byPerson[p.id] || {
            commissionPaid: 0,
            leadSpend: 0,
            otherBonusesManual: 0,
            marketingExpenses: 0,
          };
          next[p.id] = row;
          saved.set(`${p.id}-${selectedMonth}`, JSON.stringify(row));
        });
        setInputsByPerson(next);
        lastMonthlySavedRef.current = saved;
      } catch (err: any) {
        setMonthlyError(err?.message || "Failed to load monthly inputs");
      }
    }

    loadMonthlyInputs();
  }, [selectedMonth, people]);

  async function saveRate(lob: string) {
    const key = `${lob}-${activeOn}`;
    const rate = Math.max(0, rateByLob[lob] ?? 0);
    const lastSaved = lastSavedRef.current.get(key);
    if (lastSaved !== undefined && Math.abs(lastSaved - rate) < 1e-6) return;
    try {
      const res = await fetch("/api/roi/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lob,
          rate,
          effectiveStart: activeOn,
          effectiveEnd: null,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save rate");
      }
      lastSavedRef.current.set(key, rate);
      setStatusByLob((prev) => ({ ...prev, [lob]: "Saved" }));
    } catch (err: any) {
      setStatusByLob((prev) => ({ ...prev, [lob]: err?.message || "Save failed" }));
    }
  }

  async function saveCompPlan(personId: string) {
    const plan = compPlanByPerson[personId] || { monthlySalary: 0, effectiveStart: activeOn, effectiveEnd: "" };
    const monthlySalary = Math.max(0, Number(plan.monthlySalary) || 0);
    const effectiveStart = plan.effectiveStart || activeOn;
    const effectiveEnd = plan.effectiveEnd || "";
    const currentKey = JSON.stringify({ monthlySalary, effectiveStart, effectiveEnd });
    if (lastCompSavedRef.current.get(personId) === currentKey) return;
    try {
      const res = await fetch("/api/roi/comp-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          monthlySalary,
          effectiveStart,
          effectiveEnd: effectiveEnd || null,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save comp plan");
      }
      lastCompSavedRef.current.set(personId, currentKey);
      setStatusByPerson((prev) => ({ ...prev, [personId]: "Saved" }));
    } catch (err: any) {
      setStatusByPerson((prev) => ({ ...prev, [personId]: err?.message || "Save failed" }));
    }
  }

  async function saveMonthlyInputs(personId: string) {
    const row = inputsByPerson[personId] || {
      commissionPaid: 0,
      leadSpend: 0,
      otherBonusesManual: 0,
      marketingExpenses: 0,
    };
    const payload = {
      commissionPaid: Math.max(0, Number(row.commissionPaid) || 0),
      leadSpend: Math.max(0, Number(row.leadSpend) || 0),
      otherBonusesManual: Math.max(0, Number(row.otherBonusesManual) || 0),
      marketingExpenses: Math.max(0, Number(row.marketingExpenses) || 0),
    };
    const key = `${personId}-${selectedMonth}`;
    const currentKey = JSON.stringify(payload);
    if (lastMonthlySavedRef.current.get(key) === currentKey) return;
    try {
      const res = await fetch("/api/roi/monthly-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          month: selectedMonth,
          ...payload,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to save monthly inputs");
      }
      lastMonthlySavedRef.current.set(key, currentKey);
      setStatusByPersonMonth((prev) => ({ ...prev, [personId]: "Saved" }));
    } catch (err: any) {
      setStatusByPersonMonth((prev) => ({ ...prev, [personId]: err?.message || "Save failed" }));
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, padding: 16 }}>
      <div style={{ fontSize: 20, fontWeight: 800 }}>ROI Setup</div>
      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Commission rates</div>
        <div style={{ display: "grid", gap: 6, maxWidth: 240 }}>
          <label style={{ fontWeight: 700 }}>Active on</label>
          <input
            type="date"
            value={activeOn}
            onChange={(e) => setActiveOn(e.target.value)}
            style={inputStyle}
          />
        </div>
        {error && (
          <div style={{ color: "#b91c1c", border: "1px solid #fecdd3", borderRadius: 8, padding: 8, fontSize: 13 }}>
            {error}
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>LoB</th>
                <th style={thStyle}>Rate (%)</th>
                <th style={thStyle}>Effective start</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {LOBS.map((lob) => (
                <tr key={lob}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 700 }}>{lob}</div>
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="number"
                      step="0.1"
                      value={decimalToPercent(rateByLob[lob] ?? 0)}
                      onChange={(e) => {
                        const decimal = percentInputToDecimal(e.target.value);
                        setRateByLob((prev) => ({ ...prev, [lob]: Math.max(0, decimal) }));
                        setStatusByLob((prev) => ({ ...prev, [lob]: "" }));
                      }}
                      onBlur={() => saveRate(lob)}
                      style={{ ...inputStyle, maxWidth: 100 }}
                    />
                  </td>
                  <td style={tdStyle}>{activeOn}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: statusByLob[lob] ? "#0f172a" : "#64748b" }}>
                      {statusByLob[lob] || ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Salary comp plans</div>
        {compError && (
          <div style={{ color: "#b91c1c", border: "1px solid #fecdd3", borderRadius: 8, padding: 8, fontSize: 13 }}>
            {compError}
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Person</th>
                <th style={thStyle}>Monthly salary</th>
                <th style={thStyle}>Effective start</th>
                <th style={thStyle}>Effective end</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={5}>
                    No people found.
                  </td>
                </tr>
              ) : (
                people.map((p) => {
                  const plan = compPlanByPerson[p.id] || { monthlySalary: 0, effectiveStart: activeOn, effectiveEnd: "" };
                  return (
                    <tr key={p.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700 }}>{p.name}</div>
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          step="100"
                          value={Number.isFinite(plan.monthlySalary) ? plan.monthlySalary : 0}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setCompPlanByPerson((prev) => ({ ...prev, [p.id]: { ...plan, monthlySalary: val } }));
                            setStatusByPerson((prev) => ({ ...prev, [p.id]: "" }));
                          }}
                          onBlur={() => saveCompPlan(p.id)}
                          style={{ ...inputStyle, maxWidth: 140 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="date"
                          value={plan.effectiveStart || activeOn}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCompPlanByPerson((prev) => ({ ...prev, [p.id]: { ...plan, effectiveStart: val } }));
                            setStatusByPerson((prev) => ({ ...prev, [p.id]: "" }));
                          }}
                          onBlur={() => saveCompPlan(p.id)}
                          style={{ ...inputStyle, maxWidth: 170 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="date"
                          value={plan.effectiveEnd || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCompPlanByPerson((prev) => ({ ...prev, [p.id]: { ...plan, effectiveEnd: val } }));
                            setStatusByPerson((prev) => ({ ...prev, [p.id]: "" }));
                          }}
                          onBlur={() => saveCompPlan(p.id)}
                          style={{ ...inputStyle, maxWidth: 170 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, color: statusByPerson[p.id] ? "#0f172a" : "#64748b" }}>
                          {statusByPerson[p.id] || ""}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Monthly inputs</div>
        <div style={{ display: "grid", gap: 6, maxWidth: 240 }}>
          <label style={{ fontWeight: 700 }}>Month</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={inputStyle}
          />
        </div>
        {monthlyError && (
          <div style={{ color: "#b91c1c", border: "1px solid #fecdd3", borderRadius: 8, padding: 8, fontSize: 13 }}>
            {monthlyError}
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Person</th>
                <th style={thStyle}>Commission paid</th>
                <th style={thStyle}>Lead spend</th>
                <th style={thStyle}>Other bonuses (manual)</th>
                <th style={thStyle}>Marketing expenses</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 ? (
                <tr>
                  <td style={tdStyle} colSpan={6}>
                    No people found.
                  </td>
                </tr>
              ) : (
                people.map((p) => {
                  const row = inputsByPerson[p.id] || {
                    commissionPaid: 0,
                    leadSpend: 0,
                    otherBonusesManual: 0,
                    marketingExpenses: 0,
                  };
                  return (
                    <tr key={p.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700 }}>{p.name}</div>
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          step="1"
                          value={row.commissionPaid}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setInputsByPerson((prev) => ({
                              ...prev,
                              [p.id]: { ...row, commissionPaid: val },
                            }));
                            setStatusByPersonMonth((prev) => ({ ...prev, [p.id]: "" }));
                          }}
                          onBlur={() => saveMonthlyInputs(p.id)}
                          style={{ ...inputStyle, maxWidth: 140 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          step="1"
                          value={row.leadSpend}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setInputsByPerson((prev) => ({
                              ...prev,
                              [p.id]: { ...row, leadSpend: val },
                            }));
                            setStatusByPersonMonth((prev) => ({ ...prev, [p.id]: "" }));
                          }}
                          onBlur={() => saveMonthlyInputs(p.id)}
                          style={{ ...inputStyle, maxWidth: 140 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          step="1"
                          value={row.otherBonusesManual}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setInputsByPerson((prev) => ({
                              ...prev,
                              [p.id]: { ...row, otherBonusesManual: val },
                            }));
                            setStatusByPersonMonth((prev) => ({ ...prev, [p.id]: "" }));
                          }}
                          onBlur={() => saveMonthlyInputs(p.id)}
                          style={{ ...inputStyle, maxWidth: 160 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          step="1"
                          value={row.marketingExpenses}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setInputsByPerson((prev) => ({
                              ...prev,
                              [p.id]: { ...row, marketingExpenses: val },
                            }));
                            setStatusByPersonMonth((prev) => ({ ...prev, [p.id]: "" }));
                          }}
                          onBlur={() => saveMonthlyInputs(p.id)}
                          style={{ ...inputStyle, maxWidth: 160 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, color: statusByPersonMonth[p.id] ? "#0f172a" : "#64748b" }}>
                          {statusByPersonMonth[p.id] || ""}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#fff",
  borderRadius: 12,
  overflow: "hidden",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  background: "#f8fafc",
  fontSize: 13,
  color: "#475569",
  borderBottom: "1px solid #e5e7eb",
};

const tdStyle: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
  verticalAlign: "top",
};

const inputStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "8px 10px",
  fontWeight: 700,
};
