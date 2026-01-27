"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrgViewer } from "@/lib/getOrgViewer";

type FormState = { error: string | null; success: boolean };

const QUESTION_TYPES = new Set([
  "SCALE_1_10",
  "TEXT_SHORT",
  "TEXT_LONG",
  "YES_NO",
  "MULTIPLE_CHOICE",
]);

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getWeekStartUtc(date: Date, weekStartDay: number) {
  const day = date.getUTCDay();
  const diff = (day - weekStartDay + 7) % 7;
  return addDaysUtc(date, -diff);
}

function getIsoWeekInfo(date: Date) {
  const d = startOfUtcDay(date);
  const day = d.getUTCDay();
  const isoDay = day === 0 ? 7 : day;
  d.setUTCDate(d.getUTCDate() + 4 - isoDay);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: isoYear, week };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function computePeriod(template: {
  frequencyType: string;
  intervalDays: number | null;
  weekStartDay: number | null;
  createdAt: Date;
}) {
  const today = startOfUtcDay(new Date());

  if (template.frequencyType === "MONTHLY") {
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const periodStart = new Date(Date.UTC(year, month, 1));
    const periodEnd = new Date(Date.UTC(year, month + 1, 1));
    const periodKey = `${year}-${pad2(month + 1)}`;
    return { periodKey, periodStart, periodEnd };
  }

  if (template.frequencyType === "QUARTERLY") {
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const quarter = Math.floor(month / 3) + 1;
    const startMonth = (quarter - 1) * 3;
    const periodStart = new Date(Date.UTC(year, startMonth, 1));
    const periodEnd = new Date(Date.UTC(year, startMonth + 3, 1));
    const periodKey = `${year}-Q${quarter}`;
    return { periodKey, periodStart, periodEnd };
  }

  if (template.frequencyType === "CUSTOM_DAYS") {
    const intervalDays = typeof template.intervalDays === "number" && template.intervalDays > 0 ? template.intervalDays : 30;
    const anchor = startOfUtcDay(template.createdAt);
    const diffDays = Math.floor((today.getTime() - anchor.getTime()) / 86400000);
    const bucket = Math.floor(diffDays / intervalDays);
    const periodStart = addDaysUtc(anchor, bucket * intervalDays);
    const periodEnd = addDaysUtc(periodStart, intervalDays);
    const periodKey = `${periodStart.getUTCFullYear()}-CD-${bucket}`;
    return { periodKey, periodStart, periodEnd };
  }

  const weekStartDay =
    typeof template.weekStartDay === "number" && template.weekStartDay >= 0 && template.weekStartDay <= 6
      ? template.weekStartDay
      : 1;
  const weekStart = getWeekStartUtc(today, weekStartDay);
  const { year, week } = getIsoWeekInfo(today);

  if (template.frequencyType === "BIWEEKLY") {
    const anchorDate = getWeekStartUtc(startOfUtcDay(template.createdAt), weekStartDay);
    const weeksSince = Math.floor((weekStart.getTime() - anchorDate.getTime()) / (7 * 86400000));
    const bucket = Math.floor(weeksSince / 2);
    const periodStart = addDaysUtc(anchorDate, bucket * 14);
    const periodEnd = addDaysUtc(periodStart, 14);
    const periodKey = `${periodStart.getUTCFullYear()}-BW${pad2(bucket + 1)}`;
    return { periodKey, periodStart, periodEnd };
  }

  const periodEnd = addDaysUtc(weekStart, 7);
  const periodKey = `${year}-W${pad2(week)}`;
  return { periodKey, periodStart: weekStart, periodEnd };
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseJson(value: string) {
  try {
    return { data: JSON.parse(value) } as const;
  } catch {
    return { error: "Invalid JSON payload." } as const;
  }
}

export async function createSubmission(_prevState: FormState, formData: FormData): Promise<FormState> {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId;
  const viewerPersonId = viewer?.personId;
  if (!orgId || !viewerPersonId) {
    return { error: "Unauthorized.", success: false };
  }

  const personId = String(formData.get("personId") || "").trim();
  if (!personId || personId !== viewerPersonId) {
    return { error: "Forbidden.", success: false };
  }

  const templateId = String(formData.get("templateId") || "").trim();
  const templateVersionId = String(formData.get("templateVersionId") || "").trim();
  const periodKey = String(formData.get("periodKey") || "").trim();

  if (!templateId || !templateVersionId || !periodKey) {
    return { error: "Missing required submission data.", success: false };
  }

  const template = await prisma.checkInTemplate.findFirst({
    where: { id: templateId, orgId },
    select: { id: true, frequencyType: true, intervalDays: true, weekStartDay: true, createdAt: true },
  });
  if (!template) {
    return { error: "Template not found.", success: false };
  }

  const computedPeriod = computePeriod(template);
  if (computedPeriod.periodKey !== periodKey) {
    return { error: "Period mismatch.", success: false };
  }
  const periodStart = computedPeriod.periodStart;
  const periodEnd = computedPeriod.periodEnd;

  const version = await prisma.checkInTemplateVersion.findFirst({
    where: { id: templateVersionId, templateId, isCurrent: true },
    select: { id: true, questionsJson: true },
  });
  if (!version) {
    return { error: "Template version not available.", success: false };
  }

  const rawAnswers = String(formData.get("answersJson") || "{}");
  const parsedAnswers = parseJson(rawAnswers);
  if ("error" in parsedAnswers) {
    return { error: "Answers JSON is invalid.", success: false };
  }
  const answersObject = parsedAnswers.data;
  if (!answersObject || typeof answersObject !== "object" || Array.isArray(answersObject)) {
    return { error: "Answers must be an object.", success: false };
  }

  const questions = Array.isArray(version.questionsJson) ? version.questionsJson : [];
  if (!Array.isArray(questions)) {
    return { error: "Template questions are invalid.", success: false };
  }

  const validatedAnswers: Record<string, string | number | boolean> = {};
  for (const question of questions as any[]) {
    const id = typeof question?.id === "string" ? question.id.trim() : "";
    if (!id) {
      return { error: "Question id is missing.", success: false };
    }
    const type = typeof question?.type === "string" ? question.type : "";
    if (!QUESTION_TYPES.has(type)) {
      return { error: `Question ${id} has an invalid type.`, success: false };
    }
    const required = Boolean(question?.required);
    const rawValue = (answersObject as Record<string, unknown>)[id];
    const isEmptyString = typeof rawValue === "string" && rawValue.trim() === "";
    const hasValue = rawValue !== undefined && rawValue !== null && !isEmptyString;

    if (required && !hasValue) {
      const label = isNonEmptyString(question?.label) ? question.label.trim() : "required question";
      return { error: `Answer required for "${label}".`, success: false };
    }

    if (!hasValue) {
      continue;
    }

    if (type === "SCALE_1_10") {
      const num = typeof rawValue === "number" ? rawValue : Number(rawValue);
      if (!Number.isInteger(num) || num < 1 || num > 10) {
        return { error: `Scale answer for "${question.label || id}" must be 1-10.`, success: false };
      }
      validatedAnswers[id] = num;
      continue;
    }

    if (type === "TEXT_SHORT" || type === "TEXT_LONG") {
      if (typeof rawValue !== "string") {
        return { error: `Answer for "${question.label || id}" must be text.`, success: false };
      }
      validatedAnswers[id] = rawValue;
      continue;
    }

    if (type === "YES_NO") {
      if (typeof rawValue === "boolean") {
        validatedAnswers[id] = rawValue;
        continue;
      }
      if (rawValue === "true" || rawValue === "false") {
        validatedAnswers[id] = rawValue === "true";
        continue;
      }
      return { error: `Answer for "${question.label || id}" must be yes or no.`, success: false };
    }

    if (type === "MULTIPLE_CHOICE") {
      if (typeof rawValue !== "string") {
        return { error: `Answer for "${question.label || id}" is invalid.`, success: false };
      }
      const options = Array.isArray(question?.options)
        ? question.options.map((opt: any) => String(opt))
        : [];
      if (!options.includes(rawValue)) {
        return { error: `Answer for "${question.label || id}" must be a valid option.`, success: false };
      }
      validatedAnswers[id] = rawValue;
      continue;
    }
  }

  const rawGoals = String(formData.get("goalsJson") || "[]");
  const parsedGoals = parseJson(rawGoals);
  if ("error" in parsedGoals) {
    return { error: "Goals JSON is invalid.", success: false };
  }
  const goalsArray = parsedGoals.data;
  if (!Array.isArray(goalsArray)) {
    return { error: "Goals must be an array.", success: false };
  }
  if (goalsArray.length > 3) {
    return { error: "Up to 3 goals are allowed.", success: false };
  }

  const normalizedGoals: Array<{ title: string; note?: string }> = [];
  for (const goal of goalsArray) {
    if (!goal || typeof goal !== "object") {
      return { error: "Goal format is invalid.", success: false };
    }
    const title = typeof (goal as any).title === "string" ? (goal as any).title.trim() : "";
    const note = typeof (goal as any).note === "string" ? (goal as any).note.trim() : "";
    if (!title) {
      if (note) {
        return { error: "Goal title is required.", success: false };
      }
      continue;
    }
    if (note) {
      normalizedGoals.push({ title, note });
    } else {
      normalizedGoals.push({ title });
    }
  }

  const person = await prisma.person.findFirst({
    where: { id: viewerPersonId, orgId },
    select: { teamId: true },
  });

  try {
    await prisma.checkInSubmission.create({
      data: {
        orgId,
        personId,
        teamId: person?.teamId ?? null,
        templateId,
        templateVersionId,
        periodKey,
        periodStart,
        periodEnd,
        answersJson: validatedAnswers,
        goalsJson: normalizedGoals.length ? normalizedGoals : null,
        createdByPersonId: viewerPersonId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "Already submitted for this period.", success: false };
    }
    return { error: "Unable to submit check-in.", success: false };
  }

  revalidatePath("/personal-insights/weekly-check-in");

  return { error: null, success: true };
}
