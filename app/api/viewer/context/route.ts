import { NextResponse } from "next/server";
import { getViewerContext, getLastViewerDebug } from "@/lib/getViewerContext";

export async function GET(req: Request) {
  const ctx = await getViewerContext(req);
  if (!ctx) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        viewer: null,
        debug: getLastViewerDebug(),
      });
    }
    return NextResponse.json(null);
  }

  const viewer = { ...ctx } as any;

  const derivedRole =
    viewer.isAdmin ? "admin" : viewer.isOwner ? "owner" : viewer.isManager ? "manager" : viewer.role ? String(viewer.role) : "user";

  return NextResponse.json({
    viewer: {
      personId: viewer.personId,
      orgId: viewer.orgId,
      isAdmin: viewer.isAdmin,
      isManager: viewer.isManager,
      isOwner: viewer.isOwner,
      impersonating: viewer.impersonating,
      role: derivedRole,
    },
  });
}
