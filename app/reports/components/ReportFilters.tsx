"use client";

import { useEffect, useMemo, useState } from "react";
import { format, endOfMonth, startOfMonth, parseISO } from "date-fns";
import { RangePicker } from "../production/RangePicker";
import { PolicyStatus } from "@prisma/client";

export type ReportFiltersValue = {
  metric: "premium" | "apps";
  statuses: PolicyStatus[];
  businessOnly: boolean;
  agencyIds: string[];
  productIds: string[];
  topN: number;
  start: string;
  end: string;
  quickRange?: string;
  mustBeIssued?: boolean;
};

type Option = { value: string; label: string };
type ProductOption = Option & { lobName?: string };

type Props = {
  agencies: Option[];
  products: ProductOption[];
  initial: Partial<ReportFiltersValue>;
  onChange: (next: ReportFiltersValue) => void;
};

export function ReportFilters({ agencies, products, initial, onChange }: Props) {
  const initialStart = initial.start || format(startOfMonth(new Date()), "yyyy-MM-dd");
  const initialEnd = initial.end || format(endOfMonth(new Date()), "yyyy-MM-dd");

  const initialMonth = parseISO(initialStart || format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const inferredMode: "month" | "range" =
    initial.quickRange === "range" || initial.start || initial.end ? "range" : "month";
  const [filterMode, setFilterMode] = useState<"month" | "range">(inferredMode);
  const [monthIdx, setMonthIdx] = useState<number>(initialMonth.getMonth());
  const [year, setYear] = useState<number>(initialMonth.getFullYear());
  const [metric, setMetric] = useState<"premium" | "apps">(initial.metric || "premium");
  const defaultStatuses: PolicyStatus[] = [
    PolicyStatus.WRITTEN,
    PolicyStatus.ISSUED,
    PolicyStatus.PAID,
  ];
  const [statuses, setStatuses] = useState<PolicyStatus[]>(initial.statuses || defaultStatuses);
  const [businessOnly, setBusinessOnly] = useState<boolean>(initial.businessOnly || false);
  const [mustBeIssued, setMustBeIssued] = useState<boolean>(initial.mustBeIssued || false);
  const [agencyIds, setAgencyIds] = useState<string[]>(initial.agencyIds || []);
  const [productIds, setProductIds] = useState<string[]>(initial.productIds || []);
  const [topN, setTopN] = useState<number>(Number(initial.topN) || 8);
  const [start, setStart] = useState<string>(initialStart);
  const [end, setEnd] = useState<string>(initialEnd);
  const [quickRange, setQuickRange] = useState<string | undefined>(initial.quickRange);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showProductModal, setShowProductModal] = useState<boolean>(false);
  const [productSearch, setProductSearch] = useState<string>("");

  const statusOptions: PolicyStatus[] = [
    PolicyStatus.WRITTEN,
    PolicyStatus.ISSUED,
    PolicyStatus.PAID,
    PolicyStatus.STATUS_CHECK,
    PolicyStatus.CANCELLED,
  ];

  const statusIsDefault =
    statuses.length === defaultStatuses.length &&
    defaultStatuses.every((s) => statuses.includes(s));

  const productBuckets = useMemo(() => {
    const seenIds = new Set<string>();
    const lobMap = new Map<string, { lob: string; items: { label: string; ids: string[] }[] }>();

    products.forEach((p) => {
      if (seenIds.has(p.value)) return;
      seenIds.add(p.value);
      const lob = p.lobName || "Other / Unknown";
      if (!lobMap.has(lob)) lobMap.set(lob, { lob, items: [] });
      lobMap.get(lob)!.items.push({ label: p.label, ids: [p.value] });
    });

    return Array.from(lobMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([lob, data]) => ({
        lob,
        items: data.items.sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [products]);

  const filteredProductBuckets = useMemo(() => {
    if (!productSearch.trim()) return productBuckets;
    const term = productSearch.toLowerCase();
    return productBuckets
      .map((bucket) => {
        const items = bucket.items.filter(
          (item) => item.label.toLowerCase().includes(term) || bucket.lob.toLowerCase().includes(term)
        );
        return { ...bucket, items };
      })
      .filter((bucket) => bucket.items.length > 0);
  }, [productBuckets, productSearch]);

  // Emit whenever anything changes
  useEffect(() => {
    onChange({
      metric,
      statuses,
      businessOnly,
      mustBeIssued,
      agencyIds,
      productIds,
      topN,
      start,
      end,
      quickRange,
    });
  }, [metric, statuses, businessOnly, mustBeIssued, agencyIds, productIds, topN, start, end, quickRange, onChange]);

  const chips = (() => {
    const arr: { label: string; onClear: () => void }[] = [];
    arr.push({ label: metric === "premium" ? "Metric: Premium" : "Metric: Apps", onClear: () => setMetric("premium") });
    if (!statusIsDefault) {
      const statusLabel = statuses.length ? `Statuses: ${statuses.join(", ")}` : "Statuses: none";
      arr.push({ label: statusLabel, onClear: () => setStatuses(defaultStatuses) });
    }
    if (businessOnly) arr.push({ label: "Business only", onClear: () => setBusinessOnly(false) });
    if (mustBeIssued) arr.push({ label: "Must be issued", onClear: () => setMustBeIssued(false) });
    if (agencyIds.length) arr.push({ label: `Agencies: ${agencyIds.length}`, onClear: () => setAgencyIds([]) });
    if (productIds.length) arr.push({ label: `Products: ${productIds.length}`, onClear: () => setProductIds([]) });
    arr.push({
      label: filterMode === "month" ? `Month: ${format(new Date(year, monthIdx, 1), "MMMM yyyy")}` : `Range: ${start} → ${end}`,
      onClear: () => {
        setQuickRange(undefined);
        const today = new Date();
        setMonthIdx(today.getMonth());
        setYear(today.getFullYear());
        setStart(format(startOfMonth(today), "yyyy-MM-dd"));
        setEnd(format(endOfMonth(today), "yyyy-MM-dd"));
        setFilterMode("month");
      },
    });
    return arr;
  })();

  const productSelectionState = (ids: string[]) => {
    const selectedCount = ids.filter((id) => productIds.includes(id)).length;
    return {
      checked: selectedCount === ids.length,
      partial: selectedCount > 0 && selectedCount < ids.length,
    };
  };

  function toggleProductGroup(ids: string[]) {
    setProductIds((prev) => {
      const next = new Set(prev);
      const fullySelected = ids.every((id) => next.has(id));
      ids.forEach((id) => (fullySelected ? next.delete(id) : next.add(id)));
      return Array.from(next);
    });
  }

  function toggleStatus(st: PolicyStatus) {
    setStatuses((prev) => (prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]));
  }

  function syncMonthRange(nextMonth: number, nextYear: number) {
    const nextStart = format(startOfMonth(new Date(nextYear, nextMonth, 1)), "yyyy-MM-dd");
    const nextEnd = format(endOfMonth(new Date(nextYear, nextMonth, 1)), "yyyy-MM-dd");
    setStart(nextStart);
    setEnd(nextEnd);
  }

  const handleModeMonth = () => {
    setFilterMode("month");
    syncMonthRange(monthIdx, year);
    setQuickRange(undefined);
  };

  const handleModeRange = () => {
    setFilterMode("range");
    setQuickRange(undefined);
  };

  const handleMonthChange = (next: number) => {
    setMonthIdx(next);
    if (filterMode === "month") {
      syncMonthRange(next, year);
    }
  };

  const handleYearChange = (next: number) => {
    setYear(next);
    if (filterMode === "month") {
      syncMonthRange(monthIdx, next);
    }
  };

  const today = new Date();
  const quickRanges = [
    {
      label: "Last Month",
      key: "last-month",
      set: () => {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        setFilterMode("range");
        setQuickRange("last-month");
        setStart(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
        setEnd(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
      },
    },
    {
      label: "Yesterday",
      key: "yesterday",
      set: () => {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        const iso = format(y, "yyyy-MM-dd");
        setFilterMode("range");
        setQuickRange("yesterday");
        setStart(iso);
        setEnd(iso);
      },
    },
    {
      label: "Today",
      key: "today",
      set: () => {
        const iso = format(today, "yyyy-MM-dd");
        setFilterMode("range");
        setQuickRange("today");
        setStart(iso);
        setEnd(iso);
      },
    },
    {
      label: "This Month",
      key: "this-month",
      set: () => {
        setFilterMode("range");
        setQuickRange("this-month");
        setStart(format(startOfMonth(today), "yyyy-MM-dd"));
        setEnd(format(endOfMonth(today), "yyyy-MM-dd"));
      },
    },
  ];

  const advancedActiveCount =
    (statusIsDefault ? 0 : 1) +
    (agencyIds.length ? 1 : 0) +
    (productIds.length ? 1 : 0) +
    (businessOnly ? 1 : 0) +
    (mustBeIssued ? 1 : 0) +
    (topN !== 8 ? 1 : 0);

  const rangeLabel =
    filterMode === "month"
      ? format(new Date(year, monthIdx, 1), "MMMM yyyy")
      : `${start} → ${end}`;

  const selectedStatusLabel =
    statusIsDefault
      ? "Default: Written/Issued/Paid"
      : statuses.length === statusOptions.length
      ? "All statuses"
      : statuses.length
      ? `${statuses.length} selected`
      : "No statuses selected";

  const selectedAgenciesLabel = agencyIds.length ? `${agencyIds.length} selected` : "All agencies";
  const selectedProductsLabel = productIds.length ? `${productIds.length} selected` : "All products";

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="surface" style={{ padding: 12, borderRadius: 12, display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: 2 }}>
              <div style={{ fontWeight: 800 }}>Filters</div>
              <div style={{ fontSize: 12, color: "#475569" }}>
                Top-line controls first; advanced holds products + top N.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#475569" }}>
                {rangeLabel} - {metric === "premium" ? "Premium" : "Apps"}
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => setShowAdvanced((v) => !v)}
                style={{
                  borderColor: showAdvanced ? "#2563eb" : "#e5e7eb",
                  background: showAdvanced ? "rgba(37,99,235,0.08)" : "white",
                }}
              >
                {showAdvanced ? "Hide advanced" : "Advanced ▾"}
                {advancedActiveCount ? ` (${advancedActiveCount})` : ""}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", alignItems: "start" }}>
            {/* Metric */}
            <div className="surface" style={{ padding: 10, borderRadius: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Metric</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`btn ${metric === "apps" ? "primary" : ""}`}
                  onClick={() => setMetric("apps")}
                  style={{ padding: "8px 12px" }}
                >
                  Apps
                </button>
                <button
                  type="button"
                  className={`btn ${metric === "premium" ? "primary" : ""}`}
                  onClick={() => setMetric("premium")}
                  style={{ padding: "8px 12px" }}
                >
                  Premium
                </button>
              </div>
            </div>

            {/* Quick range */}
            <div className="surface" style={{ padding: 10, borderRadius: 10, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Quick range</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {quickRanges.map((qr) => (
                  <button
                    key={qr.label}
                    type="button"
                    onClick={qr.set}
                    className={`btn ${quickRange === qr.key ? "primary" : ""}`}
                    style={{ padding: "6px 10px", fontSize: 12 }}
                  >
                    {qr.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className={`btn ${filterMode === "month" ? "primary" : ""}`}
                  onClick={handleModeMonth}
                  style={{ padding: "6px 10px" }}
                >
                  Month picker
                </button>
                <button
                  type="button"
                  className={`btn ${filterMode === "range" ? "primary" : ""}`}
                  onClick={handleModeRange}
                  style={{ padding: "6px 10px" }}
                >
                  Custom range
                </button>
              </div>
              {filterMode === "month" ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <select
                    value={monthIdx}
                    onChange={(e) => handleMonthChange(Number(e.target.value))}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb" }}
                  >
                    {Array.from({ length: 12 }).map((_, i) => (
                      <option key={i} value={i}>
                        {format(new Date(2025, i, 1), "MMMM")}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => handleYearChange(Number(e.target.value))}
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #e5e7eb", width: 100 }}
                  />
                </div>
              ) : (
                <RangePicker
                  nameStart="start"
                  nameEnd="end"
                  initialStart={start}
                  initialEnd={end}
                  onChange={(s, e) => {
                    setQuickRange(undefined);
                    setStart(s);
                    setEnd(e);
                  }}
                />
              )}
            </div>

            {/* Agencies */}
            <div className="surface" style={{ padding: 10, borderRadius: 10, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Agencies</div>
              <div className="surface" style={{ borderRadius: 10, border: "1px solid #e5e7eb", padding: 8, maxHeight: 180, overflow: "auto" }}>
                {agencies.length === 0 ? <div style={{ color: "#6b7280" }}>No agencies found.</div> : null}
                {agencies.map((a) => (
                  <label key={a.value} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={agencyIds.includes(a.value)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAgencyIds((prev) =>
                          checked ? [...prev, a.value] : prev.filter((id) => id !== a.value)
                        );
                      }}
                    />
                    <span>{a.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Statuses dropdown */}
            <div className="surface" style={{ padding: 10, borderRadius: 10, display: "grid", gap: 8 }}>
              <details open style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "#fff" }}>
                <summary style={{ cursor: "pointer", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Statuses ▾</span>
                  <span style={{ fontSize: 12, color: "#475569" }}>{selectedStatusLabel}</span>
                </summary>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {statusOptions.map((st) => {
                    const active = statuses.includes(st);
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => toggleStatus(st)}
                        className={`btn ${active ? "primary" : ""}`}
                        style={{ padding: "6px 10px" }}
                      >
                        {active ? "✓ " : ""}{st}
                      </button>
                    );
                  })}
                  <button type="button" className="btn" onClick={() => setStatuses(defaultStatuses)} style={{ padding: "6px 10px" }}>
                    Default
                  </button>
                </div>
              </details>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={businessOnly} onChange={(e) => setBusinessOnly(e.target.checked)} />
                  Business only
                </label>
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={mustBeIssued} onChange={(e) => setMustBeIssued(e.target.checked)} />
                  Policy must be issued
                </label>
              </div>
            </div>
          </div>
        </div>

        {showAdvanced && (
          <div
            className="surface"
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px dashed #d1d5db",
              background: "#f8fafc",
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 700 }}>Advanced</div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>Products</div>
                    <div style={{ fontSize: 12, color: "#475569" }}>
                      {productIds.length ? `${productIds.length} selected` : "Top products (auto)"}
                    </div>
                  </div>
                  <button type="button" className="btn" onClick={() => setProductIds([])} style={{ padding: "6px 10px" }}>
                    Clear
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowProductModal(true)}
                    style={{ justifyContent: "space-between", display: "inline-flex", alignItems: "center", padding: "10px 12px" }}
                  >
                    Filter products
                    <span style={{ color: "#475569", marginLeft: 8 }}>
                      {productIds.length ? `${productIds.length} selected` : "Top products"}
                    </span>
                  </button>
                  <span style={{ fontSize: 12, color: "#475569" }}>
                    Leave empty to use Top products by metric.
                  </span>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>Top N</span>
                    <input
                      type="number"
                      min={1}
                      value={topN}
                      onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 1))}
                      style={{ width: 80, padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {chips.map((c, idx) => (
          <span
            key={idx}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              background: "#f3f4f6",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              fontSize: 12,
            }}
          >
            {c.label}
            <button
              type="button"
              onClick={c.onClear}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 700 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      {showProductModal && (
        <ProductModal
          buckets={filteredProductBuckets}
          productIds={productIds}
          onToggleGroup={toggleProductGroup}
          onClose={() => setShowProductModal(false)}
          onClear={() => setProductIds([])}
          search={productSearch}
          onSearch={setProductSearch}
          selectionState={productSelectionState}
        />
      )}
    </div>
  );
}

// Modal is defined in-file to keep dependencies light and match the lightweight VisualBonus-style interaction.

function ProductModal({
  buckets,
  productIds,
  onToggleGroup,
  onClose,
  onClear,
  search,
  onSearch,
  selectionState,
}: {
  buckets: { lob: string; items: { label: string; ids: string[] }[] }[];
  productIds: string[];
  onToggleGroup: (ids: string[]) => void;
  onClose: () => void;
  onClear: () => void;
  search: string;
  onSearch: (next: string) => void;
  selectionState: (ids: string[]) => { checked: boolean; partial: boolean };
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        className="surface"
        style={{
          width: "min(960px, 100%)",
          maxHeight: "80vh",
          overflow: "auto",
          borderRadius: 14,
          padding: 16,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800 }}>Filter products</div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              Leave empty to use Top products automatically.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={onClear}>
              Clear all
            </button>
            <button type="button" className="btn primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Search products or LoB"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              fontSize: 14,
            }}
          />
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {buckets.length === 0 ? (
            <div style={{ color: "#6b7280" }}>No products match your search.</div>
          ) : (
            buckets.map((bucket) => {
              const selectedCount = bucket.items.reduce(
                (acc, item) => acc + item.ids.filter((id) => productIds.includes(id)).length,
                0
              );
              const bucketTotal = bucket.items.reduce((acc, item) => acc + item.ids.length, 0);
              return (
                <details
                  key={bucket.lob}
                  open={bucket.items.length <= 4 || selectedCount > 0}
                  style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 8, background: "#fff" }}
                >
                  <summary style={{ cursor: "pointer", fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{bucket.lob}</span>
                    <span style={{ color: "#475569", fontSize: 12 }}>
                      {selectedCount ? `${selectedCount}/${bucketTotal} selected` : `${bucket.items.length} products`}
                    </span>
                  </summary>
                  <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                    {bucket.items.map((item) => {
                      const state = selectionState(item.ids);
                      return (
                        <label
                          key={`${bucket.lob}-${item.label}`}
                          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={state.checked}
                            aria-checked={state.partial ? "mixed" : state.checked ? "true" : "false"}
                            onChange={() => onToggleGroup(item.ids)}
                          />
                          <span style={{ fontWeight: 600 }}>{item.label}</span>
                          {state.partial && <span style={{ fontSize: 11, color: "#b45309" }}>partial</span>}
                        </label>
                      );
                    })}
                  </div>
                </details>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
