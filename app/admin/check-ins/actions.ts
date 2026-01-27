"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";

const FREQUENCIES = new Set([
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "CUSTOM_DAYS",
]);

export async function createTemplate(formData: FormData) {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId;
  const isAdmin = Boolean(viewer?.isOwner || viewer?.isAdmin);
  if (!orgId || !isAdmin) return;

  const name = String(formData.get("name") || "").trim();
  const frequencyType = String(formData.get("frequencyType") || "").trim();
  if (!name || !FREQUENCIES.has(frequencyType)) return;

  await prisma.$transaction(async (tx) => {
    const template = await tx.checkInTemplate.create({
      data: {
        orgId,
        name,
        frequencyType: frequencyType as any,
      },
    });
    await tx.checkInTemplateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        isCurrent: true,
        questionsJson: [],
      },
    });
  });

  revalidatePath("/admin/check-ins");
}

export async function assignTemplateToTeam(formData: FormData) {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId;
  const isAdmin = Boolean(viewer?.isOwner || viewer?.isAdmin);
  if (!orgId || !isAdmin) return;

  const templateId = String(formData.get("templateId") || "").trim();
  const teamId = String(formData.get("teamId") || "").trim();
  if (!templateId || !teamId) return;

  const [template, team] = await Promise.all([
    prisma.checkInTemplate.findFirst({ where: { id: templateId, orgId }, select: { id: true } }),
    prisma.team.findFirst({ where: { id: teamId, orgId }, select: { id: true } }),
  ]);
  if (!template || !team) return;

  await prisma.$transaction(async (tx) => {
    await tx.teamCheckInTemplateAssignment.updateMany({
      where: { orgId, teamId, isActive: true },
      data: { isActive: false },
    });
    await tx.teamCheckInTemplateAssignment.upsert({
      where: { teamId_templateId: { teamId, templateId } },
      update: { isActive: true, orgId },
      create: { orgId, teamId, templateId, isActive: true },
    });
  });

  revalidatePath("/admin/check-ins");
}
