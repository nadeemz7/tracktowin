import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";

export async function GET() {
  const viewer: any = await getOrgViewer();
  if (!viewer?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const permissions = viewer?.permissions ?? [];
  const canAccess = Boolean(viewer?.isTtwAdmin || viewer?.isOwner || permissions.includes("ACCESS_ADMIN_TOOLS"));
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roles = await prisma.orgRole.findMany({
    where: { orgId: viewer.orgId },
    orderBy: [{ isSystem: "desc" }, { key: "asc" }],
    include: { permissions: true },
  });

  return NextResponse.json({
    roles: roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      isSystem: role.isSystem,
      permissions: role.permissions.map((permission) => permission.permission),
    })),
  });
}
