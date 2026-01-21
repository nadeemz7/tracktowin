import { AppShell } from "@/app/components/AppShell";
import { DatePicker1RangeClient, ResetFiltersButton } from "@/app/components/DatePicker1RangeClient";
import { NewSoldProductForm } from "@/app/sold-products/NewSoldProductForm";
import {
  createSoldProduct,
  updateSoldProduct,
  deleteSoldProduct,
  updateHousehold,
  updatePolicyQuick,
  updateStatusQuick,
} from "./actions";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import { PolicyStatus, PremiumCategory } from "@prisma/client";
import { endOfMonth, format, formatISO, startOfMonth, startOfQuarter, startOfYear, subDays, subMonths } from "date-fns";
import { MultiCheck } from "./MultiCheck";
import { AutoSubmit } from "./AutoSubmit";
import Link from "next/link";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SoldProductsPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) || {};

  const toArray = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v : (v || "").split(","))
      .map((s) => s.trim())
      .filter(Boolean);
  const getParamValue = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const selectedAgencyIds = toArray(sp.agencies ?? sp.agencyId);
  const today = new Date();
  const startDefault = formatISO(subDays(today, 30), { representation: "date" });
  const endDefault = formatISO(today, { representation: "date" });
  const startDateStr =
    (typeof sp.start === "string" ? sp.start : undefined) ||
    (typeof sp.dateFrom === "string" ? sp.dateFrom : undefined) ||
    startDefault;
  const endDateStr =
    (typeof sp.end === "string" ? sp.end : undefined) ||
    (typeof sp.dateTo === "string" ? sp.dateTo : undefined) ||
    endDefault;
  const todayStr = format(today, "yyyy-MM-dd");
  const thisMonthStartStr = format(startOfMonth(today), "yyyy-MM-dd");
  const lastMonth = subMonths(today, 1);
  const lastMonthStartStr = format(startOfMonth(lastMonth), "yyyy-MM-dd");
  const lastMonthEndStr = format(endOfMonth(lastMonth), "yyyy-MM-dd");
  const qtdStartStr = format(startOfQuarter(today), "yyyy-MM-dd");
  const ytdStartStr = format(startOfYear(today), "yyyy-MM-dd");
  const datePresets = [
    { key: "today", label: "Today", start: todayStr, end: todayStr },
    { key: "this-month", label: "This Month", start: thisMonthStartStr, end: todayStr },
    { key: "last-month", label: "Last Month", start: lastMonthStartStr, end: lastMonthEndStr },
    { key: "qtd", label: "QTD", start: qtdStartStr, end: todayStr },
    { key: "ytd", label: "YTD", start: ytdStartStr, end: todayStr },
  ];
  const resetClearKeys = [
    "q",
    "agencies",
    "agencyId",
    "statuses",
    "status",
    "personId",
    "soldByPersonId",
    "lob",
    "lobId",
    "premiumCategory",
    "businessOnly",
  ];
  const businessOnly = sp.businessOnly === "1";
  const statusFilter = toArray(sp.statuses ?? sp.status) as PolicyStatus[];
  const personFilter =
    (typeof sp.personId === "string" ? sp.personId : "") ||
    (typeof sp.soldByPersonId === "string" ? sp.soldByPersonId : "");
  const selectedLobNames = toArray(sp.lob);
  const selectedLobIds = toArray(sp.lobId);
  const premiumCategoryFilter =
    typeof sp.premiumCategory === "string" ? sp.premiumCategory.trim().toUpperCase() : "";
  const sortKey = typeof sp.sort === "string" ? sp.sort : "";
  const sortDir = (typeof sp.dir === "string" ? sp.dir : "desc") as "asc" | "desc";

  function sortBy<T>(arr: T[], getter: (item: T) => string | number | Date, dir: "asc" | "desc") {
    const sorted = [...arr];
    const normalize = (value: string | number | Date) => {
      if (value instanceof Date) return value.getTime();
      if (typeof value === "number") return value;
      return value.toLowerCase();
    };
    sorted.sort((a, b) => {
      const aValue = normalize(getter(a));
      const bValue = normalize(getter(b));
      if (aValue < bValue) return dir === "asc" ? -1 : 1;
      if (aValue > bValue) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }

  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId ?? null;
  if (!orgId) {
    return (
      <AppShell title="Unauthorized">
        <div>Unauthorized.</div>
      </AppShell>
    );
  }

  const agencies = await prisma.agency.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: {
      valuePolicyDefaults: true,
    },
  });
  const lobs = await prisma.lineOfBusiness.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: { products: { orderBy: { name: "asc" } } },
  });
  const people = await prisma.person.findMany({ where: { orgId }, orderBy: { fullName: "asc" } });
  const agenciesWithLobs = agencies.map((agency) => ({ ...agency, linesOfBusiness: lobs }));

  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const preselectHouseholdId = (sp.householdId || "").trim();
  const openFlag = sp.open === "1";
  const startParam = getParamValue(sp.start);
  const endParam = getParamValue(sp.end);
  const dateFromParam = getParamValue(sp.dateFrom);
  const dateToParam = getParamValue(sp.dateTo);
  const startKey = startParam ? "start" : dateFromParam ? "dateFrom" : "";
  const endKey = endParam ? "end" : dateToParam ? "dateTo" : "";
  const personParamKey =
    typeof sp.personId === "string"
      ? "personId"
      : typeof sp.soldByPersonId === "string"
        ? "soldByPersonId"
        : "personId";
  const returnToParams = new URLSearchParams();
  if (startKey) returnToParams.set(startKey, startDateStr);
  if (endKey) returnToParams.set(endKey, endDateStr);
  if (selectedAgencyIds.length) {
    returnToParams.set(sp.agencies != null ? "agencies" : "agencyId", selectedAgencyIds.join(","));
  }
  if (statusFilter.length) {
    returnToParams.set(sp.statuses != null ? "statuses" : "status", statusFilter.join(","));
  }
  if (personFilter) {
    returnToParams.set(personParamKey, personFilter);
  }
  if (selectedLobIds.length) returnToParams.set("lobId", selectedLobIds.join(","));
  if (selectedLobNames.length) returnToParams.set("lob", selectedLobNames.join(","));
  if (premiumCategoryFilter) returnToParams.set("premiumCategory", premiumCategoryFilter);
  if (businessOnly) returnToParams.set("businessOnly", "1");
  if (q) returnToParams.set("q", q);
  const householdIdParam = typeof sp.householdId === "string" ? sp.householdId.trim() : "";
  if (householdIdParam) returnToParams.set("householdId", householdIdParam);
  const openParam = typeof sp.open === "string" ? sp.open.trim() : "";
  if (openParam) returnToParams.set("open", openParam);
  if (sortKey) {
    returnToParams.set("sort", sortKey);
    returnToParams.set("dir", sortDir);
  }
  const returnToQuery = returnToParams.toString();
  const returnTo = returnToQuery ? `/sold-products?${returnToQuery}` : "/sold-products";
  const renderReturnToInput = () =>
    returnToQuery ? <input type="hidden" name="returnTo" value={returnTo} /> : null;
  const renderCurrentQueryHiddenInputs = () =>
    Array.from(returnToParams.entries()).map(([key, value]) => (
      <input key={`${key}-${value}`} type="hidden" name={key} value={value} />
    ));
  const sortIndicator = (key: string) =>
    sortKey === key ? (sortDir === "asc" ? " ^" : " v") : "";
  const buildSortHref = (key: string) => {
    const params = new URLSearchParams(returnToParams);
    const nextDir = sortKey === key && sortDir === "asc" ? "desc" : "asc";
    params.set("sort", key);
    params.set("dir", nextDir);
    const query = params.toString();
    return query ? `/sold-products?${query}` : "/sold-products";
  };

  const households =
    q
      ? await prisma.household.findMany({
          where: {
            ...(selectedAgencyIds.length ? { agencyId: { in: selectedAgencyIds } } : {}),
            OR: [
              { firstName: { contains: q, mode: "insensitive" as const } },
              { lastName: { contains: q, mode: "insensitive" as const } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          take: 20,
          include: { agency: true },
        })
      : [];

  const preselectedHousehold = preselectHouseholdId
    ? await prisma.household.findUnique({
        where: { id: preselectHouseholdId },
        include: { agency: true },
      })
    : null;

  const householdOptionsMap = new Map<string, (typeof households)[number]>();
  if (preselectedHousehold) {
    householdOptionsMap.set(preselectedHousehold.id, preselectedHousehold);
  }
  for (const h of households) {
    if (!householdOptionsMap.has(h.id)) {
      householdOptionsMap.set(h.id, h);
    }
  }
  const householdOptions = Array.from(householdOptionsMap.values());

  // Collect unique LoBs for filter display
  const lobOptions = Array.from(
    new Map(
      lobs.map((lob) => [lob.id, { id: lob.id, name: lob.name }])
    ).values()
  );

  const openByDefault = openFlag || !!preselectedHousehold || !!q;

  const lobWhere: any = {};
  if (selectedLobNames.length) lobWhere.name = { in: selectedLobNames };
  if (premiumCategoryFilter) lobWhere.premiumCategory = premiumCategoryFilter as PremiumCategory;

  const productFilters =
    selectedLobIds.length || selectedLobNames.length || businessOnly || premiumCategoryFilter
      ? {
          product: {
            ...(selectedLobIds.length ? { lineOfBusinessId: { in: selectedLobIds } } : {}),
            ...(Object.keys(lobWhere).length ? { lineOfBusiness: lobWhere } : {}),
            ...(businessOnly ? { productType: "BUSINESS" as const } : {}),
          },
        }
      : {};

  const recent = await prisma.soldProduct.findMany({
    where: {
      ...(selectedAgencyIds.length ? { agencyId: { in: selectedAgencyIds } } : {}),
      ...(statusFilter.length ? { status: { in: statusFilter as PolicyStatus[] } } : {}),
      ...(personFilter ? { soldByPersonId: personFilter } : {}),
      ...productFilters,
      ...(q
        ? {
            OR: [
              { policyId: { contains: q, mode: "insensitive" } },
              { product: { name: { contains: q, mode: "insensitive" } } },
              { household: { firstName: { contains: q, mode: "insensitive" } } },
              { household: { lastName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
      dateSold: { gte: new Date(startDateStr), lte: new Date(endDateStr) },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      agency: true,
      product: { include: { lineOfBusiness: true } },
      household: { include: { agency: true } },
      soldByPerson: true,
    },
  });

  const sortedRecent = (() => {
    switch (sortKey) {
      case "name":
        return sortBy(
          recent,
          (r) => `${r.household.lastName || ""} ${r.household.firstName || ""}`.trim(),
          sortDir
        );
      case "product":
        return sortBy(recent, (r) => r.product.name || "", sortDir);
      case "premium":
        return sortBy(recent, (r) => r.premium || 0, sortDir);
      case "written":
        return sortBy(recent, (r) => r.dateSold, sortDir);
      case "status":
        return sortBy(recent, (r) => r.status || "", sortDir);
      case "source":
        return sortBy(recent, (r) => r.household.marketingSource || "", sortDir);
      default:
        return recent;
    }
  })();

  const groupedByHousehold = sortedRecent.reduce<Record<string, typeof recent>>((acc, r) => {
    acc[r.householdId] = acc[r.householdId] || [];
    acc[r.householdId].push(r);
    return acc;
  }, {});

  const householdOrder = Object.keys(groupedByHousehold);

  const fmtMoney = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const productsByAgency = new Map<string, { id: string; name: string; productType: string }[]>();
  const orgProducts = lobs.flatMap((lob) => lob.products);
  agencies.forEach((a) => {
    productsByAgency.set(a.id, orgProducts);
  });

  const totalPremium = sortedRecent.reduce((sum, r) => sum + r.premium, 0);
  const pcPremium = sortedRecent
    .filter((r) => r.product.lineOfBusiness.premiumCategory === "PC")
    .reduce((sum, r) => sum + r.premium, 0);
  const fsPremium = sortedRecent
    .filter((r) => r.product.lineOfBusiness.premiumCategory === "FS")
    .reduce((sum, r) => sum + r.premium, 0);
  const totalApps = sortedRecent.length;
  const tableColumns = "1.6fr 1.1fr 0.8fr 0.7fr 0.8fr 0.9fr 1.2fr 0.4fr";
  const showRows = sp.toggle !== "hide";

  return (
    <AppShell
      title="Sold Products"
      subtitle="Record issued or written policies and capture value flags."
    >
      <div className="surface" style={{ padding: 12, marginBottom: 12 }}>
        <form
          id="sold-filter-form"
          method="get"
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            alignItems: "end",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Date range</span>
            <DatePicker1RangeClient
              start={startDateStr}
              end={endDateStr}
              label=""
              quickPresets={false}
              presets={datePresets}
            />
            <div style={{ fontSize: 11, color: "#9ca3af" }}>Pick start then end; range applies instantly.</div>
          </div>
          <label style={{ fontSize: 13, color: "#6b7280" }}>
            <span style={{ display: "block", marginBottom: 4 }}>Search</span>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Household name, policy id, or product"
                style={{ padding: "10px 38px 10px 12px", width: "100%", borderRadius: 10, border: "1px solid #d1d5db" }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }}>Go</span>
            </div>
          </label>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Agencies</span>
            <details id="filter-agency" style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
              <summary style={{ cursor: "pointer", padding: "10px 12px", fontWeight: 700, color: "#0f172a", listStyle: "none" }}>
                {selectedAgencyIds.length
                  ? agencies
                      .filter((a) => selectedAgencyIds.includes(a.id))
                      .map((a) => a.name)
                      .join(", ")
                  : agencies.map((a) => a.name).join(", ")}
              </summary>
              <div style={{ padding: "10px 12px" }}>
                <MultiCheck
                  name="agencyId"
                  options={agencies.map((a) => ({ id: a.id, label: a.name }))}
                  selected={selectedAgencyIds}
                  compactColumns={2}
                />
              </div>
            </details>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Status</span>
            <details id="filter-status" style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
              <summary style={{ cursor: "pointer", padding: "10px 12px", fontWeight: 700, color: "#0f172a", listStyle: "none" }}>
                {statusFilter.length ? statusFilter.join(", ") : "Select statuses"}
              </summary>
              <div style={{ padding: "10px 12px" }}>
                <MultiCheck
                  name="status"
                  options={Object.values(PolicyStatus).map((s) => ({ id: s, label: s }))}
                  selected={statusFilter}
                  compactColumns={2}
                />
              </div>
            </details>
          </div>
          <label style={{ fontSize: 13, color: "#6b7280" }}>
            <span style={{ display: "block", marginBottom: 4 }}>Team member</span>
            <select
              name="personId"
              defaultValue={personFilter}
              style={{ padding: 10, width: "100%", borderRadius: 8, border: "1px solid #d1d5db" }}
            >
              <option value="">All</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>LoBs</span>
            <details id="filter-lob" style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
              <summary style={{ cursor: "pointer", padding: "10px 12px", fontWeight: 700, color: "#0f172a", listStyle: "none" }}>
                {selectedLobIds.length
                  ? lobOptions
                      .filter((lob) => selectedLobIds.includes(lob.id))
                      .map((lob) => lob.name)
                      .join(", ")
                  : lobOptions.map((lob) => lob.name).join(", ")}
              </summary>
              <div style={{ padding: "10px 12px" }}>
                <MultiCheck name="lobId" options={lobOptions.map((lob) => ({ id: lob.id, label: lob.name }))} selected={selectedLobIds} compactColumns={2} />
              </div>
            </details>
          </div>
          <div style={{ alignSelf: "end", display: "flex", gap: 8 }}>
            <ResetFiltersButton start={thisMonthStartStr} end={todayStr} clearKeys={resetClearKeys} />
          </div>
        </form>
        <AutoSubmit
          formId="sold-filter-form"
          debounceMs={250}
          persistOpenIds={["filter-agency", "filter-status", "filter-lob"]}
        />
      </div>

      <div
        className="surface"
        style={{
          padding: "10px 12px",
          marginBottom: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>
          {householdOrder.length} PolicyHolders - {totalApps} Policies - {fmtMoney(totalPremium)} in Premium
        </div>
        {pcPremium > 0 || fsPremium > 0 ? (
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            {pcPremium > 0 ? `PC ${fmtMoney(pcPremium)}` : ""}
            {pcPremium > 0 && fsPremium > 0 ? " - " : ""}
            {fsPremium > 0 ? `FS ${fmtMoney(fsPremium)}` : ""}
          </div>
        ) : null}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <form action="/sold-products" method="get">
            {renderCurrentQueryHiddenInputs()}
            <input type="hidden" name="toggle" value="hide" />
            <button type="submit" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f8fafc", fontWeight: 700 }}>
              Hide all
            </button>
          </form>
          <form action="/sold-products" method="get">
            {renderCurrentQueryHiddenInputs()}
            <input type="hidden" name="toggle" value="show" />
            <button type="submit" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", fontWeight: 700 }}>
              Show all
            </button>
          </form>
        </div>
      </div>

      <NewSoldProductForm
        agencies={agenciesWithLobs}
        people={people}
        households={householdOptions}
        preselectedHousehold={preselectedHousehold}
        searchFirst={""}
        searchLast={""}
        openByDefault={openByDefault}
        selectedAgencyId={selectedAgencyIds[0] || ""}
        returnTo={returnTo}
        onSubmit={createSoldProduct}
      />

      <div className="surface" style={{ marginTop: 12, padding: 0 }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>Policies</div>
        {sortedRecent.length === 0 ? (
          <p style={{ color: "#555", padding: 16 }}>No sold products yet.</p>
        ) : (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: tableColumns,
                padding: "10px 16px",
                color: "#6b7280",
                fontWeight: 600,
                fontSize: 12,
                borderBottom: "1px solid #e5e7eb",
                background: "#f8fafc",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              <span>
                <Link href={buildSortHref("name")} style={{ color: "inherit", textDecoration: "none" }}>
                  Name{sortIndicator("name")}
                </Link>
              </span>
              <span>
                <Link href={buildSortHref("product")} style={{ color: "inherit", textDecoration: "none" }}>
                  Product{sortIndicator("product")}
                </Link>
              </span>
              <span>
                <Link href={buildSortHref("premium")} style={{ color: "inherit", textDecoration: "none" }}>
                  Premium{sortIndicator("premium")}
                </Link>
              </span>
              <span>
                <Link href={buildSortHref("written")} style={{ color: "inherit", textDecoration: "none" }}>
                  Written{sortIndicator("written")}
                </Link>
              </span>
              <span>
                <Link href={buildSortHref("status")} style={{ color: "inherit", textDecoration: "none" }}>
                  Status{sortIndicator("status")}
                </Link>
              </span>
              <span>
                <Link href={buildSortHref("source")} style={{ color: "inherit", textDecoration: "none" }}>
                  Source{sortIndicator("source")}
                </Link>
              </span>
              <span>Notes</span>
              <span style={{ textAlign: "right" }}>Actions</span>
            </div>
            {householdOrder.map((hid) => {
              const rows = groupedByHousehold[hid];
              const hh = rows[0].household;
              const lobCounts = rows.reduce<Record<string, number>>((acc, r) => {
                const lob = r.product.lineOfBusiness.name;
                acc[lob] = (acc[lob] || 0) + 1;
                return acc;
              }, {});
              const pcPremiumSum = rows
                .filter((r) => r.product.lineOfBusiness.premiumCategory === PremiumCategory.PC)
                .reduce((sum, r) => sum + r.premium, 0);
              const fsPremiumSum = rows
                .filter((r) => r.product.lineOfBusiness.premiumCategory === PremiumCategory.FS)
                .reduce((sum, r) => sum + r.premium, 0);
              const summaryParts: string[] = [...Object.entries(lobCounts).map(([lob, count]) => `${lob}: ${count}`)];
              if (pcPremiumSum > 0) summaryParts.push(`PC premium ${fmtMoney(pcPremiumSum)}`);
              if (fsPremiumSum > 0) summaryParts.push(`FS premium ${fmtMoney(fsPremiumSum)}`);
              return (
                <div key={hid} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <div style={{ padding: "10px 16px", background: "#f8fafc", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 700 }}>
                      Customer: {hh.firstName} {hh.lastName} {hh.agency?.name ? `- ${hh.agency.name}` : ""}
                    </div>
                    {summaryParts.length > 0 ? (
                      <div style={{ color: "#6b7280", fontSize: 12 }}>{summaryParts.join(" - ")}</div>
                    ) : null}
                    <details style={{ marginLeft: "auto", position: "relative" }}>
                      <summary
                        aria-label="Edit customer"
                        style={{ cursor: "pointer", listStyle: "none", padding: "4px 8px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}
                      >
                        &#9998;
                      </summary>
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          marginTop: 6,
                          background: "#fff",
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: 10,
                          zIndex: 10,
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <form action={updateHousehold} style={{ display: "grid", gap: 8 }}>
                          <input type="hidden" name="householdId" value={hh.id} />
                          {renderReturnToInput()}
                          <input name="hhFirstName" defaultValue={hh.firstName} style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
                          <input name="hhLastName" defaultValue={hh.lastName} style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <Link href={returnTo} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111", fontWeight: 700, textDecoration: "none" }}>
                              Cancel
                            </Link>
                            <button
                              type="submit"
                              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", fontWeight: 700 }}
                            >
                              Save
                            </button>
                          </div>
                        </form>
                      </div>
                    </details>
                  </div>
                  {showRows
                    ? rows.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: tableColumns,
                            padding: "12px 16px",
                            alignItems: "center",
                            gap: 8,
                            borderTop: "1px solid #eef2f7",
                            background: "#fff",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ color: "#111", fontWeight: 600 }}>
                              {r.household.firstName} {r.household.lastName}
                            </span>
                            <span style={{ color: "#6b7280", fontSize: 12 }}>
                              Written by: {r.soldByPerson ? r.soldByPerson.fullName : r.soldByName || "Unassigned"}
                            </span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ fontWeight: 600 }}>{r.product.name}</span>
                            <span style={{ color: "#6b7280", fontSize: 12 }}>{r.agency.name}</span>
                          </div>
                          <div style={{ fontWeight: 700 }}>{fmtMoney(r.premium)}</div>
                          <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 700 }}>{fmtDate(r.dateSold)}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {r.status === PolicyStatus.ISSUED ? (
                              <span
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  background: "#d1fae5",
                                  color: "#065f46",
                                  fontWeight: 700,
                                }}
                              >
                                Issued
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  background: "#fef3c7",
                                  color: "#92400e",
                                  fontWeight: 700,
                                }}
                              >
                                {r.status}
                              </span>
                            )}
                            <details style={{ position: "relative" }}>
                              <summary
                                aria-label="Edit status"
                                style={{ cursor: "pointer", listStyle: "none", padding: "2px 6px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontWeight: 700 }}
                              >
                                &#9998;
                              </summary>
                              <form
                                action={updateStatusQuick}
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  marginTop: 6,
                                  background: "#fff",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 10,
                                  padding: 10,
                                  minWidth: 180,
                                  zIndex: 10,
                                  display: "grid",
                                  gap: 6,
                                }}
                              >
                                <input type="hidden" name="soldProductId" value={r.id} />
                                {renderReturnToInput()}
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    type="submit"
                                    name="status"
                                    value={PolicyStatus.WRITTEN}
                                    title="Written"
                                    style={{ minWidth: 34, padding: "6px 8px", borderRadius: 999, border: "1px solid #fcd34d", background: "#fef3c7", color: "#92400e", fontWeight: 700 }}
                                  >
                                    W
                                  </button>
                                  <button
                                    type="submit"
                                    name="status"
                                    value={PolicyStatus.ISSUED}
                                    title="Issued"
                                    style={{ minWidth: 34, padding: "6px 8px", borderRadius: 999, border: "1px solid #6ee7b7", background: "#d1fae5", color: "#065f46", fontWeight: 700 }}
                                  >
                                    I
                                  </button>
                                  <button
                                    type="submit"
                                    name="status"
                                    value={PolicyStatus.STATUS_CHECK}
                                    title="Pending / With Issues"
                                    style={{ minWidth: 34, padding: "6px 8px", borderRadius: 999, border: "1px solid #fecaca", background: "#fee2e2", color: "#991b1b", fontWeight: 700 }}
                                  >
                                    UI
                                  </button>
                                  <button
                                    type="submit"
                                    name="status"
                                    value={PolicyStatus.CANCELLED}
                                    title="Cancelled"
                                    style={{ minWidth: 34, padding: "6px 8px", borderRadius: 999, border: "1px solid #7f1d1d", background: "#7f1d1d", color: "#fff", fontWeight: 700 }}
                                  >
                                    X
                                  </button>
                                </div>
                              </form>
                            </details>
                          </div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{r.household.marketingSource || "--"}</div>
                          <div style={{ color: "#6b7280", fontSize: 12 }}>{r.notes || "--"}</div>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <details style={{ position: "relative" }}>
                              <summary style={{ cursor: "pointer", listStyle: "none", padding: "4px 8px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f8fafc", fontWeight: 700 }}>
                                ...
                              </summary>
                              <div
                                style={{
                                  position: "absolute",
                                  right: 0,
                                  marginTop: 6,
                                  background: "#fff",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 10,
                                  padding: 10,
                                  minWidth: 220,
                                  zIndex: 20,
                                  display: "grid",
                                  gap: 8,
                                }}
                              >
                                <details>
                                  <summary style={{ cursor: "pointer", fontSize: 12, color: "#2563eb" }}>Edit policy</summary>
                                  <form action={updatePolicyQuick} style={{ display: "grid", gap: 6, marginTop: 8 }}>
                                    <input type="hidden" name="soldProductId" value={r.id} />
                                    {renderReturnToInput()}
                                    <label style={{ fontSize: 12, color: "#6b7280" }}>
                                      Product
                                      <select name="quickProductId" defaultValue={r.productId} style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #d1d5db" }}>
                                        {(productsByAgency.get(r.agencyId) || []).map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name} ({p.productType})
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label style={{ fontSize: 12, color: "#6b7280" }}>
                                      Premium
                                      <input
                                        name="quickPremium"
                                        type="number"
                                        step="0.01"
                                        defaultValue={r.premium.toString()}
                                        style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #d1d5db" }}
                                      />
                                    </label>
                                    <label style={{ fontSize: 12, color: "#6b7280" }}>
                                      Written date
                                      <input
                                        name="quickDate"
                                        type="date"
                                        defaultValue={r.dateSold.toISOString().slice(0, 10)}
                                        style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #d1d5db" }}
                                      />
                                    </label>
                                    <label style={{ fontSize: 12, color: "#6b7280" }}>
                                      Status
                                      <select name="quickStatus" defaultValue={r.status} style={{ padding: 8, width: "100%", borderRadius: 8, border: "1px solid #d1d5db" }}>
                                        <option value="WRITTEN">Written</option>
                                        <option value="ISSUED">Issued</option>
                                        <option value="PAID">Paid</option>
                                        <option value="CANCELLED">Cancelled</option>
                                        <option value="STATUS_CHECK">Status Check</option>
                                      </select>
                                    </label>
                                    <button
                                      type="submit"
                                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", fontWeight: 700 }}
                                    >
                                      Save
                                    </button>
                                  </form>
                                </details>
                                <form action={updateSoldProduct}>
                                  <input type="hidden" name="soldProductId" value={r.id} />
                                  {renderReturnToInput()}
                                  <input type="hidden" name="policyFirstName" value={r.policyFirstName || r.household.firstName} />
                                  <input type="hidden" name="policyLastName" value={r.policyLastName || r.household.lastName} />
                                  <input type="hidden" name="dateSold" value={r.dateSold.toISOString().slice(0, 10)} />
                                  <input type="hidden" name="premium" value={r.premium.toString()} />
                                  <input type="hidden" name="status" value={r.status} />
                                  <button
                                    type="submit"
                                    name="intent"
                                    value="issue"
                                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f8fafc", fontWeight: 700 }}
                                  >
                                    Issue & sync names
                                  </button>
                                </form>
                                <form action={deleteSoldProduct}>
                                  <input type="hidden" name="soldProductId" value={r.id} />
                                  {renderReturnToInput()}
                                  <button
                                    type="submit"
                                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", fontWeight: 700 }}
                                  >
                                    Delete
                                  </button>
                                </form>
                              </div>
                            </details>
                          </div>
                        </div>
                      ))
                    : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
