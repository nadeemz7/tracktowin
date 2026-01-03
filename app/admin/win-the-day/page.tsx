import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { backfillAgencyDefaults } from "@/lib/wtdDefaults";
import { ConfirmDeletePlanForm } from "./ConfirmDeletePlanForm";
import Link from "next/link";
import { revalidatePath } from "next/cache";

export default async function WinTheDayListPage() {
  const plans = await prisma.winTheDayPlan.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      teamAssignments: { include: { team: true } },
      personAssignments: true,
    },
  });

  async function archivePlan(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    if (!planId) return;
    await prisma.winTheDayPlan.update({ where: { id: planId }, data: { active: false, archivedAt: new Date() } });
    revalidatePath("/admin/win-the-day");
  }

  async function duplicatePlan(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    if (!planId) return;
    const plan = await prisma.winTheDayPlan.findUnique({
      where: { id: planId },
      include: { rules: true, teamAssignments: true, personAssignments: true },
    });
    if (!plan) return;
    await prisma.winTheDayPlan.create({
      data: {
        agencyId: plan.agencyId,
        name: `${plan.name} (Copy)`,
        pointsToWin: plan.pointsToWin,
        active: plan.active,
        rules: {
          create: plan.rules.map((r, idx) => ({
            orderIndex: idx,
            sourceType: r.sourceType,
            activityTypeId: r.activityTypeId,
            unitsPerPoint: r.unitsPerPoint,
            pointsAwarded: r.pointsAwarded,
            notes: r.notes,
          })),
        },
        teamAssignments: {
          create: plan.teamAssignments.map((t) => ({ teamId: t.teamId, active: t.active })),
        },
        personAssignments: {
          create: plan.personAssignments.map((p) => ({ personId: p.personId, personName: p.personName, active: p.active })),
        },
      },
    });
    revalidatePath("/admin/win-the-day");
  }

  async function deletePlan(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    if (!planId) return;
    await prisma.$transaction([
      prisma.winTheDayRule.deleteMany({ where: { planId } }),
      prisma.winTheDayPlanTeamAssignment.deleteMany({ where: { planId } }),
      prisma.winTheDayPlanPersonAssignment.deleteMany({ where: { planId } }),
      prisma.winTheDayPlan.delete({ where: { id: planId } }),
    ]);
    revalidatePath("/admin/win-the-day");
  }

  async function backfillDefaults() {
    "use server";
    await backfillAgencyDefaults();
    revalidatePath("/admin/win-the-day");
  }

  return (
    <AppShell title="Win The Day Plans" subtitle="Admin-only builder for daily point plans.">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ color: "#555" }}>{plans.length} plan(s)</div>
        <Link href="/admin/win-the-day/new" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
          + Create WTD Plan
        </Link>
      </div>
      <div className="surface" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ color: "#555" }}>If defaults are missing, run the seeding helper.</div>
        <form action={backfillDefaults}>
          <button type="submit" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db" }}>
            Ensure default activities & WTD plans
          </button>
        </form>
      </div>

      <div className="surface" style={{ display: "grid", gap: 10 }}>
        {plans.map((p) => (
          <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700 }}>
                <Link href={`/admin/win-the-day/${p.id}`} style={{ color: "#283618" }}>
                  {p.name}
                </Link>
                {!p.active ? <span style={{ marginLeft: 8, fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "#fee2e2", color: "#991b1b" }}>Inactive</span> : null}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <form action={duplicatePlan}>
                  <input type="hidden" name="planId" value={p.id} />
                  <button type="submit" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}>
                    Duplicate
                  </button>
                </form>
                <ConfirmDeletePlanForm id={p.id} action={deletePlan} compact />
                <form action={archivePlan}>
                  <input type="hidden" name="planId" value={p.id} />
                  <button type="submit" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e31836", background: "#f8f9fa", color: "#e31836" }}>
                    Archive
                  </button>
                </form>
              </div>
            </div>
            <div style={{ color: "#555" }}>Points to win: {p.pointsToWin}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
              <Badge label={`Teams: ${p.teamAssignments.map((t) => t.team.name).join(", ") || "None"}`} />
              <Badge label={`People: ${p.personAssignments.length}`} />
            </div>
          </div>
        ))}
        {plans.length === 0 ? <div style={{ color: "#555" }}>No Win The Day plans yet.</div> : null}
      </div>
    </AppShell>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span style={{ padding: "4px 8px", borderRadius: 999, background: "#f1f5f9", border: "1px solid #e5e7eb" }}>
      {label}
    </span>
  );
}
