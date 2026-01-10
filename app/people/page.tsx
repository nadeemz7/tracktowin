import { AppShell } from "@/app/components/AppShell";
import { getViewerContext } from "@/lib/getViewerContext";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import PeopleRolesClient, { RolesTab, OfficePlanTab } from "./PeopleRolesClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TAB_KEYS = ["people", "roles", "office"] as const;

export default async function PeoplePage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) || {};
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const activeTab = TAB_KEYS.includes((tabParam as any) ?? "") ? (tabParam as (typeof TAB_KEYS)[number]) : "people";
  const personIdParam = Array.isArray(sp.personId) ? sp.personId[0] : sp.personId;
  const initialSelectedPersonId = typeof personIdParam === "string" ? personIdParam : null;

  const viewer = await getViewerContext();
  const orgId = viewer?.orgId ?? null;

  const [people, teams, agencies, roleExpectations, personOverrides, linesOfBusiness, activityTypes] =
    await Promise.all([
      prisma.person.findMany({
        orderBy: { fullName: "asc" },
        include: { team: { include: { agency: true } }, role: true, primaryAgency: true },
      }),
      prisma.team.findMany({
        include: { roles: true, agency: true },
        orderBy: { name: "asc" },
      }),
      prisma.agency.findMany({ orderBy: { name: "asc" } }),
      prisma.benchRoleExpectation.findMany({ include: { role: { include: { team: true } } } }),
      prisma.benchPersonOverride.findMany({ include: { person: true } }),
      orgId
        ? prisma.lineOfBusiness.findMany({
            where: { agencyId: orgId },
            select: { id: true, name: true, premiumCategory: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([] as Array<{ id: string; name: string; premiumCategory: string }>),
      orgId
        ? prisma.activityType.findMany({
            where: { agencyId: orgId, active: true },
            select: { id: true, name: true, active: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([] as Array<{ id: string; name: string; active: boolean }>),
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

  const tabs: Array<{ key: (typeof TAB_KEYS)[number]; label: string; href: string }> = [
    { key: "people", label: "People", href: "/people?tab=people" },
    { key: "roles", label: "Roles", href: "/people?tab=roles" },
    { key: "office", label: "Office Plan", href: "/people?tab=office" },
  ];

  const roles = teams.flatMap((t) => t.roles.map((r) => ({ id: r.id, name: r.name, team: t })));

  return (
    <AppShell title="People & Roles" subtitle="Manage people, role defaults, and office goals for Benchmarks.">
      <div style={{ display: "flex", gap: 8, marginBottom: 12, borderBottom: "1px solid #e5e7eb" }}>
        {tabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <a
              key={t.key}
              href={t.href}
              style={{
                padding: "10px 14px",
                borderBottom: active ? "3px solid #111827" : "3px solid transparent",
                fontWeight: active ? 700 : 600,
                color: active ? "#111827" : "#6b7280",
                textDecoration: "none",
              }}
            >
              {t.label}
            </a>
          );
        })}
      </div>

      {activeTab === "people" ? (
        <>
          <div className="surface" style={{ maxWidth: 700, marginBottom: 16 }}>
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

          <PeopleRolesClient
            people={people}
            teams={teams}
            agencies={agencies}
            roleExpectations={roleExpectations}
            personOverrides={personOverrides}
            initialSelectedPersonId={initialSelectedPersonId}
          />
        </>
      ) : null}

      {activeTab === "roles" ? (
        <RolesTab
          roles={roles}
          roleExpectations={roleExpectations}
          activityTypes={activityTypes}
          lobs={linesOfBusiness}
        />
      ) : null}

      {activeTab === "office" ? (
        <OfficePlanTab />
      ) : null}
    </AppShell>
  );
}
