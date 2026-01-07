import { prisma } from "@/lib/prisma";
import { readCookie } from "@/lib/readCookie";

type ViewerDebug = {
  personId?: string | null;
  userId?: string | null;
  viewerPersonId?: string | null;
  ttw_personId?: string | null;
  impersonatePersonId?: string | null;
  effectivePersonId?: string | null;
  reason?: string;
  error?: string;
};

let lastViewerDebug: ViewerDebug | null = null;

export function getLastViewerDebug() {
  return lastViewerDebug;
}

export async function getViewerContext(req?: Request) {
  if (!req) {
    lastViewerDebug = { reason: "no_request" };
    return null;
  }

  const dbg: ViewerDebug = {
    personId: await readCookie("personId"),
    userId: await readCookie("userId"),
    viewerPersonId: await readCookie("viewerPersonId"),
    ttw_personId: await readCookie("ttw_personId"),
    impersonatePersonId: await readCookie("impersonatePersonId"),
  };

  let impersonatePersonId: string | null = dbg.impersonatePersonId || null;
  let loggedInPersonId: string | null =
    dbg.personId || dbg.userId || dbg.viewerPersonId || dbg.ttw_personId || null;

  if (!loggedInPersonId && process.env.NODE_ENV !== "production") {
    try {
      const admin = await prisma.person.findFirst({
        where: { OR: [{ isAdmin: true }, { role: { name: { in: ["ADMIN", "OWNER"] } } }] },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (admin?.id) {
        loggedInPersonId = admin.id;
      }
    } catch (err) {
      console.error("[getViewerContext] fallback admin lookup error", err);
      lastViewerDebug = { ...dbg, effectivePersonId: null, reason: "lookup_error", error: String(err) };
      return null;
    }
  }

  const effectivePersonId = impersonatePersonId ?? loggedInPersonId;
  dbg.effectivePersonId = effectivePersonId;

  if (!effectivePersonId) {
    lastViewerDebug = { ...dbg, reason: "no_effective_person_id" };
    return null;
  }

  let person: any = null;
  try {
    person = await prisma.person.findFirst({
      where: { id: effectivePersonId },
      include: { primaryAgency: true, role: true },
    });
  } catch (err: any) {
    console.error("[getViewerContext] lookup error", err);
    lastViewerDebug = { ...dbg, reason: "lookup_error", error: String(err) };
    return null;
  }

  if (!person) {
    lastViewerDebug = { ...dbg, reason: "person_not_found" };
    return null;
  }

  const roleValue = (
    typeof (person as any).role === "string"
      ? (person as any).role
      : typeof (person as any).role?.name === "string"
        ? (person as any).role?.name
        : typeof (person as any).role?.key === "string"
          ? (person as any).role?.key
          : ""
  ).toUpperCase();

  const isAdmin = Boolean((person as any).isAdmin) || roleValue === "ADMIN";
  const isOwner = Boolean((person as any).isOwner) || roleValue === "OWNER";
  const isManager = Boolean((person as any).isManager) || roleValue === "MANAGER";

  const agencyId = person.primaryAgency?.id || person.primaryAgencyId || null;
  if (!agencyId) {
    console.error("getViewerContext: missing agencyId for viewer", {
      personId: person.id,
      primaryAgencyId: person.primaryAgencyId,
    });
    lastViewerDebug = { ...dbg, reason: "missing_agency", effectivePersonId };
    return null;
  }

  const orgId = agencyId;
  lastViewerDebug = { ...dbg, reason: "ok" };

  const viewer = {
    personId: person.id,
    orgId,
    isAdmin,
    isManager,
    isOwner,
    impersonating: Boolean(impersonatePersonId),
  } as any;

  if (process.env.NODE_ENV !== "production" && viewer?.impersonating) {
    viewer.role = "admin";
    viewer.isAdmin = true;
    viewer.isOwner = false;
    viewer.isManager = false;
  }

  return viewer;
}
