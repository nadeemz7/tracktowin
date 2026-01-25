import { AppShell } from "@/app/components/AppShell";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import { createAgency, deleteAgency, quickCreate } from "./actions";
import { revalidatePath } from "next/cache";
import Link from "next/link";

export default async function AgenciesPage() {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId ?? null;
  const viewerPersonId = viewer?.personId ?? null;
  const isDev = process.env.NODE_ENV !== "production";
  if (!orgId || !viewerPersonId) {
    return (
      <AppShell title="Unauthorized">
        <div>Unauthorized.</div>
        {isDev ? (
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              background: "#f3f4f6",
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {JSON.stringify(
              {
                userId: viewer?.userId ?? null,
                personId: viewer?.personId ?? null,
                orgId: viewer?.orgId ?? null,
                impersonating: !!viewer?.impersonating,
                isAdmin: !!viewer?.isAdmin,
                isOwner: !!viewer?.isOwner,
                isManager: !!viewer?.isManager,
              },
              null,
              2
            )}
          </pre>
        ) : null}
      </AppShell>
    );
  }

  const agencies = await prisma.agency.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    include: {
      peoplePrimary: {
        include: {
          primaryAgency: {
            select: { id: true },
          },
        },
      },
    },
  });

  const lobs = await prisma.lineOfBusiness.findMany({
    where: { orgId },
    include: { products: true },
    orderBy: { name: "asc" },
  });

  const stats = await Promise.all(
    agencies.map(async (a) => {
      const [primarySales, primaryCs, activeMembers] = await Promise.all([
        prisma.person.count({ where: { primaryAgency: { is: { id: a.id } }, teamType: "SALES", active: true } }),
        prisma.person.count({ where: { primaryAgency: { is: { id: a.id } }, teamType: "CS", active: true } }),
        prisma.person.count({ where: { primaryAgency: { is: { id: a.id } }, active: true } }),
      ]);
      return { id: a.id, primarySales, primaryCs, activeMembers };
    })
  );
  const statMap = new Map(stats.map((s) => [s.id, s]));

  async function addPerson(formData: FormData) {
    "use server";
    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const teamType = String(formData.get("teamType") || "SALES");
    const primaryAgencyId = String(formData.get("primaryAgencyId") || "");
    if (!fullName || !primaryAgencyId) return;

    const viewer = await getOrgViewer();
    const orgId = viewer?.orgId ?? null;
    const personId = viewer?.personId ?? null;
    if (!orgId || !personId) return;

    const agency = await prisma.agency.findUnique({
      where: { id: primaryAgencyId },
      select: { orgId: true },
    });
    if (!agency || agency.orgId !== orgId) return;

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

    const viewer = await getOrgViewer();
    const orgId = viewer?.orgId ?? null;
    const viewerPersonId = viewer?.personId ?? null;
    if (!orgId || !viewerPersonId) return;

    const agency = await prisma.agency.findUnique({
      where: { id: primaryAgencyId },
      select: { orgId: true },
    });
    if (!agency || agency.orgId !== orgId) return;

    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, orgId: true, primaryAgencyId: true },
    });
    if (!person) return;
    if (person.orgId) {
      if (person.orgId !== orgId) return;
    } else if (person.primaryAgencyId) {
      const personAgency = await prisma.agency.findUnique({
        where: { id: person.primaryAgencyId },
        select: { orgId: true },
      });
      if (!personAgency || personAgency.orgId !== orgId) return;
    } else {
      return;
    }

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
        <h2 style={{ marginTop: 0 }}>Org LoBs & Products</h2>
        {lobs.length === 0 ? (
          <p style={{ color: "#555" }}>No lines of business yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {lobs.map((lob) => (
              <div
                key={lob.id}
                style={{
                  border: "1px solid #e3e6eb",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fff",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ fontWeight: 700 }}>{lob.name}</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>{lob.premiumCategory}</div>
                <div style={{ color: "#555", fontSize: 13 }}>
                  Products: {lob.products.length ? lob.products.map((p) => p.name).join(", ") : "No products"}
                </div>
              </div>
            ))}
          </div>
        )}
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
                                <select name="primaryAgencyId" defaultValue={p.primaryAgency?.id || agency.id} style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}>
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
