import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CompAssignmentScope } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const planId = String(body.planId || "");
    const personId = String(body.personId || "");
    if (!planId || !personId) {
      return NextResponse.json({ error: "Missing planId or personId" }, { status: 400 });
    }

    await prisma.compPlanAssignment.create({
      data: {
        planId,
        scopeType: CompAssignmentScope.PERSON,
        scopeId: personId,
        effectiveStartMonth: null,
      },
    });

    revalidatePath("/compensation/plans");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to assign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
