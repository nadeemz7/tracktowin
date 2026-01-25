import { ReactNode } from "react";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { AppShellAdminLink, AppShellNav } from "./AppShellClient";

type AppShellProps = {
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  showAdminLink?: boolean;
};

type NavItem = {
  href: string;
  label: string;
  icon?: string;
  children?: { href: string; label: string }[];
};

const REPORTS_CHILDREN: NavItem["children"] = [
  { href: "/reports/policy", label: "Policy" },
  { href: "/reports/annual", label: "Annual" },
  { href: "/reports/benchmarks", label: "Benchmarks" },
  { href: "/reports/snapshots?type=benchmarks", label: "Snapshots (Benchmarks)" },
  { href: "/reports/roi", label: "ROI (Admin Only)" },
].filter((item, idx, arr) => arr.findIndex((i) => i?.href === item?.href) === idx);

const NAV_LINKS: NavItem[] = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/sold-products", label: "Sold Products", icon: "📄" },
  { href: "/activities", label: "Activities", icon: "✅" },
  {
    href: "/reports",
    label: "Reports",
    icon: "📊",
    children: REPORTS_CHILDREN,
  },
  { href: "/people", label: "People & Roles", icon: "👥" },
  { href: "/paycheck", label: "Paycheck", icon: "💵" },
  {
    href: "/admin",
    label: "Admin Tools",
    icon: "🛠️",
    children: [
      { href: "/agencies", label: "Agencies" },
      { href: "/compensation/plans", label: "Compensation" },
      { href: "/admin/activities", label: "Activities" },
      { href: "/admin/win-the-day", label: "Win The Day" },
      { href: "/admin-tools/roi-setup", label: "ROI Setup" },
    ],
  },
  { href: "/dev", label: "Dev Notes", icon: "📝" },
];

export async function AppShell({ title, subtitle, actions, children, showAdminLink = true }: AppShellProps) {
  const viewer = await getOrgViewer();
  const isSuperAdmin = Boolean(viewer?.isSuperAdmin);
  const baseAllowAdmin = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
  const roleLabel = viewer?.isOwner ? "Owner" : viewer?.isAdmin ? "Admin" : viewer?.isManager ? "Manager" : "Team Member";
  const viewerName = viewer?.fullName || "Unknown User";
  const orgName = viewer?.orgName || "Unknown Org";
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__sidebar-brand">TrackToWin</div>
        <AppShellNav navLinks={NAV_LINKS} baseAllowAdmin={baseAllowAdmin} />
      </aside>

      <div className="app-shell__main">
        {(title || subtitle || actions) && (
          <div className="app-shell__page-header">
            <div>
              {title ? <h1 className="app-shell__title">{title}</h1> : null}
              {subtitle ? <p className="app-shell__subtitle">{subtitle}</p> : null}
            </div>
            <div className="app-shell__actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#6b7280", textAlign: "right" }}>
                {viewerName} • {orgName} • {roleLabel}
              </div>
              {actions}
              <AppShellAdminLink showAdminLink={showAdminLink} isSuperAdmin={isSuperAdmin} baseAllowAdmin={baseAllowAdmin} />
            </div>
          </div>
        )}

        <main className="app-shell__content">
          {isSuperAdmin ? <ImpersonationBanner /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}
