import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { hashToken } from "@/lib/hashToken";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const COOKIE_NAME = "token";
const TOKEN_TTL_SECONDS = 60 * 60;
const VIEWER_COOKIE_NAMES = ["personId", "userId", "viewerPersonId", "ttw_personId"] as const;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return secret;
}

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  const firstName = parts.shift() || "";
  const lastName = parts.join(" ");
  return { firstName: firstName || null, lastName: lastName || null };
}

function withAuthCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
}

function withViewerCookies(res: NextResponse, personId: string) {
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  };
  VIEWER_COOKIE_NAMES.forEach((name) => {
    res.cookies.set(name, personId, options);
  });
}

export async function POST(request: Request) {
  try {
    let body: { token?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    if (!token || !password) {
      return NextResponse.json({ ok: false, error: "Token and password are required" }, { status: 400 });
    }

    const tokenHash = hashToken(token);
    const invite = await prisma.orgInvite.findUnique({
      where: { tokenHash },
    });
    if (!invite) {
      return NextResponse.json({ ok: false, error: "Invite not found" }, { status: 404 });
    }
    if (invite.acceptedAt) {
      return NextResponse.json({ ok: false, error: "Invite already accepted" }, { status: 400 });
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: "Invite expired" }, { status: 400 });
    }
    if (!invite.personId) {
      return NextResponse.json({ ok: false, error: "Invite missing person" }, { status: 400 });
    }

    const person = await prisma.person.findUnique({
      where: { id: invite.personId },
      select: { id: true, orgId: true, fullName: true, active: true, user: { select: { id: true } } },
    });
    if (!person || person.orgId !== invite.orgId) {
      return NextResponse.json({ ok: false, error: "Invite missing person" }, { status: 400 });
    }
    if (person.active === false) {
      return NextResponse.json({ ok: false, error: "Account inactive" }, { status: 403 });
    }
    if (person.user?.id) {
      return NextResponse.json({ ok: false, error: "User already exists" }, { status: 400 });
    }

    const secret = getJwtSecret();
    if (!secret) {
      console.error("[invites/accept] missing JWT secret");
      return NextResponse.json({ ok: false, error: "JWT secret not configured" }, { status: 500 });
    }

    const { firstName, lastName } = splitFullName(person.fullName || "");
    const user = await prisma.user.create({
      data: {
        email: invite.email,
        password,
        personId: invite.personId,
        firstName,
        lastName,
      },
      select: { id: true, email: true },
    });

    await prisma.orgInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    const authToken = jwt.sign({ userId: user.id, username: user.email }, secret, { expiresIn: "1h" });
    const res = NextResponse.json({ ok: true });
    withAuthCookie(res, authToken);
    withViewerCookies(res, invite.personId);
    return res;
  } catch (err) {
    console.error("[invites/accept] error", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
