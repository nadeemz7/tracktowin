"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ErrorBoundary from "@/app/components/ErrorBoundary";

type SnapshotListItem = {
  id: string;
  createdAt: string;
  title?: string | null;
  startISO: string;
  endISO: string;
  statusesCSV: string;
};

export default function ReportSnapshotsPage() {
  const searchParams = useSearchParams();
  const reportType = searchParams.get("type") || "benchmarks";
  const [items, setItems] = useState<SnapshotListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reports/snapshots?type=${encodeURIComponent(reportType)}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load snapshots");
        }
        const json = (await res.json()) as SnapshotListItem[];
        if (!cancelled) setItems(json);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load snapshots");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reportType]);

  return (
    <ErrorBoundary>
      <div style={{ display: "grid", gap: 16 }}>
        <div className="surface" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Report Snapshots</div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Type: {reportType}</div>
        </div>

        {loading ? <div className="surface" style={{ padding: 12 }}>Loading…</div> : null}
        {error ? <div className="surface" style={{ padding: 12, color: "#b91c1c" }}>{error}</div> : null}

        <div className="surface" style={{ padding: 12 }}>
          {items.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No snapshots found.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: 8 }}>Created</th>
                    <th style={{ padding: 8 }}>Title</th>
                    <th style={{ padding: 8 }}>Range</th>
                    <th style={{ padding: 8 }}>Statuses</th>
                    <th style={{ padding: 8 }}>Link</th>
                    <th style={{ padding: 8 }}>Compare</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: 8 }}>{new Date(item.createdAt).toLocaleString()}</td>
                      <td style={{ padding: 8 }}>{item.title || "—"}</td>
                      <td style={{ padding: 8 }}>{item.startISO} → {item.endISO}</td>
                      <td style={{ padding: 8 }}>{item.statusesCSV || "—"}</td>
                      <td style={{ padding: 8 }}>
                        <a
                          href={`/reports/benchmarks/snapshot/${encodeURIComponent(item.id)}`}
                          style={{ color: "#2563eb", textDecoration: "none" }}
                        >
                          Open
                        </a>
                      </td>
                      <td style={{ padding: 8 }}>
                        <a
                          href={`/reports/benchmarks/compare?base=${encodeURIComponent(item.id)}`}
                          style={{ color: "#2563eb", textDecoration: "none" }}
                        >
                          Compare
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
