"use server";

import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const STARTER_LOBS = [
  {
    name: "Auto",
    premiumCategory: "PC",
    products: [
      { name: "Auto Raw New", productType: "PERSONAL" },
      { name: "Auto Added", productType: "PERSONAL" },
      { name: "Business Raw Auto", productType: "BUSINESS" },
      { name: "Business Added Auto", productType: "BUSINESS" },
    ],
  },
  {
    name: "Fire",
    premiumCategory: "PC",
    products: [
      { name: "Homeowners", productType: "PERSONAL" },
      { name: "Renters", productType: "PERSONAL" },
      { name: "Condo", productType: "PERSONAL" },
      { name: "PAP", productType: "PERSONAL" },
      { name: "PLUP", productType: "PERSONAL" },
      { name: "Boat", productType: "PERSONAL" },
      { name: "BOP", productType: "BUSINESS" },
      { name: "Apartment", productType: "BUSINESS" },
      { name: "CLUP", productType: "BUSINESS" },
      { name: "Workers Comp", productType: "BUSINESS" },
    ],
  },
  {
    name: "Health",
    premiumCategory: "FS",
    products: [
      { name: "Short Term Disability", productType: "PERSONAL" },
      { name: "Long Term Disability", productType: "PERSONAL" },
      { name: "Hospital Indemnity", productType: "PERSONAL" },
    ],
  },
  {
    name: "Life",
    premiumCategory: "FS",
    products: [
      { name: "Term", productType: "PERSONAL" },
      { name: "Whole Life", productType: "PERSONAL" },
    ],
  },
  {
    name: "IPS",
    premiumCategory: "IPS",
    products: [
      { name: "Advisory Account", productType: "PERSONAL" },
      { name: "Non Advisory Account", productType: "PERSONAL" },
    ],
  },
];

export async function ensureStarterLobs(targetOrgId: string) {
  for (const lob of STARTER_LOBS) {
    const lobRecord = await prisma.lineOfBusiness.upsert({
      where: { orgId_name: { orgId: targetOrgId, name: lob.name } },
      update: { premiumCategory: lob.premiumCategory as "PC" | "FS" | "IPS" },
      create: {
        orgId: targetOrgId,
        name: lob.name,
        premiumCategory: lob.premiumCategory as "PC" | "FS" | "IPS",
      },
    });

    for (const product of lob.products) {
      await prisma.product.upsert({
        where: { lineOfBusinessId_name: { lineOfBusinessId: lobRecord.id, name: product.name } },
        update: { productType: product.productType as "PERSONAL" | "BUSINESS" },
        create: {
          orgId: targetOrgId,
          lineOfBusinessId: lobRecord.id,
          name: product.name,
          productType: product.productType as "PERSONAL" | "BUSINESS",
        },
      });
    }
  }
}

export async function createAgency(formData: FormData) {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId ?? null;
  if (!orgId) return;

  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  const exists = await prisma.agency.findFirst({ where: { name, orgId } });
  if (exists) {
    revalidatePath("/agencies");
    return;
  }

  const agency = await prisma.agency.create({
    data: {
      orgId,
      name,
    },
  });

  await ensureStarterLobs(orgId);
  await (await import("@/lib/wtdDefaults")).ensureDefaultWinTheDayPlans(agency.id, agency.orgId);

  revalidatePath("/agencies");
}

export async function quickCreate(formData: FormData) {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId ?? null;
  if (!orgId) return;

  const name = String(formData.get("quickName") || "").trim();
  if (!name) return;

  const exists = await prisma.agency.findFirst({ where: { name, orgId } });
  if (exists) {
    revalidatePath("/agencies");
    return;
  }

  const agency = await prisma.agency.create({
    data: {
      orgId,
      name,
    },
  });

  await ensureStarterLobs(orgId);
  await (await import("@/lib/wtdDefaults")).ensureDefaultWinTheDayPlans(agency.id, agency.orgId);

  revalidatePath("/agencies");
}

