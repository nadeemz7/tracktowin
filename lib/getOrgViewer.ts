import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import { ALL_PERMISSIONS, PERMISSION_DEFINITIONS, ROLE_PERMISSION_DEFAULTS } from "@/lib/permissions";
import { cookies, headers } from "next/headers";

export { ALL_PERMISSIONS, PERMISSION_DEFINITIONS, ROLE_PERMISSION_DEFAULTS };

export type OrgViewer = {
  personId: string | null;
  orgId: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  isManager: boolean;
  impersonating: boolean;
  roleKeys: string[];
  permissions: string[];
};

function safeCookieGet(name: string): string | null {
  try {
    const store: any = cookies();
    if (!store || typeof store.get !== "function") return null;
    return store.get(name)?.value ?? null;
  } catch {
    return null;
  }
}

function roleToString(role: any): string {
  if (!role) return "";
  if (typeof role === "string") return role;
  if (typeof role === "object" && typeof role.name === "string") return role.name;
  return "";
}

async function resolveRoleAssignments(personId: string, orgId: string | null) {
  if (!orgId) return { roleKeys: [], permissions: [] };
  const roleAssignments = await prisma.personOrgRole.findMany({
    where: { personId, role: { orgId } },
    include: { role: { include: { permissions: true } } },
  });
  const roleKeys = Array.from(
    new Set(
      roleAssignments
        .map((assignment) => assignment.role.key)
        .filter((key): key is string => Boolean(key))
    )
  );
  const permissions = Array.from(
    new Set(
      roleAssignments
        .flatMap((assignment) => assignment.role.permissions.map((p) => p.permission))
        .filter((permission): permission is string => Boolean(permission))
    )
  );
  return { roleKeys, permissions };
}

export async function getOrgViewer(req?: Request): Promise<OrgViewer> {
  let request = req;
  if (!request) {
    const hStore: any = headers();
    const h = hStore && typeof hStore.then === "function" ? await hStore : hStore;
    request = new Request("http://localhost", { headers: h });
  }

  const base: any = await getViewerContext(request).catch(() => null);

  const headerImpersonate =
    request.headers.get("x-impersonate-person-id") ||
    request.headers.get("x-impersonate-id") ||
    null;

  const cookieImpersonate = safeCookieGet("impersonatePersonId");

  // DEV FORCED FALLBACK: if no viewer, pick a user so dev is usable
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev && !base?.personId && !headerImpersonate && !cookieImpersonate) {
    const preferred =
      (await prisma.person.findFirst({
        where: { isAdmin: true },
        orderBy: { createdAt: "asc" },
        include: { primaryAgency: true, role: true, team: true },
      })) ||
      (await prisma.person.findFirst({
        where: { isManager: true },
        orderBy: { createdAt: "asc" },
        include: { primaryAgency: true, role: true, team: true },
      })) ||
      (await prisma.person.findFirst({
        orderBy: { createdAt: "asc" },
        include: { primaryAgency: true, role: true, team: true },
      }));

    if (preferred) {
      const orgId = preferred.orgId ?? null;
      const { roleKeys, permissions } = await resolveRoleAssignments(preferred.id, orgId);
      const roleKeySet = new Set(roleKeys);
      const roleValue = roleToString(preferred.role).toUpperCase();
      let isAdmin = roleKeySet.has("ORG_ADMIN") || Boolean(preferred.isAdmin) || roleValue === "ADMIN";
      const isManager = Boolean(preferred.isManager);
      const isOwner = roleKeySet.has("ORG_OWNER") || (Boolean(preferred.isAdmin) && roleKeys.length === 0);

      if (!isAdmin && !isManager && !isOwner) isAdmin = true;

      return {
        personId: preferred.id,
        orgId,
        isAdmin,
        isOwner,
        isManager,
        impersonating: false,
        roleKeys,
        permissions,
      };
    }
  }

  const effectivePersonId =
    headerImpersonate ||
    cookieImpersonate ||
    base?.personId ||
    safeCookieGet("personId") ||
    safeCookieGet("userId") ||
    safeCookieGet("viewerPersonId") ||
    safeCookieGet("ttw_personId") ||
    null;

  if (!effectivePersonId) {
    return {
      personId: null,
      orgId: base?.orgId ?? null,
      isAdmin: Boolean(base?.isAdmin),
      isOwner: Boolean(base?.isOwner),
      isManager: Boolean(base?.isManager),
      impersonating: false,
      roleKeys: [],
      permissions: [],
    };
  }

  try {
    const person: any = await prisma.person.findFirst({
      where: { id: effectivePersonId },
      include: { primaryAgency: true, role: true, team: true },
    });

    if (!person) {
      return {
        personId: base?.personId ?? null,
        orgId: base?.orgId ?? null,
        isAdmin: Boolean(base?.isAdmin),
        isOwner: Boolean(base?.isOwner),
        isManager: Boolean(base?.isManager),
        impersonating: Boolean(headerImpersonate || cookieImpersonate),
        roleKeys: [],
        permissions: [],
      };
    }

    const orgId = person.orgId ?? null;
    const { roleKeys, permissions } = await resolveRoleAssignments(person.id, orgId);
    const roleKeySet = new Set(roleKeys);
    const roleValue = roleToString(person.role).toUpperCase();
    const isOwner = roleKeySet.has("ORG_OWNER") || (Boolean(person.isAdmin) && roleKeys.length === 0);
    const isAdmin = roleKeySet.has("ORG_ADMIN") || Boolean(person.isAdmin) || roleValue === "ADMIN";
    const isManager = Boolean(person.isManager);

    return {
      personId: person.id,
      orgId,
      isAdmin,
      isOwner,
      isManager,
      impersonating: Boolean(headerImpersonate || cookieImpersonate),
      roleKeys,
      permissions,
    };
  } catch (err) {
    console.error("[getOrgViewer] error", err);
    return {
      personId: base?.personId ?? null,
      orgId: base?.orgId ?? null,
      isAdmin: Boolean(base?.isAdmin),
      isOwner: Boolean(base?.isOwner),
      isManager: Boolean(base?.isManager),
      impersonating: Boolean(headerImpersonate || cookieImpersonate),
      roleKeys: [],
      permissions: [],
    };
  }
}
