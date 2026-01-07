import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import { cookies } from "next/headers";

export type OrgViewer = {
  personId: string | null;
  orgId: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  isManager: boolean;
  impersonating: boolean;
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

export async function getOrgViewer(req: Request): Promise<OrgViewer> {
  const base: any = await getViewerContext(req).catch(() => null);

  const headerImpersonate =
    req.headers.get("x-impersonate-person-id") ||
    req.headers.get("x-impersonate-id") ||
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
      const roleValue = roleToString(preferred.role).toUpperCase();
      let isAdmin = Boolean(preferred.isAdmin) || roleValue === "ADMIN";
      const isManager = Boolean(preferred.isManager) || roleValue === "MANAGER";
      const isOwner = roleValue === "OWNER";

      if (!isAdmin && !isManager && !isOwner) isAdmin = true;

      let orgId =
        preferred.primaryAgency?.id ||
        preferred.primaryAgencyId ||
        preferred.team?.agencyId ||
        null;

      if (!orgId) {
        const anyAgency = await prisma.agency.findFirst({
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        orgId = anyAgency?.id || null;
      }

      return { personId: preferred.id, orgId, isAdmin, isOwner, isManager, impersonating: false };
    }
  }

  // Normal path
  if (base?.personId && !headerImpersonate && !cookieImpersonate) {
    return {
      personId: base.personId ?? null,
      orgId: base.orgId ?? null,
      isAdmin: Boolean(base.isAdmin),
      isOwner: Boolean(base.isOwner),
      isManager: Boolean(base.isManager),
      impersonating: false,
    };
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
      };
    }

    const roleValue = roleToString(person.role).toUpperCase();
    const isAdmin = Boolean(person.isAdmin) || roleValue === "ADMIN";
    const isManager = Boolean(person.isManager) || roleValue === "MANAGER";
    const isOwner = roleValue === "OWNER";

    const orgId =
      person.primaryAgency?.id ||
      person.primaryAgencyId ||
      person.team?.agencyId ||
      null;

    return {
      personId: person.id,
      orgId,
      isAdmin,
      isOwner,
      isManager,
      impersonating: Boolean(headerImpersonate || cookieImpersonate),
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
    };
  }
}
