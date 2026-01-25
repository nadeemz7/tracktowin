import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";

export async function POST(req: Request) {
  try {
    const viewer = await getOrgViewer(req);
    if (!viewer?.orgId || !viewer?.personId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const canManagePeople = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
    if (!canManagePeople) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });

    const person = await prisma.person.findFirst({
      where: { id: personId, orgId: viewer.orgId },
    });
    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Validate optional teamId
    const teamId = "teamId" in body ? (body.teamId ? String(body.teamId) : null) : undefined;
    if (teamId !== undefined && teamId !== null) {
      const team = await prisma.team.findFirst({ where: { id: teamId, orgId: viewer.orgId } });
      if (!team) {
        return NextResponse.json({ error: "Team not found in org" }, { status: 404 });
      }
    }

    // Validate optional roleId
    const roleId = "roleId" in body ? (body.roleId ? String(body.roleId) : null) : undefined;
    if (roleId !== undefined && roleId !== null) {
      const role = await prisma.role.findFirst({ where: { id: roleId, team: { orgId: viewer.orgId } } });
      if (!role) {
        return NextResponse.json({ error: "Role not found in org" }, { status: 404 });
      }
    }

    // Validate optional primaryAgencyId (must belong to viewer org or be null)
    const primaryAgencyId =
      "primaryAgencyId" in body ? (body.primaryAgencyId ? String(body.primaryAgencyId) : null) : undefined;
    if (primaryAgencyId !== undefined && primaryAgencyId !== null) {
      const agency = await prisma.agency.findFirst({ where: { id: primaryAgencyId, orgId: viewer.orgId } });
      if (!agency) {
        return NextResponse.json({ error: "Primary office not found in org" }, { status: 404 });
      }
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
      include: { role: true, team: true, primaryAgency: true },
    });

    return NextResponse.json({ person: updated });
  } catch (err: any) {
    console.error("[people/assignment] error", err);
    return NextResponse.json({ error: "Failed to update person" }, { status: 500 });
  }
}
