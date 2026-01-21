import { ReactNode } from "react";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
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

export function AppShell({ title, subtitle, actions, children, showAdminLink = true }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__sidebar-brand">TrackToWin</div>
        <AppShellNav navLinks={NAV_LINKS} />
      </aside>

      <div className="app-shell__main">
        {(title || subtitle || actions) && (
          <div className="app-shell__page-header">
            <div>
              {title ? <h1 className="app-shell__title">{title}</h1> : null}
              {subtitle ? <p className="app-shell__subtitle">{subtitle}</p> : null}
            </div>
            <div className="app-shell__actions" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {actions}
              <AppShellAdminLink showAdminLink={showAdminLink} />
            </div>
          </div>
        )}

        <main className="app-shell__content">
          <ImpersonationBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
