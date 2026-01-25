import { getOrgViewer } from "@/lib/getOrgViewer";
import { NextResponse } from "next/server";

export async function requireSuperAdmin(request: Request): Promise<NextResponse | null> {
  const viewer = await getOrgViewer(request);
  if (viewer?.isSuperAdmin !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
