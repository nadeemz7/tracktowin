import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

const COOKIE_NAME = "token";
const TOKEN_TTL_SECONDS = 60 * 60;

type LoginAction = "login" | "register" | "auto";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return null;
  }
  return secret;
}

function issueToken(user: { id: string; username: string }, secret: string) {
  return jwt.sign({ userId: user.id, username: user.username }, secret, { expiresIn: "1h" });
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

function buildAuthResponse(
  req: Request,
  user: { id: string; username: string; onboardingCompleted?: boolean },
  message: string,
  token: string,
  forceOnboarding: boolean
) {
  const needsOnboarding = forceOnboarding || user.onboardingCompleted === false;
  if (needsOnboarding) {
    const res = NextResponse.redirect(new URL("/onboarding", req.url));
    withAuthCookie(res, token);
    return res;
  }

  const res = NextResponse.json({ message, token }, { status: 200 });
  withAuthCookie(res, token);
  return res;
}

export async function POST(req: Request) {
  try {
    let body: { username?: string; password?: string; action?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const email = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    const action = (typeof body.action === "string" ? body.action : "auto") as LoginAction;

    if (!email || !password) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const secret = getJwtSecret();
    if (!secret) {
      console.error("[auth/login] missing JWT secret");
      return NextResponse.json({ message: "JWT secret not configured" }, { status: 500 });
    }

    console.log("[auth/login] prisma.user.findUnique", { email });
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (action === "register") {
      if (existingUser) {
        return NextResponse.json({ message: "Email already exists." }, { status: 400 });
      }

      console.log("[auth/login] prisma.user.create", { email });
      const user = await prisma.user.create({
        data: {
          email,
          password,
        },
      });

      const authUser = { id: user.id, username: user.email ?? email };
      const token = issueToken(authUser, secret);
      return buildAuthResponse(
        req,
        authUser,
        "Account created successfully",
        token,
        !user.personId
      );
    }

    if (action === "login") {
      if (!existingUser) {
        return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
      }
      if (existingUser.password !== password) {
        return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
      }

      const authUser = { id: existingUser.id, username: existingUser.email ?? email };
      const token = issueToken(authUser, secret);
      return buildAuthResponse(
        req,
        authUser,
        "Login successful",
        token,
        !existingUser.personId
      );
    }

    if (!existingUser) {
      console.log("[auth/login] prisma.user.create", { email });
      const user = await prisma.user.create({
        data: {
          email,
          password,
        },
      });

      const authUser = { id: user.id, username: user.email ?? email };
      const token = issueToken(authUser, secret);
      return buildAuthResponse(
        req,
        authUser,
        "Account created successfully",
        token,
        !user.personId
      );
    }

    if (existingUser.password !== password) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }
    const authUser = { id: existingUser.id, username: existingUser.email ?? email };
    const token = issueToken(authUser, secret);
    return buildAuthResponse(
      req,
      authUser,
      "Login successful",
      token,
      !existingUser.personId
    );
  } catch (err) {
    console.error("[auth/login] error", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: "Login error", detail }, { status: 500 });
  }
}
