import { AppShell } from "@/app/components/AppShell";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import { assignTemplateToTeam, createTemplate } from "./actions";

const FREQUENCY_OPTIONS = [
  { value: "WEEKLY", label: "Weekly" },
  { value: "BIWEEKLY", label: "Biweekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "CUSTOM_DAYS", label: "Custom days" },
];

const FREQUENCY_LABELS = FREQUENCY_OPTIONS.reduce<Record<string, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

export default async function CheckInsAdminPage() {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId || null;
  const canManage = Boolean(viewer?.isOwner || viewer?.isAdmin);

  if (!orgId || !canManage) {
    return (
      <AppShell title="Unauthorized">
        <div>Unauthorized.</div>
      </AppShell>
    );
  }

  const [templates, teams] = await Promise.all([
    prisma.checkInTemplate.findMany({
      where: { orgId },
      include: { teamAssignments: { where: { isActive: true }, include: { team: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.team.findMany({ where: { orgId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <AppShell title="Check-In Programs" subtitle="Configure team-based check-ins and cadence.">
      <div style={{ display: "grid", gap: 16 }}>
        <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Templates</div>
          {templates.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {templates.map((template) => {
                const teamNames = template.teamAssignments
                  .map((assignment) => assignment.team?.name)
                  .filter((name): name is string => Boolean(name));
                const teamLabel = teamNames.length ? teamNames.join(", ") : "Unassigned";
                return (
                  <div
                    key={template.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 600 }}>{template.name}</div>
                      <a
                        href={`/admin/check-ins/${template.id}`}
                        style={{ fontSize: 12, color: "#2563eb", textDecoration: "underline" }}
                      >
                        Manage
                      </a>
                    </div>
                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                      Frequency: {FREQUENCY_LABELS[template.frequencyType] || template.frequencyType} • Teams: {teamLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "#6b7280", fontSize: 13 }}>No templates yet.</div>
          )}

          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>Create new template</div>
            <form action={createTemplate} style={{ display: "grid", gap: 10, gridTemplateColumns: "2fr 1fr auto", alignItems: "end" }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>Name</span>
                <input name="name" required style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>Frequency</span>
                <select
                  name="frequencyType"
                  required
                  defaultValue=""
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                >
                  <option value="" disabled>
                    Select
                  </option>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                Create
              </button>
            </form>
          </div>
        </div>

        <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Team assignments</div>
          {!templates.length ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>Create a template to assign it to a team.</div>
          ) : !teams.length ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>No teams available.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {templates.map((template) => (
                <form
                  key={template.id}
                  action={assignTemplateToTeam}
                  style={{ display: "grid", gap: 10, gridTemplateColumns: "1.5fr 2fr auto", alignItems: "end" }}
                >
                  <input type="hidden" name="templateId" value={template.id} />
                  <div style={{ fontWeight: 600 }}>{template.name}</div>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Assign to team</span>
                    <select
                      name="teamId"
                      required
                      defaultValue=""
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      <option value="" disabled>
                        Select team
                      </option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid #111827",
                      background: "#111827",
                      color: "#fff",
                      fontWeight: 700,
                    }}
                  >
                    Assign
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
