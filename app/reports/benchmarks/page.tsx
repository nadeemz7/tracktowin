import { AppShell } from "@/app/components/AppShell";
import BenchmarksPageClient from "./BenchmarksPageClient";

export default function BenchmarksPage() {
  return (
    <AppShell title="Benchmarks" subtitle="Compare production against Benchmarks targets.">
      <BenchmarksPageClient />
    </AppShell>
  );
}
