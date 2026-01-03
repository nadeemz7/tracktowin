import { AppShell } from "./components/AppShell";
import { prisma } from "@/lib/prisma";
import { PolicyStatus } from "@prisma/client";
import { DateRangePicker } from "@/app/activities/DateRangePicker";
import { formatISO, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { AutoSubmit } from "./sold-products/AutoSubmit";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) || {};

  const today = new Date();
  const issuedOnly = sp.issued === "1";
  const metric = sp.metric === "premium" ? "premium" : "apps";
  const agencyFilter = typeof sp.agency === "string" ? sp.agency : "all";
  const filterBy = sp.filterBy === "custom" ? "custom" : "month";

  let startDateStr: string;
  let endDateStr: string;
  let startDate: Date;
  let endDate: Date;

  if (filterBy === "month") {
    const monthIdxRaw = typeof sp.month === "string" ? parseInt(sp.month, 10) : today.getMonth();
    const monthIdx = Number.isFinite(monthIdxRaw) ? monthIdxRaw : today.getMonth();
    const year = typeof sp.year === "string" ? parseInt(sp.year, 10) : today.getFullYear();
    const localStart = new Date(year, monthIdx, 1);
    const localEnd = endOfMonth(localStart);
    startDateStr = formatISO(localStart, { representation: "date" });
    endDateStr = formatISO(localEnd, { representation: "date" });
    startDate = localStart;
    endDate = localEnd;
  } else {
    const startDefault = formatISO(startOfMonth(today), { representation: "date" });
    const endDefault = formatISO(endOfMonth(today), { representation: "date" });
    startDateStr = typeof sp.start === "string" ? sp.start : startDefault;
    endDateStr = typeof sp.end === "string" ? sp.end : endDefault;
    startDate = new Date(startDateStr);
    endDate = new Date(endDateStr);
  }

  const agencies = await prisma.agency.findMany({ orderBy: { name: "asc" } });

  const sold = await prisma.soldProduct.findMany({
    where: {
      dateSold: { gte: startDate, lte: endDate },
      ...(issuedOnly ? { status: { in: [PolicyStatus.ISSUED, PolicyStatus.PAID] } } : {}),
      ...(agencyFilter !== "all" ? { agencyId: agencyFilter } : {}),
    },
    include: {
      product: { include: { lineOfBusiness: true } },
      soldByPerson: true,
      agency: true,
    },
  });

  type SellerRow = Record<string, number>;
  const lobOrder = ["Auto", "Fire", "Health", "Life", "IPS"];

  const lobTotals = new Map<string, { apps: number; premium: number; sellers: Map<string, { apps: number; premium: number }> }>();
  const sellerTotals = new Map<string, SellerRow>();

  for (const r of sold) {
    const lob = r.product.lineOfBusiness.name || "Other";
    const seller = r.soldByPerson?.fullName || r.soldByName || "Unassigned";
    const apps = 1;
    const premium = Number(r.premium) || 0;

    if (!lobTotals.has(lob)) {
      lobTotals.set(lob, { apps: 0, premium: 0, sellers: new Map() });
    }
    const l = lobTotals.get(lob)!;
    l.apps += apps;
    l.premium += premium;
    if (!l.sellers.has(seller)) l.sellers.set(seller, { apps: 0, premium: 0 });
    const ls = l.sellers.get(seller)!;
    ls.apps += apps;
    ls.premium += premium;

    if (!sellerTotals.has(seller)) sellerTotals.set(seller, {});
    const row = sellerTotals.get(seller)!;
    row[lob] = (row[lob] || 0) + (metric === "apps" ? apps : premium);
    row["Total"] = (row["Total"] || 0) + (metric === "apps" ? apps : premium);
  }

  const cards = [...lobOrder, "Total"].map((lob) => {
    if (lob === "Total") {
      const totalValue = metric === "apps" ? sold.length : sold.reduce((s, r) => s + Number(r.premium || 0), 0);
      const sellerAgg = new Map<string, { apps: number; premium: number }>();
      for (const [name, row] of sellerTotals) {
        sellerAgg.set(name, { apps: 0, premium: 0 });
        sellerAgg.get(name)!.apps = (sellerAgg.get(name)!.apps || 0) + (row.Total || 0);
        sellerAgg.get(name)!.premium = (sellerAgg.get(name)!.premium || 0) + (row.Total || 0);
      }
      const top = [...sellerAgg.entries()]
        .map(([name, vals]) => ({ name, value: metric === "apps" ? vals.apps : vals.premium }))
        .sort((a, b) => b.value - a.value);
      const top3 = top.slice(0, 3);
      const others = top.slice(3).reduce((s, t) => s + t.value, 0);
      return { lob, value: totalValue, top3, others };
    }
    const data = lobTotals.get(lob) || { apps: 0, premium: 0, sellers: new Map() };
    const value = metric === "apps" ? data.apps : data.premium;
    const top = [...data.sellers.entries()]
      .map(([name, vals]) => ({ name, value: metric === "apps" ? vals.apps : vals.premium }))
      .sort((a, b) => b.value - a.value);
    const top3 = top.slice(0, 3);
    const others = top.slice(3).reduce((s, t) => s + t.value, 0);
    return { lob, value, top3, others };
  });

  const tableRows = [...sellerTotals.entries()]
    .map(([seller, data]) => {
      const row: Record<string, number> = {};
      lobOrder.forEach((lob) => (row[lob] = data[lob] || 0));
      row["Total"] = data.Total || 0;
      return { seller, row };
    })
    .sort((a, b) => b.row.Total - a.row.Total);

  const fmtNumber = (n: number) => (metric === "apps" ? n : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));

  // Activity snapshot (counts)
  const activities = await prisma.activityRecord.findMany({
    where: { activityDate: { gte: startDate, lte: endDate } },
    select: { activityName: true, activityDate: true, count: true, personName: true },
  });

  type ActMap = Map<string, { total: number; people: Map<string, number> }>;
  const actTotals: ActMap = new Map();
  const personActTotals = new Map<string, Record<string, number>>();

  for (const a of activities) {
    const act = a.activityName || "Activity";
    const person = a.personName || "Unassigned";
    const cnt = Number(a.count || 0);

    if (!actTotals.has(act)) actTotals.set(act, { total: 0, people: new Map() });
    const entry = actTotals.get(act)!;
    entry.total += cnt;
    entry.people.set(person, (entry.people.get(person) || 0) + cnt);

    if (!personActTotals.has(person)) personActTotals.set(person, {});
    const row = personActTotals.get(person)!;
    row[act] = (row[act] || 0) + cnt;
    row["Total"] = (row["Total"] || 0) + cnt;
  }

  const topActs = [...actTotals.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  const actTableCols = topActs.map(([name]) => name);
  const actTableRows = [...personActTotals.entries()]
    .map(([person, data]) => ({
      person,
      row: actTableCols.reduce<Record<string, number>>((acc, col) => {
        acc[col] = data[col] || 0;
        return acc;
      }, { Total: data.Total || 0 }),
    }))
    .sort((a, b) => b.row.Total - a.row.Total);

  return (
    <AppShell title="Production Overview" subtitle="Apps and premium by line of business and seller.">
      <form
        id="home-filter-form"
        method="get"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          background: "#f8fafc",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          marginBottom: 14,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#475569" }}>
          Filter By
          <select name="filterBy" defaultValue={filterBy} style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}>
            <option value="month">Month</option>
            <option value="custom">Custom Range</option>
          </select>
        </label>

        {filterBy === "month" ? (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#475569" }}>
              Select Month
              <select name="month" defaultValue={String(startDate.getMonth())} style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}>
                {Array.from({ length: 12 }).map((_, idx) => (
                  <option key={idx} value={idx}>
                    {new Date(2000, idx, 1).toLocaleString("en-US", { month: "long" })}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#475569" }}>
              Year
              <input
                name="year"
                type="number"
                defaultValue={startDate.getFullYear()}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
              />
            </label>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#475569" }}>
            <span>Written Range</span>
            <DateRangePicker
              preset="custom"
              baseDate={startDateStr}
              start={startDateStr}
              end={endDateStr}
              query={{
                agency: agencyFilter === "all" ? undefined : agencyFilter,
                metric,
                issued: issuedOnly ? "1" : undefined,
                filterBy,
              }}
              path="/"
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[
                { label: "Last Month", start: formatISO(startOfMonth(addMonths(startDate, -1)), { representation: "date" }), end: formatISO(endOfMonth(addMonths(startDate, -1)), { representation: "date" }) },
                { label: "Yesterday", start: formatISO(new Date(startDate.getTime() - 24 * 3600 * 1000), { representation: "date" }), end: formatISO(new Date(startDate.getTime() - 24 * 3600 * 1000), { representation: "date" }) },
                { label: "Today", start: formatISO(today, { representation: "date" }), end: formatISO(today, { representation: "date" }) },
                { label: "This Month", start: formatISO(startOfMonth(today), { representation: "date" }), end: formatISO(endOfMonth(today), { representation: "date" }) },
              ].map((p) => (
                <a
                  key={p.label}
                  href={`/?filterBy=custom&start=${encodeURIComponent(p.start)}&end=${encodeURIComponent(p.end)}&metric=${metric}${
                    issuedOnly ? "&issued=1" : ""
                  }${agencyFilter !== "all" ? `&agency=${agencyFilter}` : ""}`}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    color: "#2563eb",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  {p.label}
                </a>
              ))}
            </div>
            <input type="hidden" name="start" defaultValue={startDateStr} />
            <input type="hidden" name="end" defaultValue={endDateStr} />
          </div>
        )}

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#475569" }}>
          Agencies
          <select name="agency" defaultValue={agencyFilter} style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}>
            <option value="all">All Agencies</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#475569" }}>
          Metric
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="submit"
              name="metric"
              value="apps"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: metric === "apps" ? "2px solid #1b4221" : "1px solid #d1d5db",
                background: metric === "apps" ? "#eaf3ea" : "#fff",
                fontWeight: 700,
              }}
            >
              Apps
            </button>
            <button
              type="submit"
              name="metric"
              value="premium"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: metric === "premium" ? "2px solid #1b4221" : "1px solid #d1d5db",
                background: metric === "premium" ? "#eaf3ea" : "#fff",
                fontWeight: 700,
              }}
            >
              Premium
            </button>
          </div>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569" }}>
          <input type="checkbox" name="issued" value="1" defaultChecked={issuedOnly} />
          Policy must be issued
        </label>

        <AutoSubmit formId="home-filter-form" debounceMs={150} />
      </form>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.lob}
            style={{
              padding: 14,
              borderRadius: 12,
              background: "#fff",
              border: "1px solid #e5e7eb",
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>{card.lob}</div>
            <div style={{ fontSize: 42, fontWeight: 900, color: "#1b4221", lineHeight: 1, margin: "8px 0" }}>{fmtNumber(card.value)}</div>
            <div style={{ display: "grid", gap: 6 }}>
              {card.top3.map((t) => (
                <div key={t.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#111" }}>
                  <span>{t.name}</span>
                  <span style={{ fontWeight: 700 }}>{fmtNumber(t.value)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569" }}>
                <span>All others</span>
                <span style={{ fontWeight: 700 }}>{fmtNumber(card.others)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Leaderboard</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#475569" }}>
                <th style={{ padding: "8px 6px" }}>Team member</th>
                {lobOrder.map((lob) => (
                  <th key={lob} style={{ padding: "8px 6px" }}>
                    {lob}
                  </th>
                ))}
                <th style={{ padding: "8px 6px" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.seller} style={{ borderTop: "1px solid #eef2f7" }}>
                  <td style={{ padding: "8px 6px", fontWeight: 700 }}>{row.seller}</td>
                  {lobOrder.map((lob) => (
                    <td key={lob} style={{ padding: "8px 6px" }}>
                      {fmtNumber(row.row[lob] || 0)}
                    </td>
                  ))}
                  <td style={{ padding: "8px 6px", fontWeight: 800 }}>{fmtNumber(row.row.Total)}</td>
                </tr>
              ))}
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={lobOrder.length + 2} style={{ padding: 12, color: "#6b7280" }}>
                    No data for this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2 style={{ marginBottom: 6 }}>Activity Snapshot</h2>
        <p style={{ marginTop: 0, color: "#475569" }}>Counts by activity and person for the selected range.</p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 12,
            marginTop: 12,
            marginBottom: 18,
          }}
        >
          {topActs.length === 0 && <div style={{ color: "#6b7280" }}>No activity records for this range.</div>}
          {topActs.map(([name, data]) => {
            const topPeople = [...data.people.entries()]
              .map(([person, val]) => ({ person, val }))
              .sort((a, b) => b.val - a.val);
            const top3 = topPeople.slice(0, 3);
            const others = topPeople.slice(3).reduce((s, t) => s + t.val, 0);
            return (
              <div
                key={name}
                style={{
                  padding: 14,
                  borderRadius: 12,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>{name}</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: "#1b4221", lineHeight: 1, margin: "6px 0 10px" }}>{data.total}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {top3.map((t) => (
                    <div key={t.person} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#111" }}>
                      <span>{t.person}</span>
                      <span style={{ fontWeight: 700 }}>{t.val}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569" }}>
                    <span>All others</span>
                    <span style={{ fontWeight: 700 }}>{others}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Activity by person</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#475569" }}>
                  <th style={{ padding: "8px 6px" }}>Team member</th>
                  {actTableCols.map((col) => (
                    <th key={col} style={{ padding: "8px 6px" }}>
                      {col}
                    </th>
                  ))}
                  <th style={{ padding: "8px 6px" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {actTableRows.map((row) => (
                  <tr key={row.person} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ padding: "8px 6px", fontWeight: 700 }}>{row.person}</td>
                    {actTableCols.map((col) => (
                      <td key={col} style={{ padding: "8px 6px" }}>
                        {row.row[col] || 0}
                      </td>
                    ))}
                    <td style={{ padding: "8px 6px", fontWeight: 800 }}>{row.row.Total || 0}</td>
                  </tr>
                ))}
                {actTableRows.length === 0 && (
                  <tr>
                    <td colSpan={actTableCols.length + 2} style={{ padding: 12, color: "#6b7280" }}>
                      No activity for this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
