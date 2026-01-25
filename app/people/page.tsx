import { AppShell } from "@/app/components/AppShell";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import AddPersonModalTrigger from "./AddPersonModalTrigger";
import OrgChartClient from "./OrgChartClient";
import PeopleAuthGuard from "./PeopleAuthGuard";
import PeopleRolesClient, { RolesTab, OfficePlanTab } from "./PeopleRolesClient";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TAB_KEYS = ["people", "roles", "office", "orgchart"] as const;

export default async function PeoplePage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) || {};
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const activeTab = TAB_KEYS.includes((tabParam as any) ?? "") ? (tabParam as (typeof TAB_KEYS)[number]) : "people";
  const personIdParam = Array.isArray(sp.personId) ? sp.personId[0] : sp.personId;
  const initialSelectedPersonId = typeof personIdParam === "string" ? personIdParam : null;
  const agencyIdParam = Array.isArray(sp.agencyId) ? sp.agencyId[0] : sp.agencyId;
  const teamIdParam = Array.isArray(sp.teamId) ? sp.teamId[0] : sp.teamId;
  const roleIdParam = Array.isArray(sp.roleId) ? sp.roleId[0] : sp.roleId;
  const qParam = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const selectedAgencyId = typeof agencyIdParam === "string" && agencyIdParam ? agencyIdParam : "";
  const selectedTeamId = typeof teamIdParam === "string" && teamIdParam ? teamIdParam : "";
  const selectedRoleId = typeof roleIdParam === "string" && roleIdParam ? roleIdParam : "";
  const searchQuery = typeof qParam === "string" ? qParam.trim() : "";

  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId ?? null;
  if (!orgId) {
    return (
      <AppShell title="Unauthorized">
        <div>Unauthorized.</div>
      </AppShell>
    );
  }

  const canManagePeople = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);

  const [people, teams, agencies, roleExpectations, personOverrides, linesOfBusiness, activityTypes] =
    await Promise.all([
      prisma.person.findMany({
        where: { orgId },
        orderBy: { fullName: "asc" },
        include: { team: true, role: true, primaryAgency: true, orgRoles: { include: { role: true } } },
      }),
      prisma.team.findMany({
        where: { orgId },
        include: { roles: true },
        orderBy: { name: "asc" },
      }),
      prisma.agency.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
      prisma.benchRoleExpectation.findMany({
        where: { role: { team: { orgId } } },
        include: { role: { include: { team: true } } },
      }),
      prisma.benchPersonOverride.findMany({ where: { person: { orgId } }, include: { person: true } }),
      orgId
        ? prisma.lineOfBusiness.findMany({
            where: { org: { id: orgId } },
            select: { id: true, name: true, premiumCategory: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([] as Array<{ id: string; name: string; premiumCategory: string }>),
      orgId
        ? prisma.activityType.findMany({
            where: { agency: { orgId }, active: true },
            select: { id: true, name: true, active: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([] as Array<{ id: string; name: string; active: boolean }>),
    ]);

  async function createPerson(formData: FormData) {
    "use server";

    const viewer: any = await getOrgViewer();
    const orgId = viewer?.orgId;
    const canManagePeople = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
    if (!orgId || !canManagePeople) return;

    const fullName = String(formData.get("fullName") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const teamId = String(formData.get("teamId") || "");
    const roleId = String(formData.get("roleId") || "");
    const isAdmin = formData.get("isAdmin") === "on";
    const isManager = formData.get("isManager") === "on";
    const primaryAgencyId = String(formData.get("primaryAgencyId") || "");
    if (!fullName || !teamId) return;

    const team = await prisma.team.findFirst({
      where: { id: teamId, orgId },
    });
    if (!team) return;
    const role = roleId ? await prisma.role.findFirst({ where: { id: roleId, teamId } }) : null;
    if (roleId && !role) return;
    if (primaryAgencyId) {
      const agency = await prisma.agency.findFirst({ where: { id: primaryAgencyId, orgId } });
      if (!agency) return;
    }
    const teamType =
      team.name.toLowerCase().includes("service") || team.name.toLowerCase().includes("cs") ? "CS" : "SALES";

    await prisma.person.create({
      data: {
        fullName,
        email: email || null,
        teamType,
        teamId,
        roleId: role?.id || null,
        primaryAgencyId: primaryAgencyId || null,
        orgId,
        isAdmin,
        isManager,
      },
    });

    revalidatePath("/people");
  }

  async function toggleActive(formData: FormData) {
    "use server";

    const viewer: any = await getOrgViewer();
    const orgId = viewer?.orgId;
    const canManagePeople = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
    if (!orgId || !canManagePeople) return;

    const personId = String(formData.get("personId") || "");
    const nextActive = formData.get("nextActive") === "true";
    if (!personId) return;

    const person = await prisma.person.findFirst({ where: { id: personId, orgId } });
    if (!person) return;

    await prisma.person.update({
      where: { id: personId },
      data: { active: nextActive },
    });

    revalidatePath("/people");
  }

  async function updatePrimary(formData: FormData) {
    "use server";

    const viewer: any = await getOrgViewer();
    const orgId = viewer?.orgId;
    const canManagePeople = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
    if (!orgId || !canManagePeople) return;

    const personId = String(formData.get("personId") || "");
    const primaryAgencyId = String(formData.get("primaryAgencyId") || "");
    if (!personId) return;
    const person = await prisma.person.findFirst({ where: { id: personId, orgId } });
    if (!person) return;
    if (primaryAgencyId) {
      const agency = await prisma.agency.findFirst({ where: { id: primaryAgencyId, orgId } });
      if (!agency) return;
    }
    await prisma.person.update({
      where: { id: personId },
      data: { primaryAgencyId: primaryAgencyId || null },
    });
    revalidatePath("/people");
  }

  async function createTeam(formData: FormData) {
    "use server";

    const viewer: any = await getOrgViewer();
    const orgId = viewer?.orgId;
    const canManagePeople = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
    if (!orgId || !canManagePeople) return;

    const teamName = String(formData.get("teamName") || "").trim();
    if (!teamName) return;

    await prisma.team.create({
      data: {
        name: teamName,
        orgId,
        active: true,
      },
    });

    revalidatePath("/people");
  }

  async function toggleTeamActive(formData: FormData) {
    "use server";

    const viewer: any = await getOrgViewer();
    const orgId = viewer?.orgId;
    const canManagePeople = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
    if (!orgId || !canManagePeople) return;

    const teamId = String(formData.get("teamId") || "");
    const nextActive = formData.get("nextActive") === "true";
    if (!teamId) return;

    const team = await prisma.team.findFirst({ where: { id: teamId, orgId } });
    if (!team) return;

    await prisma.team.update({
      where: { id: teamId },
      data: { active: nextActive },
    });

    revalidatePath("/people");
  }

  const tabs: Array<{ key: (typeof TAB_KEYS)[number]; label: string; href: string }> = [
    { key: "people", label: "People", href: "/people?tab=people" },
    { key: "roles", label: "Roles", href: "/people?tab=roles" },
    { key: "office", label: "Office Plan", href: "/people?tab=office" },
    { key: "orgchart", label: "Org Chart", href: "/people?tab=orgchart" },
  ];

  const roles = teams.flatMap((t) => t.roles.map((r) => ({ id: r.id, name: r.name, team: t })));
  const peopleDirectory = [...people].sort((a, b) => a.fullName.localeCompare(b.fullName));
  const selectedPerson = initialSelectedPersonId
    ? peopleDirectory.find((person) => person.id === initialSelectedPersonId) ?? null
    : null;
  const selectedPersonName = selectedPerson?.fullName ?? (initialSelectedPersonId || "");
  const peopleCountByRoleId = new Map<string, number>();
  const peopleCountByTeamId = new Map<string, number>();
  people.forEach((person) => {
    if (person.teamId) {
      peopleCountByTeamId.set(person.teamId, (peopleCountByTeamId.get(person.teamId) ?? 0) + 1);
    }
    if (person.roleId) {
      peopleCountByRoleId.set(person.roleId, (peopleCountByRoleId.get(person.roleId) ?? 0) + 1);
    }
  });
  const teamsSortedForOverview = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  const rolesSortedForOverview = [...roles].sort((a, b) => {
    const teamA = a.team?.name || "";
    const teamB = b.team?.name || "";
    if (teamA !== teamB) return teamA.localeCompare(teamB);
    return a.name.localeCompare(b.name);
  });
  const agencyById = new Map(agencies.map((agency) => [agency.id, agency]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const agencyIndexById = new Map(agencies.map((agency, index) => [agency.id, index]));
  const teamIndexById = new Map(teams.map((team, index) => [team.id, index]));
  const noAgencyLabel = "No primary office";
  const noTeamLabel = "No team";
  const noRoleLabel = "No role";
  const formatPeopleCount = (count: number) => (count === 1 ? "1 person" : `${count} people`);
  const getAgencyLabel = (agencyId: string | null) => {
    if (!agencyId) return noAgencyLabel;
    return agencies.find((agency) => agency.id === agencyId)?.name ?? "Unknown primary office";
  };
  const getTeamLabel = (teamId: string | null, teamName?: string | null) => {
    if (!teamId) return noTeamLabel;
    return teamName ?? teams.find((team) => team.id === teamId)?.name ?? "Unknown team";
  };
  const getRoleLabel = (roleId: string | null, roleName?: string | null) => {
    if (!roleId) return noRoleLabel;
    if (roleName) return roleName;
    for (const team of teams) {
      const foundRole = team.roles.find((role) => role.id === roleId);
      if (foundRole) return foundRole.name;
    }
    return "Unknown role";
  };
  const orgStructureMap = new Map();
  peopleDirectory.forEach((person) => {
    const agencyId = person.primaryAgencyId ?? null;
    const agencyKey = agencyId ?? "__no_agency__";
    const agencyLabel = getAgencyLabel(agencyId);
    let agencyGroup = orgStructureMap.get(agencyKey);
    if (!agencyGroup) {
      const agencyOrder = agencyId ? agencyIndexById.get(agencyId) ?? agencies.length : Number.MAX_SAFE_INTEGER;
      agencyGroup = {
        id: agencyId,
        label: agencyLabel,
        count: 0,
        order: agencyOrder,
        teams: new Map(),
      };
      orgStructureMap.set(agencyKey, agencyGroup);
    }
    agencyGroup.count += 1;

    const teamId = person.teamId ?? null;
    const teamKey = teamId ?? "__no_team__";
    const teamLabel = getTeamLabel(teamId, person.team?.name);
    let teamGroup = agencyGroup.teams.get(teamKey);
    if (!teamGroup) {
      const teamOrder = teamId ? teamIndexById.get(teamId) ?? teams.length : Number.MAX_SAFE_INTEGER;
      teamGroup = {
        id: teamId,
        label: teamLabel,
        count: 0,
        order: teamOrder,
        roles: new Map(),
      };
      agencyGroup.teams.set(teamKey, teamGroup);
    }
    teamGroup.count += 1;

    const roleId = person.roleId ?? null;
    const roleKey = roleId ?? "__no_role__";
    const roleLabel = getRoleLabel(roleId, person.role?.name);
    let roleGroup = teamGroup.roles.get(roleKey);
    if (!roleGroup) {
      roleGroup = {
        id: roleId,
        label: roleLabel,
        count: 0,
        isFallback: !roleId,
        people: [],
      };
      teamGroup.roles.set(roleKey, roleGroup);
    }
    roleGroup.count += 1;
    roleGroup.people.push({ id: person.id, name: person.fullName });
  });
  const orgStructure = Array.from(orgStructureMap.values())
    .map((agencyGroup) => {
      const teams = Array.from(agencyGroup.teams.values())
        .map((teamGroup) => {
          const roles = Array.from(teamGroup.roles.values())
            .map((roleGroup) => ({
              ...roleGroup,
              people: [...roleGroup.people].sort((a, b) => a.name.localeCompare(b.name)),
            }))
            .sort((a, b) => {
              if (a.isFallback !== b.isFallback) return a.isFallback ? 1 : -1;
              return a.label.localeCompare(b.label);
            });
          return { ...teamGroup, roles };
        })
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.label.localeCompare(b.label);
        });
      return { ...agencyGroup, teams };
    })
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    });
  const searchQueryLower = searchQuery.toLowerCase();
  const filteredPeople = peopleDirectory.filter((person) => {
    if (selectedAgencyId) {
      const matchesAgency = person.primaryAgencyId === selectedAgencyId;
      if (!matchesAgency) return false;
    }
    if (selectedTeamId && person.teamId !== selectedTeamId) return false;
    if (selectedRoleId && person.roleId !== selectedRoleId) return false;
    if (searchQueryLower && !person.fullName.toLowerCase().includes(searchQueryLower)) return false;
    return true;
  });
  const filterLabels: string[] = [];
  if (selectedAgencyId) {
    filterLabels.push(`Agency: ${agencyById.get(selectedAgencyId)?.name ?? selectedAgencyId}`);
  }
  if (selectedTeamId) {
    filterLabels.push(`Team: ${teamById.get(selectedTeamId)?.name ?? selectedTeamId}`);
  }
  if (selectedRoleId) {
    filterLabels.push(`Role: ${roleById.get(selectedRoleId)?.name ?? selectedRoleId}`);
  }
  if (searchQuery) {
    filterLabels.push(`Search: "${searchQuery}"`);
  }
  const filterSummary = filterLabels.join(" / ");
  const hasFilters = filterLabels.length > 0;
  const totalCount = peopleDirectory.length;
  const filteredCount = filteredPeople.length;
  const baseParams = new URLSearchParams();
  baseParams.set("tab", "people");
  if (searchQuery) baseParams.set("q", searchQuery);
  const clearParams = new URLSearchParams();
  clearParams.set("tab", "people");
  const buildHref = (params: URLSearchParams) => `/people?${params.toString()}`;
  const clearPersonParams = new URLSearchParams();
  clearPersonParams.set("tab", "people");
  if (selectedAgencyId) clearPersonParams.set("agencyId", selectedAgencyId);
  if (selectedTeamId) clearPersonParams.set("teamId", selectedTeamId);
  if (selectedRoleId) clearPersonParams.set("roleId", selectedRoleId);
  if (searchQuery) clearPersonParams.set("q", searchQuery);
  const clearPersonHref = buildHref(clearPersonParams);
  const buildTeamFilterHref = (team: (typeof teams)[number]) => {
    const params = new URLSearchParams(baseParams);
    params.set("teamId", team.id);
    params.delete("roleId");
    return buildHref(params);
  };
  const buildRoleFilterHref = (role: (typeof roles)[number]) => {
    const params = new URLSearchParams(baseParams);
    params.set("roleId", role.id);
    if (role.team?.id) params.set("teamId", role.team.id);
    return buildHref(params);
  };
  const buildAgencyFilterHref = (agencyId: string) => {
    const params = new URLSearchParams();
    params.set("tab", "people");
    params.set("agencyId", agencyId);
    if (searchQuery) params.set("q", searchQuery);
    return buildHref(params);
  };
  const buildTeamFilterHrefWithinOrgStructure = (agencyId: string | null, teamId: string) => {
    const params = new URLSearchParams();
    params.set("tab", "people");
    params.set("teamId", teamId);
    if (agencyId) params.set("agencyId", agencyId);
    if (searchQuery) params.set("q", searchQuery);
    return buildHref(params);
  };
  const buildRoleFilterHrefWithinOrgStructure = (
    agencyId: string | null,
    teamId: string | null,
    roleId: string
  ) => {
    const params = new URLSearchParams();
    params.set("tab", "people");
    params.set("roleId", roleId);
    if (teamId) params.set("teamId", teamId);
    if (agencyId) params.set("agencyId", agencyId);
    if (searchQuery) params.set("q", searchQuery);
    return buildHref(params);
  };
  const buildPersonHref = (personId: string) => {
    const params = new URLSearchParams();
    params.set("tab", "people");
    if (selectedAgencyId) params.set("agencyId", selectedAgencyId);
    if (selectedTeamId) params.set("teamId", selectedTeamId);
    if (selectedRoleId) params.set("roleId", selectedRoleId);
    if (searchQuery) params.set("q", searchQuery);
    params.set("personId", personId);
    return `/people?${params.toString()}`;
  };

  return (
    <PeopleAuthGuard>
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
        <div style={{ display: "grid", gap: 16, paddingTop: 12 }}>
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "minmax(360px, 440px) 1fr",
              alignItems: "start",
              marginBottom: 16,
            }}
          >
            <div
              className="surface"
              style={{ padding: 12, height: 520, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}
            >
              <div style={{ fontWeight: 800 }}>Org Structure</div>
              <div style={{ flex: "1 1 auto", overflow: "auto", display: "grid", gap: 12 }}>
                {orgStructure.length === 0 ? (
                  <div style={{ color: "#6b7280", fontSize: 13 }}>No people found.</div>
                ) : (
                  orgStructure.map((agencyGroup) => (
                    <div
                      key={agencyGroup.id ?? "no-agency"}
                      style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, display: "grid", gap: 8 }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {agencyGroup.id ? (
                          <a
                            href={buildAgencyFilterHref(agencyGroup.id)}
                            style={{ fontWeight: 800, fontSize: 15, textDecoration: "underline", color: "#2563eb" }}
                          >
                            {agencyGroup.label}
                          </a>
                        ) : (
                          <div style={{ fontWeight: 800, fontSize: 15 }}>{agencyGroup.label}</div>
                        )}
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            border: "1px solid #cbd5e1",
                            borderRadius: 999,
                            padding: "2px 6px",
                            color: "#475569",
                            background: "#f8fafc",
                          }}
                        >
                          {agencyGroup.id ? "Agency" : "Unassigned"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{formatPeopleCount(agencyGroup.count)}</div>
                      <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
                        {agencyGroup.teams.map((teamGroup) => (
                          <div
                            key={teamGroup.id ?? "no-team"}
                            style={{
                              border: "1px solid #f1f5f9",
                              borderRadius: 8,
                              padding: "8px 10px",
                              display: "grid",
                              gap: 6,
                              background: "#fff",
                            }}
                          >
                            {teamGroup.id ? (
                              <a
                                href={buildTeamFilterHrefWithinOrgStructure(agencyGroup.id ?? null, teamGroup.id)}
                                style={{ fontWeight: 700, textDecoration: "underline", color: "#2563eb" }}
                              >
                                {teamGroup.label}
                              </a>
                            ) : (
                              <div style={{ fontWeight: 700 }}>{teamGroup.label}</div>
                            )}
                            <div style={{ fontSize: 12, color: "#64748b" }}>{formatPeopleCount(teamGroup.count)}</div>
                            <div style={{ display: "grid", gap: 6 }}>
                              {teamGroup.roles.map((roleGroup) => (
                                <div
                                  key={roleGroup.id ?? "no-role"}
                                  style={{ borderLeft: "2px solid #e2e8f0", paddingLeft: 8, display: "grid", gap: 4 }}
                                >
                                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                                    {roleGroup.id ? (
                                      <a
                                        href={buildRoleFilterHrefWithinOrgStructure(
                                          agencyGroup.id ?? null,
                                          teamGroup.id ?? null,
                                          roleGroup.id
                                        )}
                                        style={{ fontWeight: 600, textDecoration: "underline", color: "#2563eb" }}
                                      >
                                        {roleGroup.label}
                                      </a>
                                    ) : (
                                      <div style={{ fontWeight: 600 }}>{roleGroup.label}</div>
                                    )}
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                                      {formatPeopleCount(roleGroup.count)}
                                    </div>
                                  </div>
                                  {roleGroup.people.length ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: "4px 10px",
                                        fontSize: 12,
                                        color: "#111827",
                                      }}
                                    >
                                      {roleGroup.people.map((person) => (
                                        <a
                                          key={person.id}
                                          href={`${buildPersonHref(person.id)}#people-editor`}
                                          style={{ padding: "2px 0", textDecoration: "underline", color: "#2563eb" }}
                                        >
                                          {person.name}
                                        </a>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: 12, color: "#94a3b8" }}>No people assigned.</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div
              className="surface"
              style={{ padding: 12, height: 520, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 800 }}>People Directory</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>
                  Showing {filteredCount} of {totalCount}
                </div>
              </div>
              {initialSelectedPersonId ? (
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  Selected: {selectedPersonName} ·{" "}
                  <a
                    href="#people-editor"
                    style={{ color: "#2563eb", textDecoration: "underline", fontWeight: 600 }}
                  >
                    Open editor
                  </a>{" "}
                  ·{" "}
                  <a
                    href={clearPersonHref}
                    style={{ color: "#2563eb", textDecoration: "underline", fontWeight: 600 }}
                  >
                    Clear
                  </a>
                </div>
              ) : null}
              <div style={{ flex: "1 1 auto", overflow: "auto", display: "grid", gap: 10 }}>
                {hasFilters ? (
                  <div style={{ fontSize: 12, color: "#475569", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span>{filterSummary}</span>
                    <a
                      href={buildHref(clearParams)}
                      style={{ color: "#2563eb", textDecoration: "underline", fontWeight: 600 }}
                    >
                      Clear
                    </a>
                  </div>
                ) : null}
                <form method="get" action="/people" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="tab" value="people" />
                  {selectedAgencyId ? <input type="hidden" name="agencyId" value={selectedAgencyId} /> : null}
                  {selectedTeamId ? <input type="hidden" name="teamId" value={selectedTeamId} /> : null}
                  {selectedRoleId ? <input type="hidden" name="roleId" value={selectedRoleId} /> : null}
                  <input
                    name="q"
                    defaultValue={searchQuery}
                    placeholder="Search people..."
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", minWidth: 220, flex: "1 1 220px" }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #111827",
                      background: "#111827",
                      color: "#fff",
                      fontWeight: 700,
                    }}
                  >
                    Search
                  </button>
                </form>
                {filteredPeople.length === 0 ? (
                  <div style={{ color: "#6b7280", fontSize: 13 }}>No people found.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                        <th style={{ padding: 8 }}>Name</th>
                        <th style={{ padding: 8 }}>Agency</th>
                        <th style={{ padding: 8 }}>Team</th>
                        <th style={{ padding: 8 }}>Role</th>
                        <th style={{ padding: 8 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPeople.map((person) => {
                        const agencyName = person.primaryAgency?.name || "—";
                        const teamName = person.team?.name || "—";
                        const roleName = person.role?.name || "—";
                        const status = person.active === false ? "Inactive" : "Active";
                        const statusColor = person.active === false ? "#b91c1c" : "#15803d";
                        return (
                          <tr key={person.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: 8 }}>
                              <a
                                href={buildPersonHref(person.id)}
                                title={person.fullName}
                                style={{ textDecoration: "none", color: "inherit", fontWeight: 600 }}
                              >
                                {person.fullName}
                              </a>
                            </td>
                            <td style={{ padding: 8 }}>{agencyName}</td>
                            <td style={{ padding: 8 }}>{teamName}</td>
                            <td style={{ padding: 8 }}>{roleName}</td>
                            <td style={{ padding: 8, color: statusColor, fontWeight: 600 }}>{status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
          <div
            className="surface"
            style={{ padding: 12, marginTop: 12, marginBottom: 16, position: "relative", zIndex: 1 }}
          >
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Teams & Roles Overview</div>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(280px, 1fr) minmax(280px, 1fr)" }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Teams</div>
                {teamsSortedForOverview.length === 0 ? (
                  <div style={{ color: "#6b7280", fontSize: 13 }}>No teams found.</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #e5e7eb",
                            color: "#6b7280",
                            fontSize: 12,
                          }}
                        >
                          <th style={{ padding: "6px 0" }}>Team</th>
                          <th style={{ padding: "6px 0" }}>Status</th>
                          <th style={{ padding: "6px 0" }}>People</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamsSortedForOverview.map((team) => {
                          const count = peopleCountByTeamId.get(team.id) ?? 0;
                          return (
                            <tr key={team.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "6px 0" }}>
                                <a
                                  href={buildTeamFilterHref(team)}
                                  style={{ fontWeight: 600, textDecoration: "none", color: "inherit" }}
                                >
                                  {team.name}
                                </a>
                              </td>
                              <td
                                style={{
                                  padding: "6px 0",
                                  fontSize: 12,
                                  color: team.active ? "#15803d" : "#b91c1c",
                                }}
                              >
                                {team.active ? "Active" : "Inactive"}
                              </td>
                              <td style={{ padding: "6px 0", fontSize: 12, color: "#475569" }}>{count}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Roles</div>
                {rolesSortedForOverview.length === 0 ? (
                  <div style={{ color: "#6b7280", fontSize: 13 }}>No roles found.</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #e5e7eb",
                            color: "#6b7280",
                            fontSize: 12,
                          }}
                        >
                          <th style={{ padding: "6px 0" }}>Role</th>
                          <th style={{ padding: "6px 0" }}>Team</th>
                          <th style={{ padding: "6px 0" }}>People</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rolesSortedForOverview.map((role) => {
                          const count = peopleCountByRoleId.get(role.id) ?? 0;
                          return (
                            <tr key={role.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                              <td style={{ padding: "6px 0" }}>
                                <a
                                  href={buildRoleFilterHref(role)}
                                  style={{ fontWeight: 600, textDecoration: "none", color: "inherit" }}
                                >
                                  {role.name}
                                </a>
                              </td>
                              <td style={{ padding: "6px 0", fontSize: 12, color: "#475569" }}>
                                {role.team?.name || "—"}
                              </td>
                              <td style={{ padding: "6px 0", fontSize: 12, color: "#475569" }}>{count}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
          {canManagePeople ? (
            <>
              <div className="surface" style={{ padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Manage</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <AddPersonModalTrigger agencies={agencies} teams={teams} createPerson={createPerson} />
                  <details>
                    <summary
                      style={{
                        fontWeight: 800,
                        cursor: "pointer",
                        padding: 10,
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        background: "#fff",
                      }}
                    >
                      Teams
                    </summary>
                    <div style={{ padding: "10px 4px 4px", maxWidth: 700 }}>
                      <h2 style={{ marginTop: 0 }}>Teams</h2>
                      <form action={createTeam} style={{ display: "grid", gap: 10 }}>
                        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                          <label>
                            Team Name
                            <br />
                            <input name="teamName" required style={{ padding: 8, width: "100%" }} />
                          </label>
                        </div>
                        <button type="submit" style={{ padding: "10px 14px", width: 160 }}>
                          Add Team
                        </button>
                      </form>

                      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                        {teams.length === 0 ? (
                          <div style={{ color: "#6b7280", fontSize: 13 }}>No teams found.</div>
                        ) : (
                          teams.map((team) => (
                            <form
                              key={team.id}
                              action={toggleTeamActive}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 12,
                                border: "1px solid #e5e7eb",
                                borderRadius: 8,
                                padding: "8px 10px",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600 }}>{team.name}</div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, color: team.active ? "#15803d" : "#b91c1c" }}>
                                  {team.active ? "Active" : "Inactive"}
                                </span>
                                <input type="hidden" name="teamId" value={team.id} />
                                <input type="hidden" name="nextActive" value={team.active ? "false" : "true"} />
                                <button type="submit" style={{ padding: "6px 10px" }}>
                                  {team.active ? "Deactivate" : "Activate"}
                                </button>
                              </div>
                            </form>
                          ))
                        )}
                      </div>
                    </div>
                  </details>
                </div>
              </div>
              <div id="people-editor" style={{ scrollMarginTop: 120 }} />
              <PeopleRolesClient
                people={people}
                teams={teams}
                agencies={agencies}
                roleExpectations={roleExpectations}
                personOverrides={personOverrides}
                initialSelectedPersonId={initialSelectedPersonId}
                canManagePeople={canManagePeople}
              />
            </>
          ) : (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(240px, 1fr) minmax(240px, 1fr)" }}>
              <div className="surface">
                <h2 style={{ marginTop: 0 }}>People</h2>
                {people.length === 0 ? (
                  <div style={{ color: "#6b7280", fontSize: 13 }}>No people found.</div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {people.map((p) => (
                      <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}>
                        <div style={{ fontWeight: 600 }}>{p.fullName}</div>
                        {p.email ? (
                          <div style={{ fontSize: 12, color: "#6b7280" }}>{p.email}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="surface">
                <h2 style={{ marginTop: 0 }}>Access</h2>
                <div style={{ fontSize: 13, color: "#475569" }}>
                  You can view people, but you don't have permission to edit roles/teams or add users.
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "roles" ? (
        <RolesTab
          roles={roles}
          roleExpectations={roleExpectations}
          activityTypes={activityTypes}
          lobs={linesOfBusiness}
          canManagePeople={canManagePeople}
        />
      ) : null}

      {activeTab === "office" ? (
        <OfficePlanTab />
      ) : null}

      {activeTab === "orgchart" ? (
        <OrgChartClient
          canManagePeople={canManagePeople}
          ownerName={viewer?.fullName || ""}
          people={people}
          teams={teams}
        />
      ) : null}
      </AppShell>
    </PeopleAuthGuard>
  );
}
