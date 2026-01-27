"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";

type PublishState = { error: string | null; success: boolean };

const ALLOWED_TYPES = new Set([
  "SCALE_1_10",
  "TEXT_SHORT",
  "TEXT_LONG",
  "YES_NO",
  "MULTIPLE_CHOICE",
]);

function normalizeQuestions(raw: any) {
  if (!Array.isArray(raw)) {
    return { error: "Questions must be an array." } as const;
  }

  const normalized: any[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const q = raw[index];
    if (!q || typeof q !== "object") {
      return { error: `Question ${index + 1} is invalid.` } as const;
    }
    const id = typeof q.id === "string" ? q.id.trim() : "";
    if (!id) return { error: `Question ${index + 1} is missing an id.` } as const;
    const type = typeof q.type === "string" && ALLOWED_TYPES.has(q.type) ? q.type : "";
    if (!type) return { error: `Question ${index + 1} has an invalid type.` } as const;
    const label = typeof q.label === "string" ? q.label.trim() : "";
    if (!label) return { error: `Question ${index + 1} is missing a label.` } as const;
    if (typeof q.required !== "boolean") {
      return { error: `Question ${index + 1} required flag is invalid.` } as const;
    }
    const helpText = typeof q.helpText === "string" ? q.helpText.trim() : "";

    const next: any = {
      id,
      type,
      label,
      required: q.required,
    };
    if (helpText) next.helpText = helpText;

    if (type === "MULTIPLE_CHOICE") {
      const optionsRaw = Array.isArray(q.options) ? q.options : [];
      const options = optionsRaw
        .map((opt: any) => String(opt).trim())
        .filter((opt: string) => Boolean(opt));
      if (options.length < 2) {
        return { error: `Question ${index + 1} needs at least 2 options.` } as const;
      }
      next.options = options;
    }

    normalized.push(next);
  }

  return { data: normalized } as const;
}

export async function publishTemplateVersion(prevState: PublishState, formData: FormData): Promise<PublishState> {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId;
  const isAdmin = Boolean(viewer?.isOwner || viewer?.isAdmin);
  if (!orgId || !isAdmin) {
    return { error: "Unauthorized.", success: false };
  }

  const templateId = String(formData.get("templateId") || "").trim();
  if (!templateId) {
    return { error: "Template is required.", success: false };
  }

  const template = await prisma.checkInTemplate.findFirst({
    where: { id: templateId, orgId },
    select: { id: true },
  });
  if (!template) {
    return { error: "Template not found.", success: false };
  }

  const rawQuestions = String(formData.get("questionsJson") || "[]");
  let parsed: any;
  try {
    parsed = JSON.parse(rawQuestions);
  } catch {
    return { error: "Questions JSON is invalid.", success: false };
  }

  const normalized = normalizeQuestions(parsed);
  if ("error" in normalized) {
    return { error: normalized.error, success: false };
  }

  const maxVersion = await prisma.checkInTemplateVersion.aggregate({
    where: { templateId },
    _max: { version: true },
  });
  const nextVersion = (maxVersion._max.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.checkInTemplateVersion.updateMany({
      where: { templateId },
      data: { isCurrent: false },
    });
    await tx.checkInTemplateVersion.create({
      data: {
        templateId,
        version: nextVersion,
        isCurrent: true,
        questionsJson: normalized.data,
      },
    });
  });

  revalidatePath("/admin/check-ins");
  revalidatePath(`/admin/check-ins/${templateId}`);

  return { error: null, success: true };
}
