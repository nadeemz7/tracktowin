"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

type MonthRow = {
  month: string;
  apps: number;
  premium: number;
  revenue: number;
  salary: number;
  commissionsPaid: number;
  commissionPaidFromComp: boolean;
  leadSpend: number;
  otherBonusesAuto: number;
  otherBonusesManual: number;
  marketingExpenses: number;
  net: number;
  roi: number;
};

type ApiResponse = {
  personId: string;
  personName: string;
  months: MonthRow[];
  error?: string;
};

const DEFAULT_STATUSES = ["WRITTEN", "ISSUED", "PAID"];

function formatMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function PersonROIClient({ personId }: { personId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!personId) return;
    setLoading(true);
    setError(null);
    fetch("/api/reports/roi/person", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId, monthsBack: 12, statuses: DEFAULT_STATUSES }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((json: ApiResponse) => setData(json))
      .catch((err) => setError(err?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [personId]);

  if (loading && !data) return <div style={{ padding: 16 }}>Loading...</div>;
  if (error) return <div style={{ padding: 16, color: "#b91c1c" }}>{error}</div>;
  if (!data) return <div style={{ padding: 16 }}>No data</div>;

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{data.personName}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Month</th>
              <th style={thStyle}>Apps</th>
              <th style={thStyle}>Premium</th>
              <th style={thStyle}>Revenue</th>
              <th style={thStyle}>Salary</th>
              <th style={thStyle}>Commission Paid</th>
              <th style={thStyle}>Lead Spend</th>
              <th style={thStyle}>Other bonuses (auto)</th>
              <th style={thStyle}>Other bonuses (manual)</th>
              <th style={thStyle}>Marketing</th>
              <th style={thStyle}>Net</th>
              <th style={thStyle}>ROI %</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month}>
                <td style={tdStyle}>{m.month}</td>
                <td style={tdStyle}>{m.apps}</td>
                <td style={tdStyle}>{formatMoney(m.premium)}</td>
                <td style={tdStyle}>{formatMoney(m.revenue)}</td>
                <td style={tdStyle}>{formatMoney(m.salary)}</td>
                <td style={tdStyle}>
                  <div>{formatMoney(m.commissionsPaid)}</div>
                  {m.commissionPaidFromComp ? <div style={{ color: "#475569", fontSize: 12 }}>(from comp)</div> : null}
                </td>
                <td style={tdStyle}>{formatMoney(m.leadSpend)}</td>
                <td style={tdStyle}>{formatMoney(m.otherBonusesAuto)}</td>
                <td style={tdStyle}>{formatMoney(m.otherBonusesManual)}</td>
                <td style={tdStyle}>{formatMoney(m.marketingExpenses)}</td>
                <td style={tdStyle}>{formatMoney(m.net)}</td>
                <td style={tdStyle}>{m.roi.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
