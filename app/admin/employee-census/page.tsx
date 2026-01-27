import { AppShell } from "@/app/components/AppShell";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";

const EMPTY_VALUE = "\u2014";

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date;
}

function formatDate(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return date.toISOString().slice(0, 10);
}

function utcDayValue(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function diffDays(start: Date, end: Date) {
  const diff = utcDayValue(end) - utcDayValue(start);
  return Math.max(0, Math.round(diff / 86400000));
}

export default async function EmployeeCensusPage() {
  const viewer: any = await getOrgViewer();
  if (!viewer?.orgId || !viewer?.personId) {
    return (
      <AppShell title="Unauthorized">
        <div>Unauthorized.</div>
      </AppShell>
    );
  }

  const permissions = Array.isArray(viewer?.permissions) ? viewer.permissions : [];
  const allowByPerm =
    permissions.includes("ACCESS_ADMIN_TOOLS") || permissions.includes("VIEW_MANAGER_REPORTS");
  const allowByRole = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
  if (!allowByPerm && !allowByRole) {
    return (
      <AppShell title="Unauthorized">
        <div>Unauthorized.</div>
      </AppShell>
    );
  }

  const people = await prisma.person.findMany({
    where: { orgId: viewer.orgId },
    include: { team: true, role: true, primaryAgency: true },
    orderBy: [{ active: "desc" }, { fullName: "asc" }],
  });

  const today = new Date();
  const rows = people.map((person) => {
    const startDate = toDate(person.startDate);
    const endDate = toDate(person.endDate);
    const isActive = person.active !== false && !endDate;
    const status = isActive ? "Active" : "Inactive";
    const startDateLabel = formatDate(startDate);
    const endDateLabel = formatDate(endDate);
    let tenureLabel = EMPTY_VALUE;
    if (startDate) {
      const endForTenure = endDate ?? today;
      const days = diffDays(startDate, endForTenure);
      const months = (days / 30.4).toFixed(1);
      tenureLabel = `${days}d (~${months}m)`;
    }
    return {
      id: person.id,
      name: person.fullName,
      status,
      startDateLabel,
      endDateLabel,
      team: person.team?.name || EMPTY_VALUE,
      role: person.role?.name || EMPTY_VALUE,
      primaryOffice: person.primaryAgency?.name || EMPTY_VALUE,
      tenureLabel,
      isActive,
    };
  });

  const activePeople = rows.filter((row) => row.isActive);
  const activeCount = activePeople.length;
  const totalCount = rows.length;
  const inactiveCount = totalCount - activeCount;
  const activePercent = totalCount ? Math.round((activeCount / totalCount) * 100) : 0;

  const roleCounts = new Map<string, number>();
  activePeople.forEach((row) => {
    const key = row.role === EMPTY_VALUE ? "No role" : row.role;
    roleCounts.set(key, (roleCounts.get(key) ?? 0) + 1);
  });
  const roleRows = Array.from(roleCounts.entries())
    .map(([role, count]) => ({
      role,
      count,
      percent: activeCount ? Math.round((count / activeCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));

  return (
    <AppShell
      title="Employee Census"
      subtitle="Org-wide workforce timeline and structure (leadership only)."
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Summary</div>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Active</div>
              <div style={{ fontWeight: 600 }}>{activeCount}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Inactive</div>
              <div style={{ fontWeight: 600 }}>{inactiveCount}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Total</div>
              <div style={{ fontWeight: 600 }}>{totalCount}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>% Active</div>
              <div style={{ fontWeight: 600 }}>{activePercent}%</div>
            </div>
          </div>
        </div>

        <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Role distribution (active)</div>
          {!roleRows.length ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>No active roles available.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "6px 4px" }}>Role</th>
                  <th style={{ padding: "6px 4px" }}>Active Count</th>
                  <th style={{ padding: "6px 4px" }}>% of active</th>
                </tr>
              </thead>
              <tbody>
                {roleRows.map((row) => (
                  <tr key={row.role} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 4px" }}>{row.role}</td>
                    <td style={{ padding: "6px 4px" }}>{row.count}</td>
                    <td style={{ padding: "6px 4px" }}>{row.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Employee timeline</div>
          {!rows.length ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>No people available.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ padding: "6px 4px" }}>Name</th>
                  <th style={{ padding: "6px 4px" }}>Status</th>
                  <th style={{ padding: "6px 4px" }}>Start date</th>
                  <th style={{ padding: "6px 4px" }}>End date</th>
                  <th style={{ padding: "6px 4px" }}>Team</th>
                  <th style={{ padding: "6px 4px" }}>Role</th>
                  <th style={{ padding: "6px 4px" }}>Primary office</th>
                  <th style={{ padding: "6px 4px" }}>Tenure</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 4px" }}>{row.name}</td>
                    <td style={{ padding: "6px 4px" }}>{row.status}</td>
                    <td style={{ padding: "6px 4px" }}>{row.startDateLabel}</td>
                    <td style={{ padding: "6px 4px" }}>{row.endDateLabel}</td>
                    <td style={{ padding: "6px 4px" }}>{row.team}</td>
                    <td style={{ padding: "6px 4px" }}>{row.role}</td>
                    <td style={{ padding: "6px 4px" }}>{row.primaryOffice}</td>
                    <td style={{ padding: "6px 4px" }}>{row.tenureLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
