"use client";

import { useEffect, useMemo, useState } from "react";

type AgencyOption = { value: string; label: string };
type LobOption = { id: string; name: string; premiumCategory: string };

type RoiApiResponse = {
  persons: { id: string; fullName: string; teamType: string; agencyId: string | null }[];
  personMetrics: Record<string, { premium: number; apps: number; byLob: Record<string, { premium: number; apps: number; name: string; premiumCategory: string }> }>;
  lobTotals: { id: string; name: string; premiumCategory: string; premium: number; apps: number }[];
  compByPerson: Record<string, number>;
};

const STATUS_OPTIONS = ["WRITTEN", "ISSUED", "PAID", "STATUS_CHECK", "CANCELLED"] as const;

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function labelCategory(cat: string) {
  if (cat === "PC") return "P&C";
  if (cat === "FS") return "Financial Services";
  if (cat === "IPS") return "IPS";
  return cat || "All";
}

export default function ROIClient({ agencies, lobs }: { agencies: AgencyOption[]; lobs: LobOption[] }) {
  const today = useMemo(() => new Date(), []);
  const startDefault = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  }, [today]);
  const endDefault = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const [agencyId, setAgencyId] = useState<string>(agencies[0]?.value || "");
  const [start, setStart] = useState<string>(startDefault);
  const [end, setEnd] = useState<string>(endDefault);
  const [statuses, setStatuses] = useState<string[]>(["WRITTEN", "ISSUED", "PAID"]);
  const [lobRates, setLobRates] = useState<Record<string, number>>({});
  const [salaryByPerson, setSalaryByPerson] = useState<Record<string, number>>({});
  const [data, setData] = useState<RoiApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load persisted rates/salaries per agency
  useEffect(() => {
    const rateKey = `roi_rates_${agencyId || "all"}`;
    const salaryKey = `roi_salary_${agencyId || "all"}`;
    try {
      const savedRates = localStorage.getItem(rateKey);
      if (savedRates) setLobRates(JSON.parse(savedRates));
      else {
        const defaults: Record<string, number> = {};
        lobs.forEach((l) => {
          const base = l.premiumCategory === "FS" ? 0.15 : l.premiumCategory === "IPS" ? 0.12 : 0.1;
          defaults[l.id] = base;
        });
        setLobRates(defaults);
      }
      const savedSalary = localStorage.getItem(salaryKey);
      if (savedSalary) setSalaryByPerson(JSON.parse(savedSalary));
      else setSalaryByPerson({});
    } catch (err) {
      console.error(err);
    }
  }, [agencyId, lobs]);

  // Fetch data
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/reports/roi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agencyId: agencyId || undefined, start, end, statuses }),
        });
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as RoiApiResponse;
        setData(json);
        // seed salaries if missing but do not overwrite existing values
        setSalaryByPerson((prev) => {
          const next = { ...prev };
          json.persons.forEach((p) => {
            if (next[p.id] === undefined) next[p.id] = 4000;
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
  }, [agencyId, start, end, statuses]);

  // Persist rates/salaries when they change
  useEffect(() => {
    const rateKey = `roi_rates_${agencyId || "all"}`;
    const salaryKey = `roi_salary_${agencyId || "all"}`;
    try {
      localStorage.setItem(rateKey, JSON.stringify(lobRates));
      localStorage.setItem(salaryKey, JSON.stringify(salaryByPerson));
    } catch (err) {
      console.error(err);
    }
  }, [lobRates, salaryByPerson, agencyId]);

  const computed = useMemo(() => {
    if (!data) return null;
    const rateByLob: Record<string, number> = {};
    lobs.forEach((l) => {
      rateByLob[l.id] = lobRates[l.id] ?? 0;
    });

    const rows = data.persons.map((p) => {
      const m = data.personMetrics[p.id] || { premium: 0, apps: 0, byLob: {} };
      const revenue = Object.entries(m.byLob).reduce((sum, [lobId, entry]) => sum + entry.premium * (rateByLob[lobId] ?? 0), 0);
      const comp = data.compByPerson[p.id] ?? 0;
      const salary = salaryByPerson[p.id] ?? 0;
      const net = revenue - comp - salary;
      return { ...p, metrics: m, revenue, comp, salary, net };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.premium += r.metrics.premium;
        acc.apps += r.metrics.apps;
        acc.revenue += r.revenue;
        acc.comp += r.comp;
        acc.salary += r.salary;
        acc.net += r.net;
        return acc;
      },
      { premium: 0, apps: 0, revenue: 0, comp: 0, salary: 0, net: 0 },
    );
    const roi = totals.revenue === 0 ? 0 : (totals.net / totals.revenue) * 100;

    const lobTable = data.lobTotals.map((lob) => {
      const rate = rateByLob[lob.id] ?? 0;
      return {
        ...lob,
        rate,
        revenue: lob.premium * rate,
      };
    });

    return { rows, totals, roi, lobTable };
  }, [data, lobRates, salaryByPerson, lobs]);

  const toggleStatus = (s: string) => {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  if (loading && !data) {
    return <div style={{ padding: 16 }}>Loading ROI…</div>;
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Agency</span>
          <select value={agencyId} onChange={(e) => setAgencyId(e.target.value)} style={inputStyle}>
            <option value="">All agencies</option>
            {agencies.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>Start</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>End</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
        </label>
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

      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
      {!loading && !data && !error && <div style={{ padding: 12, background: "#f1f5f9", borderRadius: 10 }}>No data for the selected range.</div>}

      {computed && (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <StatCard label="Revenue" value={computed.totals.revenue} color="#166534" />
            <StatCard label="Salaries" value={-computed.totals.salary} color="#b45309" />
            <StatCard label="Commissions" value={-computed.totals.comp} color="#b45309" />
            <StatCard label="Net" value={computed.totals.net} color={computed.totals.net >= 0 ? "#166534" : "#b91c1c"} />
            <StatCard label="ROI" value={computed.roi} suffix="%" color="#2563eb" />
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
                    <tr key={lob.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700 }}>{lob.name}</div>
                        <div style={{ fontSize: 12, color: "#475569" }}>{labelCategory(lob.premiumCategory)}</div>
                      </td>
                      <td style={tdStyle}>{formatMoney(lob.premium)}</td>
                      <td style={tdStyle}>{lob.apps}</td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          step="0.01"
                          value={lobRates[lob.id] ?? 0}
                          onChange={(e) => setLobRates({ ...lobRates, [lob.id]: Number(e.target.value) })}
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
                    <th style={thStyle}>Commission</th>
                    <th style={thStyle}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "#475569" }}>
                        No people found in this range.
                      </td>
                    </tr>
                  )}
                  {computed.rows.map((r) => (
                    <tr key={r.id}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 800 }}>{r.fullName}</div>
                        <div style={{ fontSize: 12, color: "#475569" }}>{r.teamType}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <span style={{ fontSize: 12, color: "#475569" }}>Salary</span>
                          <input
                            type="number"
                            value={salaryByPerson[r.id] ?? 0}
                            onChange={(e) => setSalaryByPerson({ ...salaryByPerson, [r.id]: Number(e.target.value) })}
                            style={{ ...inputStyle, maxWidth: 110 }}
                          />
                        </div>
                      </td>
                      <td style={tdStyle}>{r.metrics.apps}</td>
                      <td style={tdStyle}>{formatMoney(r.metrics.premium)}</td>
                      <td style={tdStyle}>{formatMoney(r.revenue)}</td>
                      <td style={tdStyle}>{formatMoney(r.salary)}</td>
                      <td style={tdStyle}>{formatMoney(r.comp)}</td>
                      <td style={{ ...tdStyle, fontWeight: 800, color: r.net >= 0 ? "#166534" : "#b91c1c" }}>{formatMoney(r.net)}</td>
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

function StatCard({ label, value, color, suffix = "" }: { label: string; value: number; color: string; suffix?: string }) {
  const display = suffix === "%" ? `${value.toFixed(1)}%` : formatMoney(value);
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
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
