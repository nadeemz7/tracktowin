import { AppShell } from "@/app/components/AppShell";
import { PERMISSION_DEFINITIONS } from "@/lib/getOrgViewer";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";

export default async function PermissionsPage() {
  const viewer = await getOrgViewer();
  const permissions = viewer?.permissions ?? [];
  const canAccess = Boolean(viewer?.isTtwAdmin || permissions.includes("ACCESS_ADMIN_TOOLS"));
  if (!canAccess) {
    return (
      <AppShell title="Not authorized">
        <div>Not authorized.</div>
      </AppShell>
    );
  }

  const roles = viewer?.orgId
    ? await prisma.orgRole.findMany({
        where: { orgId: viewer.orgId },
        orderBy: { key: "asc" },
        include: { permissions: true },
      })
    : [];

  const permissionEntries = Object.entries(PERMISSION_DEFINITIONS);

  return (
    <AppShell title="Permissions & Roles" subtitle="Documented permissions and current org role assignments.">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Permissions</div>
        <div style={{ display: "grid", gap: 8 }}>
          {permissionEntries.map(([key, def]) => (
            <div key={key} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 700 }}>{key}</div>
              <div style={{ fontSize: 13, color: "#475569" }}>{def.label}</div>
              <div style={{ fontSize: 13, color: "#475569" }}>{def.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Org Roles</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#475569" }}>
                <th style={{ padding: "6px 6px", borderBottom: "1px solid #e5e7eb" }}>Role Key</th>
                <th style={{ padding: "6px 6px", borderBottom: "1px solid #e5e7eb" }}>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr>
                  <td colSpan={2} style={{ padding: "8px 6px", color: "#6b7280" }}>
                    No roles found for this org.
                  </td>
                </tr>
              ) : (
                roles.map((role: any) => (
                  <tr key={role.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ padding: "6px 6px", fontWeight: 700 }}>{role.key}</td>
                    <td style={{ padding: "6px 6px" }}>
                      {Array.isArray(role.permissions) && role.permissions.length
                        ? role.permissions.map((p: any) => p.permission).filter(Boolean).join(", ")
                        : "None"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
