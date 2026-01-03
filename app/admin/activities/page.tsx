import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { ConfirmDeleteForm } from "./ConfirmDeleteForm";
import Link from "next/link";
import { revalidatePath } from "next/cache";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function ActivitiesAdminPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) || {};
  const q = (sp.q || "").trim();
  const teamFilter = sp.team || "";
  const payableOnly = sp.payable === "1";
  const fullNameOnly = sp.fullname === "1";
  const activeOnly = sp.active !== "0";

  const activities = await prisma.activityType.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(payableOnly ? { payable: true } : {}),
      ...(fullNameOnly ? { requiresFullName: true } : {}),
      ...(activeOnly ? { active: true } : {}),
      ...(teamFilter
        ? {
            visibilities: {
              some: {
                teamId: teamFilter,
                canUse: true,
              },
            },
          }
        : {}),
    },
    include: {
      visibilities: { include: { team: true } },
      expectations: true,
    },
    orderBy: { name: "asc" },
  });

  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });

  async function toggleActive(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const active = formData.get("active") === "true";
    if (!id) return;
    await prisma.activityType.update({ where: { id }, data: { active } });
    revalidatePath("/admin/activities");
  }

  async function duplicate(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    if (!id) return;
    const activity = await prisma.activityType.findUnique({
      where: { id },
      include: { visibilities: true, expectations: true },
    });
    if (!activity) return;
    await prisma.activityType.create({
      data: {
        agencyId: activity.agencyId,
        name: `${activity.name} (Copy)`,
        description: activity.description,
        active: activity.active,
        inputMode: activity.inputMode,
        unitLabel: activity.unitLabel,
        requiresFullName: activity.requiresFullName,
        payable: activity.payable,
        trackOnly: activity.trackOnly,
        defaultQuotaPerDay: activity.defaultQuotaPerDay,
        groupingHint: activity.groupingHint,
        visibilities: {
          create: activity.visibilities.map((v) => ({
            teamId: v.teamId,
            canUse: v.canUse,
            isDefaultForTeam: v.isDefaultForTeam,
          })),
        },
        expectations: {
          create: activity.expectations.map((e) => ({
            teamId: e.teamId,
            expectedPerDay: e.expectedPerDay,
            required: e.required,
            notes: e.notes,
          })),
        },
      },
    });
    revalidatePath("/admin/activities");
  }

  async function deleteActivity(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    if (!id) return;
    await prisma.activityTeamVisibility.deleteMany({ where: { activityTypeId: id } });
    await prisma.activityDailyExpectation.deleteMany({ where: { activityTypeId: id } });
    await prisma.activityPayoutTier.deleteMany({ where: { activityTypeId: id } });
    await prisma.winTheDayRule.updateMany({ where: { activityTypeId: id }, data: { activityTypeId: null } });
    await prisma.activityType.delete({ where: { id } });
    revalidatePath("/admin/activities");
  }

  return (
    <AppShell title="Activity Admin" subtitle="Define activities, visibility, quotas, and payability. (Admin-only placeholder)">
      <div className="surface" style={{ marginBottom: 12 }}>
        <form method="get" style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr repeat(auto-fit, minmax(140px, 1fr))" }}>
          <input name="q" placeholder="Search activities" defaultValue={q} style={{ padding: 10 }} />
          <select name="team" defaultValue={teamFilter} style={{ padding: 10 }}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name="payable" value="1" defaultChecked={payableOnly} />
            Payable
          </label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name="fullname" value="1" defaultChecked={fullNameOnly} />
            Full name req.
          </label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" name="active" value="1" defaultChecked={activeOnly} />
            Active only
          </label>
          <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
            Apply
          </button>
        </form>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ color: "#555" }}>{activities.length} activity(ies)</div>
        <Link href="/admin/activities/new" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
          + Create Activity
        </Link>
      </div>

      <div className="surface" style={{ display: "grid", gap: 10 }}>
        {activities.map((a) => {
          const teamsForActivity = a.visibilities.filter((v) => v.canUse);
          const defaults = a.visibilities.filter((v) => v.isDefaultForTeam);
          const hasQuota = !a.trackOnly;
          return (
            <div key={a.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700 }}>
                  <Link href={`/admin/activities/${a.id}`} style={{ color: "#283618" }}>
                    {a.name}
                  </Link>
                  {!a.active ? <span style={{ marginLeft: 8, fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "#fee2e2", color: "#991b1b" }}>Inactive</span> : null}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Link href={`/admin/activities/${a.id}`} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}>
                    Edit
                  </Link>
                <form action={duplicate}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}>
                    Duplicate
                  </button>
                </form>
                <ConfirmDeleteForm id={a.id} action={deleteActivity} />
                <form action={toggleActive}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="active" value={(!a.active).toString()} />
                  <button type="submit" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e31836", background: "#f8f9fa", color: "#e31836" }}>
                    {a.active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </div>
              </div>
              <div style={{ color: "#555" }}>{a.description || "No description"}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13, color: "#111" }}>
                <Badge label={`Input: ${a.inputMode}`} />
                <Badge label={`Full name: ${a.requiresFullName ? "Yes" : "No"}`} />
                <Badge label={`Payable: ${a.payable ? "Yes" : "No"}`} />
                <Badge label={hasQuota ? "Has quota" : "Track-only"} />
                <Badge label={`Teams: ${teamsForActivity.map((v) => v.team.name).join(", ") || "None"}`} />
                {defaults.length ? <Badge label={`Default: ${defaults.map((v) => v.team.name).join(", ")}`} /> : null}
                {a.payable && a.payoutMode ? <Badge label={`Payout: ${a.payoutMode === "FLAT" ? `$${a.flatPayoutValue ?? 0}` : "Tiered"}`} /> : null}
              </div>
            </div>
          );
        })}
        {activities.length === 0 ? <div style={{ color: "#555" }}>No activities found.</div> : null}
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
