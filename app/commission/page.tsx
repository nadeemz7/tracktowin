import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { CommissionScope, TeamType } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { ComponentsListClient } from "./ComponentsListClient";
import { SimpleComponentBuilder } from "./SimpleComponentBuilder";

type PersonWithContext = Awaited<ReturnType<typeof prisma.person.findMany>>[number];

function matchingPeople(plan: Awaited<typeof prisma.commissionPlan.findMany>[number], people: PersonWithContext[]) {
  if (plan.scope === CommissionScope.PERSON && plan.personId) {
    return people.filter((p) => p.id === plan.personId);
  }
  if (plan.scope === CommissionScope.ROLE && plan.roleId) {
    return people.filter((p) => p.roleId === plan.roleId);
  }
  if (plan.scope === CommissionScope.TEAM && plan.teamId) {
    return people.filter((p) => p.teamId === plan.teamId);
  }
  if (plan.scope === CommissionScope.AGENCY && plan.agencyId) {
    return people.filter((p) => {
      return p.primaryAgencyId === plan.agencyId;
    });
  }
  if (plan.scope === CommissionScope.TEAM_TYPE && plan.teamType) {
    return people.filter((p) => p.teamType === plan.teamType);
  }
  return [];
}

const BUCKET_OPTIONS: { value: string; label: string }[] = [
  { value: "auto_personal_raw_new_apps", label: "Auto Raw New (apps)" },
  { value: "auto_personal_adds_apps", label: "Auto Adds (apps)" },
  { value: "business_auto_premium", label: "Business Auto Premium" },
  { value: "business_auto_adds_premium", label: "Business Auto Adds Premium" },
  { value: "fire_personal_premium", label: "Fire Personal Premium" },
  { value: "business_fire_premium", label: "Business Fire Premium" },
  { value: "health_premium", label: "Health Premium" },
  { value: "life_premium", label: "Life Premium" },
  { value: "pc_premium", label: "P&C Premium" },
  { value: "fs_premium", label: "Financial Services Premium" },
  { value: "pc_apps_total", label: "P&C Apps (total)" },
  { value: "fs_apps_total", label: "FS Apps (total)" },
  { value: "ips_premium", label: "IPS Premium" },
  { value: "business_premium", label: "Business Premium (all)" },
];

function salesComponents() {
  return [
    {
      name: "Auto Personal Raw New",
      componentType: "TIERED_PER_APP",
      config: {
        bucket: "auto_personal_raw_new_apps",
        tiers: [
          { min: 0, max: 19, ratePerApp: 10 },
          { min: 20, max: 30, ratePerApp: 25 },
          { min: 31, ratePerApp: 40 },
        ],
      },
    },
    {
      name: "Auto Personal Adds",
      componentType: "FLAT_PER_APP",
      config: { bucket: "auto_personal_adds_apps", ratePerApp: 5 },
    },
    {
      name: "Business Auto Premium",
      componentType: "PERCENT_TIER",
      config: {
        bucket: "business_auto_premium",
        tiers: [
          { min: 0, max: 50000, percent: 0.02 },
          { min: 50000.01, percent: 0.03 },
        ],
      },
    },
    {
      name: "Business Auto Adds",
      componentType: "PERCENT_FLAT",
      config: { bucket: "business_auto_adds_premium", percent: 0.005 },
    },
    {
      name: "Fire Personal",
      componentType: "PERCENT_FLAT",
      config: { bucket: "fire_personal_premium", percent: 0.03 },
    },
    {
      name: "Business Fire Premium",
      componentType: "PERCENT_TIER",
      config: {
        bucket: "business_fire_premium",
        tiers: [
          { min: 0, max: 50000, percent: 0.02 },
          { min: 50000.01, percent: 0.03 },
        ],
      },
    },
    {
      name: "Health Premium",
      componentType: "PERCENT_TIER",
      config: {
        bucket: "health_premium",
        tiers: [
          { min: 0, max: 400, percent: 0.1 },
          { min: 401, max: 800, percent: 0.14 },
          { min: 801, percent: 0.18 },
        ],
        flagOverrides: [{ flagField: "isValueHealth", percent: 0.2 }],
      },
    },
    {
      name: "Life Premium",
      componentType: "PERCENT_TIER",
      config: {
        bucket: "life_premium",
        tiers: [
          { min: 0, max: 3000, percent: 0.1 },
          { min: 3001, max: 6000, percent: 0.14 },
          { min: 6001, percent: 0.18 },
        ],
        flagOverrides: [{ flagField: "isValueLife", percent: 0.2 }],
      },
    },
    {
      name: "Bonus Tiers (placeholder)",
      componentType: "BONUS_TIER",
      config: {
        note: "Add Bronze/Silver/Gold thresholds and bonuses here.",
      },
    },
    {
      name: "Sales Activity Pay",
      componentType: "ACTIVITY_PAY",
      config: {
        activities: [
          { activityName: "FS Appointment Scheduled & Held", amount: 10 },
          { activityName: "3 Line Bonus", amount: 7 },
          { activityName: "4 Line Bonus", amount: 10 },
        ],
      },
    },
  ];
}

