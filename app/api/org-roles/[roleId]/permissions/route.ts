import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";

export async function POST(request: Request, { params }: { params: { roleId: string } }) {
  const viewer: any = await getOrgViewer(request);
  if (!viewer?.orgId || !(viewer?.personId || viewer?.userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canAccess = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roleId = params?.roleId?.trim();
  if (!roleId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const rawPermissions = Array.isArray(body?.permissions) ? body.permissions : [];
  const sanitized = Array.from(
    new Set(rawPermissions.map((permission) => (typeof permission === "string" ? permission.trim() : "")).filter(Boolean))
  );

  const role = await prisma.orgRole.findFirst({
    where: { id: roleId, orgId: viewer.orgId },
    select: { id: true },
  });
  if (!role) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.orgRolePermission.deleteMany({ where: { roleId } }),
    prisma.orgRolePermission.createMany({
      data: sanitized.map((permission) => ({ roleId, permission })),
    }),
  ]);

  return NextResponse.json({ ok: true, roleId, permissions: sanitized });
}
