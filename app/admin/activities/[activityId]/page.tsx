import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ActivityWizard } from "../ActivityWizard";

type Params = { params: Promise<{ activityId: string }> };

export default async function EditActivityPage({ params }: Params) {
  const { activityId } = await params;
  const activity = await prisma.activityType.findUnique({
    where: { id: activityId },
    include: { visibilities: true, expectations: true },
  });
  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });

  if (!activity) redirect("/admin/activities");

  async function updateActivity(formData: FormData) {
    "use server";
    const payloadStr = String(formData.get("payload") || "");
    if (!payloadStr) return;
    const payload = JSON.parse(payloadStr) as {
      name: string;
      description?: string;
      active: boolean;
      inputMode: "COUNT" | "BOOLEAN" | "TEXT";
      unitLabel?: string;
      requiresFullName: boolean;
      payable: boolean;
      payoutMode: "FLAT" | "TIER" | "";
      flatPayoutValue: number | null;
      payoutTiers: { minValue: number; maxValue: number | null; payoutValue: number }[];
      trackOnly: boolean;
      defaultQuotaPerDay?: number | null;
      groupingHint?: string;
      selectedTeams: string[];
      defaultTeams: string[];
      expectations: Record<string, { expectedPerDay: number | null; required: boolean; notes: string }>;
    };
    if (!payload.name?.trim()) return;

    await prisma.activityType.update({
      where: { id: activityId },
      data: {
        name: payload.name.trim(),
        description: payload.description || null,
        active: !!payload.active,
        inputMode: payload.inputMode,
        unitLabel: payload.unitLabel || null,
        requiresFullName: !!payload.requiresFullName,
        payable: !!payload.payable,
        payoutMode: payload.payoutMode || null,
        flatPayoutValue: payload.payoutMode === "FLAT" ? payload.flatPayoutValue : null,
        trackOnly: !!payload.trackOnly,
        defaultQuotaPerDay: payload.defaultQuotaPerDay ?? null,
        groupingHint: payload.groupingHint || null,
      },
    });

    // reset visibilities and expectations
    await prisma.activityTeamVisibility.deleteMany({ where: { activityTypeId: activityId } });
    await prisma.activityDailyExpectation.deleteMany({ where: { activityTypeId: activityId } });

    if (payload.selectedTeams?.length) {
      await prisma.activityTeamVisibility.createMany({
        data: payload.selectedTeams.map((teamId: string) => ({
          activityTypeId: activityId,
          teamId,
          canUse: true,
          isDefaultForTeam: (payload.defaultTeams || []).includes(teamId),
        })),
      });
    }
    const expectationRows = Object.entries(payload.expectations || {})
      .filter(([teamId]) => (payload.selectedTeams || []).includes(teamId))
      .map(([teamId, exp]) => ({
        activityTypeId: activityId,
        teamId,
        expectedPerDay: payload.trackOnly ? null : exp.expectedPerDay ?? null,
        required: !!exp.required,
        notes: exp.notes || "",
      }));
    if (expectationRows.length) {
      await prisma.activityDailyExpectation.createMany({ data: expectationRows });
    }

    await prisma.activityPayoutTier.deleteMany({ where: { activityTypeId: activityId } });
    if (payload.payoutMode === "TIER" && payload.payoutTiers?.length) {
      await prisma.activityPayoutTier.createMany({
        data: payload.payoutTiers.map((t, idx) => ({
          activityTypeId: activityId,
          minValue: t.minValue,
          maxValue: t.maxValue,
          payoutValue: t.payoutValue,
          orderIndex: idx,
        })),
      });
    }

    revalidatePath("/admin/activities");
    redirect(`/admin/activities/${activityId}`);
  }

  const initial: {
    name: string;
    description: string;
    active: boolean;
    selectedTeams: string[];
    defaultTeams: string[];
    inputMode: "COUNT" | "BOOLEAN" | "TEXT";
    unitLabel: string;
    requiresFullName: boolean;
    payable: boolean;
    trackOnly: boolean;
    groupingHint: string;
    defaultQuotaPerDay: number | null | undefined;
    expectations: Record<string, { expectedPerDay: number | null; required: boolean; notes: string }>;
  } = {
    name: activity.name,
    description: activity.description || "",
    active: activity.active,
    selectedTeams: activity.visibilities.filter((v) => v.canUse).map((v) => v.teamId),
    defaultTeams: activity.visibilities.filter((v) => v.isDefaultForTeam).map((v) => v.teamId),
    inputMode: activity.inputMode,
    unitLabel: activity.unitLabel || "",
    requiresFullName: activity.requiresFullName,
    payable: activity.payable,
    payoutMode: (activity.payoutMode as "FLAT" | "TIER" | null) || "",
    flatPayoutValue: activity.flatPayoutValue,
    trackOnly: activity.trackOnly,
    groupingHint: activity.groupingHint || "",
    defaultQuotaPerDay: activity.defaultQuotaPerDay,
    expectations: activity.expectations.reduce<Record<string, { expectedPerDay: number | null; required: boolean; notes: string }>>(
      (acc, e) => {
      acc[e.teamId] = { expectedPerDay: e.expectedPerDay, required: e.required, notes: e.notes || "" };
      return acc;
    },
      {}
    ),
    payoutTiers: (await prisma.activityPayoutTier.findMany({ where: { activityTypeId: activityId }, orderBy: { orderIndex: "asc" } })).map((t) => ({
      minValue: t.minValue,
      maxValue: t.maxValue,
      payoutValue: t.payoutValue,
    })),
  };

  return (
    <AppShell title="Edit Activity" subtitle="Admin-only: adjust visibility, quotas, and payability.">
      <form action={updateActivity}>
        <ActivityWizard teams={teams} initial={initial} onSubmitLabel="Update Activity" />
      </form>
    </AppShell>
  );
}
