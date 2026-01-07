import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewerContext } from "@/lib/getViewerContext";
import {
  ValidationError,
  normalizeOptionalPremiumTargets,
  parseOptionalNonNegativeInt,
  parseOptionalNonNegativeNumber,
} from "@/lib/benchmarks/validate";
import { hasBenchmarksWriteAccess } from "@/lib/benchmarks/guards";

export async function GET(req: Request) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const overrides = await prisma.benchPersonOverride.findMany({
      where: {
        person: { primaryAgencyId: viewer.orgId },
      },
    });

    return NextResponse.json({ overrides });
  } catch (err: any) {
    console.error("[benchmarks/person-overrides][GET] error", err);
    return NextResponse.json({ error: "Failed to fetch person overrides" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const viewer = await getViewerContext(req);
    if (!viewer?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!hasBenchmarksWriteAccess(viewer)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as any;
    const personId = typeof body.personId === "string" ? body.personId.trim() : "";
    if (!personId) {
      throw new ValidationError("personId is required", "personId");
    }

    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: { team: true },
    });

    if (!person || person.primaryAgencyId !== viewer.orgId) {
      return NextResponse.json({ error: "Person not found in org" }, { status: 404 });
    }

    const monthlyAppsOverride = parseOptionalNonNegativeInt(body.monthlyAppsOverride, "monthlyAppsOverride");
    const monthlyPremiumOverride = parseOptionalNonNegativeNumber(
      body.monthlyPremiumOverride,
      "monthlyPremiumOverride"
    );

    const { premiumMode, premiumByLob, premiumByBucket } = normalizeOptionalPremiumTargets(
      body.premiumModeOverride,
      body.premiumByLobOverride,
      body.premiumByBucketOverride
    );

    const override = await prisma.benchPersonOverride.upsert({
      where: { personId },
      create: {
        personId,
        monthlyAppsOverride,
        monthlyPremiumOverride,
        premiumModeOverride: premiumMode,
        premiumByLobOverride: premiumByLob,
        premiumByBucketOverride: premiumByBucket,
      },
      update: {
        monthlyAppsOverride,
        monthlyPremiumOverride,
        premiumModeOverride: premiumMode,
        premiumByLobOverride: premiumByLob,
        premiumByBucketOverride: premiumByBucket,
      },
    });

    return NextResponse.json({ override });
  } catch (err: any) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
    }
    console.error("[benchmarks/person-overrides][POST] error", err);
    return NextResponse.json({ error: "Failed to save person override" }, { status: 500 });
  }
}
