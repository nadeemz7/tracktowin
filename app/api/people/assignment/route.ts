import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import { hasBenchmarksWriteAccess } from "@/lib/benchmarks/guards";

export async function POST(req: Request) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasBenchmarksWriteAccess(viewer)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as any;
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });

    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: { team: true },
    });
    if (!person || person.primaryAgencyId !== viewer.orgId) {
      return NextResponse.json({ error: "Person not found in org" }, { status: 404 });
    }

    // Validate optional teamId
    const teamId = "teamId" in body ? (body.teamId ? String(body.teamId) : null) : undefined;
    if (teamId !== undefined && teamId !== null) {
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team || team.agencyId !== viewer.orgId) {
        return NextResponse.json({ error: "Team not found in org" }, { status: 404 });
      }
    }

    // Validate optional roleId
    const roleId = "roleId" in body ? (body.roleId ? String(body.roleId) : null) : undefined;
    if (roleId !== undefined && roleId !== null) {
      const role = await prisma.role.findUnique({ where: { id: roleId }, include: { team: true } });
      if (!role || role.team?.agencyId !== viewer.orgId) {
        return NextResponse.json({ error: "Role not found in org" }, { status: 404 });
      }
    }

    // Validate optional primaryAgencyId (must be viewer org or null)
    const primaryAgencyId =
      "primaryAgencyId" in body ? (body.primaryAgencyId ? String(body.primaryAgencyId) : null) : undefined;
    if (primaryAgencyId !== undefined && primaryAgencyId !== null && primaryAgencyId !== viewer.orgId) {
      return NextResponse.json({ error: "primaryAgencyId must match viewer org" }, { status: 400 });
    }

    const payload: any = {};
    if (roleId !== undefined) payload.roleId = roleId;
    if (teamId !== undefined) payload.teamId = teamId;
    if (primaryAgencyId !== undefined) payload.primaryAgencyId = primaryAgencyId;
    if ("isAdmin" in body) payload.isAdmin = Boolean(body.isAdmin);
    if ("isManager" in body) payload.isManager = Boolean(body.isManager);
    if ("active" in body) payload.active = Boolean(body.active);

    const updated = await prisma.person.update({
      where: { id: personId },
      data: payload,
      include: { role: true, team: { include: { agency: true } }, primaryAgency: true },
    });

    return NextResponse.json({ person: updated });
  } catch (err: any) {
    console.error("[people/assignment] error", err);
    return NextResponse.json({ error: "Failed to update person" }, { status: 500 });
  }
}
