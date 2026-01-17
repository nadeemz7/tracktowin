import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";

export async function POST(req: Request) {
  try {
    const viewer = await getOrgViewer(req);
    if (!viewer?.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const permissions = viewer?.permissions ?? [];
    const canManagePeople = Boolean(
      viewer?.isTtwAdmin || permissions.includes("MANAGE_PEOPLE") || permissions.includes("ACCESS_ADMIN_TOOLS")
    );
    if (!canManagePeople) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as any;
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId) return NextResponse.json({ error: "personId required" }, { status: 400 });
    if (!Array.isArray(body.roleIds)) return NextResponse.json({ error: "roleIds required" }, { status: 400 });

    const roleIds = Array.from(
      new Set(
        body.roleIds
          .filter((id: unknown): id is string => typeof id === "string")
          .map((id: string) => id.trim())
          .filter(Boolean)
      )
    );

    const person = await prisma.person.findFirst({
      where: { id: personId, orgId: viewer.orgId },
      select: { id: true },
    });
    if (!person) {
      return NextResponse.json({ error: "Person not found in org" }, { status: 404 });
    }

    if (roleIds.length) {
      const roles = await prisma.orgRole.findMany({
        where: { id: { in: roleIds }, orgId: viewer.orgId },
        select: { id: true },
      });
      if (roles.length !== roleIds.length) {
        return NextResponse.json({ error: "Role not found in org" }, { status: 404 });
      }
    }

    const transaction = [
      prisma.personOrgRole.deleteMany({
        where: { personId, role: { orgId: viewer.orgId } },
      }),
    ];
    if (roleIds.length) {
      transaction.push(
        prisma.personOrgRole.createMany({
          data: roleIds.map((roleId) => ({ personId, roleId })),
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
