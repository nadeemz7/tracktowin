import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { CompPlanStatus } from "@prisma/client";
import AssignDragBoard from "./AssignDragBoard";

export default async function CompPlansPage() {
  const agencies = await prisma.agency.findMany({ orderBy: { name: "asc" } });
  const activeAgency = agencies[0] || null;

  const plans = await prisma.compPlan.findMany({
    where: activeAgency ? { agencyId: activeAgency.id, status: { not: CompPlanStatus.ARCHIVED } } : { status: { not: CompPlanStatus.ARCHIVED } },
    orderBy: { updatedAt: "desc" },
    include: { assignments: true, versions: { where: { isCurrent: true } } },
  });

  const people = await prisma.person.findMany({
    where: activeAgency
      ? {
          OR: [
            { primaryAgencyId: activeAgency.id },
            { team: { agencyId: activeAgency.id } },
          ],
        }
      : {},
    orderBy: { fullName: "asc" },
  });

  const assignedPersonIds = new Set<string>();
  plans.forEach((p) =>
    p.assignments
      .filter((a) => a.scopeType === "PERSON" && a.scopeId)
      .forEach((a) => a.scopeId && assignedPersonIds.add(a.scopeId))
  );
  const unassigned = people
    .filter((p) => !assignedPersonIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.fullName }));

  async function archivePlan(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    if (!planId) return;
    await prisma.compPlan.update({ where: { id: planId }, data: { active: false, archivedAt: new Date(), status: CompPlanStatus.ARCHIVED } });
    revalidatePath("/compensation/plans");
  }

  async function markActive(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    if (!planId) return;
    await prisma.compPlan.update({ where: { id: planId }, data: { status: CompPlanStatus.ACTIVE, active: true, archivedAt: null } });
    revalidatePath("/compensation/plans");
  }

  async function markDraft(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    if (!planId) return;
    await prisma.compPlan.update({ where: { id: planId }, data: { status: CompPlanStatus.DRAFT } });
    revalidatePath("/compensation/plans");
  }

  async function deletePlan(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    if (!planId) return;

    const versions = await prisma.compPlanVersion.findMany({
      where: { planId },
      include: {
        ruleBlocks: { include: { tiers: true } },
        gates: true,
        bonusModules: { include: { scorecardTiers: { include: { conditions: true, rewards: true } } } },
      },
    });

    const tierIds = versions.flatMap((v) => v.ruleBlocks.flatMap((rb) => rb.tiers.map((t) => t.id)));
    const ruleBlockIds = versions.flatMap((v) => v.ruleBlocks.map((rb) => rb.id));
    const gateIds = versions.flatMap((v) => v.gates.map((g) => g.id));
    const bonusIds = versions.flatMap((v) => v.bonusModules.map((bm) => bm.id));
    const scorecardTierIds = versions.flatMap((v) => v.bonusModules.flatMap((bm) => bm.scorecardTiers.map((t) => t.id)));
    const conditionIds = versions.flatMap((v) =>
      v.bonusModules.flatMap((bm) => bm.scorecardTiers.flatMap((t) => t.conditions.map((c) => c.id)))
    );
    const rewardIds = versions.flatMap((v) =>
      v.bonusModules.flatMap((bm) => bm.scorecardTiers.flatMap((t) => t.rewards.map((r) => r.id)))
    );
    const versionIds = versions.map((v) => v.id);

    await prisma.$transaction([
      prisma.compPlanScorecardCondition.deleteMany({ where: { id: { in: conditionIds } } }),
      prisma.compPlanScorecardReward.deleteMany({ where: { id: { in: rewardIds } } }),
      prisma.compPlanScorecardTier.deleteMany({ where: { id: { in: scorecardTierIds } } }),
      prisma.compPlanBonusModule.deleteMany({ where: { id: { in: bonusIds } } }),
      prisma.compPlanGate.deleteMany({ where: { id: { in: gateIds } } }),
      prisma.compPlanTierRow.deleteMany({ where: { id: { in: tierIds } } }),
      prisma.compPlanRuleBlock.deleteMany({ where: { id: { in: ruleBlockIds } } }),
      prisma.compPlanVersion.deleteMany({ where: { id: { in: versionIds } } }),
      prisma.compPlanAssignment.deleteMany({ where: { planId } }),
      prisma.compPlan.delete({ where: { id: planId } }),
    ]);

    revalidatePath("/compensation/plans");
  }

  async function duplicatePlan(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    if (!planId) return;
    const plan = await prisma.compPlan.findUnique({
      where: { id: planId },
      include: {
        versions: {
          where: { isCurrent: true },
          include: { ruleBlocks: { include: { tiers: true } }, gates: true, bonusModules: { include: { scorecardTiers: { include: { conditions: true, rewards: true } } } } },
        },
      },
    });
    if (!plan || !plan.versions[0]) return;
    const current = plan.versions[0];
    const clone = await prisma.compPlan.create({
      data: {
        agencyId: plan.agencyId,
        name: `${plan.name} (Copy)`,
        description: plan.description,
        defaultStatusEligibility: plan.defaultStatusEligibility,
        effectiveStartMonth: plan.effectiveStartMonth,
        versions: {
          create: {
            effectiveStartMonth: current.effectiveStartMonth,
            ruleBlocks: {
              create: current.ruleBlocks.map((rb) => ({
                name: rb.name,
                enabled: rb.enabled,
                orderIndex: rb.orderIndex,
                ruleType: rb.ruleType,
                statusEligibilityOverride: rb.statusEligibilityOverride,
                applyScope: rb.applyScope,
                applyFilters: rb.applyFilters,
                payoutType: rb.payoutType,
                basePayoutValue: rb.basePayoutValue,
                tierMode: rb.tierMode,
                tierBasis: rb.tierBasis,
                bucketId: rb.bucketId,
                minThreshold: rb.minThreshold,
                gateBehavior: rb.gateBehavior,
                notes: rb.notes,
                maxPayout: rb.maxPayout,
                tiers: {
                  create: rb.tiers.map((t) => ({
                    minValue: t.minValue,
                    maxValue: t.maxValue,
                    payoutValue: t.payoutValue,
                    payoutUnit: t.payoutUnit,
                    orderIndex: t.orderIndex,
                  })),
                },
              })),
            },
            gates: {
              create: current.gates.map((g) => ({
                enabled: g.enabled,
                name: g.name,
                gateType: g.gateType,
                bucketId: g.bucketId,
                thresholdValue: g.thresholdValue,
                behavior: g.behavior,
                scope: g.scope,
                ruleBlockIds: g.ruleBlockIds,
              })),
            },
            bonusModules: {
              create: current.bonusModules.map((bm) => ({
                enabled: bm.enabled,
                name: bm.name,
                bonusType: bm.bonusType,
                config: bm.config,
                highestTierWins: bm.highestTierWins,
                stackTiers: bm.stackTiers,
                scorecardTiers: {
                  create: bm.scorecardTiers.map((tier) => ({
                    name: tier.name,
                    orderIndex: tier.orderIndex,
                    requiresAllConditions: tier.requiresAllConditions,
                    conditions: {
                      create: tier.conditions.map((c) => ({
                        metricSource: c.metricSource,
                        bucketId: c.bucketId,
                        activityTypeId: c.activityTypeId,
                        operator: c.operator,
                        value: c.value,
                        statusFilter: c.statusFilter,
                        timeframe: c.timeframe,
                      })),
                    },
                    rewards: {
                      create: tier.rewards.map((r) => ({
                        rewardType: r.rewardType,
                        bucketId: r.bucketId,
                        premiumCategory: r.premiumCategory,
                        percentValue: r.percentValue,
                        dollarValue: r.dollarValue,
                      })),
                    },
                  })),
                },
              })),
            },
          },
        },
      },
    });

    await prisma.compPlanAssignment.createMany({
      data: plan.assignments.map((a) => ({
        planId: clone.id,
        scopeType: a.scopeType,
        scopeId: a.scopeId,
        effectiveStartMonth: a.effectiveStartMonth,
        active: a.active,
      })),
    });

    revalidatePath("/compensation/plans");
  }

  return (
    <AppShell title="Compensation Builder" subtitle="Plans, assignments, and unassigned users at a glance.">
      <div style={{ display: "grid", gap: 24, padding: 16 }}>
        <div style={{ textAlign: "center", display: "grid", gap: 8 }}>
          <div style={{ fontSize: 32, fontWeight: 900 }}>Compensation Builder</div>
          <div style={{ color: "#475569" }}>{activeAgency ? activeAgency.name : "All agencies"}</div>
          <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
            <Link href="/compensation/plans/new" className="btn primary" style={{ textDecoration: "none" }}>
              + New Plan
            </Link>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <div className="surface" style={{ padding: 16, borderRadius: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Current Plans</div>
            <div style={{ display: "grid", gap: 12 }}>
              {plans.map((plan) => (
                <div key={plan.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Link href={`/compensation/plans/${plan.id}`} style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>
                      {plan.name}
                    </Link>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          fontSize: 12,
                          background:
                            plan.status === CompPlanStatus.DRAFT
                              ? "#fef3c7"
                              : plan.status === CompPlanStatus.ACTIVE
                                ? "#dcfce7"
                                : "#e2e8f0",
                          color: "#0f172a",
                          border: "1px solid #e5e7eb",
                        }}
                      >
                        {plan.status}
                      </span>
                      <form action={duplicatePlan}>
                        <input type="hidden" name="planId" value={plan.id} />
                        <button type="submit" className="btn" style={{ padding: "6px 10px" }}>
                          Duplicate
                        </button>
                      </form>
                      <form action={markDraft}>
                        <input type="hidden" name="planId" value={plan.id} />
                        <button type="submit" className="btn" style={{ padding: "6px 10px" }}>
                          Mark Draft
                        </button>
                      </form>
                      <form action={markActive}>
                        <input type="hidden" name="planId" value={plan.id} />
                        <button type="submit" className="btn" style={{ padding: "6px 10px" }}>
                          Mark Active
                        </button>
                      </form>
                      <form action={archivePlan}>
                        <input type="hidden" name="planId" value={plan.id} />
                        <button type="submit" className="btn" style={{ padding: "6px 10px", borderColor: "#e11d48", color: "#e11d48" }}>
                          Archive
                        </button>
                      </form>
                      <form action={deletePlan}>
                        <input type="hidden" name="planId" value={plan.id} />
                        <button type="submit" className="btn danger" style={{ padding: "6px 10px" }}>
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                  <div style={{ color: "#555", marginTop: 4 }}>
                    Assigned teams/users: {plan.assignments.length || 0}
                    <br />
                    Version: {plan.versions[0]?.effectiveStartMonth || "Current"}
                  </div>
                </div>
              ))}
              {plans.length === 0 ? <div style={{ color: "#6b7280" }}>No plans yet. Create one to get started.</div> : null}
            </div>
          </div>

          <AssignDragBoard
            plans={plans.map((p) => ({ id: p.id, name: p.name }))}
            people={unassigned}
          />
        </div>
      </div>
    </AppShell>
  );
}
