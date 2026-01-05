import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const orgId = req.headers.get("x-org-id")?.trim() || undefined;
  const people = await prisma.person.findMany({
    where: {
      ...(orgId ? { primaryAgency: { orgId } } : {}),
    },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return NextResponse.json(people.map((p) => ({ id: p.id, name: p.fullName || p.id })));
}
