import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";

async function getDevFallbackOrgId(): Promise<string | null> {
  // In dev, if viewer/org can't be resolved, pick the first agency so the UI can function.
  const anyAgency = await prisma.agency.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return anyAgency?.id ?? null;
}

export async function GET(req: Request) {
  try {
    const viewer = await getOrgViewer(req);
    const isDev = process.env.NODE_ENV !== "production";

    if (isDev) {
      console.log("[org-lobs] viewer", {
        viewerId: viewer?.personId ?? null,
        isAdmin: viewer?.isAdmin ?? false,
        orgId: viewer?.orgId ?? null,
        impersonating: viewer?.impersonating ?? false,
      });
    }

    // If viewer/org missing, use a dev fallback org id (dev only).
    let orgId = viewer?.orgId ?? null;
    if (!orgId && isDev) {
      orgId = await getDevFallbackOrgId();
      console.log("[org-lobs][dev-fallback] orgId", orgId);
    }

    // If still no orgId, return empty list (no error)
    if (!orgId) {
      if (isDev) console.error("[org-lobs][GET] missing orgId (even after dev fallback)", { viewer });
      return NextResponse.json({ lobs: [] });
    }

    const lobs = await prisma.lineOfBusiness.findMany({
      where: { agencyId: orgId },
      select: { id: true, name: true, premiumCategory: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ lobs });
  } catch (err: any) {
    console.error("[org-lobs][GET] error", err);
    return NextResponse.json({ error: err?.message || "Failed to load LoBs" }, { status: 500 });
  }
}
