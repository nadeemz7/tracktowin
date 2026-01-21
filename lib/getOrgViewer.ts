import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import { ALL_PERMISSIONS, PERMISSION_DEFINITIONS, ROLE_PERMISSION_DEFAULTS } from "@/lib/permissions";
import { cookies, headers } from "next/headers";
import jwt from "jsonwebtoken";

export { ALL_PERMISSIONS, PERMISSION_DEFINITIONS, ROLE_PERMISSION_DEFAULTS };

export type OrgViewer = {
  userId: string | null;
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
    if (!store) return null;
    const fromString = (value: string) => {
      const tokenPair = value
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
      return tokenPair ? tokenPair.slice(`${name}=`.length) : null;
    };
    if (typeof store.getAll === "function") {
      const match = store.getAll().find((cookie: any) => cookie.name === name);
      return match?.value ?? null;
    }
    if (typeof store.toString === "function") {
      return fromString(store.toString());
    }
    if (typeof store.get === "function") {
      return store.get(name)?.value ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

function getUserIdFromToken(token: string | null): string | null {
  if (!token) return null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    const decoded = jwt.verify(token, secret) as { userId?: string };
    return typeof decoded?.userId === "string" ? decoded.userId : null;
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
    let hStore: any = null;
    try {
      hStore = headers();
    } catch {
      hStore = null;
    }
    const h = hStore && typeof hStore.then === "function" ? await hStore : hStore;
    request = h && typeof h.get === "function" ? new Request("http://localhost", { headers: h }) : null;
  }

  const base: any = request ? await getViewerContext(request).catch(() => null) : null;
  const jwtUserId = getUserIdFromToken(safeCookieGet("token"));
  const userId = typeof base?.userId === "string" ? base.userId : jwtUserId;

  const headerImpersonate =
    request?.headers?.get("x-impersonate-person-id") ||
    request?.headers?.get("x-impersonate-id") ||
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
        userId,
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
      userId,
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
        userId,
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
      userId,
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
      userId,
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
