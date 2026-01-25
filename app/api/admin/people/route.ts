import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const viewer = await getOrgViewer(request);
  if (!viewer?.orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const people = await prisma.person.findMany({
    where: { orgId: viewer.orgId },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      teamType: true,
      primaryAgencyId: true,
      primaryAgency: { select: { id: true, name: true, profileName: true, ownerName: true } },
    },
  });

  const filtered = q
    ? people.filter((p) => {
        const agency = p.primaryAgency;
        const agencyStr = [
          agency?.profileName,
          agency?.name,
          agency?.ownerName,
          agency?.id,
          p.primaryAgencyId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return p.fullName.toLowerCase().includes(q) || agencyStr.includes(q);
      })
    : people;

  const enriched = filtered.slice(0, 50).map((p) => ({
    id: p.id,
    fullName: p.fullName,
    teamType: p.teamType,
    primaryAgencyId: p.primaryAgencyId,
    agencyLabel: p.primaryAgency?.profileName || p.primaryAgency?.name || p.primaryAgencyId || "",
    agencyOwner: p.primaryAgency?.ownerName || "",
  }));

  return NextResponse.json({ people: enriched });
}
