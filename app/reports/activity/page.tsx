import { AppShell } from "@/app/components/AppShell";
import ActivityDashboard from "./ActivityDashboard";

export default function ActivityReportPage() {
  return (
    <AppShell title="Activity Report" subtitle="Team/person activities with totals and time series.">
      <div style={{ display: "grid", gap: 16 }}>
        <a className="btn" href="/reports" style={{ textDecoration: "none", width: "fit-content" }}>
          ƒ+? Back to Reports
        </a>
        <ActivityDashboard variant="full" />
      </div>
    </AppShell>
  );
}
