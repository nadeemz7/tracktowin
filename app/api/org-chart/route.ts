import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const viewer = await getOrgViewer(request);
  if (!viewer?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await prisma.org.findUnique({
    where: { id: viewer.orgId },
    select: { orgChartJson: true },
  });

  return NextResponse.json({ ok: true, chart: org?.orgChartJson ?? null });
}

export async function POST(request: Request) {
  const viewer = await getOrgViewer(request);
  if (!viewer?.orgId || !(viewer?.personId || viewer?.userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isOrgAdmin = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
  if (!isOrgAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const chart = body?.chart;
  if (chart !== null) {
    if (!chart || typeof chart !== "object" || Array.isArray(chart)) {
      return NextResponse.json({ error: "Invalid chart" }, { status: 400 });
    }
    if (!Array.isArray(chart.nodes) || !Array.isArray(chart.edges)) {
      return NextResponse.json({ error: "Invalid chart" }, { status: 400 });
    }
  }

  await prisma.org.update({
    where: { id: viewer.orgId },
    data: { orgChartJson: chart },
  });

  return NextResponse.json({ ok: true });
}
