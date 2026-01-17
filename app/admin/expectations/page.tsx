import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function ExpectationsPage() {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: {
      team: true,
    },
  });

  const lobs = await prisma.lineOfBusiness.findMany({ orderBy: { name: "asc" }, include: { agency: true } });
  const activities = await prisma.activityType.findMany({ orderBy: { name: "asc" }, include: { agency: true } });
  const expectations = await prisma.productionExpectation.findMany({
    orderBy: { updatedAt: "desc" },
    include: { role: { include: { team: true } }, lineOfBusiness: true, activityType: true, agency: true },
  });

  async function upsertExpectation(formData: FormData) {
    "use server";
    const roleId = String(formData.get("roleId") || "");
    if (!roleId) return;
    const agencyId = String(formData.get("agencyId") || "") || null;
    const lineOfBusinessId = String(formData.get("lineOfBusinessId") || "") || null;
    const activityTypeId = String(formData.get("activityTypeId") || "") || null;
    const monthKey = String(formData.get("monthKey") || "") || null;
    const targetApps = formData.get("targetApps") ? Number(formData.get("targetApps")) : null;
    const targetPremium = formData.get("targetPremium") ? Number(formData.get("targetPremium")) : null;
    const targetActivityCount = formData.get("targetActivityCount") ? Number(formData.get("targetActivityCount")) : null;
    const notes = String(formData.get("notes") || "").trim() || null;

    await prisma.productionExpectation.upsert({
      where: { roleId_lineOfBusinessId_activityTypeId_monthKey: { roleId, lineOfBusinessId, activityTypeId, monthKey } },
      create: { roleId, agencyId, lineOfBusinessId, activityTypeId, monthKey, targetApps, targetPremium, targetActivityCount, notes },
      update: { agencyId, lineOfBusinessId, activityTypeId, monthKey, targetApps, targetPremium, targetActivityCount, notes },
    });

    revalidatePath("/admin/expectations");
  }

  return (
    <AppShell
      title="Production Expectations"
      subtitle="Set per-role benchmarks by line of business or activity to benchmark reports later."
    >
      <div className="surface" style={{ padding: 16, display: "grid", gap: 16 }}>
        <details open>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Add / Update Expectation</summary>
          <form
            action={upsertExpectation}
            style={{ marginTop: 12, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
          >
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Role</span>
              <select name="roleId" required style={{ padding: 10, width: "100%" }}>
                <option value="">Select role</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.team.name} — {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Agency (optional)</span>
              <select name="agencyId" style={{ padding: 10, width: "100%" }}>
                <option value="">All</option>
                {Array.from(new Map(lobs.map((l) => [l.agencyId, l.agency?.name ?? ""]))).map(([id, name]) => (
                  <option key={id || "none"} value={id || ""}>
                    {name || "(no agency)"}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Line of business (optional)</span>
              <select name="lineOfBusinessId" style={{ padding: 10, width: "100%" }}>
                <option value="">All</option>
                {lobs.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.agency?.name ? `${l.agency.name} • ` : ""}
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Activity (optional)</span>
              <select name="activityTypeId" style={{ padding: 10, width: "100%" }}>
                <option value="">None</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.agency?.name ? `${a.agency.name} • ` : ""}
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Month (optional, YYYY-MM)</span>
              <input name="monthKey" placeholder="2025-01" style={{ padding: 10 }} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Target apps</span>
              <input name="targetApps" type="number" step="0.01" placeholder="e.g., 40" style={{ padding: 10 }} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Target premium</span>
              <input name="targetPremium" type="number" step="0.01" placeholder="e.g., 25000" style={{ padding: 10 }} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Target activity count</span>
              <input name="targetActivityCount" type="number" step="0.01" placeholder="e.g., 80 calls" style={{ padding: 10 }} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Notes (optional)</span>
              <input name="notes" placeholder="Any context or tier rule" style={{ padding: 10 }} />
            </label>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
              <button type="submit" className="btn primary">
                Save expectation
              </button>
              <span style={{ color: "#6b7280", fontSize: 12 }}>
                Unique per role + LoB + activity + month; reusing updates the existing row.
              </span>
            </div>
          </form>
        </details>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Existing expectations</div>
          <div style={{ display: "grid", gap: 8 }}>
            {expectations.length === 0 && <div style={{ color: "#6b7280" }}>None yet.</div>}
            {expectations.map((e) => (
              <div key={e.id} className="surface" style={{ padding: 12, borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {e.role.team.name} — {e.role.name}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 13 }}>
                      {e.lineOfBusiness ? `LoB: ${e.lineOfBusiness.name}` : "All LoBs"} • {e.activityType ? `Activity: ${e.activityType.name}` : "No activity filter"}
                      {e.monthKey ? ` • Month ${e.monthKey}` : ""}
                    </div>
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Updated {e.updatedAt.toLocaleDateString()}</div>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
                  {e.targetApps != null && <span className="pill">Apps target: {e.targetApps}</span>}
                  {e.targetPremium != null && <span className="pill">Premium target: {e.targetPremium}</span>}
                  {e.targetActivityCount != null && <span className="pill">Activity target: {e.targetActivityCount}</span>}
                  {e.notes && <span className="pill">{e.notes}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
