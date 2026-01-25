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

function useAllowAdmin(baseAllowAdmin: boolean) {
  const [impersonated, setImpersonated] = useState<{ id: string; isAdmin?: boolean; isManager?: boolean; isOwner?: boolean } | null>(null);
  const [hasImpersonationCookie, setHasImpersonationCookie] = useState<boolean | null>(null);

  useEffect(() => {
    // Detect cookie early to avoid a flash of admin nav while impersonating a non-admin.
    let hasCookie = false;
    if (typeof document !== "undefined") {
      const hasSessionFlag = sessionStorage.getItem("ttw_impersonating") === "1";
      hasCookie = document.cookie.includes("impersonatePersonId=") || hasSessionFlag;
    }
    setHasImpersonationCookie(hasCookie);

    if (!hasCookie) {
      setImpersonated(null);
      return;
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
  }, []);

  if (hasImpersonationCookie === null) return false;
  if (hasImpersonationCookie) {
    if (!impersonated) return false;
    return Boolean(impersonated.isAdmin || impersonated.isManager || impersonated.isOwner);
  }
  return Boolean(baseAllowAdmin);
}

export function AppShellNav({ navLinks, baseAllowAdmin = false }: { navLinks: NavItem[]; baseAllowAdmin?: boolean }) {
  const pathname = usePathname();
  const allowAdmin = useAllowAdmin(baseAllowAdmin);
  const canSeeAdminTools = allowAdmin;

  const nav = canSeeAdminTools
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

export function AppShellAdminLink({
  showAdminLink = true,
  isSuperAdmin = false,
  baseAllowAdmin: _baseAllowAdmin = false,
}: {
  showAdminLink?: boolean;
  isSuperAdmin?: boolean;
  baseAllowAdmin?: boolean;
}) {
  const showImpersonation = Boolean(isSuperAdmin);
  if (!showImpersonation) return null;

  return showAdminLink ? (
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