function csComponents() {
  const base = salesComponents().filter((c) => c.componentType !== "BONUS_TIER");
  base.push({
    name: "Large Bonus (P&C + FS)",
    componentType: "BONUS_VOLUME",
    config: {
      requirements: { pcApps: 20, fsApps: 12 },
      bonusPercents: { pcPremium: 0.02, fsPremium: 0.04 },
      buckets: { pcPremium: "pc_premium", fsPremium: "fs_premium", pcApps: "pc_apps_total", fsApps: "fs_apps_total" },
      note: "Applies when both app thresholds are met in the month.",
    },
  });
  base.push({
    name: "CS Activity Pay",
    componentType: "ACTIVITY_PAY",
    config: {
      activities: [{ activityName: "FS Appointment Scheduled & Held", amount: 10 }],
    },
  });
  return base;
}

async function upsertDefaultPlan(teamType: TeamType, name: string, componentDefs: ReturnType<typeof salesComponents>) {
  let plan = await prisma.commissionPlan.findFirst({
    where: { isDefaultForTeamType: true, teamType },
  });

  if (!plan) {
    plan = await prisma.commissionPlan.create({
      data: {
        name,
        scope: CommissionScope.TEAM_TYPE,
        teamType,
        isDefaultForTeamType: true,
        components: { create: componentDefs.map((c, idx) => ({ ...c, displayOrder: idx })) },
      },
    });
  } else {
    await prisma.commissionComponent.deleteMany({ where: { planId: plan.id } });
    await prisma.commissionComponent.createMany({
      data: componentDefs.map((c, idx) => ({
        planId: plan!.id,
        name: c.name,
        componentType: c.componentType,
        config: c.config as object,
        displayOrder: idx,
      })),
    });
  }

  const people = await prisma.person.findMany({ where: { teamType } });
  if (people.length > 0) {
    await prisma.commissionPlanAssignment.createMany({
      data: people.map((p) => ({
        personId: p.id,
        planId: plan!.id,
        effectiveFrom: plan!.effectiveFrom,
      })),
      skipDuplicates: true,
    });
  }

  return plan;
}

async function ensureDefaultPlans() {
  await upsertDefaultPlan(TeamType.SALES, "Sales Default Plan", salesComponents());
  await upsertDefaultPlan(TeamType.CS, "Customer Service Default Plan", csComponents());
}

