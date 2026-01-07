import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const snapshot = await prisma.reportSnapshot.findUnique({
      where: { id: params.id },
    });

    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    const statuses = snapshot.statusesCSV
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return NextResponse.json({
      id: snapshot.id,
      createdAt: snapshot.createdAt,
      title: snapshot.title,
      reportType: snapshot.reportType,
      startISO: snapshot.startISO,
      endISO: snapshot.endISO,
      statusesCSV: snapshot.statusesCSV,
      statuses,
      payloadJson: snapshot.payloadJson,
      payload: snapshot.payloadJson,
      meta: snapshot.metaJson,
    });
  } catch (err: any) {
    console.error("[snapshots read] error", err);
    return NextResponse.json({ error: "Snapshot read failed", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
