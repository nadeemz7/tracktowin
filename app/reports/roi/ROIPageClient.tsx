"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/app/components/AppShell";
import ROIClient from "./ROIClient";

type ViewerContext = {
  personId: string;
  orgId: string;
  role?: string;
  isAdmin: boolean;
  isManager: boolean;
  isOwner: boolean;
  impersonating: boolean;
};

type LobOption = { id: string; name: string; premiumCategory: string };

export default function ROIPageClient({ lobs }: { lobs: LobOption[] }) {
  const [viewer, setViewer] = useState<ViewerContext | null>(null);
  const [loadingViewer, setLoadingViewer] = useState<boolean>(true);
  const didAutoLoginRef = useRef(false);
  const [lastContextStatus, setLastContextStatus] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/viewer/context", { cache: "no-store", credentials: "include" });
        if (active) setLastContextStatus(res.status);

        const handleJson = async (response: Response) => {
          const json = (await response.json()) as { viewer?: ViewerContext | null } | ViewerContext | null;
          if (!active) return;
          if (json && typeof (json as any).viewer === "object") {
            setViewer(((json as any).viewer as ViewerContext) || null);
          } else {
            setViewer((json as ViewerContext | null) || null);
          }
        };

        if (!res.ok) {
          if (process.env.NODE_ENV !== "production" && !didAutoLoginRef.current) {
            didAutoLoginRef.current = true;
            try {
              await fetch("/api/dev/login", { credentials: "include" });
              const retry = await fetch("/api/viewer/context", { cache: "no-store", credentials: "include" });
              if (active) setLastContextStatus(retry.status);
              if (retry.ok) {
                await handleJson(retry);
                return;
              }
            } catch {
              // swallow and fall through to null
            }
          }
          if (active) setViewer(null);
          return;
        }
        await handleJson(res);
      } catch {
        if (active) setViewer(null);
      } finally {
        if (active) setLoadingViewer(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const allowedRoles = new Set(["admin", "owner", "manager"]);
  const role =
    viewer?.role ?? (viewer?.isAdmin ? "admin" : viewer?.isOwner ? "owner" : viewer?.isManager ? "manager" : "");
  const canView = role !== "" && allowedRoles.has(role);

  return (
    <AppShell title="ROI Report" subtitle="Understand profit by person and line of business.">
      {loadingViewer ? (
        <div style={{ padding: 16 }}>Loading…</div>
      ) : !viewer || !canView ? (
        <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecdd3", borderRadius: 12, color: "#991b1b" }}>
          This report is restricted to managers, owners, or admins. Switch to an authorized profile to view ROI.
        </div>
      ) : (
        <ROIClient lobs={lobs} />
      )}
    </AppShell>
  );
}