export async function deleteAgency(formData: FormData) {
  const id = String(formData.get("agencyId") || "");
  if (!id) return;
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId ?? null;
  if (!orgId) return;
  const agency = await prisma.agency.findFirst({ where: { id, orgId } });
  if (!agency) return;

  const plans = await prisma.commissionPlan.findMany({ where: { agencyId: id }, select: { id: true } });
  const wtdPlans = await prisma.winTheDayPlan.findMany({ where: { agencyId: id }, select: { id: true } });

  await prisma.$transaction([
    prisma.commissionPlanAssignment.deleteMany({ where: { planId: { in: plans.map((p) => p.id) } } }),
    prisma.commissionComponent.deleteMany({ where: { planId: { in: plans.map((p) => p.id) } } }),
    prisma.commissionPlan.deleteMany({ where: { id: { in: plans.map((p) => p.id) } } }),
    prisma.winTheDayPlanPersonAssignment.deleteMany({ where: { planId: { in: wtdPlans.map((p) => p.id) } } }),
    prisma.winTheDayPlanTeamAssignment.deleteMany({ where: { planId: { in: wtdPlans.map((p) => p.id) } } }),
    prisma.winTheDayRule.deleteMany({ where: { planId: { in: wtdPlans.map((p) => p.id) } } }),
    prisma.winTheDayPlan.deleteMany({ where: { id: { in: wtdPlans.map((p) => p.id) } } }),
    prisma.activityPayoutTier.deleteMany({ where: { activityType: { agencyId: id } } }),
    prisma.activityType.deleteMany({ where: { agencyId: id } }),
    prisma.soldProduct.deleteMany({ where: { agencyId: id } }),
    prisma.householdFieldValue.deleteMany({ where: { household: { agencyId: id } } }),
    prisma.household.deleteMany({ where: { agencyId: id } }),
    prisma.marketingSourceOption.deleteMany({ where: { agencyId: id } }),
    prisma.householdFieldDefinition.deleteMany({ where: { agencyId: id } }),
    prisma.valuePolicyDefault.deleteMany({ where: { agencyId: id } }),
    prisma.agency.delete({ where: { id } }),
  ]);

  revalidatePath("/agencies");
}

export async function addPerson(formData: FormData) {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId ?? null;
  if (!orgId) return;
  const permissions = viewer?.permissions ?? [];
  const canManagePeople = Boolean(
    viewer?.isTtwAdmin || permissions.includes("MANAGE_PEOPLE") || permissions.includes("ACCESS_ADMIN_TOOLS")
  );
  if (!canManagePeople) return;

  const fullName = String(formData.get("fullName") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const teamType = String(formData.get("teamType") || "SALES");
  const primaryAgencyId = String(formData.get("primaryAgencyId") || "");
  if (!fullName || !primaryAgencyId) return;
  const agency = await prisma.agency.findFirst({ where: { id: primaryAgencyId, orgId } });
  if (!agency) return;
  await prisma.person.create({
    data: {
      fullName,
      email: email || null,
      teamType: teamType === "CS" ? "CS" : "SALES",
      orgId,
      primaryAgency: { connect: { id: primaryAgencyId } },
      active: true,
    },
  });
  revalidatePath("/agencies");
  revalidatePath(`/agencies/${primaryAgencyId}`);
}

export async function updatePrimaryAgency(formData: FormData) {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId ?? null;
  const permissions = viewer?.permissions ?? [];
  const canManagePeople = Boolean(
    viewer?.isTtwAdmin || permissions.includes("MANAGE_PEOPLE") || permissions.includes("ACCESS_ADMIN_TOOLS")
  );
  if (!orgId || !canManagePeople) return;

  const personId = String(formData.get("personId") || "");
  const primaryAgencyId = String(formData.get("primaryAgencyId") || "");
  if (!personId || !primaryAgencyId) return;
  const agency = await prisma.agency.findFirst({ where: { id: primaryAgencyId, orgId } });
  if (!agency) return;
  const person = await prisma.person.findFirst({ where: { id: personId, orgId } });
  if (!person) return;
  await prisma.person.update({ where: { id: personId }, data: { primaryAgency: { connect: { id: primaryAgencyId } } } });
  revalidatePath("/agencies");
  revalidatePath(`/agencies/${primaryAgencyId}`);
}
