import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";

type ParsedDate = { value: Date | null; error?: string };

function parseDateInput(value: unknown, field: "dateOfBirth" | "startDate"): ParsedDate {
  if (value === null) return { value: null };
  if (typeof value !== "string") {
    return { value: null, error: `Invalid ${field}` };
  }
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return { value: null, error: `Invalid ${field}` };
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) {
    return { value: null, error: `Invalid ${field}` };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return { value: null, error: `Invalid ${field}` };
  }
  return { value: parsed };
}

export async function POST(request: Request) {
  const viewer: any = await getOrgViewer(request);
  if (!viewer?.orgId || !viewer?.personId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as any;
  const providedPersonId = typeof body.personId === "string" ? body.personId.trim() : "";
  const targetPersonId = providedPersonId || viewer.personId;

  const isOrgAdmin = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
  if (targetPersonId !== viewer.personId && !isOrgAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const person = await prisma.person.findFirst({
    where: { id: targetPersonId, orgId: viewer.orgId },
    select: { id: true },
  });
  if (!person) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const hasDateOfBirth = Object.prototype.hasOwnProperty.call(body, "dateOfBirth");
  const hasStartDate = Object.prototype.hasOwnProperty.call(body, "startDate");
  if (!hasDateOfBirth && !hasStartDate) {
    return NextResponse.json({ error: "Missing dateOfBirth or startDate" }, { status: 400 });
  }

  const data: { dateOfBirth?: Date | null; startDate?: Date | null } = {};
  if (hasDateOfBirth) {
    const parsed = parseDateInput(body.dateOfBirth, "dateOfBirth");
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    data.dateOfBirth = parsed.value;
  }
  if (hasStartDate) {
    const parsed = parseDateInput(body.startDate, "startDate");
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    data.startDate = parsed.value;
  }

  const updated = await prisma.person.update({
    where: { id: targetPersonId },
    data,
    select: { id: true, dateOfBirth: true, startDate: true },
  });

  return NextResponse.json({ ok: true, person: updated });
}
