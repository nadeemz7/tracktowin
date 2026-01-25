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
    if (!Array.isArray(body.roleIds)) return NextResponse.json({ error: "roleIds required" }, { status: 400 });

    const roleIdsCleaned = body.roleIds
      .filter((id: unknown): id is string => typeof id === "string")
      .map((id: string) => id.trim());
    if (roleIdsCleaned.length !== body.roleIds.length || roleIdsCleaned.some((id) => !id)) {
      return NextResponse.json({ error: "Invalid roleIds" }, { status: 400 });
    }
    const roleIds = Array.from(new Set(roleIdsCleaned));

    const person = await prisma.person.findFirst({
      where: { id: personId, orgId: viewer.orgId },
      select: { id: true },
    });
    if (!person) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (roleIds.length) {
      const roles = await prisma.orgRole.findMany({
        where: { id: { in: roleIds }, orgId: viewer.orgId },
        select: { id: true },
      });
      if (roles.length !== roleIds.length) {
        return NextResponse.json({ error: "Invalid roleIds" }, { status: 400 });
      }
    }

    const deleteWhere = roleIds.length
      ? { personId, role: { orgId: viewer.orgId }, roleId: { notIn: roleIds } }
      : { personId, role: { orgId: viewer.orgId } };
    const transaction = [prisma.personOrgRole.deleteMany({ where: deleteWhere })];
    if (roleIds.length) {
      transaction.push(
        prisma.personOrgRole.createMany({
          data: roleIds.map((roleId) => ({ personId, roleId })),
          skipDuplicates: true,
        })
      );
    }

    await prisma.$transaction(transaction);

    return NextResponse.json({ ok: true, personId, roleIds });
  } catch (err) {
    console.error("[people/org-roles] error", err);
    return NextResponse.json({ error: "Failed to update org roles" }, { status: 500 });
  }
}
