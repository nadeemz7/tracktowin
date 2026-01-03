import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SavedReportsPage() {
  const presets = await prisma.reportPreset.findMany({ orderBy: { updatedAt: "desc" } });
  return (
    <AppShell title="Saved Reports" subtitle="Open any saved preset.">
      <div className="surface" style={{ padding: 16, display: "grid", gap: 10 }}>
        {presets.length === 0 && <div style={{ color: "#6b7280" }}>No saved reports yet.</div>}
        {presets.map((p) => (
          <a key={p.id} href={`/reports/view/${p.id}`} className="surface" style={{ padding: 12, borderRadius: 10, textDecoration: "none", color: "inherit" }}>
            <div style={{ fontWeight: 700 }}>{p.name}</div>
            <div style={{ color: "#6b7280", fontSize: 13 }}>{p.description || "No description"}</div>
          </a>
        ))}
      </div>
    </AppShell>
  );
}
