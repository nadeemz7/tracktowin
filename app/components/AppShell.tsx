"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ImpersonationBar } from "@/components/ImpersonationBar";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

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
  const pathname = usePathname();
  const [impersonated, setImpersonated] = useState<{ id: string; isAdmin?: boolean; isManager?: boolean; isOwner?: boolean } | null>(null);
  const [hasImpersonationCookie, setHasImpersonationCookie] = useState(false);
  const [impersonationChecked, setImpersonationChecked] = useState(false);

  useEffect(() => {
    // Detect cookie early to avoid a flash of admin nav while impersonating a non-admin.
    if (typeof document !== "undefined") {
      const hasCookie = document.cookie.includes("impersonatePersonId=");
      const hasSessionFlag = sessionStorage.getItem("ttw_impersonating") === "1";
      setHasImpersonationCookie(hasCookie || hasSessionFlag);
    }

    async function check() {
      try {
        const res = await fetch("/api/admin/impersonate");
        if (!res.ok) return setImpersonated(null);
        const data = await res.json();
        setImpersonated(data?.person || null);
      } catch {
        setImpersonated(null);
      }
    }
    check();
    setImpersonationChecked(true);
  }, []);

  const allowAdmin = impersonated
    ? Boolean(impersonated.isAdmin || impersonated.isManager || impersonated.isOwner)
    : hasImpersonationCookie
      ? false // if a cookie exists but we don't yet have role info, hide admin to avoid a flash
      : impersonationChecked; // only allow by default after we've checked for cookies once

  const nav = allowAdmin
    ? NAV_LINKS
    : NAV_LINKS.filter((n) => n.href !== "/admin").map((n) => {
        if (n.href !== "/reports" || !n.children) return n;
        return { ...n, children: n.children.filter((c) => c.href !== "/reports/roi") };
      });

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__sidebar-brand">TrackToWin</div>
        <nav className="app-shell__sidebar-nav">
          {nav.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            const childActive = link.children?.some((c) => {
              const childPath = c.href.split("?")[0];
              return pathname === childPath || pathname.startsWith(`${childPath}/`);
            });
            return (
              <div key={link.href}>
                <Link
                  href={link.href}
                  className={`app-shell__nav-link ${active ? "is-active" : ""}`}
                >
                  <span className="app-shell__nav-icon">{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
                {link.children ? (
                  <div className={`app-shell__nav-sub ${childActive ? "is-open" : ""}`}>
                    {link.children.map((child) => {
                      const childPath = child.href.split("?")[0];
                      const childMatch = pathname === childPath || pathname.startsWith(`${childPath}/`);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`app-shell__sub-link ${childMatch ? "is-active" : ""}`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
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
              {showAdminLink && allowAdmin ? (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Link href="/admin" className="btn" style={{ textDecoration: "none", padding: "6px 12px" }}>
                    TrackToWin Admin
                  </Link>
                  <ImpersonationBar />
                </div>
              ) : (
                <ImpersonationBar />
              )}
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
