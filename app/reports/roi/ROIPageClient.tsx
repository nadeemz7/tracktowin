"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/app/components/AppShell";
import { canAccessRoiReport } from "@/lib/permissions";
import ROIClient from "./ROIClient";

type ViewerContext = {
  personId: string;
  orgId: string;
  isAdmin: boolean;
  isManager: boolean;
  isOwner: boolean;
  impersonating: boolean;
};

type LobOption = { id: string; name: string; premiumCategory: string };

export default function ROIPageClient({ lobs }: { lobs: LobOption[] }) {
  const [ctx, setCtx] = useState<ViewerContext | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/viewer/context", { cache: "no-store" });
        if (!res.ok) {
          if (active) setCtx(null);
          return;
        }
        const json = (await res.json()) as ViewerContext | null;
        if (active) setCtx(json);
      } catch {
        if (active) setCtx(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const isAllowed = Boolean(ctx && canAccessRoiReport(ctx));

  return (
    <AppShell title="ROI Report" subtitle="Understand profit by person and line of business.">
      {loading ? (
        <div style={{ padding: 16 }}>Loading…</div>
      ) : !isAllowed ? (
        <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecdd3", borderRadius: 12, color: "#991b1b" }}>
          This report is restricted to managers and admins. Switch to an admin or manager profile to view ROI.
        </div>
      ) : (
        <ROIClient lobs={lobs} />
      )}
    </AppShell>
  );
}
