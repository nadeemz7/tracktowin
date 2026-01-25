import { getOrgViewer } from "@/lib/getOrgViewer";
import { ROLE_PERMISSION_DEFAULTS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

const COOKIE_NAME = "token";
const TOKEN_TTL_SECONDS = 60 * 60;
const VIEWER_COOKIE_NAMES = ["personId", "userId", "viewerPersonId", "ttw_personId"] as const;

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

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  const firstName = parts.shift() || "";
  const lastName = parts.join(" ");
  return { firstName: firstName || null, lastName: lastName || null };
}

async function rejectIfPersonInactive(personId: string | null) {
  if (!personId) return null;
  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { active: true },
  });
  if (person?.active === false) {
    return NextResponse.json({ message: "Account inactive" }, { status: 403 });
  }
  return null;
}

async function resolvePersonForUserEmail(email: string) {
  if (!email) return null;
  // Attach existing Person by email to avoid false onboarding redirects.
  return prisma.person.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, orgId: true, email: true },
  });
}

async function createUserWithTenant({
  email,
  password,
  fullName,
  userFirstName,
  userLastName,
}: {
  email: string;
  password: string;
  fullName: string;
  userFirstName: string | null;
  userLastName: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        password,
        firstName: userFirstName,
        lastName: userLastName,
      },
    });

    let personId = user.personId ?? null;
    let orgId: string | null = null;

    if (!personId) {
      const existingPerson = await tx.person.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true, orgId: true, fullName: true, email: true },
      });

      if (existingPerson) {
        await tx.user.update({
          where: { id: user.id },
          data: { personId: existingPerson.id },
        });
        if (!existingPerson.fullName) {
          await tx.person.update({
            where: { id: existingPerson.id },
            data: { fullName },
          });
        }
        if (!existingPerson.email) {
          await tx.person.update({
            where: { id: existingPerson.id },
            data: { email },
          });
        }
        personId = existingPerson.id;
        orgId = existingPerson.orgId ?? null;
      } else {
        const org = await tx.org.create({
          data: { name: `${fullName} Org` },
        });
        let managementTeam = await tx.team.findFirst({
          where: { orgId: org.id, name: "Management" },
          select: { id: true },
        });
        if (!managementTeam) {
          managementTeam = await tx.team.create({
            data: { orgId: org.id, name: "Management" },
            select: { id: true },
          });
        }
        let managementOwnerRole = await tx.role.findFirst({
          where: { teamId: managementTeam.id, name: "Owner" },
          select: { id: true },
        });
        if (!managementOwnerRole) {
          managementOwnerRole = await tx.role.create({
            data: { teamId: managementTeam.id, name: "Owner" },
            select: { id: true },
          });
        }
        let managementIssuerRole = await tx.role.findFirst({
          where: { teamId: managementTeam.id, name: "Issuer" },
          select: { id: true },
        });
        if (!managementIssuerRole) {
          managementIssuerRole = await tx.role.create({
            data: { teamId: managementTeam.id, name: "Issuer" },
            select: { id: true },
          });
        }
        const person = await tx.person.create({
          data: {
            orgId: org.id,
            fullName,
            email,
            teamType: "MANAGEMENT",
            teamId: managementTeam.id,
            roleId: managementOwnerRole.id,
            isAdmin: true,
            isManager: true,
          },
        });
        personId = person.id;
        orgId = org.id;

        await tx.user.update({
          where: { id: user.id },
          data: { personId: person.id },
        });

        let ownerRole = await tx.orgRole.findFirst({
          where: { orgId: org.id, key: "ORG_OWNER" },
          select: { id: true },
        });
        if (!ownerRole) {
          ownerRole = await tx.orgRole.create({
            data: { orgId: org.id, key: "ORG_OWNER", name: "Owner" },
            select: { id: true },
          });
        }
        const ownerPermissions = ROLE_PERMISSION_DEFAULTS.ORG_OWNER ?? [];
        if (ownerPermissions.length) {
          await tx.orgRolePermission.createMany({
            data: ownerPermissions.map((permission) => ({ roleId: ownerRole!.id, permission })),
            skipDuplicates: true,
          });
        }
        await tx.personOrgRole.createMany({
          data: [{ personId: person.id, roleId: ownerRole.id }],
          skipDuplicates: true,
        });
      }
    }

    return { user, personId, orgId };
  });
}

async function buildAuthResponse(
  req: Request,
  user: { id: string; username: string },
  message: string,
  token: string,
  personId: string | null,
  orgId: string | null
) {
  if (!personId) {
    const res = NextResponse.redirect(new URL("/onboarding", req.url));
    withAuthCookie(res, token);
    return res;
  }

  if (!orgId) {
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { orgId: true },
    });
    orgId = person?.orgId ?? null;
  }

  if (!orgId) {
    const res = NextResponse.redirect(new URL("/onboarding", req.url));
    withAuthCookie(res, token);
    withViewerCookies(res, personId);
    return res;
  }

  const agencyCount = await prisma.agency.count({ where: { orgId } });
  if (agencyCount === 0) {
    const res = NextResponse.redirect(new URL("/onboarding", req.url));
    withAuthCookie(res, token);
    withViewerCookies(res, personId);
    return res;
  }

  const res = NextResponse.redirect(new URL("/", req.url));
  withAuthCookie(res, token);
  withViewerCookies(res, personId);
  return res;
}

