import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CompAssignmentScope } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const planId = typeof body?.planId === "string" ? body.planId.trim() : "";
    const personId = typeof body?.personId === "string" ? body.personId.trim() : "";

    if (!planId || !personId) {
      return NextResponse.json({ error: "Missing planId or personId" }, { status: 400 });
    }

    const [plan, person] = await Promise.all([
      prisma.compPlan.findUnique({ where: { id: planId }, select: { id: true, effectiveStartMonth: true } }),
      prisma.person.findUnique({ where: { id: personId }, select: { id: true } }),
    ]);

    if (!plan || !person) {
      return NextResponse.json({ error: "Invalid planId or personId" }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.compPlanAssignment.updateMany({
        where: { scopeType: CompAssignmentScope.PERSON, scopeId: personId, active: true },
        data: { active: false },
      }),
      prisma.compPlanAssignment.create({
        data: {
          planId,
          scopeType: CompAssignmentScope.PERSON,
          scopeId: personId,
          active: true,
          effectiveStartMonth: plan.effectiveStartMonth ?? null,
        },
      }),
    ]);

    const counts = await prisma.compPlanAssignment.groupBy({
      by: ["planId"],
      where: { scopeType: CompAssignmentScope.PERSON, active: true },
      _count: { _all: true },
    });

    const planCounts: Record<string, number> = {};
    counts.forEach((row) => {
      planCounts[row.planId] = row._count._all;
    });

    const activeAssignments = await prisma.compPlanAssignment.findMany({
      where: { scopeType: CompAssignmentScope.PERSON, active: true, scopeId: { not: null } },
      select: { planId: true, scopeId: true },
    });
    const assignedPersonIds = Array.from(
      new Set(activeAssignments.flatMap((assignment) => (assignment.scopeId ? [assignment.scopeId] : [])))
    );
    const assignedPeople = assignedPersonIds.length
      ? await prisma.person.findMany({
          where: { id: { in: assignedPersonIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const personNameById = new Map(assignedPeople.map((person) => [person.id, person.fullName]));
    const assignedByPlan: Record<string, { id: string; name: string }[]> = {};
    activeAssignments.forEach((assignment) => {
      if (!assignment.scopeId) return;
      const name = personNameById.get(assignment.scopeId);
      if (!name) return;
      if (!assignedByPlan[assignment.planId]) assignedByPlan[assignment.planId] = [];
      assignedByPlan[assignment.planId].push({ id: assignment.scopeId, name });
    });

    return NextResponse.json({ ok: true, planId, personId, planCounts, assignedByPlan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to assign";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
