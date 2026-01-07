import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const COOKIE_NAME = "impersonatePersonId";
const COOKIE_OPTIONS = { path: "/", httpOnly: true, sameSite: "lax" as const };

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const personId = match?.[1];
  if (!personId) return NextResponse.json({ person: null });
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, fullName: true, isAdmin: true, isManager: true, primaryAgencyId: true, teamType: true },
  });
  if (!person) return NextResponse.json({ person: null });
  const ownsAgencies =
    (await prisma.agency.count({ where: { ownerName: { contains: person.fullName, mode: "insensitive" } } })) > 0;
  return NextResponse.json({ person: { ...person, isOwner: ownsAgencies } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const personId = typeof body.personId === "string" && body.personId.length > 0 ? body.personId : null;

  const response = NextResponse.json({ ok: true });

  if (!personId) {
    response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
    return response;
  }

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { id: true, fullName: true, isAdmin: true, isManager: true, primaryAgencyId: true, teamType: true },
  });
  if (!person) {
    const notFound = NextResponse.json({ ok: false, error: "Person not found" }, { status: 404 });
    notFound.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
    return notFound;
  }

  response.cookies.set(COOKIE_NAME, personId, COOKIE_OPTIONS);
  const ownsAgencies =
    (await prisma.agency.count({ where: { ownerName: { contains: person.fullName, mode: "insensitive" } } })) > 0;
  return NextResponse.json({ person: { ...person, isOwner: ownsAgencies } }, { headers: response.headers });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  return response;
}