export default async function CommissionPage() {
  await ensureDefaultPlans();

  const plans = await prisma.commissionPlan.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      components: { orderBy: { displayOrder: "asc" } },
      assignments: { include: { person: true }, orderBy: { effectiveFrom: "desc" } },
      agency: true,
      team: true,
      role: { include: { team: true } },
      person: true,
    },
  });

  const people = await prisma.person.findMany({
    orderBy: { fullName: "asc" },
    include: {
      team: true,
      role: { include: { team: true } },
    },
  });
  const agencies = await prisma.agency.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
  });
  const roles = await prisma.role.findMany({
    include: { team: true },
    orderBy: { name: "asc" },
  });

  async function createCustomPlan(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "").trim();
    const scope = String(formData.get("scope") || CommissionScope.PERSON) as CommissionScope;
    const targetPersonId = String(formData.get("targetPersonId") || "");
    const targetTeamType = String(formData.get("targetTeamType") || "");
    const targetTeamId = String(formData.get("targetTeamId") || "");
    const targetRoleId = String(formData.get("targetRoleId") || "");
    const targetAgencyId = String(formData.get("targetAgencyId") || "") || null;
    const defaultTeamType = String(formData.get("isDefaultForTeamType") || "");
    if (!name) return;

    const payload: Parameters<typeof prisma.commissionPlan.create>[0]["data"] = {
      name,
      scope,
      agencyId: null,
      teamId: null,
      roleId: null,
      personId: null,
      teamType: null,
      isDefaultForTeamType: false,
    };

    payload.agencyId = targetAgencyId || null;

    if (scope === CommissionScope.AGENCY) {
      payload.agencyId = targetAgencyId;
    } else if (scope === CommissionScope.TEAM) {
      payload.teamId = targetTeamId || null;
    } else if (scope === CommissionScope.ROLE) {
      payload.roleId = targetRoleId || null;
    } else if (scope === CommissionScope.PERSON) {
      payload.personId = targetPersonId || null;
    } else if (scope === CommissionScope.TEAM_TYPE) {
      payload.teamType = (targetTeamType || "SALES") as TeamType;
      payload.isDefaultForTeamType = defaultTeamType === "on";
    }

    const plan = await prisma.commissionPlan.create({
      data: payload,
    });

    if (scope === CommissionScope.PERSON && targetPersonId) {
      await prisma.commissionPlanAssignment.create({
        data: { personId: targetPersonId, planId: plan.id },
      });
    }

    revalidatePath("/commission");
  }

  async function addComponentSimple(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    const name = String(formData.get("simpleName") || "").trim();
    const simpleType = String(formData.get("simpleType") || "");
    const bucketOption = String(formData.get("bucketOption") || "");
    const bucketCustom = String(formData.get("bucketCustom") || "").trim();
    const bucket = bucketOption === "CUSTOM" ? bucketCustom : bucketOption;
    const rateStr = String(formData.get("simpleRate") || "");
    const tierRowsRaw = String(formData.get("tierRows") || "[]");
    const flagOverridesRaw = String(formData.get("flagOverrides") || "[]");
    const activityName = String(formData.get("activityName") || "").trim();
    const activityAmountStr = String(formData.get("activityAmount") || "");
    if (!planId || !name) return;

    let flagOverrides: { flagField: string; percent: number }[] = [];
    try {
      const parsed = JSON.parse(flagOverridesRaw) as string[];
      flagOverrides = parsed
        .filter((f) => f === "isValueHealth" || f === "isValueLife")
        .map((flagField) => ({ flagField, percent: 0.2 }));
    } catch {
      flagOverrides = [];
    }

    let config: Record<string, unknown> | null = null;
    let componentType: string | null = null;

    if (simpleType === "PER_APP_FLAT") {
      const rate = Number(rateStr);
      if (Number.isNaN(rate) || !bucket) return;
      componentType = "FLAT_PER_APP";
      config = { bucket, ratePerApp: rate };
    } else if (simpleType === "PER_APP_TIER") {
      let tiers: { min: number; max?: number; ratePerApp: number }[] = [];
      try {
        const rows = JSON.parse(tierRowsRaw) as { min?: string; max?: string; value?: string }[];
        tiers = rows
          .map((r) => ({
            min: Number(r.min ?? 0),
            max: r.max ? Number(r.max) : undefined,
            ratePerApp: Number(r.value ?? 0),
          }))
          .filter((t) => !Number.isNaN(t.min) && !Number.isNaN(t.ratePerApp));
      } catch {
        tiers = [];
      }
      if (!bucket || tiers.length === 0) return;
      componentType = "TIERED_PER_APP";
      config = { bucket, tiers };
    } else if (simpleType === "PERCENT_FLAT") {
      const percent = Number(rateStr);
      if (Number.isNaN(percent) || !bucket) return;
      componentType = "PERCENT_FLAT";
      config = { bucket, percent: percent / 100, ...(flagOverrides.length ? { flagOverrides } : {}) };
    } else if (simpleType === "PERCENT_TIER") {
      let tiers: { min: number; max?: number; percent: number }[] = [];
      try {
        const rows = JSON.parse(tierRowsRaw) as { min?: string; max?: string; value?: string }[];
        tiers = rows
          .map((r) => ({
            min: Number(r.min ?? 0),
            max: r.max ? Number(r.max) : undefined,
            percent: Number(r.value ?? 0) / 100,
          }))
          .filter((t) => !Number.isNaN(t.min) && !Number.isNaN(t.percent));
      } catch {
        tiers = [];
      }
      if (!bucket || tiers.length === 0) return;
      componentType = "PERCENT_TIER";
      config = { bucket, tiers, ...(flagOverrides.length ? { flagOverrides } : {}) };
    } else if (simpleType === "ACTIVITY") {
      const amount = Number(activityAmountStr);
      if (!activityName || Number.isNaN(amount)) return;
      componentType = "ACTIVITY_PAY";
      config = { activities: [{ activityName, amount }] };
    }

    if (!componentType || !config) return;

    const maxOrder = await prisma.commissionComponent.aggregate({
      where: { planId },
      _max: { displayOrder: true },
    });
    const nextOrder = (maxOrder._max.displayOrder || 0) + 1;

    await prisma.commissionComponent.create({
      data: { planId, name, componentType, config, displayOrder: nextOrder },
    });
    revalidatePath("/commission");
  }

  async function deleteComponent(formData: FormData) {
    "use server";
    const id = String(formData.get("componentId") || "");
    if (!id) return;
    await prisma.commissionComponent.delete({ where: { id } });
    revalidatePath("/commission");
  }

  async function moveComponent(formData: FormData) {
    "use server";
    const id = String(formData.get("componentId") || "");
    const direction = String(formData.get("direction") || "");
    const planId = String(formData.get("planId") || "");
    if (!id || !direction || !planId) return;
    const components = await prisma.commissionComponent.findMany({
      where: { planId },
      orderBy: { displayOrder: "asc" },
    });
    const idx = components.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= components.length) return;
    const current = components[idx];
    const target = components[targetIdx];
    await prisma.$transaction([
      prisma.commissionComponent.update({
        where: { id: current.id },
        data: { displayOrder: target.displayOrder },
      }),
      prisma.commissionComponent.update({
        where: { id: target.id },
        data: { displayOrder: current.displayOrder },
      }),
    ]);
    revalidatePath("/commission");
  }

  async function deleteAssignment(formData: FormData) {
    "use server";
    const assignmentId = String(formData.get("assignmentId") || "");
    if (!assignmentId) return;
    await prisma.commissionPlanAssignment.delete({ where: { id: assignmentId } });
    revalidatePath("/commission");
  }

  async function assignPlan(formData: FormData) {
    "use server";
    const planId = String(formData.get("assignPlanId") || "");
    const personId = String(formData.get("assignPersonId") || "");
    const teamType = String(formData.get("assignTeamType") || "");
    const teamId = String(formData.get("assignTeamId") || "");
    const roleId = String(formData.get("assignRoleId") || "");
    const agencyId = String(formData.get("assignAgencyId") || "");
    const effectiveStr = String(formData.get("effectiveFrom") || "");
    if (!planId) return;
    const effectiveFrom = effectiveStr ? new Date(effectiveStr) : new Date();

    const baseUpdates: Record<string, unknown> = {
      agencyId: null,
      teamId: null,
      roleId: null,
      personId: null,
      teamType: null,
    };
    let scope: CommissionScope | null = null;
    let targetPeople: { id: string }[] = [];

    if (personId) {
      scope = CommissionScope.PERSON;
      baseUpdates.personId = personId;
      targetPeople = [{ id: personId }];
    } else if (roleId) {
      scope = CommissionScope.ROLE;
      baseUpdates.roleId = roleId;
      targetPeople = await prisma.person.findMany({ where: { roleId } });
    } else if (teamId) {
      scope = CommissionScope.TEAM;
      baseUpdates.teamId = teamId;
      targetPeople = await prisma.person.findMany({ where: { teamId } });
    } else if (agencyId) {
      scope = CommissionScope.AGENCY;
      baseUpdates.agencyId = agencyId;
      targetPeople = await prisma.person.findMany({ where: { primaryAgencyId: agencyId } });
    } else if (teamType === "SALES" || teamType === "CS") {
      scope = CommissionScope.TEAM_TYPE;
      baseUpdates.teamType = teamType as TeamType;
      targetPeople = await prisma.person.findMany({ where: { teamType: teamType as TeamType } });
    }

    if (scope) {
      await prisma.commissionPlan.update({
        where: { id: planId },
        data: { ...baseUpdates, scope },
      });
    }

    if (targetPeople.length > 0) {
      await prisma.commissionPlanAssignment.createMany({
        data: targetPeople.map((p) => ({ personId: p.id, planId, effectiveFrom })),
        skipDuplicates: true,
      });
    }

    revalidatePath("/commission");
  }

  async function clonePlan(formData: FormData) {
    "use server";
    const planId = String(formData.get("clonePlanId") || "");
    const customName = String(formData.get("cloneName") || "").trim();
    if (!planId) return;

    const plan = await prisma.commissionPlan.findUnique({
      where: { id: planId },
      include: { components: true },
    });
    if (!plan) return;

    const name = customName || `${plan.name} (Copy)`;
    const sortedComponents = [...plan.components].sort((a, b) => a.displayOrder - b.displayOrder);

    await prisma.commissionPlan.create({
      data: {
        name,
        scope: plan.scope,
        agencyId: plan.agencyId,
        teamId: plan.teamId,
        roleId: plan.roleId,
        personId: plan.personId,
        teamType: plan.teamType,
        isDefaultForTeamType: false,
        components: {
          create: sortedComponents.map((c) => ({
            name: c.name,
            componentType: c.componentType,
            config: c.config as object,
            displayOrder: c.displayOrder,
          })),
        },
      },
    });

    revalidatePath("/commission");
  }

  const reorderComponents = async (input: { planId: string; orderedIds: string[] }) => {
    "use server";
    if (!input.planId || !input.orderedIds?.length) return;
    const updates = input.orderedIds.map((id, idx) =>
      prisma.commissionComponent.update({ where: { id }, data: { displayOrder: idx } })
    );
    await prisma.$transaction(updates);
    revalidatePath("/commission");
  };

  return (
    <AppShell
      title="Commission Plans"
      subtitle="Default Sales/CS plans plus modular builder with dated assignments and activity pay."
    >
      <div className="surface">
        <h2 style={{ marginTop: 0 }}>Create Custom Plan</h2>
        <form action={createCustomPlan} style={{ display: "grid", gap: 10 }}>
          <label>
            Plan name
            <br />
            <input name="name" style={{ padding: 8, width: "100%" }} />
          </label>
          <label>
            Scope
            <br />
            <select name="scope" defaultValue={CommissionScope.PERSON} style={{ padding: 8, width: "100%" }}>
              <option value={CommissionScope.PERSON}>Person</option>
              <option value={CommissionScope.TEAM_TYPE}>Team Type (Sales/CS)</option>
              <option value={CommissionScope.TEAM}>Team</option>
              <option value={CommissionScope.ROLE}>Role</option>
              <option value={CommissionScope.AGENCY}>Agency</option>
            </select>
          </label>
          <div style={{ color: "#555", fontSize: 13 }}>
            Choose the scope first, then fill only the matching target (person/team/role/agency/team type).
          </div>

          <label>
            Person (for person plans)
            <br />
            <select name="targetPersonId" style={{ padding: 8, width: "100%" }}>
              <option value="">None</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </label>

          <label>
            Team type (for team type plans)
            <br />
            <select name="targetTeamType" style={{ padding: 8, width: "100%" }}>
              <option value="SALES">Sales</option>
              <option value="CS">Customer Service</option>
            </select>
          </label>

          <label>
            Team (for team-scoped plans)
            <br />
            <select name="targetTeamId" style={{ padding: 8, width: "100%" }}>
              <option value="">None</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Role (for role-scoped plans)
            <br />
            <select name="targetRoleId" style={{ padding: 8, width: "100%" }}>
              <option value="">None</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {`${r.team.name} / ${r.name}`}
                </option>
              ))}
            </select>
          </label>

          <label>
            Agency (optional scoping)
            <br />
            <select name="targetAgencyId" style={{ padding: 8, width: "100%" }}>
              <option value="">All agencies</option>
              {agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" name="isDefaultForTeamType" /> Set as default for selected team type
          </label>

          <div style={{ color: "#555", fontSize: 13 }}>
            Only the field matching the chosen scope is used. Person plans auto-assign to that person; defaults only apply to Sales/CS scopes.
          </div>

          <button type="submit" style={{ padding: "10px 14px", width: 160 }}>
            Create Plan
          </button>
        </form>
      </div>

      <div className="surface">
        <h2 style={{ marginTop: 0 }}>Existing Plans</h2>
        {plans.length === 0 ? (
          <p style={{ color: "#555" }}>No plans yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 8 }}>
            {plans.map((plan) => {
              const scopeBits: string[] = [];
              if (plan.scope === CommissionScope.TEAM_TYPE && plan.teamType) {
                scopeBits.push(`Team Type: ${plan.teamType}${plan.isDefaultForTeamType ? " (default)" : ""}`);
              }
              if (plan.scope === CommissionScope.AGENCY && plan.agency) {
                scopeBits.push(`Agency: ${plan.agency.name}`);
              }
              if (plan.scope === CommissionScope.TEAM && plan.team) {
                scopeBits.push(`Team: ${plan.team.name}`);
              }
              if (plan.scope === CommissionScope.ROLE && plan.role) {
                scopeBits.push(
                  `Role: ${
                    `${plan.role.team.name} / ${plan.role.name}`
                  }`
                );
              }
              if (plan.scope === CommissionScope.PERSON && plan.person) {
                scopeBits.push(`Person: ${plan.person.fullName}`);
              }
              const scopeLabel = scopeBits.length ? scopeBits.join(" • ") : plan.scope;

              const matched = matchingPeople(plan, people);
              const matchedPreview = matched.slice(0, 3).map((p) => p.fullName);

              return (
                <div key={plan.id} style={{ border: "1px solid #e3e6eb", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Link href={`/commission/${plan.id}`} style={{ fontWeight: 700 }}>
                      {plan.name}
                    </Link>
                    <span style={{ fontSize: 12, color: "#777" }}>({plan.components.length} rules)</span>
                    <form action={clonePlan} style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                      <input type="hidden" name="clonePlanId" value={plan.id} />
                      <input
                        name="cloneName"
                        placeholder="Copy name (optional)"
                        style={{ padding: 6, border: "1px solid #dcdfe6", borderRadius: 6, minWidth: 180 }}
                      />
                      <button style={{ padding: "6px 10px" }}>Clone plan</button>
                    </form>
                    <Link href={`/commission/${plan.id}`} style={{ padding: "6px 10px", border: "1px solid #dcdfe6", borderRadius: 6 }}>
                      Open
                    </Link>
                  </div>
                  <div style={{ color: "#333", marginTop: 2 }}>Scope: {scopeLabel}</div>
                  <div style={{ color: "#555", fontSize: 13, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>Effective from {plan.effectiveFrom.toISOString().slice(0, 10)}</span>
                    <span>Matches {matched.length} people{matchedPreview.length ? ` (${matchedPreview.join(", ")}${matched.length > 3 ? "…" : ""})` : ""}</span>
                    <span>{plan.assignments.length} person assignment{plan.assignments.length === 1 ? "" : "s"}</span>
                  </div>
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <ComponentsListClient
                      planId={plan.id}
                      components={plan.components}
                      reorderAction={reorderComponents}
                      moveAction={moveComponent}
                      deleteAction={deleteComponent}
                    />
                  </div>

                  <div style={{ marginTop: 10, padding: 8, background: "#f7f8fb", borderRadius: 8 }}>
                    <div style={{ fontWeight: 600 }}>Assignments</div>
                    {plan.assignments.length === 0 ? (
                      <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>No person assignments yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                        {plan.assignments.map((a) => (
                          <div
                            key={a.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: 8,
                              borderRadius: 6,
                              background: "#fff",
                              border: "1px solid #e3e6eb",
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>{a.person?.fullName || "Unknown person"}</div>
                            <div style={{ color: "#555", fontSize: 13 }}>
                              Effective {a.effectiveFrom.toISOString().slice(0, 10)}
                            </div>
                            <form action={deleteAssignment} style={{ marginLeft: "auto" }}>
                              <input type="hidden" name="assignmentId" value={a.id} />
                              <button style={{ padding: "6px 10px", background: "#fce8e8", border: "1px solid #f5c2c2" }}>
                                Remove
                              </button>
                            </form>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Add a new earning rule</div>
                    <div style={{ color: "#555", fontSize: 13, marginBottom: 6 }}>
                      Choose the metric, pick flat or tiered, and enter amounts. No code required.
                    </div>
                    <SimpleComponentBuilder planId={plan.id} bucketOptions={BUCKET_OPTIONS} addAction={addComponentSimple} />
                  </div>

                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer" }}>Assign plan</summary>
                    <form action={assignPlan} style={{ display: "grid", gap: 8, marginTop: 6 }}>
                      <input type="hidden" name="assignPlanId" value={plan.id} />
                      <label>
                        Scope
                        <br />
                        <select name="assignTeamType" style={{ padding: 8, width: "100%" }}>
                          <option value="">Person/Team/Role/Agency assignment</option>
                          <option value="SALES">Team Type: SALES</option>
                          <option value="CS">Team Type: CS</option>
                        </select>
                      </label>
                      <label>
                        Agency
                        <br />
                        <select name="assignAgencyId" style={{ padding: 8, width: "100%" }}>
                          <option value="">None</option>
                          {agencies.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Team
                        <br />
                        <select name="assignTeamId" style={{ padding: 8, width: "100%" }}>
                          <option value="">None</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Role
                        <br />
                        <select name="assignRoleId" style={{ padding: 8, width: "100%" }}>
                          <option value="">None</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {`${r.team.name} / ${r.name}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Person (for person assignments)
                        <br />
                        <select name="assignPersonId" style={{ padding: 8, width: "100%" }}>
                          <option value="">None</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.fullName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Effective from
                        <br />
                        <input name="effectiveFrom" type="date" style={{ padding: 8, width: "100%" }} />
                      </label>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        Assigning to a scope automatically creates dated person assignments for matching people.
                      </div>
                      <button type="submit" style={{ padding: "8px 12px", width: 180 }}>
                        Assign plan
                      </button>
                    </form>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