export async function GET(req: Request) {
  const viewer = await getOrgViewer(req);
  const fullName = typeof viewer?.fullName === "string" ? viewer.fullName : "";
  return NextResponse.json({ fullName });
}

export async function POST(req: Request) {
  try {
    let body: {
      username?: string;
      password?: string;
      action?: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }

    const email = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password.trim() : "";
    const action = (typeof body.action === "string" ? body.action : "auto") as LoginAction;
    const fullNameInput = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const fullName = fullNameInput || [firstName, lastName].filter(Boolean).join(" ").trim();
    const splitNames = fullName ? splitFullName(fullName) : { firstName: null, lastName: null };
    const userFirstName = firstName || splitNames.firstName;
    const userLastName = lastName || splitNames.lastName;

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
      if (!firstName || !lastName) {
        return NextResponse.json({ message: "First and last name are required." }, { status: 400 });
      }

      const registerFullName = `${firstName} ${lastName}`.trim();
      console.log("[auth/login] prisma.user.create", { email });
      const { user, personId, orgId } = await createUserWithTenant({
        email,
        password,
        fullName: registerFullName,
        userFirstName: firstName,
        userLastName: lastName,
      });
      const inactiveRes = await rejectIfPersonInactive(personId ?? null);
      if (inactiveRes) {
        return inactiveRes;
      }
      const authUser = { id: user.id, username: user.email ?? email };
      const token = issueToken(authUser, secret);
      return await buildAuthResponse(
        req,
        authUser,
        "Account created successfully",
        token,
        personId ?? null,
        orgId
      );
    }

    if (action === "login") {
      if (!existingUser) {
        return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
      }
      if (existingUser.password !== password) {
        return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
      }

      let personId = existingUser.personId;
      if (!personId) {
        const person = await resolvePersonForUserEmail(email);
        if (person) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { personId: person.id },
          });
          if (!person.email) {
            await prisma.person.update({
              where: { id: person.id },
              data: { email },
            });
          }
          personId = person.id;
        }
      }
      let orgId: string | null = null;
      if (personId) {
        const person = await prisma.person.findUnique({
          where: { id: personId },
          select: { orgId: true, email: true },
        });
        if (person && !person.email) {
          await prisma.person.update({
            where: { id: personId },
            data: { email },
          });
        }
        orgId = person?.orgId ?? null;
      }
      const inactiveRes = await rejectIfPersonInactive(personId);
      if (inactiveRes) {
        return inactiveRes;
      }
      const authUser = { id: existingUser.id, username: existingUser.email ?? email };
      const token = issueToken(authUser, secret);
      return await buildAuthResponse(
        req,
        authUser,
        "Login successful",
        token,
        personId,
        orgId
      );
    }

    if (!existingUser) {
      const autoFullName = fullName || email.split("@")[0] || email;
      const autoNames = fullName ? { firstName: userFirstName, lastName: userLastName } : splitFullName(autoFullName);
      const autoFirstName = userFirstName || autoNames.firstName;
      const autoLastName = userLastName || autoNames.lastName;

      console.log("[auth/login] prisma.user.create", { email });
      const { user, personId, orgId } = await createUserWithTenant({
        email,
        password,
        fullName: autoFullName,
        userFirstName: autoFirstName ?? null,
        userLastName: autoLastName ?? null,
      });
      const inactiveRes = await rejectIfPersonInactive(personId ?? null);
      if (inactiveRes) {
        return inactiveRes;
      }
      const authUser = { id: user.id, username: user.email ?? email };
      const token = issueToken(authUser, secret);
      return await buildAuthResponse(
        req,
        authUser,
        "Account created successfully",
        token,
        personId ?? null,
        orgId
      );
    }

    if (existingUser.password !== password) {
      return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
    }
    let personId = existingUser.personId;
    if (!personId) {
      const person = await resolvePersonForUserEmail(email);
      if (person) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { personId: person.id },
        });
        if (!person.email) {
          await prisma.person.update({
            where: { id: person.id },
            data: { email },
          });
        }
        personId = person.id;
      }
    }
    let orgId: string | null = null;
    if (personId) {
      const person = await prisma.person.findUnique({
        where: { id: personId },
        select: { orgId: true, email: true },
      });
      if (person && !person.email) {
        await prisma.person.update({
          where: { id: personId },
          data: { email },
        });
      }
      orgId = person?.orgId ?? null;
    }
    const inactiveRes = await rejectIfPersonInactive(personId);
    if (inactiveRes) {
      return inactiveRes;
    }
    const authUser = { id: existingUser.id, username: existingUser.email ?? email };
    const token = issueToken(authUser, secret);
    return await buildAuthResponse(
      req,
      authUser,
      "Login successful",
      token,
      personId,
      orgId
    );
  } catch (err) {
    console.error("[auth/login] error", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: "Login error", detail }, { status: 500 });
  }
}
