import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function ViewReportPage({ params }: Params) {
  const { id } = await params;
  const preset = await prisma.reportPreset.findUnique({ where: { id } });
  if (!preset) return notFound();

  const config = (preset.configJson || {}) as { modules?: Array<{ type?: string; title?: string; summary?: string }> };
  const modules = Array.isArray(config.modules) ? config.modules : [];

  return (
    <AppShell title={preset.name} subtitle={preset.description || "Saved report"}>
      <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ color: "#6b7280", fontSize: 13 }}>
            Saved preset • {preset.updatedAt.toLocaleDateString()}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="/reports" className="btn" style={{ textDecoration: "none" }}>Reports hub</a>
            <a href="/reports/builder" className="btn primary" style={{ textDecoration: "none" }}>Build / edit</a>
          </div>
        </div>

        {modules.length === 0 ? (
          <div className="surface" style={{ padding: 14, borderRadius: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>No modules configured</div>
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              This preset has no modules yet. Use the builder to add KPI tiles, charts, and tables.
            </div>
          </div>
        ) : (
          <div className="surface" style={{ padding: 14, borderRadius: 12, border: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Modules</div>
            <div style={{ display: "grid", gap: 8 }}>
              {modules.map((m, idx) => (
                <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontWeight: 700 }}>{m.title || `Module ${idx + 1}`}</div>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    {m.summary || `Type: ${m.type || "unknown"}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Raw configuration</div>
          <pre style={{ background: "#0b0f17", color: "#e5e7eb", padding: 12, borderRadius: 10, overflow: "auto" }}>
            {JSON.stringify(preset.configJson, null, 2)}
          </pre>
        </div>
      </div>
    </AppShell>
  );
}
