"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ImpersonationBar } from "@/components/ImpersonationBar";

type NavItem = {
  href: string;
  label: string;
  icon?: string;
  children?: { href: string; label: string }[];
};

function useAllowAdmin() {
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

  return impersonated
    ? Boolean(impersonated.isAdmin || impersonated.isManager || impersonated.isOwner)
    : hasImpersonationCookie
      ? false // if a cookie exists but we don't yet have role info, hide admin to avoid a flash
      : impersonationChecked; // only allow by default after we've checked for cookies once
}

export function AppShellNav({ navLinks }: { navLinks: NavItem[] }) {
  const pathname = usePathname();
  const allowAdmin = useAllowAdmin();

  const nav = allowAdmin
    ? navLinks
    : navLinks.filter((n) => n.href !== "/admin").map((n) => {
        if (n.href !== "/reports" || !n.children) return n;
        return { ...n, children: n.children.filter((c) => c.href !== "/reports/roi") };
      });

  return (
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
  );
}

export function AppShellAdminLink({ showAdminLink = true }: { showAdminLink?: boolean }) {
  const allowAdmin = useAllowAdmin();

  return showAdminLink && allowAdmin ? (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Link href="/admin" className="btn" style={{ textDecoration: "none", padding: "6px 12px" }}>
        TrackToWin Admin
      </Link>
      <ImpersonationBar />
    </div>
  ) : (
    <ImpersonationBar />
  );
}
