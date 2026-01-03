import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { WinSourceType } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { WtdWizard } from "../WtdWizard";
import { computeWinTheDayPoints } from "@/lib/winTheDay";
import { ConfirmDeletePlanForm } from "../ConfirmDeletePlanForm";

type Params = { params: Promise<{ planId: string }>; searchParams?: Promise<Record<string, string | undefined>> };

export default async function EditWtdPlanPage({ params, searchParams }: Params) {
  const { planId } = await params;
  const sp = (await searchParams) || {};

  const plan = await prisma.winTheDayPlan.findUnique({
    where: { id: planId },
    include: {
      rules: true,
      teamAssignments: true,
      personAssignments: true,
    },
  });
  if (!plan) redirect("/admin/win-the-day");

  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });
  const people = await prisma.person.findMany({ orderBy: { fullName: "asc" } });
  const activities = await prisma.activityType.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  async function updatePlan(formData: FormData) {
    "use server";
    const payloadStr = String(formData.get("payload") || "");
    if (!payloadStr) return;
    const payload = JSON.parse(payloadStr) as {
      name: string;
      active: boolean;
      teamId?: string;
      pointsToWin: number;
      rules: { sourceType: WinSourceType; activityTypeId?: string; unitsPerPoint?: number | null; pointsAwarded: number }[];
      personIds: string[];
    };
    if (!payload.name?.trim()) return;

    await prisma.winTheDayPlan.update({
      where: { id: planId },
      data: {
        name: payload.name.trim(),
        active: payload.active,
        pointsToWin: payload.pointsToWin || 0,
      },
    });

    await prisma.winTheDayRule.deleteMany({ where: { planId } });
    await prisma.winTheDayRule.createMany({
      data: payload.rules.map((r, idx) => ({
        planId,
        orderIndex: idx,
        sourceType: r.sourceType,
        activityTypeId: r.activityTypeId || null,
        unitsPerPoint: r.unitsPerPoint ?? 1,
        pointsAwarded: r.pointsAwarded || 1,
      })),
    });

    await prisma.winTheDayPlanTeamAssignment.deleteMany({ where: { planId } });
    if (payload.teamId) {
      await prisma.winTheDayPlanTeamAssignment.create({
        data: { planId, teamId: payload.teamId, active: true },
      });
    }

    await prisma.winTheDayPlanPersonAssignment.deleteMany({ where: { planId } });
    if (payload.personIds?.length) {
      await prisma.winTheDayPlanPersonAssignment.createMany({
        data: payload.personIds.map((pid) => ({ planId, personId: pid, active: true })),
      });
    }

    revalidatePath("/admin/win-the-day");
    redirect(`/admin/win-the-day/${planId}`);
  }

  async function deletePlan(formData: FormData) {
    "use server";
    const id = String(formData.get("planId") || "");
    if (!id) return;
    await prisma.$transaction([
      prisma.winTheDayRule.deleteMany({ where: { planId: id } }),
      prisma.winTheDayPlanTeamAssignment.deleteMany({ where: { planId: id } }),
      prisma.winTheDayPlanPersonAssignment.deleteMany({ where: { planId: id } }),
      prisma.winTheDayPlan.delete({ where: { id } }),
    ]);
    revalidatePath("/admin/win-the-day");
    redirect("/admin/win-the-day");
  }

  // preview
  let previewResult: Awaited<ReturnType<typeof computeWinTheDayPoints>> | null = null;
  if (sp.previewPerson && sp.previewDate) {
    previewResult = await computeWinTheDayPoints(planId, sp.previewPerson, new Date(sp.previewDate));
  }

  const initial = {
    name: plan.name,
    active: plan.active,
    teamId: plan.teamAssignments[0]?.teamId || "",
    pointsToWin: plan.pointsToWin,
    rules: plan.rules
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((r) => ({
        sourceType: r.sourceType as WinSourceType,
        activityTypeId: r.activityTypeId || "",
        unitsPerPoint: r.unitsPerPoint || 1,
        pointsAwarded: r.pointsAwarded || 1,
      })),
    personIds: plan.personAssignments.map((p) => p.personId).filter(Boolean) as string[],
  };

  return (
    <AppShell title="Edit Win The Day Plan" subtitle="Admin-only builder for daily point plans.">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>{plan.name}</div>
        <ConfirmDeletePlanForm id={planId} action={deletePlan} />
      </div>
      <form action={updatePlan}>
        <WtdWizard teams={teams} people={people} activities={activities} initial={initial} />
      </form>

      <div className="surface" style={{ marginTop: 16 }}>
        <h3>Preview / Test</h3>
        <form method="get" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label>
            Person
            <select name="previewPerson" style={{ padding: 10, width: "100%" }}>
              <option value="">Select</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input type="date" name="previewDate" style={{ padding: 10, width: "100%" }} />
          </label>
          <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
            Run preview
          </button>
        </form>
        {previewResult ? (
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <strong>Points:</strong> {previewResult.points} / {previewResult.target}{" "}
              {previewResult.win ? <span style={{ color: "#16a34a" }}>✅ WIN</span> : <span style={{ color: "#b45309" }}>⏳ Not yet</span>}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {previewResult.breakdown.map((b) => (
                <div key={b.ruleId} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                  {b.detail} — {b.points} pts
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
