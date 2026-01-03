import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { BuilderClient } from "../BuilderClient";

export const dynamic = "force-dynamic";

export default async function ReportBuilderPage() {
  const presets = await prisma.reportPreset.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <AppShell title="Report Builder" subtitle="Add filters and modules, then save as a preset.">
      <BuilderClient />

      <div className="surface" style={{ padding: 16, marginTop: 16, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Existing presets</div>
        {presets.length === 0 && <div style={{ color: "#6b7280" }}>No presets yet.</div>}
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {presets.map((p) => (
            <a
              key={p.id}
              href={`/reports/view/${p.id}`}
              className="surface"
              style={{ padding: 12, borderRadius: 10, textDecoration: "none", color: "inherit", border: "1px solid #e5e7eb" }}
            >
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>{p.description || "No description"}</div>
              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>
                Updated {p.updatedAt.toLocaleDateString()}
              </div>
            </a>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
