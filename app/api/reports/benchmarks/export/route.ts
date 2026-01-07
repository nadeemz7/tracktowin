import { NextResponse } from "next/server";
import { getViewerContext } from "@/lib/getViewerContext";
import { PolicyStatus } from "@prisma/client";
import { DEFAULT_STATUSES } from "@/app/reports/benchmarks/lib/benchmarksConstants";
import { BenchmarksReportError, getBenchmarksReport } from "@/app/reports/benchmarks/lib/getBenchmarksReport";

function parseISODate(value: string | null) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function toCell(value: unknown) {
  if (value == null) return "";
  return csvEscape(String(value));
}

export async function GET(req: Request) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const startParam = url.searchParams.get("start");
    const endParam = url.searchParams.get("end");
    const start = parseISODate(startParam);
    const end = parseISODate(endParam);
    if (!start || !end) {
      return NextResponse.json({ error: "Invalid start or end date" }, { status: 400 });
    }

    const rawStatuses = url.searchParams.get("statuses");
    const parsedStatuses = rawStatuses
      ? rawStatuses
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const statuses = (parsedStatuses.length ? parsedStatuses : DEFAULT_STATUSES) as PolicyStatus[];

    const report = await getBenchmarksReport({
      orgId: viewer.orgId,
      start,
      end,
      statuses,
    });

    const lines: string[] = [];

    lines.push(
      [
        "section",
        "mode",
        "appsActual",
        "appsTarget",
        "premiumActual",
        "premiumTarget",
        "appsDelta",
        "premiumDelta",
        "appsPace",
        "premiumPace",
      ].map(csvEscape).join(",")
    );
    lines.push(
      [
        "OFFICE",
        report.office.planMode ?? "",
        report.office.appsActual,
        report.office.appsTarget,
        report.office.premiumActual,
        report.office.premiumTarget,
        report.office.appsDelta,
        report.office.premiumDelta,
        report.office.pace.appsPace,
        report.office.pace.premiumPace,
      ].map(toCell).join(",")
    );
    lines.push("");

    lines.push(
      [
        "section",
        "mode",
        "key",
        "category",
        "appsActual",
        "appsTarget",
        "premiumActual",
        "premiumTarget",
        "premiumDelta",
        "pacePremium",
      ].map(csvEscape).join(",")
    );
    report.breakdown.rows.forEach((row) => {
      lines.push(
        [
          "BREAKDOWN",
          report.breakdown.mode,
          row.key,
          row.category ?? "",
          row.appsActual,
          row.appsTarget,
          row.premiumActual,
          row.premiumTarget,
          row.premiumDelta,
          row.pacePremium,
        ].map(toCell).join(",")
      );
    });
    lines.push("");

    lines.push(
      [
        "section",
        "personId",
        "name",
        "roleName",
        "appsActual",
        "appsTarget",
        "premiumActual",
        "premiumTarget",
        "premiumDelta",
        "pacePremium",
        "expectationSource",
      ].map(csvEscape).join(",")
    );
    report.people.forEach((row) => {
      lines.push(
        [
          "PEOPLE",
          row.personId,
          row.name,
          row.roleName ?? "",
          row.appsActual,
          row.appsTarget,
          row.premiumActual,
          row.premiumTarget,
          row.premiumDelta,
          row.pacePremium,
          row.expectationSource,
        ].map(toCell).join(",")
      );
    });

    const csv = lines.join("\n");
    const filename = `benchmarks_${startParam}_to_${endParam}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    if (err instanceof BenchmarksReportError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[benchmarks export] error", err);
    return NextResponse.json({ error: "Benchmarks export failed", detail: String(err?.message ?? err) }, { status: 500 });
  }
}
