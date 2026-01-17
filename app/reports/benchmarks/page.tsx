import { AppShell } from "@/app/components/AppShell";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { canViewManagerReports } from "@/lib/permissions";
import BenchmarksPageClient from "./BenchmarksPageClient";

export default async function BenchmarksPage() {
  const viewer = await getOrgViewer();
  const canViewPeopleBenchmarks = canViewManagerReports(viewer);
  return (
    <AppShell title="Benchmarks" subtitle="Compare production against Benchmarks targets.">
      <BenchmarksPageClient canViewPeopleBenchmarks={canViewPeopleBenchmarks} />
    </AppShell>
  );
}
