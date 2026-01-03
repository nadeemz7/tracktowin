import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ActivityWizard } from "../ActivityWizard";

export default async function NewActivityPage() {
  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });

  async function createActivity(formData: FormData) {
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

    const activity = await prisma.activityType.create({
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
        visibilities: {
          create: (payload.selectedTeams || []).map((teamId: string) => ({
            teamId,
            canUse: true,
            isDefaultForTeam: (payload.defaultTeams || []).includes(teamId),
          })),
        },
        expectations: {
          create: Object.entries(payload.expectations || {})
            .filter(([teamId]) => (payload.selectedTeams || []).includes(teamId))
            .map(([teamId, exp]) => ({
              teamId,
              expectedPerDay: payload.trackOnly ? null : exp.expectedPerDay ?? null,
              required: !!exp.required,
              notes: exp.notes || "",
            })),
        },
        ...(payload.payoutMode === "TIER"
          ? {
              payoutTiers: {
                create: (payload.payoutTiers || []).map((t, idx) => ({
                  minValue: t.minValue,
                  maxValue: t.maxValue,
                  payoutValue: t.payoutValue,
                  orderIndex: idx,
                })),
              },
            }
          : {}),
      },
    });

    revalidatePath("/admin/activities");
    redirect(`/admin/activities/${activity.id}`);
  }

  return (
    <AppShell title="Create Activity" subtitle="Admin-only: define activity fields, visibility, quotas, and payability.">
      <form action={createActivity}>
        <ActivityWizard teams={teams} />
      </form>
    </AppShell>
  );
}
