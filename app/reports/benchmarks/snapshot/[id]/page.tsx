"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BenchmarksReportView } from "../../BenchmarksPageClient";
import type { ReportResponse } from "../../BenchmarksPageClient";
import ErrorBoundary from "@/app/components/ErrorBoundary";

type SnapshotResponse = {
  id: string;
  createdAt: string;
  title?: string | null;
  reportType: string;
  startISO: string;
  endISO: string;
  statuses: string[];
  payload: ReportResponse;
  meta?: { generatedAt?: string; version?: number } | null;
};

type SnapshotListItem = {
  id: string;
  createdAt: string;
  title?: string | null;
  startISO: string;
  endISO: string;
};

export default function BenchmarksSnapshotPage() {
  const params = useParams();
  const snapshotId = typeof params?.id === "string" ? params.id : "";
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareSnapshotId, setCompareSnapshotId] = useState("");
  const [compareSnapshot, setCompareSnapshot] = useState<SnapshotResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareOptions, setCompareOptions] = useState<SnapshotListItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const initialCompareId = params.get("compareSnapshotId") ?? "";
    if (initialCompareId) {
      setCompareSnapshotId(initialCompareId);
    }
    function handlePopstate() {
      const nextCompareId = new URLSearchParams(window.location.search).get("compareSnapshotId") ?? "";
      if (!nextCompareId) setCompareError(null);
      setCompareSnapshotId((current) => (current === nextCompareId ? current : nextCompareId));
    }
    window.addEventListener("popstate", handlePopstate);
    return () => {
      window.removeEventListener("popstate", handlePopstate);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const currentCompareId = url.searchParams.get("compareSnapshotId") ?? "";
    if (compareSnapshotId) {
      if (currentCompareId !== compareSnapshotId) {
        url.searchParams.set("compareSnapshotId", compareSnapshotId);
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
      return;
    }
    if (currentCompareId) {
      url.searchParams.delete("compareSnapshotId");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [compareSnapshotId]);

  useEffect(() => {
    if (!snapshotId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reports/snapshots/${encodeURIComponent(snapshotId)}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load snapshot");
        }
        const json = (await res.json()) as SnapshotResponse;
        if (!cancelled) setSnapshot(json);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Failed to load snapshot");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [snapshotId]);

  useEffect(() => {
    if (!snapshotId) return;
    let cancelled = false;
    async function loadOptions() {
      try {
        const res = await fetch("/api/reports/snapshots?type=benchmarks");
        if (!res.ok) return;
        const json = (await res.json()) as SnapshotListItem[];
        if (!cancelled) {
          setCompareOptions(json.filter((item) => item.id !== snapshotId));
        }
      } catch {
        if (!cancelled) setCompareOptions([]);
      }
    }
    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [snapshotId]);

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

  const rangeMismatch = !!snapshot &&
    !!compareSnapshot &&
    (compareSnapshot.startISO !== snapshot.startISO || compareSnapshot.endISO !== snapshot.endISO);
  const statusesMismatch = !!snapshot &&
    !!compareSnapshot &&
    (() => {
      const baseStatuses = new Set(snapshot.statuses);
      const compareStatuses = new Set(compareSnapshot.statuses);
      if (baseStatuses.size !== compareStatuses.size) return true;
      for (const status of baseStatuses) {
        if (!compareStatuses.has(status)) return true;
      }
      return false;
    })();
  const mismatchLabels: string[] = [];
  if (rangeMismatch) mismatchLabels.push("Date range");
  if (statusesMismatch) mismatchLabels.push("Statuses");
  const mismatchNote = mismatchLabels.map((label) => `[${label}]`).join(" ");

  return (
    <ErrorBoundary>
      <div style={{ display: "grid", gap: 16 }}>
        <div className="surface" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>
            {snapshot
              ? (snapshot.title?.trim() || `Benchmarks: ${snapshot.startISO} to ${snapshot.endISO}`)
              : "Benchmarks Snapshot"}
          </div>
          {snapshot ? (
            <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
              {snapshot.startISO} → {snapshot.endISO} • {snapshot.statuses.join(", ")}
            </div>
          ) : null}
          {snapshot ? (
            <div style={{ marginTop: 12, display: "grid", gap: 6, maxWidth: 420 }}>
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
              {compareError ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{compareError}</div> : null}
              {compareSnapshot && mismatchLabels.length ? (
                <div style={{ color: "#6b7280", fontSize: 12 }}>
                  Note: Comparing against a snapshot with different filters: {mismatchNote}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {loading ? <div className="surface" style={{ padding: 12 }}>Loading…</div> : null}
        {error ? <div className="surface" style={{ padding: 12, color: "#b91c1c" }}>{error}</div> : null}

        {snapshot ? (
          <BenchmarksReportView
            payload={snapshot.payload}
            startISO={snapshot.startISO}
            endISO={snapshot.endISO}
            statuses={snapshot.statuses}
            comparePayload={compareSnapshot?.payload ?? null}
            readOnly
          />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}
