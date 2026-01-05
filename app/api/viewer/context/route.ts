import { NextResponse } from "next/server";
import { getViewerContext } from "@/lib/getViewerContext";

export async function GET(req: Request) {
  const ctx = await getViewerContext(req);
  if (!ctx) return NextResponse.json(null);
  return NextResponse.json({
    personId: ctx.personId,
    orgId: ctx.orgId,
    isAdmin: ctx.isAdmin,
    isManager: ctx.isManager,
    isOwner: ctx.isOwner,
    impersonating: ctx.impersonating,
  });
}
