import { NextResponse } from "next/server";
import { PolicyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import { ALL_STATUSES, DEFAULT_STATUSES } from "@/app/reports/benchmarks/lib/benchmarksConstants";
import { BenchmarksReportError, getBenchmarksReport } from "@/app/reports/benchmarks/lib/getBenchmarksReport";

function parseISODate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return null;
  return date;
}

function sanitizeStatuses(input: unknown): PolicyStatus[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const next: PolicyStatus[] = [];
  input.forEach((status) => {
    const trimmed = typeof status === "string" ? status.trim() : "";
    if (!trimmed) return;
    if (!ALL_STATUSES.includes(trimmed as any)) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    next.push(trimmed as PolicyStatus);
  });
  return next;
}

export async function GET(req: Request) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    if (type !== "benchmarks") {
      return NextResponse.json({ error: "Unsupported snapshot type" }, { status: 400 });
    }

    const snapshots = await prisma.reportSnapshot.findMany({
      where: { reportType: type },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        startISO: true,
        endISO: true,
        statusesCSV: true,
        title: true,
      },
    });

    return NextResponse.json(snapshots);
  } catch (err: any) {
    console.error("[snapshots list] error", err);
    return NextResponse.json({ error: "Snapshots list failed", detail: String(err?.message ?? err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as {
      reportType?: string;
      start?: string;
      end?: string;
      title?: string;
      statuses?: unknown;
    } | null;

    if (!body || body.reportType !== "benchmarks") {
      return NextResponse.json({ error: "Unsupported snapshot type" }, { status: 400 });
    }

    const startISO = typeof body.start === "string" ? body.start : null;
    const endISO = typeof body.end === "string" ? body.end : null;
    const start = parseISODate(startISO);
    const end = parseISODate(endISO);
    if (!startISO || !endISO || !start || !end) {
      return NextResponse.json({ error: "Invalid or missing start/end" }, { status: 400 });
    }

    const sanitized = sanitizeStatuses(body.statuses);
    const statuses = (sanitized.length ? sanitized : DEFAULT_STATUSES) as PolicyStatus[];
    const trimmedTitle = typeof body.title === "string" ? body.title.trim() : "";
    const fallbackTitle = `Benchmarks: ${startISO} to ${endISO}`;
    const title = (trimmedTitle || fallbackTitle).slice(0, 140);

    const report = await getBenchmarksReport({
      orgId: viewer.orgId,
      start,
      end,
      statuses,
    });

    const snapshot = await prisma.reportSnapshot.create({
      data: {
        reportType: "benchmarks",
        startISO,
        endISO,
        statusesCSV: statuses.join(","),
        payloadJson: report as any,
        title,
        metaJson: {
          generatedAt: new Date().toISOString(),
          version: 1,
        },
      },
      select: { id: true, createdAt: true, title: true },
    });

    return NextResponse.json(snapshot);
  } catch (err: any) {
    if (err instanceof BenchmarksReportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[snapshots create] error", err);
    return NextResponse.json({ error: "Snapshot create failed", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
