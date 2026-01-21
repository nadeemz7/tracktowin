"use server";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import { PolicyStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createSoldProduct(formData: FormData) {
  const agencyId = String(formData.get("agencyId") || "");
  const productId = String(formData.get("productId") || "");
  const dateSoldStr = String(formData.get("dateSold") || "");
  const premiumStr = String(formData.get("premium") || "");
  const soldByPersonId = String(formData.get("soldByPersonId") || "");
  const soldByName = String(formData.get("soldByName") || "").trim();
  const policyId = String(formData.get("policyId") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const quantity = Math.max(1, Number(formData.get("quantity") || 1) || 1);
  const useHouseholdId = String(formData.get("existingHouseholdId") || "").trim();
  const nextAction = String(formData.get("nextAction") || "");
  const returnTo = String(formData.get("returnTo") || "").trim();
  const addAnotherForHousehold = nextAction === "addAnother";

  const firstName = String(formData.get("firstName") || "").trim();
  const lastName = String(formData.get("lastName") || "").trim();
  const ecrmLink = String(formData.get("ecrmLink") || "").trim();
  const marketingSource = String(formData.get("marketingSource") || "").trim();
  const onboarded = formData.get("onboarded") === "on";

  const isValueHealth = formData.get("isValueHealth") === "on";
  const isValueLife = formData.get("isValueLife") === "on";

  if (!agencyId || !productId || !dateSoldStr || !premiumStr) return;
  if (!useHouseholdId && (!firstName || !lastName || !marketingSource)) return;

  const dateSold = new Date(dateSoldStr);
  const premium = Number(premiumStr);
  if (Number.isNaN(premium)) return;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { lineOfBusiness: true },
  });
  if (!product) return;

  const valueDefaults = await prisma.valuePolicyDefault.findMany({
    where: { agencyId },
  });

  const lobName = product.lineOfBusiness.name;
  const healthDefault = valueDefaults.find(
    (v) => v.flagField === "isValueHealth" && v.lineOfBusiness === lobName && v.active
  );
  const lifeDefault = valueDefaults.find(
    (v) => v.flagField === "isValueLife" && v.lineOfBusiness === lobName && v.active
  );

  let householdId = useHouseholdId;
  if (householdId) {
    const exists = await prisma.household.findUnique({
      where: { id: householdId },
      select: { id: true, agencyId: true },
    });
    if (!exists || exists.agencyId !== agencyId) return;
  } else {
    const household = await prisma.household.create({
      data: {
        agencyId,
        firstName,
        lastName,
        ecrmLink: ecrmLink || null,
        marketingSource: marketingSource || null,
        onboarded,
      },
    });
    householdId = household.id;
  }

  const effectiveValueHealth =
    isValueHealth || (!!healthDefault && premium >= healthDefault.threshold);
  const effectiveValueLife = isValueLife || (!!lifeDefault && premium >= lifeDefault.threshold);

  await prisma.soldProduct.createMany({
    data: Array.from({ length: quantity }).map((_, idx) => ({
      agencyId,
      productId,
      householdId,
      dateSold,
      premium: idx === 0 ? premium : 0, // first record holds full premium, others default to 0
      status: PolicyStatus.WRITTEN,
      isValueHealth: effectiveValueHealth,
      isValueLife: effectiveValueLife,
      soldByPersonId: soldByPersonId || null,
      soldByName: soldByName || null,
      policyFirstName: firstName,
      policyLastName: lastName,
      policyId: policyId || null,
      notes: notes || null,
    })),
  });

  revalidatePath("/sold-products");

  if (returnTo) {
    if (addAnotherForHousehold && householdId) {
      const url = new URL(returnTo, "http://example.com");
      const params = new URLSearchParams(url.search);
      params.set("householdId", householdId);
      params.set("open", "1");
      const query = params.toString();
      redirect(`${url.pathname}${query ? `?${query}` : ""}`);
    }
    redirect(returnTo);
  }

  if (addAnotherForHousehold && householdId) {
    redirect(`/sold-products?householdId=${householdId}&open=1`);
  }
  // Close modal and refresh list
  redirect("/sold-products");
}

export async function updateSoldProduct(formData: FormData) {
  const soldProductId = String(formData.get("soldProductId") || "");
  const status = String(formData.get("status") || PolicyStatus.WRITTEN);
  const dateSoldStr = String(formData.get("dateSold") || "");
  const premiumStr = String(formData.get("premium") || "");
  const policyId = String(formData.get("policyId") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  const policyFirstName = String(formData.get("policyFirstName") || "").trim();
  const policyLastName = String(formData.get("policyLastName") || "").trim();
  const returnTo = String(formData.get("returnTo") || "").trim();
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId ?? null;
  if (!orgId) return;

  if (!soldProductId || !dateSoldStr || !premiumStr || !policyFirstName || !policyLastName) return;
  const sp = await prisma.soldProduct.findUnique({
    where: { id: soldProductId },
    select: { id: true, agency: { select: { orgId: true } } },
  });
  if (!sp || sp.agency.orgId !== orgId) return;

  const premium = Number(premiumStr);
  if (Number.isNaN(premium)) return;
  const dateSold = new Date(dateSoldStr);

  await prisma.soldProduct.update({
    where: { id: soldProductId },
    data: {
      dateSold,
      premium,
      status: status as PolicyStatus,
      policyId: policyId || null,
      notes: notes || null,
      policyFirstName,
      policyLastName,
    },
  });

  revalidatePath("/sold-products");
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function deleteSoldProduct(formData: FormData) {
  const soldProductId = String(formData.get("soldProductId") || "");
  const returnTo = String(formData.get("returnTo") || "").trim();
  if (!soldProductId) return;

  await prisma.soldProduct.delete({ where: { id: soldProductId } });
  revalidatePath("/sold-products");
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function updateHousehold(formData: FormData) {
  const householdId = String(formData.get("householdId") || "");
  const firstName = String(formData.get("hhFirstName") || "").trim();
  const lastName = String(formData.get("hhLastName") || "").trim();
  const returnTo = String(formData.get("returnTo") || "").trim();
  if (!householdId || !firstName || !lastName) return;
  await prisma.household.update({ where: { id: householdId }, data: { firstName, lastName } });
  revalidatePath("/sold-products");
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function updatePolicyQuick(formData: FormData) {
  const soldProductId = String(formData.get("soldProductId") || "");
  const productId = String(formData.get("quickProductId") || "");
  const premiumStr = String(formData.get("quickPremium") || "");
  const status = String(formData.get("quickStatus") || PolicyStatus.WRITTEN);
  const dateSoldStr = String(formData.get("quickDate") || "");
  const returnTo = String(formData.get("returnTo") || "").trim();
  if (!soldProductId || !productId || !premiumStr || !dateSoldStr) return;
  const premium = Number(premiumStr);
  if (Number.isNaN(premium)) return;
  const dateSold = new Date(dateSoldStr);
  await prisma.soldProduct.update({
    where: { id: soldProductId },
    data: { productId, premium, status: status as PolicyStatus, dateSold },
  });
  revalidatePath("/sold-products");
  if (returnTo) {
    redirect(returnTo);
  }
}

export async function updateStatusQuick(formData: FormData) {
  const soldProductId = String(formData.get("soldProductId") || "");
  const status = String(formData.get("status") || PolicyStatus.WRITTEN);
  const returnTo = String(formData.get("returnTo") || "").trim();
  if (!soldProductId) return;
  await prisma.soldProduct.update({
    where: { id: soldProductId },
    data: { status: status as PolicyStatus },
  });
  revalidatePath("/sold-products");
  if (returnTo) {
    redirect(returnTo);
  }
}
