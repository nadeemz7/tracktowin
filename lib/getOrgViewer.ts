import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import { ALL_PERMISSIONS, PERMISSION_DEFINITIONS, ROLE_PERMISSION_DEFAULTS } from "@/lib/permissions";
import { cookies, headers } from "next/headers";
import jwt from "jsonwebtoken";

export { ALL_PERMISSIONS, PERMISSION_DEFINITIONS, ROLE_PERMISSION_DEFAULTS };

const COOKIE_NAME = "token";

export type OrgViewer = {
  userId: string | null;
  personId: string | null;
  fullName: string | null;
  orgId: string | null;
  orgName: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  isManager: boolean;
  isSuperAdmin: boolean;
  impersonating: boolean;
  roleKeys: string[];
  permissions: string[];
};

function safeCookieGet(store: any, name: string): string | null {
  try {
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

  // Next.js 16 cookies() is async; await the store before reading values.
  let cookieStore: any = null;
  try {
    cookieStore = await cookies();
  } catch {
    cookieStore = null;
  }

  const base: any = request ? await getViewerContext(request).catch(() => null) : null;
  const jwtUserId = getUserIdFromToken(safeCookieGet(cookieStore, COOKIE_NAME));
  const userId = typeof base?.userId === "string" ? base.userId : jwtUserId;
  /*
   * Viewer resolution order (highest priority first):
   * 1) Impersonation headers (x-impersonate-person-id / x-impersonate-id)
   * 2) Impersonation cookie (impersonatePersonId)
   * 3) Base viewer context (getViewerContext)
   * 4) JWT userId -> User.personId (resilient when cookies are missing)
   * 5) Legacy cookies (personId/userId/viewerPersonId/ttw_personId)
   *
   * Why: JWT is source of truth; cookies can be cleared. The User.personId
   * lookup prevents Unauthorized after redirects/onboarding. Do not reorder
   * without understanding impersonation + auth implications.
   */
  let userPersonId: string | null = null;
  let userIsSuperAdmin = false;
  if (userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { personId: true, isSuperAdmin: true },
      });
      userPersonId = user?.personId ?? null;
      userIsSuperAdmin = Boolean(user?.isSuperAdmin);
    } catch {
      userPersonId = null;
      userIsSuperAdmin = false;
    }
  }

  const headerImpersonate =
    request?.headers?.get("x-impersonate-person-id") ||
    request?.headers?.get("x-impersonate-id") ||
    null;

  const cookieImpersonate = safeCookieGet(cookieStore, "impersonatePersonId");
  const basePersonId =
    typeof base?.personId === "string" && base.personId ? base.personId : null;

  // DEV FORCED FALLBACK: if no viewer, pick a user so dev is usable
  const isDev = process.env.NODE_ENV !== "production";
  const allowDevFallback = process.env.TTW_DEV_VIEWER_FALLBACK === "1";
  if (isDev && allowDevFallback && !basePersonId && !headerImpersonate && !cookieImpersonate) {
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
      const orgName = orgId
        ? (await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } }))?.name ?? null
        : null;
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
        fullName: preferred.fullName ?? null,
        orgId,
        orgName,
        isAdmin,
        isOwner,
        isManager,
        isSuperAdmin: userIsSuperAdmin,
        impersonating: false,
        roleKeys,
        permissions,
      };
    }
  }

  const effectivePersonId =
    headerImpersonate ||
    cookieImpersonate ||
    basePersonId ||
    userPersonId ||
    safeCookieGet(cookieStore, "personId") ||
    safeCookieGet(cookieStore, "userId") ||
    safeCookieGet(cookieStore, "viewerPersonId") ||
    safeCookieGet(cookieStore, "ttw_personId") ||
    null;

  if (!effectivePersonId) {
    return {
      userId,
      personId: null,
      fullName: null,
      orgId: base?.orgId ?? null,
      orgName: null,
      isAdmin: Boolean(base?.isAdmin),
      isOwner: Boolean(base?.isOwner),
      isManager: Boolean(base?.isManager),
      isSuperAdmin: userIsSuperAdmin,
      impersonating: false,
      roleKeys: [],
      permissions: [],
    };
  }

  try {
    const impersonationRequested = Boolean(headerImpersonate || cookieImpersonate);
    let fellBackFromImpersonation = false;
    let person: any = await prisma.person.findFirst({
      where: { id: effectivePersonId },
      include: { primaryAgency: true, role: true, team: true },
    });

    if (!person && impersonationRequested) {
      const fallbackPersonId = basePersonId || null;
      if (fallbackPersonId) {
        person = await prisma.person.findFirst({
          where: { id: fallbackPersonId },
          include: { primaryAgency: true, role: true, team: true },
        });
        fellBackFromImpersonation = true;
      }
    }

    if (!person) {
      return {
        userId,
        personId: basePersonId ?? null,
        fullName: null,
        orgId: base?.orgId ?? null,
        orgName: null,
        isAdmin: Boolean(base?.isAdmin),
        isOwner: Boolean(base?.isOwner),
        isManager: Boolean(base?.isManager),
        isSuperAdmin: userIsSuperAdmin,
        impersonating: false,
        roleKeys: [],
        permissions: [],
      };
    }

    const orgId = person.orgId ?? null;
    const orgName = orgId
      ? (await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } }))?.name ?? null
      : null;
    const { roleKeys, permissions } = await resolveRoleAssignments(person.id, orgId);
    const roleKeySet = new Set(roleKeys);
    const roleValue = roleToString(person.role).toUpperCase();
    const isOwner = roleKeySet.has("ORG_OWNER") || (Boolean(person.isAdmin) && roleKeys.length === 0);
    const isAdmin = roleKeySet.has("ORG_ADMIN") || Boolean(person.isAdmin) || roleValue === "ADMIN";
    const isManager = Boolean(person.isManager);

    return {
      userId,
      personId: person.id,
      fullName: person.fullName ?? null,
      orgId,
      orgName,
      isAdmin,
      isOwner,
      isManager,
      isSuperAdmin: userIsSuperAdmin,
      impersonating: impersonationRequested && !fellBackFromImpersonation,
      roleKeys,
      permissions,
    };
  } catch (err) {
    console.error("[getOrgViewer] error", err);
    return {
      userId,
      personId: basePersonId ?? null,
      fullName: null,
      orgId: base?.orgId ?? null,
      orgName: null,
      isAdmin: Boolean(base?.isAdmin),
      isOwner: Boolean(base?.isOwner),
      isManager: Boolean(base?.isManager),
      isSuperAdmin: userIsSuperAdmin,
      impersonating: Boolean(headerImpersonate || cookieImpersonate),
      roleKeys: [],
      permissions: [],
    };
  }
}
