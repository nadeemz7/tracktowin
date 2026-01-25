import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { hashToken } from "@/lib/hashToken";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const TEAM_TYPES = new Set(["SALES", "CS", "MANAGEMENT"]);

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalId(value: unknown): string | undefined {
  const trimmed = readTrimmedString(value);
  return trimmed ? trimmed : undefined;
}

export async function POST(request: Request) {
  try {
    const viewer = await getOrgViewer(request);
    if (!viewer?.orgId || !viewer?.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!viewer.isOwner && !viewer.isAdmin && !viewer.isManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: {
      firstName?: string;
      lastName?: string;
      email?: string;
      teamType?: "SALES" | "CS" | "MANAGEMENT";
      primaryAgencyId?: string;
      teamId?: string;
      roleId?: string;
    };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    const firstName = readTrimmedString(body.firstName);
    const lastName = readTrimmedString(body.lastName);
    const emailRaw = readTrimmedString(body.email);
    if (!firstName || !lastName || !emailRaw) {
      return NextResponse.json(
        { ok: false, error: "First name, last name, and email are required" },
        { status: 400 }
      );
    }

    const emailNormalized = emailRaw.toLowerCase();
    const fullName = `${firstName} ${lastName}`.trim();

    const teamTypeRaw = readTrimmedString(body.teamType).toUpperCase();
    if (teamTypeRaw && !TEAM_TYPES.has(teamTypeRaw)) {
      return NextResponse.json({ ok: false, error: "Invalid teamType" }, { status: 400 });
    }
    const teamType = teamTypeRaw
      ? (teamTypeRaw as "SALES" | "CS" | "MANAGEMENT")
      : undefined;
    const primaryAgencyId = readOptionalId(body.primaryAgencyId);
    const teamId = readOptionalId(body.teamId);
    const roleId = readOptionalId(body.roleId);

    const existingPerson = await prisma.person.findFirst({
      where: {
        orgId: viewer.orgId,
        email: { equals: emailNormalized, mode: "insensitive" },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        user: { select: { id: true } },
      },
    });

    if (existingPerson?.user?.id) {
      return NextResponse.json(
        { ok: false, error: "User with this email already exists in this org." },
        { status: 400 }
      );
    }

    let personId: string;
    if (!existingPerson) {
      const createdPerson = await prisma.person.create({
        data: {
          orgId: viewer.orgId,
          fullName,
          email: emailNormalized,
          active: true,
          teamType: teamType ?? "SALES",
          ...(primaryAgencyId ? { primaryAgencyId } : {}),
          ...(teamId ? { teamId } : {}),
          ...(roleId ? { roleId } : {}),
        },
        select: { id: true },
      });
      personId = createdPerson.id;
    } else {
      const updateData: {
        fullName?: string;
        email?: string;
        teamType?: "SALES" | "CS" | "MANAGEMENT";
        primaryAgencyId?: string;
        teamId?: string;
        roleId?: string;
      } = {};
      if (!existingPerson.fullName?.trim()) updateData.fullName = fullName;
      if (!existingPerson.email?.trim()) updateData.email = emailNormalized;
      if (teamType) updateData.teamType = teamType;
      if (primaryAgencyId) updateData.primaryAgencyId = primaryAgencyId;
      if (teamId) updateData.teamId = teamId;
      if (roleId) updateData.roleId = roleId;
      if (Object.keys(updateData).length) {
        await prisma.person.update({
          where: { id: existingPerson.id },
          data: updateData,
        });
      }
      personId = existingPerson.id;
    }

    const rawToken = randomUUID();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const invite = await prisma.orgInvite.create({
      data: {
        orgId: viewer.orgId,
        personId,
        email: emailNormalized,
        tokenHash,
        expiresAt,
        createdByUserId: viewer.userId,
      },
      select: { id: true },
    });

    return NextResponse.json({
      ok: true,
      inviteUrl: `/invite/${rawToken}`,
      inviteId: invite.id,
    });
  } catch (err) {
    console.error("[invites] error", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
