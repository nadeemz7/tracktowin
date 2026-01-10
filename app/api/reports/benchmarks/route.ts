import { NextResponse } from "next/server";
import { getViewerContext } from "@/lib/getViewerContext";
import { PolicyStatus } from "@prisma/client";
import { startOfMonth } from "date-fns";
import { DEFAULT_STATUSES } from "@/app/reports/benchmarks/lib/benchmarksConstants";
import { BenchmarksReportError, getBenchmarksReport } from "@/app/reports/benchmarks/lib/getBenchmarksReport";

type RequestBody = {
  dateFrom?: string;
  dateTo?: string;
  statuses?: PolicyStatus[];
  peopleIds?: string[];
  lobIds?: string[];
};

function parseDate(value: any): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const startRaw = parseDate(body.dateFrom) || startOfMonth(new Date());
    const endRaw = parseDate(body.dateTo) || new Date();
    const statuses = (Array.isArray(body.statuses) && body.statuses.length ? body.statuses : DEFAULT_STATUSES) as PolicyStatus[];

    const peopleIds = Array.isArray(body.peopleIds)
      ? body.peopleIds.map((id) => String(id)).filter((id) => id)
      : [];
    const lobIds = Array.isArray(body.lobIds) ? body.lobIds.map((id) => String(id)).filter((id) => id) : [];

    const report = await getBenchmarksReport({
      orgId: viewer.orgId,
      start: startRaw,
      end: endRaw,
      statuses,
      personIds: peopleIds.length ? peopleIds : undefined,
      lobIds: lobIds.length ? lobIds : undefined,
    });

    return NextResponse.json(report);
  } catch (err: any) {
    if (err instanceof BenchmarksReportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[benchmarks report] error", err);
    return NextResponse.json({ error: "Benchmarks report failed", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
