import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const COOKIE_OPTIONS = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: false };

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const providedPersonId = url.searchParams.get("personId") || undefined;

  let personId = providedPersonId;

  if (!personId) {
    const admin = await prisma.person.findFirst({
      where: { OR: [{ isAdmin: true }, { role: { name: { in: ["ADMIN", "OWNER"] } } }] },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    personId = admin?.id || null;

    if (!personId) {
      const anyPerson = await prisma.person.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
      personId = anyPerson?.id || null;
    }
  }

  if (!personId) {
    return NextResponse.json({ ok: false, error: "No people found in DB" }, { status: 404 });
  }

  const usedFallback = !providedPersonId;
  const res = NextResponse.json({ ok: true, personId, note: "dev login set", usedFallback });
  // Set only the cookie names getViewerContext reads.
  res.cookies.set("personId", personId, COOKIE_OPTIONS);
  res.cookies.set("userId", personId, COOKIE_OPTIONS);
  res.cookies.set("viewerPersonId", personId, COOKIE_OPTIONS);
  res.cookies.set("ttw_personId", personId, COOKIE_OPTIONS);
  res.cookies.set("impersonatePersonId", personId, COOKIE_OPTIONS);

  return res;
}
