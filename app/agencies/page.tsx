import { AppShell } from "@/app/components/AppShell";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { revalidatePath } from "next/cache";

const STARTER_LOBS = [
  {
    name: "Auto",
    premiumCategory: "PC",
    products: [
      { name: "Auto Raw New", productType: "PERSONAL" },
      { name: "Auto Added", productType: "PERSONAL" },
      { name: "Business Raw Auto", productType: "BUSINESS" },
      { name: "Business Added Auto", productType: "BUSINESS" },
    ],
  },
  {
    name: "Fire",
    premiumCategory: "PC",
    products: [
      { name: "Homeowners", productType: "PERSONAL" },
      { name: "Renters", productType: "PERSONAL" },
      { name: "Condo", productType: "PERSONAL" },
      { name: "PAP", productType: "PERSONAL" },
      { name: "PLUP", productType: "PERSONAL" },
      { name: "Boat", productType: "PERSONAL" },
      { name: "BOP", productType: "BUSINESS" },
      { name: "Apartment", productType: "BUSINESS" },
      { name: "CLUP", productType: "BUSINESS" },
      { name: "Workers Comp", productType: "BUSINESS" },
    ],
  },
  {
    name: "Health",
    premiumCategory: "FS",
    products: [
      { name: "Short Term Disability", productType: "PERSONAL" },
      { name: "Long Term Disability", productType: "PERSONAL" },
      { name: "Hospital Indemnity", productType: "PERSONAL" },
    ],
  },
  {
    name: "Life",
    premiumCategory: "FS",
    products: [
      { name: "Term", productType: "PERSONAL" },
      { name: "Whole Life", productType: "PERSONAL" },
    ],
  },
  {
    name: "IPS",
    premiumCategory: "IPS",
    products: [
      { name: "Advisory Account", productType: "PERSONAL" },
      { name: "Non Advisory Account", productType: "PERSONAL" },
    ],
  },
];

