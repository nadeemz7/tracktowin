import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { WinSourceType } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { WtdWizard } from "../WtdWizard";

export default async function NewWtdPlanPage() {
  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });
  const people = await prisma.person.findMany({ orderBy: { fullName: "asc" } });
  const activities = await prisma.activityType.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  async function createPlan(formData: FormData) {
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
    const plan = await prisma.winTheDayPlan.create({
      data: {
        name: payload.name.trim(),
        active: payload.active,
        pointsToWin: payload.pointsToWin || 0,
        rules: {
          create: payload.rules.map((r, idx) => ({
            orderIndex: idx,
            sourceType: r.sourceType,
            activityTypeId: r.activityTypeId || null,
            unitsPerPoint: r.unitsPerPoint ?? 1,
            pointsAwarded: r.pointsAwarded || 1,
          })),
        },
      },
    });
    if (payload.teamId) {
      await prisma.winTheDayPlanTeamAssignment.upsert({
        where: { teamId: payload.teamId },
        update: { planId: plan.id, active: true },
        create: { planId: plan.id, teamId: payload.teamId, active: true },
      });
    }
    if (payload.personIds?.length) {
      await prisma.winTheDayPlanPersonAssignment.createMany({
        data: payload.personIds.map((pid) => ({ planId: plan.id, personId: pid, active: true })),
      });
    }

    revalidatePath("/admin/win-the-day");
    redirect(`/admin/win-the-day/${plan.id}`);
  }

  return (
    <AppShell title="Create Win The Day Plan" subtitle="Admin-only builder for daily point plans.">
      <form action={createPlan}>
        <WtdWizard teams={teams} people={people} activities={activities} />
      </form>
    </AppShell>
  );
}
