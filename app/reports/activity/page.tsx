import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import ActivityDashboard from "./ActivityDashboard";

export default async function ActivityReportPage() {
  const activities = await prisma.activityType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  let activityOptions = activities.map((a) => ({ value: a.name, label: a.name }));
  if (activityOptions.length === 0) {
    const distinctRecords = await prisma.activityRecord.findMany({
      select: { activityName: true },
      distinct: ["activityName"],
      orderBy: { activityName: "asc" },
    });
    activityOptions = distinctRecords
      .filter((r) => r.activityName)
      .map((r) => ({ value: r.activityName as string, label: r.activityName as string }));
  }
  const people = await prisma.person.findMany({ orderBy: { fullName: "asc" } });

  const peopleOptions = people.map((p) => ({ value: p.id, label: p.fullName || p.id }));

  return (
    <AppShell title="Activity Report" subtitle="Team/person activities with totals and time series.">
      <div style={{ display: "grid", gap: 16 }}>
        <a className="btn" href="/reports" style={{ textDecoration: "none", width: "fit-content" }}>
          ← Back to Reports
        </a>
        <ActivityDashboard activityOptions={activityOptions} peopleOptions={peopleOptions} />
      </div>
    </AppShell>
  );
}
