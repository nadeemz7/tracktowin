"use client";

import { useEffect, useMemo, useState } from "react";
import ProductionOverviewClient from "./ProductionOverviewClient";
import { ReportFilters, ReportFiltersValue } from "../components/ReportFilters";

type Option = { value: string; label: string };
type ProductOption = Option & { lobName?: string };

type PremiumCategory = "PC" | "FS" | "IPS";

type ProductionResponse = {
  meta: { rangeLabel: string; statuses: string[]; topProductsApplied?: boolean; topProductIds?: string[]; topN?: number };
  lobNames: string[];
  persons: {
    name: string;
    totalApps: number;
    totalPremium: number;
    lobCounts: Record<string, { apps: number; premium: number }>;
  }[];
  totals: { totalApps: number; totalPremium: number; businessApps: number; businessPremium: number };
  monthLabels: string[];
  series: { name: string; data: number[] }[];
  lobTotals: { name: string; apps: number; premium: number }[];
  trendByAgencyCategory?: {
    labels: string[];
    series: {
      agencyId: string;
      agencyName: string;
      category: PremiumCategory;
      apps: number[];
      premium: number[];
    }[];
  };
};

type Props = {
  agencies: Option[];
  products: ProductOption[];
};

export default function ProductionOverviewDashboard({ agencies, products }: Props) {
  const [filters, setFilters] = useState<ReportFiltersValue>({
    metric: "premium",
    statuses: [],
    businessOnly: false,
    agencyIds: [],
    productIds: [],
    topN: 8,
    start: "",
    end: "",
    mustBeIssued: false,
  });
  const [data, setData] = useState<ProductionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const agencyLookup = useMemo(() => new Map(agencies.map((a) => [a.value, a.label])), [agencies]);
  const productLookup = useMemo(() => new Map(products.map((p) => [p.value, p.label])), [products]);

  useEffect(() => {
    // Wait until we have start/end from RangePicker
    if (!filters.start || !filters.end) return;
    const params = new URLSearchParams();
    params.set("metric", filters.metric);
    params.set("start", filters.start);
    params.set("end", filters.end);
    if (filters.statuses.length) params.set("statuses", filters.statuses.join(","));
    if (filters.agencyIds.length) params.set("agencies", filters.agencyIds.join(","));
    if (filters.productIds.length) params.set("products", filters.productIds.join(","));
    if (filters.topN) params.set("top", String(filters.topN));
    if (filters.businessOnly) params.set("businessOnly", "1");
    if (filters.mustBeIssued) params.set("mustBeIssued", "1");

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/reports/production?${params.toString()}`)
      .then((r) => r.json())
      .then((json) => setData(json))
      .finally(() => setLoading(false));
  }, [filters]);

  const agencyNames = filters.agencyIds.map((id) => agencyLookup.get(id) || id);
  const productNames = filters.productIds.map((id) => productLookup.get(id) || id);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ReportFilters
        agencies={agencies}
        products={products}
        initial={filters}
        onChange={(next) => setFilters(next)}
      />

      {loading && <div className="surface" style={{ padding: 12 }}>Loading…</div>}
      {!loading && data && (
        <ProductionOverviewClient
          metric={filters.metric}
          data={data}
          agencyFilter={agencyNames}
          productFilter={productNames}
          selectedAgencyIds={filters.agencyIds}
        />
      )}
    </div>
  );
}