export default async function AgenciesPage() {
  const agencies = await prisma.agency.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      linesOfBusiness: {
        include: { products: true },
      },
      peoplePrimary: true,
    },
  });

  const stats = await Promise.all(
    agencies.map(async (a) => {
      const [primarySales, primaryCs, activeMembers] = await Promise.all([
        prisma.person.count({ where: { primaryAgencyId: a.id, teamType: "SALES", active: true } }),
        prisma.person.count({ where: { primaryAgencyId: a.id, teamType: "CS", active: true } }),
        prisma.person.count({ where: { team: { agencyId: a.id }, active: true } }),
      ]);
      return { id: a.id, primarySales, primaryCs, activeMembers };
    })
  );
  const statMap = new Map(stats.map((s) => [s.id, s]));

  async function createAgency(formData: FormData) {
    "use server";

    const name = String(formData.get("name") || "").trim();
    if (!name) return;

    const exists = await prisma.agency.findFirst({ where: { name } });
    if (exists) {
      revalidatePath("/agencies");
      return;
    }

    const agency = await prisma.agency.create({
      data: {
        name,
        linesOfBusiness: {
          create: STARTER_LOBS.map((lob) => ({
            name: lob.name,
            premiumCategory: lob.premiumCategory as "PC" | "FS" | "IPS",
            products: { create: lob.products },
          })),
        },
      },
    });

    await (await import("@/lib/wtdDefaults")).ensureDefaultWinTheDayPlans(agency.id);

    revalidatePath("/agencies");
  }

  async function quickCreate(formData: FormData) {
    "use server";
    const name = String(formData.get("quickName") || "").trim();
    if (!name) return;

    const exists = await prisma.agency.findFirst({ where: { name } });
    if (exists) {
      revalidatePath("/agencies");
      return;
    }

    const agency = await prisma.agency.create({
      data: {
        name,
        linesOfBusiness: {
          create: STARTER_LOBS.map((lob) => ({
            name: lob.name,
            premiumCategory: lob.premiumCategory as "PC" | "FS" | "IPS",
            products: { create: lob.products },
          })),
        },
      },
    });

    await (await import("@/lib/wtdDefaults")).ensureDefaultWinTheDayPlans(agency.id);

    revalidatePath("/agencies");
  }

  async function deleteAgency(formData: FormData) {
    "use server";
    const id = String(formData.get("agencyId") || "");
    if (!id) return;

    const plans = await prisma.commissionPlan.findMany({ where: { agencyId: id }, select: { id: true } });
    const wtdPlans = await prisma.winTheDayPlan.findMany({ where: { agencyId: id }, select: { id: true } });

    await prisma.$transaction([
      prisma.commissionPlanAssignment.deleteMany({ where: { planId: { in: plans.map((p) => p.id) } } }),
      prisma.commissionComponent.deleteMany({ where: { planId: { in: plans.map((p) => p.id) } } }),
      prisma.commissionPlan.deleteMany({ where: { id: { in: plans.map((p) => p.id) } } }),
      prisma.winTheDayPlanPersonAssignment.deleteMany({ where: { planId: { in: wtdPlans.map((p) => p.id) } } }),
      prisma.winTheDayPlanTeamAssignment.deleteMany({ where: { planId: { in: wtdPlans.map((p) => p.id) } } }),
      prisma.winTheDayPlanTeamAssignment.deleteMany({ where: { team: { agencyId: id } } }),
      prisma.winTheDayPlanPersonAssignment.deleteMany({ where: { person: { team: { agencyId: id } } } }),
      prisma.winTheDayRule.deleteMany({ where: { planId: { in: wtdPlans.map((p) => p.id) } } }),
      prisma.winTheDayPlan.deleteMany({ where: { id: { in: wtdPlans.map((p) => p.id) } } }),
      prisma.activityTeamVisibility.deleteMany({ where: { team: { agencyId: id } } }),
      prisma.activityDailyExpectation.deleteMany({ where: { team: { agencyId: id } } }),
      prisma.activityPayoutTier.deleteMany({ where: { activityType: { agencyId: id } } }),
      prisma.activityType.deleteMany({ where: { agencyId: id } }),
      prisma.soldProduct.deleteMany({ where: { agencyId: id } }),
      prisma.householdFieldValue.deleteMany({ where: { household: { agencyId: id } } }),
      prisma.household.deleteMany({ where: { agencyId: id } }),
      prisma.marketingSourceOption.deleteMany({ where: { agencyId: id } }),
      prisma.householdFieldDefinition.deleteMany({ where: { agencyId: id } }),
      prisma.valuePolicyDefault.deleteMany({ where: { agencyId: id } }),
      prisma.premiumBucket.deleteMany({ where: { agencyId: id } }),
      prisma.person.updateMany({ where: { team: { agencyId: id } }, data: { teamId: null, roleId: null } }),
      prisma.role.deleteMany({ where: { team: { agencyId: id } } }),
      prisma.team.deleteMany({ where: { agencyId: id } }),
      prisma.product.deleteMany({ where: { lineOfBusiness: { agencyId: id } } }),
      prisma.lineOfBusiness.deleteMany({ where: { agencyId: id } }),
      prisma.agency.delete({ where: { id } }),
    ]);

    revalidatePath("/agencies");
  }

  async function addPerson(formData: FormData) {
    "use server";
    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const teamType = String(formData.get("teamType") || "SALES");
    const primaryAgencyId = String(formData.get("primaryAgencyId") || "");
    if (!fullName || !primaryAgencyId) return;
    await prisma.person.create({
      data: {
        fullName,
        email: email || null,
        teamType: teamType === "CS" ? "CS" : "SALES",
        primaryAgencyId,
        active: true,
      },
    });
    revalidatePath("/agencies");
    revalidatePath(`/agencies/${primaryAgencyId}`);
  }

  async function updatePrimaryAgency(formData: FormData) {
    "use server";
    const personId = String(formData.get("personId") || "");
    const primaryAgencyId = String(formData.get("primaryAgencyId") || "");
    if (!personId || !primaryAgencyId) return;
    await prisma.person.update({ where: { id: personId }, data: { primaryAgencyId } });
    revalidatePath("/agencies");
    revalidatePath(`/agencies/${primaryAgencyId}`);
  }

  return (
    <AppShell title="Agencies" subtitle="Create a new agency with starter lines of business.">
      <div className="surface">
        <h2 style={{ marginTop: 0 }}>New Agency</h2>
        <form action={createAgency} style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            name="name"
            placeholder="Agency name (e.g., Legacy Office)"
            style={{ padding: 10, width: 320 }}
          />
          <button type="submit" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e31836", background: "#e31836", color: "#f8f9fa", fontWeight: 700 }}>
            Add
          </button>
        </form>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Legacy", "MOA", "TROA"].map((preset) => (
            <form key={preset} action={quickCreate}>
              <input type="hidden" name="quickName" value={preset} />
              <button type="submit" style={{ padding: "8px 12px" }}>
                Add {preset}
              </button>
            </form>
          ))}
        </div>

        {agencies.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <Link href="/onboarding" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e31836", background: "#e31836", color: "#f8f9fa", fontWeight: 700 }}>
              Run Onboarding Wizard
            </Link>
          </div>
        ) : null}
      </div>

      <div className="surface" style={{ marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Existing Agencies</h2>
        {agencies.length === 0 ? (
          <p style={{ color: "#555" }}>No agencies yet.</p>
        ) : (
          <div style={{ marginTop: 8, display: "grid", gap: 12 }}>
            {agencies.map((agency) => {
              const stat = statMap.get(agency.id);
              return (
                <div
                  key={agency.id}
                  style={{
                    border: "1px solid #e3e6eb",
                    borderRadius: 10,
                    padding: 12,
                    background: "#fff",
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{agency.name}</div>
                      <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>Owner: {agency.ownerName || "—"}</div>
                    </div>
                    <Link
                      href={`/agencies/${agency.id}`}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 10,
                        border: "1px solid #283618",
                        background: "#283618",
                        color: "#f8f9fa",
                        fontWeight: 800,
                      }}
                    >
                      Open
                    </Link>
                  </div>
                  <div>
                    <div style={{ color: "#555", fontSize: 13 }}>{agency.profileName || "Office profile"}</div>
                    <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>
                      Office Location: {agency.address || "Add address"}
                    </div>
                    <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>
                      Sales primarily here: {stat?.primarySales ?? 0} • CS primarily here: {stat?.primaryCs ?? 0}
                    </div>
                    <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>
                      Active team members: {stat?.activeMembers ?? 0}
                    </div>
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700, color: "#111" }}>People (primary in this agency)</summary>
                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        {agency.peoplePrimary.length === 0 ? (
                          <div style={{ color: "#6b7280", fontSize: 13 }}>No people yet.</div>
                        ) : (
                          agency.peoplePrimary.map((p) => {
                            const ownerName = (agency.ownerName || "").trim().toLowerCase();
                            const personName = (p.fullName || "").trim().toLowerCase();
                            const isOwner = !!ownerName && personName === ownerName;
                            const badges = [
                              ...(isOwner ? ["Owner"] : []),
                              ...(p.isAdmin ? ["Admin"] : []),
                              ...(p.isManager ? ["Manager"] : []),
                            ];

                            return (
                              <form key={p.id} action={updatePrimaryAgency} style={{ display: "grid", gap: 6, gridTemplateColumns: "1.3fr 1fr auto", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                                <div>
                                  <div style={{ fontWeight: 600 }}>{p.fullName}</div>
                                  <div style={{ color: "#6b7280", fontSize: 12 }}>{p.email || "No email"}</div>
                                </div>
                                <select name="primaryAgencyId" defaultValue={p.primaryAgencyId || agency.id} style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                                  {agencies.map((ag) => (
                                    <option key={ag.id} value={ag.id}>
                                      {ag.name}
                                    </option>
                                  ))}
                                </select>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                                  {badges.length ? (
                                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                      {badges.map((badge) => (
                                        <span key={badge} style={{ padding: "2px 8px", borderRadius: 999, background: "#f3f4f6", color: "#374151", fontSize: 11, fontWeight: 700 }}>
                                          {badge}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <input type="hidden" name="personId" value={p.id} />
                                    <button type="submit" className="btn" style={{ padding: "6px 10px" }}>
                                      Set primary
                                    </button>
                                  </div>
                                </div>
                              </form>
                            );
                          })
                        )}
                        <form action={addPerson} style={{ marginTop: 6, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", alignItems: "center", border: "1px dashed #d1d5db", borderRadius: 10, padding: 10, background: "#f8fafc" }}>
                          <input type="hidden" name="primaryAgencyId" value={agency.id} />
                          <label style={{ display: "grid", gap: 4 }}>
                            <span style={{ fontWeight: 600 }}>Full name</span>
                            <input name="fullName" placeholder="Jane Doe" style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} required />
                          </label>
                          <label style={{ display: "grid", gap: 4 }}>
                            <span style={{ fontWeight: 600 }}>Email (optional)</span>
                            <input name="email" placeholder="jane@email.com" style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                          </label>
                          <label style={{ display: "grid", gap: 4 }}>
                            <span style={{ fontWeight: 600 }}>Team</span>
                            <select name="teamType" style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                              <option value="SALES">Sales</option>
                              <option value="CS">Customer Service</option>
                            </select>
                          </label>
                          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                            <button type="submit" className="btn primary" style={{ padding: "8px 12px" }}>
                              Add person
                            </button>
                          </div>
                        </form>
                      </div>
                    </details>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
                    <form action={deleteAgency}>
                      <input type="hidden" name="agencyId" value={agency.id} />
                      <ConfirmSubmitButton
                        confirmText={`Delete "${agency.name}"? This cannot be undone.`}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 10,
                          border: "1px solid #fecaca",
                          background: "#fff",
                          color: "#b91c1c",
                          fontWeight: 700,
                        }}
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
