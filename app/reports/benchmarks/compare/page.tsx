"use client";

import { useEffect, useState } from "react";
import { BenchmarksReportView } from "../BenchmarksPageClient";
import type { ReportResponse } from "../BenchmarksPageClient";
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

export default function BenchmarksComparePage() {
  const [baseSnapshotId, setBaseSnapshotId] = useState("");
  const [compareSnapshotId, setCompareSnapshotId] = useState("");
  const [options, setOptions] = useState<SnapshotListItem[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [baseSnapshot, setBaseSnapshot] = useState<SnapshotResponse | null>(null);
  const [baseLoading, setBaseLoading] = useState(false);
  const [baseError, setBaseError] = useState<string | null>(null);

  const [compareSnapshot, setCompareSnapshot] = useState<SnapshotResponse | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const baseId = params.get("base") ?? "";
    const compareId = params.get("compare") ?? "";
    if (baseId) setBaseSnapshotId(baseId);
    if (compareId && compareId !== baseId) setCompareSnapshotId(compareId);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (baseSnapshotId) {
      url.searchParams.set("base", baseSnapshotId);
    } else {
      url.searchParams.delete("base");
    }
    if (compareSnapshotId) {
      url.searchParams.set("compare", compareSnapshotId);
    } else {
      url.searchParams.delete("compare");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [baseSnapshotId, compareSnapshotId]);

  useEffect(() => {
    if (baseSnapshotId && compareSnapshotId && baseSnapshotId === compareSnapshotId) {
      setCompareSnapshotId("");
    }
  }, [baseSnapshotId, compareSnapshotId]);

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      setOptionsLoading(true);
      setOptionsError(null);
      try {
        const res = await fetch("/api/reports/snapshots?type=benchmarks");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load snapshot options");
        }
        const json = (await res.json()) as SnapshotListItem[];
        if (!cancelled) setOptions(json);
      } catch (err: any) {
        if (!cancelled) setOptionsError(err?.message || "Failed to load snapshot options");
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    }
    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!baseSnapshotId) {
      setBaseSnapshot(null);
      setBaseError("Base snapshot is required.");
      setBaseLoading(false);
      return;
    }
    let cancelled = false;
    async function loadBase() {
      setBaseLoading(true);
      setBaseError(null);
      try {
        const res = await fetch(`/api/reports/snapshots/${encodeURIComponent(baseSnapshotId)}`);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load base snapshot");
        }
        const json = (await res.json()) as SnapshotResponse;
        if (json.reportType !== "benchmarks") {
          throw new Error("Base snapshot is not a benchmarks snapshot.");
        }
        if (!cancelled) setBaseSnapshot(json);
      } catch (err: any) {
        if (!cancelled) {
          setBaseSnapshot(null);
          setBaseError(err?.message || "Failed to load base snapshot");
        }
      } finally {
        if (!cancelled) setBaseLoading(false);
      }
    }
    loadBase();
    return () => {
      cancelled = true;
    };
  }, [baseSnapshotId]);

  useEffect(() => {
    if (!compareSnapshotId) {
      setCompareSnapshot(null);
      setCompareError(null);
      setCompareLoading(false);
      return;
    }
    let cancelled = false;
    async function loadCompare() {
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
            setCompareError("Compare snapshot is not a benchmarks snapshot.");
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
    loadCompare();
    return () => {
      cancelled = true;
    };
  }, [compareSnapshotId]);

  const baseTitle = baseSnapshot
    ? (baseSnapshot.title?.trim() || `Benchmarks: ${baseSnapshot.startISO} to ${baseSnapshot.endISO}`)
    : "Benchmarks Compare";
  const baseMeta = baseSnapshot
    ? `${baseSnapshot.startISO} to ${baseSnapshot.endISO} | ${baseSnapshot.statuses.join(", ")}`
    : "";

  return (
    <ErrorBoundary>
      <div style={{ display: "grid", gap: 16 }}>
        <div className="surface" style={{ padding: 12 }}>
          <div style={{ fontWeight: 800 }}>{baseTitle}</div>
          {baseMeta ? <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>{baseMeta}</div> : null}
          <div style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: 520 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor="base-snapshot" style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>
                Base snapshot
              </label>
              <select
                id="base-snapshot"
                value={baseSnapshotId}
                onChange={(e) => setBaseSnapshotId(e.target.value)}
                disabled={optionsLoading}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="">Select base snapshot</option>
                {options.map((item) => {
                  const rangeLabel = `${item.startISO} to ${item.endISO}`;
                  const title = item.title?.trim() || rangeLabel;
                  const createdAt = new Date(item.createdAt).toLocaleDateString();
                  return (
                    <option key={item.id} value={item.id}>
                      {title} - {createdAt}
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor="compare-snapshot" style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>
                Compare snapshot
              </label>
              <select
                id="compare-snapshot"
                value={compareSnapshotId}
                onChange={(e) => setCompareSnapshotId(e.target.value)}
                disabled={optionsLoading}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb" }}
              >
                <option value="">None</option>
                {options.filter((item) => item.id !== baseSnapshotId).map((item) => {
                  const rangeLabel = `${item.startISO} to ${item.endISO}`;
                  const title = item.title?.trim() || rangeLabel;
                  const createdAt = new Date(item.createdAt).toLocaleDateString();
                  return (
                    <option key={item.id} value={item.id}>
                      {title} - {createdAt}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {optionsLoading ? <div className="surface" style={{ padding: 12 }}>Loading options...</div> : null}
        {optionsError ? <div className="surface" style={{ padding: 12, color: "#b91c1c" }}>{optionsError}</div> : null}

        {baseLoading ? <div className="surface" style={{ padding: 12 }}>Loading base snapshot...</div> : null}
        {baseError ? <div className="surface" style={{ padding: 12, color: "#b91c1c" }}>{baseError}</div> : null}

        {compareLoading ? <div className="surface" style={{ padding: 12 }}>Loading compare snapshot...</div> : null}
        {compareError ? <div className="surface" style={{ padding: 12, color: "#b91c1c" }}>{compareError}</div> : null}

        {baseSnapshot ? (
          <BenchmarksReportView
            payload={baseSnapshot.payload}
            startISO={baseSnapshot.startISO}
            endISO={baseSnapshot.endISO}
            statuses={baseSnapshot.statuses}
            comparePayload={compareSnapshot?.payload ?? null}
            readOnly
          />
        ) : null}
      </div>
    </ErrorBoundary>
  );
}
