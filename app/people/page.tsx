import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export default async function PeoplePage() {
  const [people, teams, agencies] = await Promise.all([
    prisma.person.findMany({
      orderBy: { fullName: "asc" },
      include: { team: { include: { agency: true } }, role: true, primaryAgency: true },
    }),
    prisma.team.findMany({
      include: { roles: true, agency: true },
      orderBy: { name: "asc" },
    }),
    prisma.agency.findMany({ orderBy: { name: "asc" } }),
  ]);

  async function createPerson(formData: FormData) {
    "use server";

    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const teamId = String(formData.get("teamId") || "");
    const roleId = String(formData.get("roleId") || "");
    const isAdmin = formData.get("isAdmin") === "on";
    const isManager = formData.get("isManager") === "on";
    const primaryAgencyId = String(formData.get("primaryAgencyId") || "");
    if (!fullName || !teamId) return;

    const team = await prisma.team.findUnique({ where: { id: teamId }, include: { agency: true } });
    if (!team) return;
    const role = roleId ? await prisma.role.findUnique({ where: { id: roleId } }) : null;
    const teamType =
      team.name.toLowerCase().includes("service") || team.name.toLowerCase().includes("cs") ? "CS" : "SALES";

    await prisma.person.create({
      data: {
        fullName,
        email: email || null,
        teamType,
        teamId,
        roleId: role?.id || null,
        primaryAgencyId: primaryAgencyId || team.agencyId || null,
        isAdmin,
        isManager,
      },
    });

    revalidatePath("/people");
  }

  async function toggleActive(formData: FormData) {
    "use server";

    const personId = String(formData.get("personId") || "");
    const nextActive = formData.get("nextActive") === "true";
    if (!personId) return;

    await prisma.person.update({
      where: { id: personId },
      data: { active: nextActive },
    });

    revalidatePath("/people");
  }

  async function updatePrimary(formData: FormData) {
    "use server";
    const personId = String(formData.get("personId") || "");
    const primaryAgencyId = String(formData.get("primaryAgencyId") || "");
    if (!personId) return;
    await prisma.person.update({
      where: { id: personId },
      data: { primaryAgencyId: primaryAgencyId || null },
    });
    revalidatePath("/people");
  }

  return (
    <AppShell title="People" subtitle="Create team members, assign team/role, and toggle admin/manager.">
      <div className="surface" style={{ maxWidth: 700 }}>
        <h2 style={{ marginTop: 0 }}>New Person</h2>
        <form action={createPerson} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label>
              Full Name
              <br />
              <input name="fullName" required style={{ padding: 8, width: "100%" }} />
            </label>
            <label>
              Email
              <br />
              <input name="email" type="email" style={{ padding: 8, width: "100%" }} />
            </label>
          </div>

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <label>
              Team
              <br />
              <select name="teamId" required style={{ padding: 8, width: "100%" }}>
                <option value="">Select team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.agency?.name ? `${t.agency.name} — ${t.name}` : t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role
              <br />
              <select name="roleId" style={{ padding: 8, width: "100%" }}>
                <option value="">No role</option>
                {teams.flatMap((t) =>
                  t.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {t.agency?.name ? `${t.agency.name} — ${t.name} / ${r.name}` : `${t.name} / ${r.name}`}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              Primary office
              <br />
              <select name="primaryAgencyId" style={{ padding: 8, width: "100%" }}>
                <option value="">Match team office</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name="isAdmin" />
              Admin
            </label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name="isManager" />
              Manager
            </label>
          </div>

          <button type="submit" style={{ padding: "10px 14px", width: 160 }}>
            Add Person
          </button>
        </form>
      </div>

      <div className="surface" style={{ marginTop: 18 }}>
        <h2 style={{ marginTop: 0 }}>People</h2>
        {people.length === 0 ? (
          <p style={{ color: "#555" }}>No people yet.</p>
        ) : (
          <ul style={{ marginTop: 8, paddingLeft: 18, display: "grid", gap: 8 }}>
            {people.map((p) => (
              <li key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.fullName}</div>
                  <div style={{ color: "#555", fontSize: 14 }}>
                    {p.email || "No email"} • {p.team?.agency?.name ? `${p.team.agency.name} — ` : ""}
                    {p.team?.name || "No team"}
                    {p.role ? ` / ${p.role.name}` : ""} • {p.isAdmin ? "Admin" : "User"}
                    {p.isManager ? " • Manager" : ""} • {p.active ? "Active" : "Inactive"}
                    {p.primaryAgency ? ` • Primary: ${p.primaryAgency.name}` : ""}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <form action={updatePrimary} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input type="hidden" name="personId" value={p.id} />
                    <select name="primaryAgencyId" defaultValue={p.primaryAgency?.id || ""} style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                      <option value="">Match team office</option>
                      {agencies.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" style={{ padding: "8px 12px" }}>Save</button>
                  </form>
                  <form action={toggleActive} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input type="hidden" name="personId" value={p.id} />
                    <input type="hidden" name="nextActive" value={(!p.active).toString()} />
                    <button type="submit" style={{ padding: "8px 12px" }}>
                      {p.active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
