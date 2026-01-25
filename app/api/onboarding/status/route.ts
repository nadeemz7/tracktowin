import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const viewer = await getOrgViewer();
  const orgId = viewer?.orgId ?? null;
  if (!orgId) {
    return NextResponse.json({ needsOnboarding: false });
  }
  const agencyCount = await prisma.agency.count({ where: { orgId } });
  return NextResponse.json({ needsOnboarding: agencyCount === 0 });
}
