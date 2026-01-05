import { AppShell } from "@/app/components/AppShell";
import Link from "next/link";
import { DateRangePicker } from "@/app/activities/DateRangePicker";
import { NewSoldProductForm } from "@/app/sold-products/NewSoldProductForm";
import { prisma } from "@/lib/prisma";
import { PolicyStatus, PremiumCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatISO, subDays } from "date-fns";
import { MultiCheck } from "./MultiCheck";
import { AutoSubmit } from "./AutoSubmit";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SoldProductsPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) || {};

  const toArray = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v : (v || "").split(","))
      .map((s) => s.trim())
      .filter(Boolean);

  const selectedAgencyIds = toArray(sp.agencies ?? sp.agencyId);
  const startDefault = formatISO(subDays(new Date(), 30), { representation: "date" });
  const endDefault = formatISO(new Date(), { representation: "date" });
  const startDateStr = sp.start || startDefault;
  const endDateStr = sp.end || endDefault;
  const businessOnly = sp.businessOnly === "1";
  const statusFilter = toArray(sp.statuses ?? sp.status) as PolicyStatus[];
  const personFilter = sp.personId || "";
  const selectedLobNames = toArray(sp.lob);
  const selectedLobIds = toArray(sp.lobId);

  const agencies = await prisma.agency.findMany({
    orderBy: { name: "asc" },
    include: {
      linesOfBusiness: {
        orderBy: { name: "asc" },
        include: { products: { orderBy: { name: "asc" } } },
      },
      valuePolicyDefaults: true,
    },
  });
  const people = await prisma.person.findMany({ orderBy: { fullName: "asc" } });

  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const preselectHouseholdId = (sp.householdId || "").trim();
  const openFlag = sp.open === "1";

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
      agencies
        .flatMap((a) => a.linesOfBusiness)
        .map((lob) => [lob.id, { id: lob.id, name: lob.name }])
    ).values()
  );

  const openByDefault = openFlag || !!preselectedHousehold || !!q;

  async function createSoldProduct(formData: FormData) {
    "use server";

    const agencyId = String(formData.get("agencyId") || "");
    const productId = String(formData.get("productId") || "");
    const dateSoldStr = String(formData.get("dateSold") || "");
    const premiumStr = String(formData.get("premium") || "");
    const soldByPersonId = String(formData.get("soldByPersonId") || "");
    const soldByName = String(formData.get("soldByName") || "").trim();
    const policyId = String(formData.get("policyId") || "").trim();
    const notes = String(formData.get("notes") || "").trim();
    const quantity = Math.max(1, Number(formData.get("quantity") || 1) || 1);
    const useHouseholdId = String(formData.get("existingHouseholdId") || "").trim();
    const nextAction = String(formData.get("nextAction") || "");
    const addAnotherForHousehold = nextAction === "addAnother";

    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();
    const ecrmLink = String(formData.get("ecrmLink") || "").trim();
    const marketingSource = String(formData.get("marketingSource") || "").trim();
    const onboarded = formData.get("onboarded") === "on";

    const isValueHealth = formData.get("isValueHealth") === "on";
    const isValueLife = formData.get("isValueLife") === "on";

    if (!agencyId || !productId || !dateSoldStr || !premiumStr) return;
    if (!useHouseholdId && (!firstName || !lastName || !marketingSource)) return;

    const dateSold = new Date(dateSoldStr);
    const premium = Number(premiumStr);
    if (Number.isNaN(premium)) return;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { lineOfBusiness: true },
    });
    if (!product) return;

    const valueDefaults = await prisma.valuePolicyDefault.findMany({
      where: { agencyId },
    });

    const lobName = product.lineOfBusiness.name;
    const healthDefault = valueDefaults.find(
      (v) => v.flagField === "isValueHealth" && v.lineOfBusiness === lobName && v.active
    );
    const lifeDefault = valueDefaults.find(
      (v) => v.flagField === "isValueLife" && v.lineOfBusiness === lobName && v.active
    );

    let householdId = useHouseholdId;
    if (householdId) {
      const exists = await prisma.household.findUnique({
        where: { id: householdId },
        select: { id: true, agencyId: true },
      });
      if (!exists || exists.agencyId !== agencyId) return;
    } else {
      const household = await prisma.household.create({
        data: {
          agencyId,
          firstName,
          lastName,
          ecrmLink: ecrmLink || null,
          marketingSource: marketingSource || null,
          onboarded,
        },
      });
      householdId = household.id;
    }

    const effectiveValueHealth =
      isValueHealth || (!!healthDefault && premium >= healthDefault.threshold);
    const effectiveValueLife = isValueLife || (!!lifeDefault && premium >= lifeDefault.threshold);

    await prisma.soldProduct.createMany({
      data: Array.from({ length: quantity }).map((_, idx) => ({
        agencyId,
        productId,
        householdId,
        dateSold,
        premium: idx === 0 ? premium : 0, // first record holds full premium, others default to 0
        status: PolicyStatus.WRITTEN,
        isValueHealth: effectiveValueHealth,
        isValueLife: effectiveValueLife,
        soldByPersonId: soldByPersonId || null,
        soldByName: soldByName || null,
        policyFirstName: firstName,
        policyLastName: lastName,
        policyId: policyId || null,
        notes: notes || null,
      })),
    });

    revalidatePath("/sold-products");

    if (addAnotherForHousehold && householdId) {
      redirect(`/sold-products?householdId=${householdId}&open=1`);
    }
    // Close modal and refresh list
    redirect("/sold-products");
  }

  async function updateSoldProduct(formData: FormData) {
    "use server";

    const intent = String(formData.get("intent") || "");
    const soldProductId = String(formData.get("soldProductId") || "");
    const status = String(formData.get("status") || PolicyStatus.WRITTEN);
    const dateSoldStr = String(formData.get("dateSold") || "");
    const premiumStr = String(formData.get("premium") || "");
    const policyId = String(formData.get("policyId") || "").trim();
    const notes = String(formData.get("notes") || "").trim();
    const policyFirstName = String(formData.get("policyFirstName") || "").trim();
    const policyLastName = String(formData.get("policyLastName") || "").trim();
    const applyToHousehold = formData.get("applyToHousehold") === "on";
    const markIssued = intent === "issue";

    if (!soldProductId || !dateSoldStr || !premiumStr || !policyFirstName || !policyLastName) return;

    const premium = Number(premiumStr);
    if (Number.isNaN(premium)) return;
    const dateSold = new Date(dateSoldStr);

    // fetch household to update names
    const existing = await prisma.soldProduct.findUnique({
      where: { id: soldProductId },
      include: { household: true },
    });
    if (!existing) return;

    const actions = [
      prisma.soldProduct.update({
        where: { id: soldProductId },
        data: {
          dateSold,
          premium,
          status: markIssued ? PolicyStatus.ISSUED : (status as PolicyStatus),
          policyId: policyId || null,
          notes: notes || null,
          policyFirstName,
          policyLastName,
        },
      }),
    ];

    if (applyToHousehold) {
      actions.push(
        prisma.household.update({
          where: { id: existing.householdId },
          data: { firstName: policyFirstName, lastName: policyLastName },
        })
      );
    }

    await prisma.$transaction(actions);

    revalidatePath("/sold-products");
  }

  async function deleteSoldProduct(formData: FormData) {
    "use server";

    const soldProductId = String(formData.get("soldProductId") || "");
    if (!soldProductId) return;

    await prisma.soldProduct.delete({ where: { id: soldProductId } });
    revalidatePath("/sold-products");
  }

  async function updateHousehold(formData: FormData) {
    "use server";
    const householdId = String(formData.get("householdId") || "");
    const firstName = String(formData.get("hhFirstName") || "").trim();
    const lastName = String(formData.get("hhLastName") || "").trim();
    if (!householdId || !firstName || !lastName) return;
    await prisma.household.update({ where: { id: householdId }, data: { firstName, lastName } });
    revalidatePath("/sold-products");
  }

  async function updatePolicyQuick(formData: FormData) {
    "use server";
    const soldProductId = String(formData.get("soldProductId") || "");
    const productId = String(formData.get("quickProductId") || "");
    const premiumStr = String(formData.get("quickPremium") || "");
    const status = String(formData.get("quickStatus") || PolicyStatus.WRITTEN);
    const dateSoldStr = String(formData.get("quickDate") || "");
    if (!soldProductId || !productId || !premiumStr || !dateSoldStr) return;
    const premium = Number(premiumStr);
    if (Number.isNaN(premium)) return;
    const dateSold = new Date(dateSoldStr);
    await prisma.soldProduct.update({
      where: { id: soldProductId },
      data: { productId, premium, status: status as PolicyStatus, dateSold },
    });
    revalidatePath("/sold-products");
  }

  async function updateStatusQuick(formData: FormData) {
    "use server";
    const soldProductId = String(formData.get("soldProductId") || "");
    const status = String(formData.get("status") || PolicyStatus.WRITTEN);
    if (!soldProductId) return;
    await prisma.soldProduct.update({
      where: { id: soldProductId },
      data: { status: status as PolicyStatus },
    });
    revalidatePath("/sold-products");
  }

  const productFilters =
    selectedLobIds.length || selectedLobNames.length || businessOnly
      ? {
          product: {
            ...(selectedLobIds.length ? { lineOfBusinessId: { in: selectedLobIds } } : {}),
            ...(selectedLobNames.length ? { lineOfBusiness: { name: { in: selectedLobNames } } } : {}),
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

  const groupedByHousehold = recent.reduce<Record<string, typeof recent>>((acc, r) => {
    acc[r.householdId] = acc[r.householdId] || [];
    acc[r.householdId].push(r);
    return acc;
  }, {});

  const householdOrder = Object.keys(groupedByHousehold);

  const globalLobCounts = recent.reduce<Record<string, number>>((acc, r) => {
    const lob = r.product.lineOfBusiness.name;
    acc[lob] = (acc[lob] || 0) + 1;
    return acc;
  }, {});
  const globalPcPremium = recent
    .filter((r) => r.product.lineOfBusiness.premiumCategory === PremiumCategory.PC)
    .reduce((sum, r) => sum + r.premium, 0);
  const globalFsPremium = recent
    .filter((r) => r.product.lineOfBusiness.premiumCategory === PremiumCategory.FS)
    .reduce((sum, r) => sum + r.premium, 0);
  const globalTotalApps = recent.length;

  const fmtMoney = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const productsByAgency = new Map<string, { id: string; name: string; productType: string }[]>();
  agencies.forEach((a) => {
    const list = a.linesOfBusiness.flatMap((lob) => lob.products);
    productsByAgency.set(a.id, list);
  });

  const totalPremium = recent.reduce((sum, r) => sum + r.premium, 0);
  const pcPremium = recent
    .filter((r) => r.product.lineOfBusiness.premiumCategory === "PC")
    .reduce((sum, r) => sum + r.premium, 0);
  const fsPremium = recent
    .filter((r) => r.product.lineOfBusiness.premiumCategory === "FS")
    .reduce((sum, r) => sum + r.premium, 0);
  const totalApps = recent.length;

  return (
    <AppShell
      title="Sold Products"
      subtitle="Record issued or written policies and capture value flags."
    >
      <div
        style={{
          background: "#f7f8fb",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          marginBottom: 18,
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 12, letterSpacing: 1.1, color: "#6b7280", fontWeight: 800 }}>POLICY WORKSPACE</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ padding: "6px 10px", borderRadius: 12, background: "#eef2ff", color: "#312e81", fontWeight: 800, minWidth: 90, textAlign: "center" }}>
              {totalApps} apps
            </div>
            <div style={{ padding: "6px 10px", borderRadius: 12, background: "#f1f5f9", color: "#0f172a", fontWeight: 800, minWidth: 110, textAlign: "center" }}>
              PC: {fmtMoney(pcPremium)}
            </div>
            <div style={{ padding: "6px 10px", borderRadius: 12, background: "#f1f5f9", color: "#0f172a", fontWeight: 800, minWidth: 110, textAlign: "center" }}>
              FS: {fmtMoney(fsPremium)}
            </div>
            <div style={{ padding: "6px 10px", borderRadius: 12, background: "#ecfdf3", color: "#065f46", fontWeight: 800, minWidth: 120, textAlign: "center" }}>
              Total: {fmtMoney(totalPremium)}
            </div>
          </div>
        </div>

        <form
          id="sold-filter-form"
          method="get"
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            alignItems: "center",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Date range</span>
            <DateRangePicker
              preset="custom"
              baseDate={startDateStr}
              start={startDateStr}
              end={endDateStr}
              query={{
                start: startDateStr,
                end: endDateStr,
                agencyId: selectedAgencyIds.length ? selectedAgencyIds.join(",") : undefined,
                status: statusFilter.length ? statusFilter.join(",") : undefined,
                personId: personFilter || undefined,
                lobId: selectedLobIds.length ? selectedLobIds.join(",") : undefined,
                open: sp.open,
                householdId: sp.householdId,
              }}
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
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }}>🔍</span>
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
            <button
              type="submit"
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #2563eb",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              Apply Filters
            </button>
            <Link
              href="/sold-products"
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111",
                textDecoration: "none",
              }}
            >
              Reset
            </Link>
          </div>
        </form>
        <AutoSubmit
          formId="sold-filter-form"
          debounceMs={250}
          persistOpenIds={["filter-agency", "filter-status", "filter-lob"]}
        />
      </div>

      <NewSoldProductForm
        agencies={agencies}
        people={people}
        households={householdOptions}
        preselectedHousehold={preselectedHousehold}
        searchFirst={""}
        searchLast={""}
        openByDefault={openByDefault}
        selectedAgencyId={selectedAgencyIds[0] || ""}
        onSubmit={createSoldProduct}
      />

      <div className="surface" style={{ marginTop: 18, padding: 0 }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", fontWeight: 700 }}>Policies by Household</div>
        <div style={{ padding: "8px 16px", display: "flex", gap: 12, alignItems: "center", color: "#475569", fontSize: 13 }}>
          <span style={{ fontWeight: 700, color: "#111" }}>{householdOrder.length} households</span>
          <span style={{ fontWeight: 700, color: "#111" }}>{globalTotalApps} total apps</span>
          <span>
            {Object.entries(globalLobCounts)
              .map(([lob, count]) => `${lob}: ${count} app${count === 1 ? "" : "s"}`)
              .join(" • ")}
          </span>
          {globalPcPremium > 0 && <span>PC premium {fmtMoney(globalPcPremium)}</span>}
          {globalFsPremium > 0 && <span>FS premium {fmtMoney(globalFsPremium)}</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <form action="/sold-products" method="get">
              <input type="hidden" name="toggle" value="hide" />
              <button type="submit" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f8fafc", fontWeight: 700 }}>
                Hide all
              </button>
            </form>
            <form action="/sold-products" method="get">
              <input type="hidden" name="toggle" value="show" />
              <button type="submit" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", fontWeight: 700 }}>
                Show all
              </button>
            </form>
          </div>
        </div>
        {recent.length === 0 ? (
          <p style={{ color: "#555", padding: 16 }}>No sold products yet.</p>
        ) : (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 0.8fr 0.7fr 0.7fr 0.9fr 0.5fr",
                padding: "12px 16px",
                color: "#6b7280",
                fontWeight: 600,
                fontSize: 13,
                borderBottom: "1px solid #e5e7eb",
                background: "#f8fafc",
              }}
            >
              <span>Household</span>
              <span>Product</span>
              <span>Premium</span>
              <span>Written</span>
              <span>Issued</span>
              <span>Source</span>
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
              const toggle = sp.toggle === "hide" ? false : true;
              return (
                <details key={hid} open={toggle} style={{ borderBottom: "1px solid #e5e7eb", background: "#f8fafc" }}>
                  <summary
                    style={{
                      padding: "10px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                      listStyle: "none",
                      fontWeight: 700,
                    }}
                  >
                    <span>
                      {hh.firstName} {hh.lastName} {hh.agency?.name ? `• ${hh.agency.name}` : ""}
                    </span>
                    {summaryParts.length > 0 && (
                      <span style={{ color: "#475569", fontSize: 13 }}>({summaryParts.join(" • ")})</span>
                    )}
                    <span style={{ marginLeft: "auto", color: "#2563eb", fontSize: 13 }}>Toggle</span>
                  </summary>
                  <div style={{ padding: "8px 16px", display: "flex", justifyContent: "flex-end" }}>
                    <form action={updateHousehold} style={{ display: "flex", gap: 8 }}>
                      <input type="hidden" name="householdId" value={hh.id} />
                      <input name="hhFirstName" defaultValue={hh.firstName} style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
                      <input name="hhLastName" defaultValue={hh.lastName} style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
                      <button
                        type="submit"
                        style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", fontWeight: 700 }}
                      >
                        Save
                      </button>
                    </form>
                  </div>
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 1fr 0.8fr 0.7fr 0.7fr 0.9fr 0.5fr",
                        padding: "12px 16px",
                        alignItems: "center",
                        gap: 8,
                        borderTop: "1px solid #eef2f7",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ color: "#2563eb", fontWeight: 700 }}>
                          {r.household.firstName} {r.household.lastName}
                        </span>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>
                          {r.soldByPerson ? r.soldByPerson.fullName : r.soldByName || "Unassigned"}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontWeight: 600 }}>{r.product.name}</span>
                        <span style={{ color: "#6b7280", fontSize: 12 }}>{r.agency.name}</span>
                      </div>
                      <div style={{ fontWeight: 700 }}>{fmtMoney(r.premium)}</div>
                      <div>
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: "#e1ecff",
                            color: "#1d4ed8",
                            fontWeight: 700,
                          }}
                        >
                          {fmtDate(r.dateSold)}
                        </span>
                      </div>
                      <div>
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
                      </div>
                      <div style={{ color: "#6b7280" }}>{r.household.marketingSource || "—"}</div>
                      <div style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
                        <form action={updateStatusQuick} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input type="hidden" name="soldProductId" value={r.id} />
                          <button
                            type="submit"
                            name="status"
                            value={PolicyStatus.WRITTEN}
                            style={{
                              padding: "6px 8px",
                              borderRadius: 8,
                              border: r.status === PolicyStatus.WRITTEN ? "2px solid #2563eb" : "1px solid #d1d5db",
                              background: r.status === PolicyStatus.WRITTEN ? "#e0e7ff" : "#f8fafc",
                              fontWeight: 700,
                            }}
                          >
                            W
                          </button>
                          <button
                            type="submit"
                            name="status"
                            value={PolicyStatus.ISSUED}
                            style={{
                              padding: "6px 8px",
                              borderRadius: 8,
                              border: r.status === PolicyStatus.ISSUED ? "2px solid #16a34a" : "1px solid #d1d5db",
                              background: r.status === PolicyStatus.ISSUED ? "#dcfce7" : "#f8fafc",
                              fontWeight: 700,
                            }}
                          >
                            ✓
                          </button>
                          <select
                            name="status"
                            defaultValue={r.status}
                            style={{ padding: 6, borderRadius: 8, border: "1px solid #d1d5db" }}
                          >
                            <option value={PolicyStatus.WRITTEN}>Written</option>
                            <option value={PolicyStatus.ISSUED}>Issued</option>
                            <option value={PolicyStatus.PAID}>Paid</option>
                            <option value={PolicyStatus.STATUS_CHECK}>Pending / With Issues</option>
                            <option value={PolicyStatus.CANCELLED}>Cancelled</option>
                          </select>
                          <button
                            type="submit"
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #2563eb",
                              background: "#2563eb",
                              color: "#fff",
                              fontWeight: 700,
                            }}
                          >
                            Update
                          </button>
                        </form>
                        <details>
                          <summary style={{ cursor: "pointer", fontSize: 13, color: "#2563eb" }}>Edit</summary>
                          <form action={updatePolicyQuick} style={{ display: "grid", gap: 6, marginTop: 8, minWidth: 240 }}>
                            <input type="hidden" name="soldProductId" value={r.id} />
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
                          <input type="hidden" name="policyFirstName" value={r.policyFirstName || r.household.firstName} />
                          <input type="hidden" name="policyLastName" value={r.policyLastName || r.household.lastName} />
                          <input type="hidden" name="dateSold" value={r.dateSold.toISOString().slice(0, 10)} />
                          <input type="hidden" name="premium" value={r.premium.toString()} />
                          <input type="hidden" name="status" value={r.status} />
                          <button
                            type="submit"
                            name="intent"
                            value="issue"
                            style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #d1d5db", background: "#f8fafc" }}
                          >
                            ✓
                          </button>
                        </form>
                        <form action={deleteSoldProduct}>
                          <input type="hidden" name="soldProductId" value={r.id} />
                          <button
                            type="submit"
                            style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #f5c2c2", background: "#fce8e8", color: "#b91c1c" }}
                          >
                            🗑
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </details>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
