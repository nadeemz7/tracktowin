import { prisma } from "@/lib/prisma";
import { readCookie } from "@/lib/readCookie";

export async function getViewerContext(req?: Request) {
  if (!req) return null;
  let impersonatePersonId: string | null = null;
  let loggedInPersonId: string | null = null;

  impersonatePersonId = (await readCookie("impersonatePersonId")) || null;
  loggedInPersonId =
    (await readCookie("personId")) ||
    (await readCookie("userId")) ||
    (await readCookie("viewerPersonId")) ||
    (await readCookie("ttw_personId")) ||
    null;

  if (!loggedInPersonId && process.env.NODE_ENV !== "production") {
    const admin = await prisma.person.findFirst({
      where: { OR: [{ isAdmin: true }, { role: { name: { in: ["ADMIN", "OWNER"] } } }] },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (admin?.id) {
      loggedInPersonId = admin.id;
    }
  }

  const viewerPersonId = impersonatePersonId ?? loggedInPersonId;
  if (!viewerPersonId) return null;

  const person = await prisma.person.findFirst({
    where: { id: viewerPersonId },
    include: { primaryAgency: true, role: true },
  });

  if (!person) return null;

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
    return null;
  }

  const orgId = agencyId;

  return {
    personId: person.id,
    orgId,
    isAdmin,
    isManager,
    isOwner,
    impersonating: Boolean(impersonatePersonId),
  };
}
