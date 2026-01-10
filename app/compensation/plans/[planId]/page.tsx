import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import {
  CompApplyScope,
  CompAssignmentScope,
  CompBonusType,
  CompPlanStatus,
  CompGateBehavior,
  CompGateScope,
  CompGateType,
  CompMetricSource,
  CompPayoutType,
  CompRuleType,
  CompTierBasis,
  CompTierMode,
  CompRewardType,
  CompScorecardConditionGroupMode,
  ConditionOperator,
  PolicyStatus,
  PremiumCategory,
  Prisma,
} from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import LobRuleComposer from "./LobRuleComposer";
import BonusComposer from "./BonusComposer";
import ProductSidebarClient from "./ProductSidebarClient";
import PlanMetaAutosaveClient from "./PlanMetaAutosaveClient";
import AdvancedRuleBlockModalClient, { PlanBuilderSelectionProvider } from "./AdvancedRuleBlockModalClient";
import BucketQuickRuleFormClient from "./BucketQuickRuleFormClient";

type Params = { params: Promise<{ planId: string }>; searchParams?: Promise<Record<string, string | undefined>> };

export default async function CompPlanDetailPage({ params, searchParams }: Params) {
  const sp = (await searchParams) || {};
  const section = sp.section || "lob";
  const errMessage =
    sp.err === "no_tiers"
      ? "Tiered rules require at least one valid tier."
      : sp.err === "bad_tier_input"
        ? "Tier requires Min and Payout. Enter numbers and try again."
        : sp.err === "invalid_tier_basis"
          ? "Tier basis requires tier mode to be set to Tiered."
          : sp.err === "invalid_tier_rows"
            ? "Tier rows are invalid (overlap/out of order/max <= min). Fix tiers and try again."
            : sp.err === "invalid_threshold_basis"
              ? "Minimum threshold requires a tier basis (apps, premium, or bucket)."
              : "";
  const { planId } = await params;
  const plan = await prisma.compPlan.findUnique({
    where: { id: planId },
    include: {
      versions: {
        where: { isCurrent: true },
        include: {
          ruleBlocks: { include: { tiers: true }, orderBy: { orderIndex: "asc" } },
          gates: true,
          bonusModules: {
            include: {
              scorecardTiers: {
                include: { conditionGroups: { include: { conditions: true }, orderBy: { orderIndex: "asc" } }, conditions: true, rewards: true },
                orderBy: { orderIndex: "asc" },
              },
            },
          },
        },
      },
      assignments: true,
      agency: { include: { linesOfBusiness: { include: { products: true } }, premiumBuckets: true } },
    },
  });

  if (!plan) {
    redirect("/compensation/plans");
  }

  async function markActive() {
    "use server";
    await prisma.compPlan.update({ where: { id: planId }, data: { status: CompPlanStatus.ACTIVE, active: true, archivedAt: null } });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function markDraft() {
    "use server";
    await prisma.compPlan.update({ where: { id: planId }, data: { status: CompPlanStatus.DRAFT } });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function updatePlanMeta(formData: FormData) {
    "use server";
    const planIdValue = String(formData.get("planId") || "");
    if (!planIdValue) return;
    const description = String(formData.get("description") || "");
    await prisma.compPlan.update({ where: { id: planIdValue }, data: { description } });
    revalidatePath(`/compensation/plans/${planIdValue}`);
  }

  async function deletePlanAction() {
    "use server";
    const versions = await prisma.compPlanVersion.findMany({
      where: { planId },
      include: {
        ruleBlocks: { include: { tiers: true } },
        gates: true,
        bonusModules: {
          include: {
            scorecardTiers: {
              include: { conditionGroups: { include: { conditions: true }, orderBy: { orderIndex: "asc" } }, conditions: true, rewards: true },
            },
          },
        },
      },
    });

    const tierIds = versions.flatMap((v) => v.ruleBlocks.flatMap((rb) => rb.tiers.map((t) => t.id)));
    const ruleBlockIds = versions.flatMap((v) => v.ruleBlocks.map((rb) => rb.id));
    const gateIds = versions.flatMap((v) => v.gates.map((g) => g.id));
    const bonusIds = versions.flatMap((v) => v.bonusModules.map((bm) => bm.id));
    const scorecardTierIds = versions.flatMap((v) => v.bonusModules.flatMap((bm) => bm.scorecardTiers.map((t) => t.id)));
    const conditionIds = versions.flatMap((v) =>
      v.bonusModules.flatMap((bm) => bm.scorecardTiers.flatMap((t) => t.conditions.map((c) => c.id)))
    );
    const conditionGroupIds = versions.flatMap((v) =>
      v.bonusModules.flatMap((bm) => bm.scorecardTiers.flatMap((t) => t.conditionGroups.map((g) => g.id)))
    );
    const rewardIds = versions.flatMap((v) =>
      v.bonusModules.flatMap((bm) => bm.scorecardTiers.flatMap((t) => t.rewards.map((r) => r.id)))
    );
    const versionIds = versions.map((v) => v.id);

    await prisma.$transaction([
      prisma.compPlanScorecardCondition.deleteMany({ where: { id: { in: conditionIds } } }),
      prisma.compPlanScorecardConditionGroup.deleteMany({ where: { id: { in: conditionGroupIds } } }),
      prisma.compPlanScorecardReward.deleteMany({ where: { id: { in: rewardIds } } }),
      prisma.compPlanScorecardTier.deleteMany({ where: { id: { in: scorecardTierIds } } }),
      prisma.compPlanBonusModule.deleteMany({ where: { id: { in: bonusIds } } }),
      prisma.compPlanGate.deleteMany({ where: { id: { in: gateIds } } }),
      prisma.compPlanTierRow.deleteMany({ where: { id: { in: tierIds } } }),
      prisma.compPlanRuleBlock.deleteMany({ where: { id: { in: ruleBlockIds } } }),
      prisma.compPlanVersion.deleteMany({ where: { id: { in: versionIds } } }),
      prisma.compPlanAssignment.deleteMany({ where: { planId } }),
      prisma.compPlan.delete({ where: { id: planId } }),
    ]);

    redirect("/compensation/plans");
  }

  async function deleteRuleBlock(formData: FormData) {
    "use server";
    const ruleBlockId = String(formData.get("ruleBlockId") || "");
    if (!ruleBlockId) return;
    // clean up children first to avoid FK violations (tiers reference the rule block)
    await prisma.$transaction([
      prisma.compPlanTierRow.deleteMany({ where: { ruleBlockId } }),
      prisma.compPlanRuleBlock.delete({ where: { id: ruleBlockId } }),
    ]);
    revalidatePath(`/compensation/plans/${planId}`);
  }

  const version = plan.versions[0];
  const agencyId = plan.agencyId || undefined;
  const selectedLobId = sp.lob || undefined;
  const selectedBucketId = typeof sp.bucketId === "string" ? sp.bucketId : "";
  const activityTypes = await prisma.activityType.findMany({
    where: agencyId ? { agencyId, active: true } : { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const activityTypeNameById = new Map(activityTypes.map((activity) => [activity.id, activity.name]));

  // If the plan is scoped to an agency, use that agency's LoBs/products/buckets; otherwise fall back to all products to keep the UI usable.
  let products: { id: string; name: string; lobName: string; premiumCategory: PremiumCategory; productType: string }[] = [];
  let lobs: { id: string; name: string; premiumCategory: PremiumCategory }[] = [];
  let buckets = plan.agency ? plan.agency.premiumBuckets : [];

  if (plan.agency) {
    products = plan.agency.linesOfBusiness.flatMap((lob) =>
      lob.products.map((p) => ({
        id: p.id,
        name: p.name,
        lobName: lob.name,
        premiumCategory: lob.premiumCategory,
        productType: p.productType,
      }))
    );
    lobs = plan.agency.linesOfBusiness.map((l) => ({ id: l.id, name: l.name, premiumCategory: l.premiumCategory }));
  } else {
    const allProducts = await prisma.product.findMany({ include: { lineOfBusiness: true } });
    products = allProducts.map((p) => ({
      id: p.id,
      name: p.name,
      lobName: p.lineOfBusiness.name,
      premiumCategory: p.lineOfBusiness.premiumCategory,
      productType: p.productType,
    }));
    const lobMap = new Map<string, { id: string; name: string; premiumCategory: PremiumCategory }>();
    allProducts.forEach((p) => {
      if (!lobMap.has(p.lineOfBusinessId)) {
        lobMap.set(p.lineOfBusinessId, {
          id: p.lineOfBusinessId,
          name: p.lineOfBusiness.name,
          premiumCategory: p.lineOfBusiness.premiumCategory,
        });
      }
    });
    lobs = Array.from(lobMap.values());
    buckets = [];
  }

  // De-duplicate LoBs by name (multi-agency data can repeat the same LoB)
  const lobNameMap = new Map<string, { id: string; name: string; premiumCategory: PremiumCategory }>();
  lobs.forEach((lob) => {
    if (!lobNameMap.has(lob.name)) lobNameMap.set(lob.name, lob);
  });
  lobs = Array.from(lobNameMap.values());

  // De-duplicate products by LoB+Name (multi-agency scenarios can repeat the same product)
  const deduped = new Map<string, (typeof products)[number]>();
  products.forEach((p) => {
    const key = `${p.lobName}::${p.name}`;
    if (!deduped.has(key)) deduped.set(key, p);
  });
  products = Array.from(deduped.values());
  const validProductIds = new Set(products.map((p) => p.id));
  const missingProductRules: { ruleId: string; ruleName: string; missingIdsCount: number }[] = [];
  let totalMissingCount = 0;
  for (const rb of version?.ruleBlocks || []) {
    if (rb.applyScope !== CompApplyScope.PRODUCT) continue;
    const apply = (rb.applyFilters as { productIds?: string[] }) || {};
    const missingIds = (apply.productIds || []).filter((id) => !validProductIds.has(id));
    if (!missingIds.length) continue;
    totalMissingCount += missingIds.length;
    missingProductRules.push({ ruleId: rb.id, ruleName: rb.name || "Untitled rule", missingIdsCount: missingIds.length });
  }
  const missingRuleCount = missingProductRules.length;
  const topMissingRules = [...missingProductRules].sort((a, b) => b.missingIdsCount - a.missingIdsCount).slice(0, 3);
  const validLobNames = new Set(lobs.map((l) => l.name));
  const validProductNames = new Set(products.map((p) => p.name));
  const missingBucketRefs: { bucketId: string; bucketName: string; missingCount: number }[] = [];
  let totalMissingBucketRefs = 0;
  for (const bucket of buckets) {
    const includesLobs = bucket.includesLobs || [];
    const includesProducts = bucket.includesProducts || [];
    const excludesLobs = "excludesLobs" in bucket && Array.isArray(bucket.excludesLobs) ? bucket.excludesLobs : [];
    const excludesProducts =
      "excludesProducts" in bucket && Array.isArray(bucket.excludesProducts) ? bucket.excludesProducts : [];
    const missingLobs = includesLobs.filter((lobName) => !validLobNames.has(lobName)).length;
    const missingProducts = includesProducts.filter((productName) => !validProductNames.has(productName)).length;
    const missingExcludeLobs = excludesLobs.filter((lobName) => !validLobNames.has(lobName)).length;
    const missingExcludeProducts = excludesProducts.filter((productName) => !validProductNames.has(productName)).length;
    const missingCount = missingLobs + missingProducts + missingExcludeLobs + missingExcludeProducts;
    if (!missingCount) continue;
    totalMissingBucketRefs += missingCount;
    missingBucketRefs.push({ bucketId: bucket.id, bucketName: bucket.name, missingCount });
  }
  const missingBucketCount = missingBucketRefs.length;
  const topMissingBuckets = [...missingBucketRefs].sort((a, b) => b.missingCount - a.missingCount).slice(0, 3);

  const teams = await prisma.team.findMany({ where: agencyId ? { agencyId } : {}, orderBy: { name: "asc" }, include: { roles: true } });
  const people = await prisma.person.findMany({
    where: agencyId ? { team: { agencyId } } : {},
    orderBy: { fullName: "asc" },
    include: { team: true, role: true },
  });
  const selectedLob = lobs.find((l) => l.id === selectedLobId) || lobs[0] || null;
  const selectedBucket = selectedBucketId ? buckets.find((b) => b.id === selectedBucketId) || null : null;

  // derive coverage for warning
  const productConfigCoverage = new Set<string>();
  const productUsage = new Map<string, number>();
  const bucketUsage = new Map<string, number>();
  for (const rb of version?.ruleBlocks || []) {
    const apply = (rb.applyFilters as ApplyFilters) || {};
    if (rb.applyScope === CompApplyScope.PRODUCT && apply.productIds?.length) {
      apply.productIds.forEach((id) => {
        productConfigCoverage.add(id);
        productUsage.set(id, (productUsage.get(id) || 0) + 1);
      });
    } else if (rb.applyScope === CompApplyScope.LOB && apply.lobIds?.length) {
      apply.lobIds.forEach((lobId) => {
        products
          .filter((p) => p.lobName === lobs.find((l) => l.id === lobId)?.name)
          .forEach((p) => {
            productConfigCoverage.add(p.id);
            productUsage.set(p.id, (productUsage.get(p.id) || 0) + 1);
          });
      });
    } else if (rb.applyScope === CompApplyScope.PRODUCT_TYPE && apply.productTypes?.length) {
      products
        .filter((p) => apply.productTypes.includes(p.productType))
        .forEach((p) => {
          productConfigCoverage.add(p.id);
          productUsage.set(p.id, (productUsage.get(p.id) || 0) + 1);
        });
    } else if (rb.applyScope === CompApplyScope.PREMIUM_CATEGORY && apply.premiumCategories?.length) {
      products
        .filter((p) => apply.premiumCategories.includes(p.premiumCategory))
        .forEach((p) => {
          productConfigCoverage.add(p.id);
          productUsage.set(p.id, (productUsage.get(p.id) || 0) + 1);
        });
    } else if (rb.applyScope === CompApplyScope.BUCKET && rb.bucketId) {
      // bucket covers products via includesProducts/includesLobs
      const b = buckets.find((b) => b.id === rb.bucketId);
      if (b) {
        products
          .filter((p) => b.includesProducts.includes(p.name) || b.includesLobs.includes(p.lobName))
          .forEach((p) => {
            productConfigCoverage.add(p.id);
            productUsage.set(p.id, (productUsage.get(p.id) || 0) + 1);
          });
      }
      bucketUsage.set(rb.bucketId, (bucketUsage.get(rb.bucketId) || 0) + 1);
    }
  }
  const unconfiguredCount = products.length ? products.length - productConfigCoverage.size : 0;

  // optional preview display
  let previewResult: Awaited<ReturnType<typeof computePreview>> | null = null;
  if (sp.previewPerson && sp.previewMonth && version) {
    previewResult = await computePreview(planId, version.id, sp.previewPerson, sp.previewMonth);
  }

  async function addRuleBlock(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const name = String(formData.get("name") || "").trim();
    const applyScope = formData.get("applyScope") as CompApplyScope | null;
    const payoutType = formData.get("payoutType") as CompPayoutType | null;
    const basePayoutValue = Number(formData.get("basePayoutValue") || 0);
    const tierMode = formData.get("tierMode") as CompTierMode | null;
    const tierBasis = (formData.get("tierBasis") as CompTierBasis | null) || null;
    const bucketId = String(formData.get("bucketId") || "") || null;
    const primaryProductId = String(formData.get("primaryProductId") || "") || null;
    const productIds = formData.getAll("productIds").map(String);
    const lobIds = formData.getAll("lobIds").map(String);
    const productTypes = formData.getAll("productTypes").map(String);
    const premiumCategories = formData.getAll("premiumCategories").map(String);
    const minThreshold = formData.get("minThreshold") ? Number(formData.get("minThreshold")) : null;
    const statusEligibilityOverride = formData.getAll("statusOverride").map(String) as PolicyStatus[];
    const tierMins = formData.getAll("tierMin").map((value) => {
      const raw = String(value).trim();
      return raw === "" ? null : Number(raw);
    });
    const tierMaxs = formData.getAll("tierMax").map((value) => {
      const raw = String(value).trim();
      return raw === "" ? null : Number(raw);
    });
    const tierPayouts = formData.getAll("tierPayout").map((value) => {
      const raw = String(value).trim();
      return raw === "" ? null : Number(raw);
    });
    const tierPayoutTypes = formData.getAll("tierPayoutType").map((v) => (v ? (v as CompPayoutType) : payoutType));

    const redirectSection = String(formData.get("redirectSection") || "lob");
    const redirectLob = String(formData.get("redirectLob") || "");

    if (!name || !applyScope || !payoutType) return;

    if (tierBasis && tierMode !== CompTierMode.TIERS) {
      const dest = `/compensation/plans/${planId}?section=${redirectSection}${redirectLob ? `&lob=${redirectLob}` : ""}&err=invalid_tier_basis`;
      return redirect(dest);
    }

    if (minThreshold != null && !tierBasis) {
      const dest = `/compensation/plans/${planId}?section=${redirectSection}${redirectLob ? `&lob=${redirectLob}` : ""}&err=invalid_threshold_basis`;
      return redirect(dest);
    }

    if (tierMode === CompTierMode.TIERS) {
      const hasValidTier = tierMins.some((min, index) => {
        const payout = tierPayouts[index];
        return min != null && payout != null && !Number.isNaN(min) && !Number.isNaN(payout);
      });
      if (!hasValidTier) {
        const dest = `/compensation/plans/${planId}?section=${redirectSection}${redirectLob ? `&lob=${redirectLob}` : ""}&err=no_tiers`;
        return redirect(dest);
      }
      const tiersToValidate = tierMins
        .map((min, index) => ({ min, max: tierMaxs[index], payout: tierPayouts[index] }))
        .filter((t) => t.min != null && t.payout != null && !Number.isNaN(t.min) && !Number.isNaN(t.payout))
        .map((t) => ({
          min: t.min as number,
          max: t.max == null || Number.isNaN(t.max as number) ? null : (t.max as number),
          payout: t.payout as number,
        }));
      let invalidTiers = false;
      for (const t of tiersToValidate) {
        if (t.min < 0 || t.payout < 0) {
          invalidTiers = true;
          break;
        }
        if (t.max != null && (Number.isNaN(t.max) || t.max <= t.min)) {
          invalidTiers = true;
          break;
        }
      }
      if (!invalidTiers) {
        const sorted = [...tiersToValidate].sort((a, b) => a.min - b.min);
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          if (prev.max == null || prev.max >= curr.min) {
            invalidTiers = true;
            break;
          }
        }
      }
      if (invalidTiers) {
        const dest = `/compensation/plans/${planId}?section=${redirectSection}${redirectLob ? `&lob=${redirectLob}` : ""}&err=invalid_tier_rows`;
        return redirect(dest);
      }
    }

    const orderIndex = (await prisma.compPlanRuleBlock.count({ where: { planVersionId: versionId } })) || 0;

    // ensure primary product is included in the filters list
    if (primaryProductId) {
      if (!productIds.includes(primaryProductId)) productIds.push(primaryProductId);
    }

    const tierData: { minValue: number; maxValue: number | null; payoutValue: number; payoutUnit: string; orderIndex: number }[] = [];
    if (tierMode === CompTierMode.TIERS) {
      const seen = new Set<string>();
      const maxLen = Math.max(tierMins.length, tierMaxs.length, tierPayouts.length, tierPayoutTypes.length);
      for (let i = 0; i < maxLen; i++) {
        const min = tierMins[i];
        const payout = tierPayouts[i];
        if (min == null || payout == null || Number.isNaN(min) || Number.isNaN(payout)) continue;
        const max = tierMaxs[i];
        const maxValue = max == null || Number.isNaN(max) ? null : max;
        const payoutTypeOverride = tierPayoutTypes[i] || payoutType;
        const payoutUnit = payoutUnitLabel(payoutTypeOverride || payoutType);
        const key = `${min}|${maxValue ?? "null"}|${payout}|${payoutUnit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tierData.push({
          minValue: min,
          maxValue,
          payoutValue: payout,
          payoutUnit,
          orderIndex: i,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      const rb = await tx.compPlanRuleBlock.create({
        data: {
          planVersionId: versionId,
          name,
          ruleType: CompRuleType.BASE,
          applyScope,
          applyFilters: { productIds, lobIds, productTypes, premiumCategories },
          payoutType,
          basePayoutValue,
          tierMode: tierMode || CompTierMode.NONE,
          tierBasis: tierBasis || null,
          bucketId,
          minThreshold,
          statusEligibilityOverride,
          orderIndex,
        },
      });

      if (tierMode === CompTierMode.TIERS && tierData.length) {
        await tx.compPlanTierRow.createMany({
          data: tierData.map((t) => ({ ...t, ruleBlockId: rb.id })),
        });
      }
    });

    revalidatePath(`/compensation/plans/${planId}`);
    const dest = `/compensation/plans/${planId}?section=${redirectSection}${redirectLob ? `&lob=${redirectLob}` : ""}`;
    return redirect(dest);
  }

  async function updateRuleBlock(formData: FormData) {
    "use server";
    const ruleBlockId = String(formData.get("ruleBlockId") || "");
    if (!ruleBlockId) return;
    const name = String(formData.get("name") || "").trim();
    const payoutType = formData.get("payoutType") as CompPayoutType | null;
    const basePayoutValue = Number(formData.get("basePayoutValue") || 0);
    const minThreshold = formData.get("minThreshold") ? Number(formData.get("minThreshold")) : null;
    const enabled = formData.get("enabled") === "on";
    const statusEligibilityOverride = formData.getAll("statusOverride").map(String) as PolicyStatus[];

    const existingRuleBlock = await prisma.compPlanRuleBlock.findUnique({
      where: { id: ruleBlockId },
      select: { tierMode: true, tierBasis: true, payoutType: true, tiers: { select: { id: true } } },
    });
    if (!existingRuleBlock) return;

    if (existingRuleBlock.tierMode === CompTierMode.TIERS && existingRuleBlock.tiers.length === 0) {
      const dest = `/compensation/plans/${planId}?section=${section}${selectedLobId ? `&lob=${selectedLobId}` : ""}&err=no_tiers`;
      return redirect(dest);
    }

    if (minThreshold != null && !existingRuleBlock.tierBasis) {
      const dest = `/compensation/plans/${planId}?section=${section}${selectedLobId ? `&lob=${selectedLobId}` : ""}&err=invalid_threshold_basis`;
      return redirect(dest);
    }

    await prisma.compPlanRuleBlock.update({
      where: { id: ruleBlockId },
      data: {
        name: name || undefined,
        payoutType: payoutType || undefined,
        basePayoutValue,
        minThreshold,
        enabled,
        statusEligibilityOverride,
      },
    });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function addTier(formData: FormData) {
    "use server";
    const ruleBlockId = String(formData.get("ruleBlockId") || "");
    if (!ruleBlockId) return;
    const minValueRaw = String(formData.get("minValue") || "");
    const payoutValueRaw = String(formData.get("payoutValue") || "");
    const minValue = minValueRaw.trim() === "" ? null : Number(minValueRaw);
    const payoutValue = payoutValueRaw.trim() === "" ? null : Number(payoutValueRaw);
    if (minValue == null || payoutValue == null || Number.isNaN(minValue) || Number.isNaN(payoutValue)) {
      const dest = `/compensation/plans/${planId}?section=${section}${selectedLobId ? `&lob=${selectedLobId}` : ""}&err=bad_tier_input`;
      return redirect(dest);
    }
    const maxValueRaw = String(formData.get("maxValue") || "").trim();
    const maxValueParsed = maxValueRaw === "" ? null : Number(maxValueRaw);
    const maxValue = maxValueParsed == null || Number.isNaN(maxValueParsed) ? null : maxValueParsed;
    const payoutUnitRaw = String(formData.get("payoutUnit") || "").trim();
    let payoutUnit = payoutUnitRaw || null;
    if (!payoutUnit) {
      const parentRuleBlock = await prisma.compPlanRuleBlock.findUnique({
        where: { id: ruleBlockId },
        select: { payoutType: true },
      });
      if (!parentRuleBlock) return;
      payoutUnit = payoutUnitLabel(parentRuleBlock.payoutType);
    }
    const orderIndex = (await prisma.compPlanTierRow.count({ where: { ruleBlockId } })) || 0;

    await prisma.compPlanTierRow.create({
      data: { ruleBlockId, minValue, maxValue, payoutValue, payoutUnit, orderIndex },
    });
    revalidatePath(`/compensation/plans/${planId}`);
    const dest = `/compensation/plans/${planId}?section=${section}${selectedLobId ? `&lob=${selectedLobId}` : ""}`;
    return redirect(dest);
  }

  async function removeTier(formData: FormData) {
    "use server";
    const tierId = String(formData.get("tierId") || "");
    if (!tierId) return;
    await prisma.compPlanTierRow.delete({ where: { id: tierId } });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function addGate(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const name = String(formData.get("name") || "").trim();
    const gateType = formData.get("gateType") as CompGateType | null;
    const behavior = formData.get("behavior") as CompGateBehavior | null;
    const scope = formData.get("scope") as CompGateScope | null;
    const thresholdValue = Number(formData.get("thresholdValue") || 0);
    const bucketId = String(formData.get("bucketId") || "") || null;
    const ruleBlockIds = formData.getAll("ruleBlockIds").map(String);
    if (!name || !gateType || !behavior || !scope) return;
    await prisma.compPlanGate.create({
      data: { planVersionId: versionId, name, gateType, behavior, scope, thresholdValue, bucketId, ruleBlockIds },
    });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function addScorecardTier(formData: FormData) {
    "use server";
    const bonusModuleId = String(formData.get("bonusModuleId") || "");
    if (!bonusModuleId) return;
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    const orderIndex = (await prisma.compPlanScorecardTier.count({ where: { bonusModuleId } })) || 0;
    await prisma.compPlanScorecardTier.create({ data: { bonusModuleId, name, orderIndex } });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function addBonusModule(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const name = String(formData.get("name") || "").trim();
    const bonusType = formData.get("bonusType") as CompBonusType | null;
    if (!name || !bonusType) return;
    await prisma.compPlanBonusModule.create({ data: { planVersionId: versionId, name, bonusType } });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function deleteBonusModule(formData: FormData) {
    "use server";
    const bonusModuleId = String(formData.get("bonusModuleId") || "");
    if (!bonusModuleId) return;
    const tierIds = await prisma.compPlanScorecardTier.findMany({
      where: { bonusModuleId },
      select: { id: true },
    });
    const tierIdList = tierIds.map((t) => t.id);
    await prisma.$transaction([
      prisma.compPlanScorecardCondition.deleteMany({ where: { tierId: { in: tierIdList } } }),
      prisma.compPlanScorecardReward.deleteMany({ where: { tierId: { in: tierIdList } } }),
      prisma.compPlanScorecardTier.deleteMany({ where: { bonusModuleId } }),
      prisma.compPlanBonusModule.delete({ where: { id: bonusModuleId } }),
    ]);
    revalidatePath(`/compensation/plans/${planId}`);
    const dest = `/compensation/plans/${planId}?section=bonuses${selectedLobId ? `&lob=${selectedLobId}` : ""}`;
    return redirect(dest);
  }

  async function addActivityBonus(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const name = String(formData.get("name") || "").trim();
    const timeframe = formData.get("timeframe") as "MONTH" | "DAY" | null;
    const requiresAll = (formData.get("requiresAll") as string) === "ALL";
    const payoutType = formData.get("payoutType") as "FLAT" | "PER_UNIT" | null;
    const payoutValueRaw = Number(formData.get("payoutValue") || 0);
    if (!name || !timeframe || !payoutType) return;

    const activityTypeIds = formData.getAll("activityTypeId").map(String);
    const activityMins = formData.getAll("activityMin").map((value) => (value === "" ? null : Number(value)));
    const requirements = activityTypeIds
      .map((activityTypeId, index) => {
        if (!activityTypeId) return null;
        const min = activityMins[index];
        return { activityTypeId, min: min == null || Number.isNaN(min) ? 0 : min };
      })
      .filter((req): req is { activityTypeId: string; min: number } => Boolean(req));

    await prisma.compPlanBonusModule.create({
      data: {
        planVersionId: versionId,
        enabled: true,
        name,
        bonusType: CompBonusType.ACTIVITY_BONUS,
        config: {
          timeframe: timeframe === "DAY" ? "DAY" : "MONTH",
          requiresAll,
          payoutType: payoutType === "PER_UNIT" ? "PER_UNIT" : "FLAT",
          payoutValue: Number.isNaN(payoutValueRaw) ? 0 : payoutValueRaw,
          requirements,
        },
      },
    });

    revalidatePath(`/compensation/plans/${planId}`);
    const dest = `/compensation/plans/${planId}?section=bonuses${selectedLobId ? `&lob=${selectedLobId}` : ""}`;
    return redirect(dest);
  }

  async function addConditionGroup(formData: FormData) {
    "use server";
    const tierId = String(formData.get("tierId") || "");
    if (!tierId) return;
    const orderIndex = (await prisma.compPlanScorecardConditionGroup.count({ where: { tierId } })) || 0;
    await prisma.compPlanScorecardConditionGroup.create({
      data: { tierId, mode: CompScorecardConditionGroupMode.ANY, name: "", orderIndex },
    });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function addCondition(formData: FormData) {
    "use server";
    const tierId = String(formData.get("tierId") || "");
    const groupId = String(formData.get("groupId") || "");
    if (!tierId || !groupId) return;
    const preset = String(formData.get("preset") || "").trim();
    const operator = formData.get("operator") as ConditionOperator | null;
    const valueRaw = String(formData.get("value") || "").trim();
    const bucketId = String(formData.get("bucketId") || "") || null;
    const premiumCategoryRaw = (formData.get("premiumCategory") as PremiumCategory | null) || null;
    const statusFilterRaw = String(formData.get("statusFilter") || "");
    const statusFilter = statusFilterRaw ? (statusFilterRaw as PolicyStatus) : null;
    const presetProductIds = formData
      .getAll("presetProductIds")
      .map(String)
      .filter((id) => id);
    const presetActivityTypeIds = formData
      .getAll("presetActivityTypeIds")
      .map(String)
      .filter((id) => id);
    let metricSource: CompMetricSource | null = null;
    let premiumCategory: PremiumCategory | null = null;
    const filters: Record<string, string[]> = {};
    let scopeMode: string = "ANY";
    let productIds: string[] = [];
    let lobIds: string[] = [];
    let activityTypeIds: string[] = [];
    if (preset) {
      switch (preset) {
        case "APPS_ALL":
          metricSource = CompMetricSource.APPS_COUNT;
          break;
        case "APPS_PC": {
          metricSource = CompMetricSource.APPS_COUNT;
          const pcProductIds = products.filter((p) => p.premiumCategory === PremiumCategory.PC).map((p) => p.id);
          if (!pcProductIds.length) return;
          filters.productIds = pcProductIds;
          break;
        }
        case "APPS_FS": {
          metricSource = CompMetricSource.APPS_COUNT;
          const fsProductIds = products.filter((p) => p.premiumCategory === PremiumCategory.FS).map((p) => p.id);
          if (!fsProductIds.length) return;
          filters.productIds = fsProductIds;
          break;
        }
        case "APPS_BUSINESS": {
          metricSource = CompMetricSource.APPS_COUNT;
          const businessProductIds = products.filter((p) => p.productType === "BUSINESS").map((p) => p.id);
          if (!businessProductIds.length) return;
          filters.productIds = businessProductIds;
          break;
        }
        case "APPS_PRODUCT":
          metricSource = CompMetricSource.APPS_COUNT;
          if (!presetProductIds.length) return;
          filters.productIds = presetProductIds;
          break;
        case "PREMIUM_ALL":
          metricSource = CompMetricSource.TOTAL_PREMIUM;
          break;
        case "PREMIUM_PC":
          metricSource = CompMetricSource.PREMIUM_CATEGORY;
          premiumCategory = PremiumCategory.PC;
          break;
        case "PREMIUM_FS":
          metricSource = CompMetricSource.PREMIUM_CATEGORY;
          premiumCategory = PremiumCategory.FS;
          break;
        case "PREMIUM_PRODUCT":
          metricSource = CompMetricSource.TOTAL_PREMIUM;
          if (!presetProductIds.length) return;
          filters.productIds = presetProductIds;
          break;
        case "ACTIVITY_TYPES":
          metricSource = CompMetricSource.ACTIVITY;
          if (!presetActivityTypeIds.length) return;
          filters.activityTypeIds = presetActivityTypeIds;
          break;
        default:
          break;
      }
    } else {
      metricSource = formData.get("metricSource") as CompMetricSource | null;
      premiumCategory = premiumCategoryRaw;
      scopeMode = String(formData.get("scopeMode") || "ANY");
      productIds = formData
        .getAll("productIds")
        .map(String)
        .filter((id) => id);
      lobIds = formData
        .getAll("lobIds")
        .map(String)
        .filter((id) => id);
      activityTypeIds = formData
        .getAll("activityTypeIds")
        .map(String)
        .filter((id) => id);
      if (scopeMode === "PRODUCTS" && productIds.length) filters.productIds = productIds;
      else if (scopeMode === "LOBS" && lobIds.length) filters.lobIds = lobIds;
      if (activityTypeIds.length) filters.activityTypeIds = activityTypeIds;
    }
    if (!metricSource || !operator || valueRaw === "") return;
    const value = Number(valueRaw);
    if (Number.isNaN(value)) return;
    if (metricSource === CompMetricSource.PREMIUM_CATEGORY && !premiumCategory) return;
    await prisma.compPlanScorecardCondition.create({
      data: {
        tierId,
        groupId,
        metricSource,
        operator,
        value,
        statusFilter,
        bucketId: metricSource === CompMetricSource.BUCKET ? bucketId : null,
        premiumCategory: metricSource === CompMetricSource.PREMIUM_CATEGORY ? premiumCategory : null,
        filters: Object.keys(filters).length ? filters : null,
      },
    });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function removeCondition(formData: FormData) {
    "use server";
    const conditionId = String(formData.get("conditionId") || "");
    if (!conditionId) return;
    await prisma.compPlanScorecardCondition.delete({ where: { id: conditionId } });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function addReward(formData: FormData) {
    "use server";
    const tierId = String(formData.get("tierId") || "");
    if (!tierId) return;
    const rewardPreset = String(formData.get("rewardPreset") || "");
    let rewardType = formData.get("rewardType") as CompRewardType | null;
    const percentValue = formData.get("percentValue") ? Number(formData.get("percentValue")) : null;
    const dollarValue = formData.get("dollarValue") ? Number(formData.get("dollarValue")) : null;
    let bucketId = String(formData.get("bucketId") || "") || null;
    let premiumCategory = (formData.get("premiumCategory") as PremiumCategory | null) || null;
    if (rewardPreset === "PCT_PREMIUM_ALL") {
      rewardType = CompRewardType.ADD_PERCENT_OF_BUCKET;
      bucketId = null;
      premiumCategory = null;
    } else if (rewardPreset === "PCT_PREMIUM_PC") {
      rewardType = CompRewardType.ADD_PERCENT_OF_BUCKET;
      bucketId = null;
      premiumCategory = PremiumCategory.PC;
    } else if (rewardPreset === "PCT_PREMIUM_FS") {
      rewardType = CompRewardType.ADD_PERCENT_OF_BUCKET;
      bucketId = null;
      premiumCategory = PremiumCategory.FS;
    } else if (rewardPreset === "FLAT_DOLLARS") {
      rewardType = CompRewardType.ADD_FLAT_DOLLARS;
    }
    if (!rewardType) return;
    await prisma.compPlanScorecardReward.create({
      data: { tierId, rewardType, percentValue, dollarValue, bucketId, premiumCategory },
    });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function addAssignment(formData: FormData) {
    "use server";
    const scopeType = formData.get("scopeType") as CompAssignmentScope | null;
    const scopeId = String(formData.get("scopeId") || "") || null;
    const effectiveStartMonth = String(formData.get("effectiveStartMonth") || "") || null;
    if (!scopeType) return;
    await prisma.compPlanAssignment.create({
      data: { planId, scopeType, scopeId, effectiveStartMonth },
    });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function preview(formData: FormData) {
    "use server";
    const personId = String(formData.get("personId") || "");
    const month = String(formData.get("month") || "");
    if (!personId || !month || !version) return redirect(`/compensation/plans/${planId}`);

    const previewResult = await computePreview(planId, version.id, personId, month);
    return redirect(`/compensation/plans/${planId}?previewPerson=${personId}&previewMonth=${month}&total=${previewResult.totalEarnings}`);
  }

  return (
    <AppShell title={plan.name} subtitle="Modular plan builder with guided steps.">
      <div className="surface" style={{ display: "grid", gap: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16, alignItems: "start" }}>
          <div
            style={{
              borderRight: "1px solid #e5e7eb",
              paddingRight: 12,
              display: "grid",
              gap: 10,
              position: "sticky",
              top: 110,
              alignSelf: "start",
              background: "white",
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>Plan sections</div>
            {[
              { id: "lob", label: "Lines of Business" },
              { id: "buckets", label: "Buckets" },
              { id: "bonuses", label: "Bonuses / Scorecard" },
              { id: "assign", label: "Assign User / Team" },
              { id: "preview", label: "Plan Summary" },
            ].map((t) => (
              <a
                key={t.id}
                href={`?section=${t.id}${selectedLob ? `&lob=${selectedLob.id}` : ""}`}
                style={{
                  color: section === t.id ? "#2563eb" : "#111",
                  textDecoration: "none",
                  fontWeight: section === t.id ? 800 : 600,
                }}
              >
                {t.label}
              </a>
            ))}
            <div style={{ height: 12 }} />
            <div style={{ fontWeight: 800, fontSize: 14 }}>Lines of Business</div>
            {lobs.map((lob) => (
              <a
                key={lob.id}
                href={`?section=lob&lob=${lob.id}`}
                style={{
                  color: selectedLob?.id === lob.id ? "#2563eb" : "#111",
                  textDecoration: "none",
                  fontWeight: 700,
                }}
              >
                {lob.name}
              </a>
            ))}
            <div style={{ fontSize: 12, color: "#6b7280" }}>Each LoB opens its own editing view.</div>
          </div>

          <div style={{ display: "grid", gap: 20 }}>
            <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <h2 style={{ marginTop: 0 }}>Overview</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  background:
                    plan.status === CompPlanStatus.DRAFT
                      ? "#fef3c7"
                      : plan.status === CompPlanStatus.ACTIVE
                        ? "#dcfce7"
                        : "#e2e8f0",
                  border: "1px solid #e5e7eb",
                }}
              >
                {plan.status}
              </span>
              <form action={markDraft}>
                <button type="submit" className="btn" style={{ padding: "6px 10px" }}>
                  Save as Draft
                </button>
              </form>
              <form action={markActive}>
                <button type="submit" className="btn" style={{ padding: "6px 10px" }}>
                  Mark Active
                </button>
              </form>
              <form action={deletePlanAction}>
                <button type="submit" className="btn danger" style={{ padding: "6px 10px" }}>
                  Delete Plan
                </button>
              </form>
            </div>
          </div>
          <PlanMetaAutosaveClient planId={planId} initialDescription={plan.description || ""} onSave={updatePlanMeta} />
          <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>
            Default statuses: {plan.defaultStatusEligibility.join(", ") || "Issued, Paid"} • Version: {version?.effectiveStartMonth || "Current"}
          </div>
          {unconfiguredCount > 0 ? (
            <div style={{ marginTop: 8, color: "#b45309", background: "#fef3c7", padding: "8px 10px", borderRadius: 8, border: "1px solid #fcd34d" }}>
              {unconfiguredCount} product(s) have no rule coverage and will currently pay $0. Add rule blocks to cover them.
            </div>
          ) : null}
          {totalMissingCount > 0 ? (
            <div
              style={{
                marginTop: 8,
                color: "#b45309",
                background: "#fef3c7",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #fcd34d",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                Data integrity: Some rules reference products that no longer exist in this agency's catalog.
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Missing product refs: {totalMissingCount} across {missingRuleCount} rules
              </div>
              <div style={{ marginTop: 6, display: "grid", gap: 4, fontSize: 12 }}>
                {topMissingRules.map((rule) => (
                  <div key={rule.ruleId}>
                    {rule.ruleName} — {rule.missingIdsCount} missing
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {totalMissingBucketRefs > 0 ? (
            <div
              style={{
                marginTop: 8,
                color: "#b45309",
                background: "#fef3c7",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #fcd34d",
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700 }}>Data integrity: Some buckets reference products/LoBs that no longer exist.</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Missing bucket refs: {totalMissingBucketRefs} across {missingBucketCount} buckets
              </div>
              <div style={{ marginTop: 6, display: "grid", gap: 4, fontSize: 12 }}>
                {topMissingBuckets.map((bucket) => (
                  <div key={bucket.bucketId}>
                    {bucket.bucketName} — {bucket.missingCount} missing
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {errMessage ? (
          <div
            style={{
              color: "#b45309",
              background: "#fef3c7",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #fcd34d",
              fontSize: 13,
            }}
          >
            {errMessage}
          </div>
        ) : null}

        <PlanBuilderSelectionProvider>
          <section id="lob-nav" style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 16 }}>
                {section === "lob" ? (
                  <>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontWeight: 800 }}>Line of Business:</div>
                      {lobs.map((lob) => (
                        <a
                          key={lob.id}
                          href={`?section=lob&lob=${lob.id}`}
                          style={{
                            textDecoration: "none",
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: selectedLob?.id === lob.id ? "1px solid #2563eb" : "1px solid #e5e7eb",
                            background: selectedLob?.id === lob.id ? "rgba(37,99,235,0.08)" : "white",
                            color: "#0f172a",
                            fontWeight: 700,
                          }}
                        >
                          {lob.name}
                        </a>
                      ))}
                    </div>

                    {selectedLob ? (
                      <div id={`lob-${selectedLob.id}`} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 18 }}>{selectedLob.name}</div>
                            <div style={{ color: "#6b7280", fontSize: 13 }}>Only this LoB is shown to keep the page clean.</div>
                          </div>
                          <div style={{ color: "#475569", fontSize: 13 }}>
                            Products: {products.filter((p) => p.lobName === selectedLob.name).length}
                          </div>
                        </div>
                        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                          {version?.ruleBlocks
                            .filter((rb) => {
                              const apply = (rb.applyFilters as ApplyFilters) || {};
                              if (rb.applyScope === CompApplyScope.LOB) return apply.lobIds?.includes(selectedLob.id);
                              if (rb.applyScope === CompApplyScope.PRODUCT)
                                return apply.productIds?.some((pid: string) => products.filter((p) => p.lobName === selectedLob.name).find((p) => p.id === pid));
                              return false;
                            })
                            .map((rb) => (
                              <div key={rb.id} style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: 10 }}>
                                <div style={{ fontWeight: 700 }}>{rb.name}</div>
                                <div style={{ color: "#555", fontSize: 13 }}>{ruleSummary(rb)}</div>
                                <a href={`#edit-${rb.id}`} style={{ color: "#2563eb", fontSize: 13 }}>Edit</a>
                              </div>
                          ))}
                          <form action={addRuleBlock}>
                            <input type="hidden" name="redirectSection" value="lob" />
                            <input type="hidden" name="redirectLob" value={selectedLob.id} />
                            <LobRuleComposer
                              lobName={selectedLob.name}
                              products={products
                                .filter((p) => p.lobName === selectedLob.name)
                                .map((p) => ({ id: p.id, name: p.name, usage: productUsage.get(p.id) || 0 }))}
                            />
                          </form>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: "#94a3b8" }}>No line of business found.</div>
                    )}

                    <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ marginTop: 0 }}>Base Plan (Rule Blocks)</h2>
            <a href="#add-rule" className="btn primary" style={{ textDecoration: "none", padding: "8px 12px" }}>
              + Add Rule Block
            </a>
          </div>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#f8fafc", color: "#0f172a", marginBottom: 6 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>How rules work</div>
            <div style={{ fontSize: 13, display: "grid", gap: 4 }}>
              <div>1) Pick the products or LoB the rule applies to (drag or quick-pick).</div>
              <div>2) Choose payout type (flat $ per app or % of premium) and set a base value.</div>
              <div>3) (Optional) Add tiers using app counts or premium ranges to pay different amounts.</div>
              <div>4) (Optional) Set minimum threshold or status filters (e.g., Issued/Paid only).</div>
              <div style={{ fontStyle: "italic", color: "#475569" }}>
                Example: “Pay $10 per app for Auto Raw New when Issued/Paid, 20–30 apps pays $25, 31+ pays $40.”
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {version?.ruleBlocks.map((rb) => (
              <div key={rb.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{rb.name}</div>
                    <div style={{ color: "#555", fontSize: 13 }}>{ruleSummary(rb)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: rb.enabled ? "#15803d" : "#b91c1c" }}>{rb.enabled ? "Enabled" : "Disabled"}</span>
                    <a
                      href={`#edit-${rb.id}`}
                      style={{
                        textDecoration: "none",
                        padding: "4px 10px",
                        borderRadius: 999,
                        border: "1px solid #d1d5db",
                        color: "#2563eb",
                        fontWeight: 700,
                      }}
                    >
                      Edit rule
                    </a>
                    <form action={deleteRuleBlock} style={{ margin: 0 }}>
                      <input type="hidden" name="ruleBlockId" value={rb.id} />
                      <button
                        type="submit"
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: "1px solid #dc2626",
                          color: "#b91c1c",
                          background: "white",
                          fontWeight: 700,
                        }}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                {ruleWarnings(rb)}
                {rb.tierMode === CompTierMode.TIERS ? (
                  <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                    {rb.tiers
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map((t) => (
                        <div key={t.id} style={{ fontSize: 13, color: "#111" }}>
                          {t.minValue}-{t.maxValue ?? "∞"} =&gt; {t.payoutValue} {t.payoutUnit || payoutUnitLabel(rb.payoutType)}
                        </div>
                      ))}
                  </div>
                ) : null}

                {/* Edit modal for this block */} 
                <div id={`edit-${rb.id}`} className="modal-target">
                  <div className="modal-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontWeight: 800 }}>Edit rule block</div>
                      <a href="#" style={{ textDecoration: "none", color: "#b91c1c", fontWeight: 700 }}>✕ Close</a>
                    </div>
                    <form action={updateRuleBlock} style={{ display: "grid", gap: 12 }}>
                      <input type="hidden" name="ruleBlockId" value={rb.id} />
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>Rule name</span>
                        <input name="name" defaultValue={rb.name} style={{ padding: 10 }} />
                      </label>
                      <div style={{ fontSize: 12, color: "#555" }}>
                        Tip: Clear “Min threshold” to remove the gate requirement. Adjust tiers below or remove them to change the sentence.
                      </div>
                      <div style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc", fontSize: 13, color: "#0f172a" }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Current sentence</div>
                        <div>{ruleSummary(rb)}</div>
                      </div>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>Payout type</span>
                        <select name="payoutType" defaultValue={rb.payoutType} style={{ padding: 10 }}>
                          <option value={CompPayoutType.FLAT_PER_APP}>Flat $ per app</option>
                          <option value={CompPayoutType.PERCENT_OF_PREMIUM}>% of premium</option>
                          <option value={CompPayoutType.FLAT_LUMP_SUM}>Flat lump sum</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>Tier basis</span>
                        <select name="tierBasis" defaultValue={rb.tierBasis || ""} style={{ padding: 10 }}>
                          <option value="">(none)</option>
                          <option value={CompTierBasis.APP_COUNT}>App count</option>
                          <option value={CompTierBasis.PREMIUM_SUM}>Premium sum</option>
                          <option value={CompTierBasis.BUCKET_VALUE}>Bucket value</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>Base payout value</span>
                        <input name="basePayoutValue" type="number" step="0.01" defaultValue={rb.basePayoutValue ?? 0} style={{ padding: 10 }} />
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>Minimum threshold (apps/premium)</span>
                        <input name="minThreshold" type="number" step="0.01" defaultValue={rb.minThreshold ?? ""} style={{ padding: 10 }} />
                      </label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {Object.values(PolicyStatus).map((s) => (
                          <label key={`edit-status-${rb.id}-${s}`} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                            <input type="checkbox" name="statusOverride" value={s} defaultChecked={rb.statusEligibilityOverride.includes(s)} /> {s}
                          </label>
                        ))}
                      </div>
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="enabled" defaultChecked={rb.enabled} /> Enabled
                      </label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <button type="submit" className="btn primary">Save changes</button>
                        <a href="#" className="btn">Cancel</a>
                      </div>
                    </form>
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #e5e7eb", display: "grid", gap: 8 }}>
                      <div style={{ fontWeight: 700 }}>Tiers</div>
                      {rb.tiers
                        .sort((a, b) => a.orderIndex - b.orderIndex)
                        .map((t) => (
                          <div
                            key={t.id}
                            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr)) auto", gap: 8, alignItems: "center", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}
                          >
                            <div style={{ fontSize: 13, color: "#111" }}>
                              {t.minValue}-{t.maxValue ?? "∞"} =&gt; {t.payoutValue} {t.payoutUnit || payoutUnitLabel(rb.payoutType)}
                            </div>
                            <form action={removeTier} style={{ margin: 0 }}>
                              <input type="hidden" name="tierId" value={t.id} />
                              <button type="submit" className="btn danger" style={{ padding: "4px 8px" }}>
                                Remove tier
                              </button>
                            </form>
                          </div>
                        ))}
                      {rb.tiers.length === 0 ? <div style={{ fontSize: 12, color: "#6b7280" }}>No tiers yet.</div> : null}
                      <div style={{ fontSize: 12, color: "#6b7280" }}>To change values, delete and re-add tiers with new numbers.</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* modal styling via :target (no client JS needed) */}
          <style>{`
            .modal-target {
              position: fixed;
              inset: 0;
              display: none;
              align-items: flex-start;
              justify-content: center;
              padding: 40px 16px;
              background: rgba(0,0,0,0.45);
              z-index: 70;
            }
            .modal-target:target {
              display: flex;
            }
            .modal-card {
              background: #fff;
              width: min(1100px, 100%);
              max-height: 85vh;
              overflow: auto;
              border-radius: 14px;
              border: 1px solid #dfe5d6;
              box-shadow: 0 20px 60px rgba(0,0,0,0.25);
              padding: 18px 18px 22px;
            }
            .scorecard-requirement-row details > summary {
              list-style: none;
            }
            .scorecard-requirement-row details > summary::-webkit-details-marker {
              display: none;
            }
            .reward-details > summary {
              list-style: none;
            }
            .reward-details > summary::-webkit-details-marker {
              display: none;
            }
            .scorecard-add-row-plus {
              position: relative;
            }
            .scorecard-add-row-plus::before,
            .scorecard-add-row-plus::after {
              content: "";
              position: absolute;
              left: 50%;
              width: 1px;
              height: 6px;
              background: #cbd5e1;
              transform: translateX(-50%);
            }
            .scorecard-add-row-plus::before {
              top: -8px;
            }
            .scorecard-add-row-plus::after {
              bottom: -8px;
            }
            [data-tip] {
              position: relative;
            }
            [data-tip]::after {
              content: attr(data-tip);
              position: absolute;
              left: 50%;
              bottom: calc(100% + 6px);
              transform: translateX(-50%);
              background: #111827;
              color: #f8fafc;
              font-size: 11px;
              padding: 6px 8px;
              border-radius: 6px;
              white-space: nowrap;
              opacity: 0;
              pointer-events: none;
              transition: opacity 0.15s ease;
              z-index: 80;
              box-shadow: 0 6px 16px rgba(0,0,0,0.18);
            }
            [data-tip]:hover::after,
            [data-tip]:focus-visible::after {
              opacity: 1;
            }
          `}</style>
          <AdvancedRuleBlockModalClient
            planId={planId}
            lobs={lobs}
            products={products}
            buckets={buckets.map((bucket) => ({
              id: bucket.id,
              name: bucket.name,
              includesProducts: bucket.includesProducts,
              includesLobs: bucket.includesLobs,
            }))}
            productUsageById={Object.fromEntries(products.map((p) => [p.id, productUsage.get(p.id) || 0]))}
            selectedLobId={selectedLobId || ""}
            addRuleBlockAction={addRuleBlock}
          />
        </section>

                  <section>
                    <h2 style={{ marginTop: 0 }}>Requirements</h2>
                    <div style={{ display: "grid", gap: 10 }}>
                      {version?.gates.map((g) => (
                        <div key={g.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                          <div style={{ fontWeight: 700 }}>{g.name}</div>
                          <div style={{ color: "#555", fontSize: 13 }}>
                            {g.gateType} • Threshold {g.thresholdValue} • {g.behavior} • Scope {g.scope}
                          </div>
                        </div>
                      ))}
                    </div>
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ Add Requirement</summary>
                      <form action={addGate} style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                        <input name="name" placeholder="Gate name" style={{ padding: 10, width: "100%" }} />
                        <select name="gateType" style={{ padding: 10 }}>
                          <option value={CompGateType.MIN_APPS}>Min apps</option>
                          <option value={CompGateType.MIN_PREMIUM}>Min premium</option>
                          <option value={CompGateType.MIN_BUCKET}>Min bucket</option>
                        </select>
                        <input name="thresholdValue" type="number" step="0.01" placeholder="Threshold" style={{ padding: 10 }} />
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            Behavior
                            <details style={{ display: "inline-block" }}>
                              <summary
                                style={{
                                  listStyle: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "2px 6px",
                                  borderRadius: 999,
                                  border: "1px solid #e5e7eb",
                                  background: "#f8fafc",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                ?
                              </summary>
                              <div
                                style={{
                                  marginTop: 6,
                                  border: "1px solid #e5e7eb",
                                  background: "#f8fafc",
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  color: "#475569",
                                  display: "grid",
                                  gap: 6,
                                }}
                              >
                                <div>
                                  <strong>Hard gate:</strong> If unmet, pay $0 for the affected scope. Example: Min apps 20: 19 apps pays $0.
                                </div>
                                <div>
                                  <strong>Retroactive:</strong> Once met, payouts apply to all production from the start of the period. Example: Min apps 20: when app #20 is hit, all 20 apps pay.
                                </div>
                                <div>
                                  <strong>Non-retro:</strong> Only production after the threshold is met pays. Example: Min apps 20: apps 1-19 pay $0, apps 20+ pay.
                                </div>
                              </div>
                            </details>
                          </span>
                          <select name="behavior" style={{ padding: 10 }}>
                            <option value={CompGateBehavior.HARD_GATE}>Hard gate</option>
                            <option value={CompGateBehavior.RETROACTIVE}>Retroactive</option>
                            <option value={CompGateBehavior.NON_RETROACTIVE}>Non-retro</option>
                          </select>
                        </label>
                        <select name="scope" style={{ padding: 10 }}>
                          <option value={CompGateScope.PLAN}>Entire plan</option>
                          <option value={CompGateScope.RULE_BLOCKS}>Specific rule blocks</option>
                        </select>
                        <select name="bucketId" style={{ padding: 10 }}>
                          <option value="">Bucket (optional)</option>
                          {buckets.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                        <div style={{ gridColumn: "1 / span 3" }}>
                          <div style={{ fontSize: 13, color: "#555" }}>Apply to rule blocks (optional)</div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {version?.ruleBlocks.map((rb) => (
                              <label key={rb.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <input type="checkbox" name="ruleBlockIds" value={rb.id} /> {rb.name}
                              </label>
                            ))}
                          </div>
                        </div>
                        <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
                          Save requirement
                        </button>
                      </form>
                    </details>
                  </section>
                </>
              ) : null}
              {section === "buckets" ? (
                <section id="buckets">
                  <h2 style={{ marginTop: 0 }}>Buckets</h2>
                  <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 10 }}>
                    Buckets aggregate premium across products/LoBs. Configure these in Agency settings.
                  </div>
                  {selectedBucketId ? (
                    selectedBucket ? (
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #e5e7eb",
                          background: "#fff",
                          marginBottom: 10,
                          display: "grid",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={{ fontWeight: 800 }}>{selectedBucket.name}</div>
                          <a
                            href={`?section=buckets${selectedLobId ? `&lob=${selectedLobId}` : ""}`}
                            style={{ color: "#2563eb", fontSize: 12, textDecoration: "none", fontWeight: 600 }}
                          >
                            Back to buckets list
                          </a>
                        </div>
                        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#f8fafc", display: "grid", gap: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: "#0f172a" }}>Quick actions</div>
                          <form action={addGate} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <input type="hidden" name="name" value="Min total apps (bucket scaffold)" />
                            <input type="hidden" name="gateType" value={CompGateType.MIN_APPS} />
                            <input type="hidden" name="behavior" value={CompGateBehavior.HARD_GATE} />
                            <input type="hidden" name="scope" value={CompGateScope.PLAN} />
                            <input type="hidden" name="thresholdValue" value="30" />
                            <input type="hidden" name="bucketId" value="" />
                            <div style={{ fontSize: 12, color: "#475569" }}>Add plan gate: Min total apps</div>
                            <button type="submit" className="btn" style={{ padding: "6px 10px", fontSize: 12 }}>
                              Add 30-app gate
                            </button>
                          </form>
                          <BucketQuickRuleFormClient
                            addRuleBlockAction={addRuleBlock}
                            selectedBucketId={selectedBucket.id}
                            selectedBucketName={selectedBucket.name}
                            selectedLobId={selectedLobId || ""}
                          />
                        </div>
                        {(() => {
                          const excludedLobs = selectedBucket.excludesLobs || [];
                          const excludedProducts = selectedBucket.excludesProducts || [];
                          const hasExcludes = excludedLobs.length || excludedProducts.length;
                          return (
                            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#f8fafc", display: "grid", gap: 6 }}>
                              <div style={{ fontWeight: 700, fontSize: 12, color: "#0f172a" }}>Definition</div>
                              <div style={{ display: "grid", gap: 2, fontSize: 12, color: "#475569" }}>
                                <div style={{ fontWeight: 600, color: "#0f172a" }}>Included</div>
                                <div>LoBs: {selectedBucket.includesLobs.join(", ") || "—"}</div>
                                <div>Products: {selectedBucket.includesProducts.join(", ") || "—"}</div>
                              </div>
                              {hasExcludes ? (
                                <div style={{ display: "grid", gap: 2, fontSize: 12, color: "#475569" }}>
                                  <div style={{ fontWeight: 600, color: "#0f172a" }}>Excluded</div>
                                  <div>LoBs: {excludedLobs.join(", ") || "—"}</div>
                                  <div>Products: {excludedProducts.join(", ") || "—"}</div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                        <div style={{ color: "#64748b", fontSize: 12 }}>
                          This bucket aggregates premium from included items and subtracts excluded items before being used in rules, gates, or bonuses.
                        </div>
                        <div style={{ marginTop: 6, border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, fontSize: 12, color: "#475569", background: "#f8fafc", display: "grid", gap: 4 }}>
                          <div>This bucket aggregates premium from the included products/LoBs and is evaluated at preview time.</div>
                          {previewResult ? (
                            <div>
                              Current preview value: $
                              {(previewResult.bucketValues[selectedBucket.id] || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          ) : (
                            <div style={{ color: "#6b7280" }}>Run a preview to see bucket value.</div>
                          )}
                        </div>
                        <form
                          action={addRuleBlock}
                          style={{
                            marginTop: 8,
                            paddingTop: 8,
                            borderTop: "1px dashed #e5e7eb",
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          <input type="hidden" name="applyScope" value={CompApplyScope.BUCKET} />
                          <input type="hidden" name="bucketId" value={selectedBucket.id} />
                          <input type="hidden" name="primaryProductId" value="" />
                          <input type="hidden" name="redirectSection" value="buckets" />
                          <input type="hidden" name="redirectLob" value={selectedLobId || ""} />

                          <div style={{ fontWeight: 700, fontSize: 13 }}>Create bucket rule</div>
                          <div
                            style={{
                              display: "grid",
                              gap: 8,
                              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                            }}
                          >
                            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                              Rule name
                              <input name="name" required style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
                            </label>
                            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                              Payout type
                              <select name="payoutType" defaultValue={CompPayoutType.FLAT_PER_APP} style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                                <option value={CompPayoutType.FLAT_PER_APP}>Flat $ per app</option>
                                <option value={CompPayoutType.PERCENT_OF_PREMIUM}>% of premium</option>
                                <option value={CompPayoutType.FLAT_LUMP_SUM}>Flat lump sum</option>
                              </select>
                            </label>
                            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                              Base payout value
                              <input
                                name="basePayoutValue"
                                type="number"
                                step="0.01"
                                defaultValue="0"
                                style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                              />
                            </label>
                            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                              Tier mode
                              <select name="tierMode" defaultValue={CompTierMode.NONE} style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                                <option value={CompTierMode.NONE}>No tiers</option>
                                <option value={CompTierMode.TIERS}>Tiered</option>
                              </select>
                            </label>
                            <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                              Tier range
                              <select name="tierBasis" defaultValue={CompTierBasis.APP_COUNT} style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                                <option value={CompTierBasis.APP_COUNT}>Apps</option>
                                <option value={CompTierBasis.BUCKET_VALUE}>Premium</option>
                              </select>
                            </label>
                          </div>
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ fontSize: 12, color: "#475569" }}>Tier rows (used when Tiered selected)</div>
                            {[0, 1, 2].map((idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: "grid",
                                  gap: 8,
                                  gridTemplateColumns: "repeat(4, minmax(100px, 1fr))",
                                }}
                              >
                                <input name="tierMin" placeholder="Min" type="number" step="0.01" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
                                <input name="tierMax" placeholder="Max" type="number" step="0.01" style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }} />
                                <input
                                  name="tierPayout"
                                  placeholder="Payout"
                                  type="number"
                                  step="0.01"
                                  style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                                />
                                <select name="tierPayoutType" defaultValue={CompPayoutType.FLAT_PER_APP} style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}>
                                  <option value={CompPayoutType.FLAT_PER_APP}>$ per app</option>
                                  <option value={CompPayoutType.PERCENT_OF_PREMIUM}>% of premium</option>
                                </select>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="submit"
                              className="btn primary"
                              style={{ padding: "6px 12px" }}
                            >
                              Create rule
                            </button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 10 }}>Bucket not found.</div>
                    )
                  ) : null}
                  <div style={{ display: "grid", gap: 8 }}>
                    {buckets.length === 0 ? <div style={{ color: "#94a3b8" }}>No buckets defined for this agency.</div> : null}
                    {buckets.map((b) => {
                      const includedLobCount = b.includesLobs?.length || 0;
                      const includedProductCount = b.includesProducts?.length || 0;
                      const excludedLobCount = b.excludesLobs?.length || 0;
                      const excludedProductCount = b.excludesProducts?.length || 0;
                      const hasExcludes = excludedLobCount || excludedProductCount;
                      return (
                        <div
                          key={b.id}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: bucketUsage.get(b.id) ? "#d1fae5" : "#f8fafc",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700 }}>
                              <a
                                href={`?section=buckets&bucketId=${b.id}${selectedLobId ? `&lob=${selectedLobId}` : ""}`}
                                style={{ color: "#2563eb", textDecoration: "none" }}
                              >
                                {b.name}
                              </a>
                            </div>
                            <div style={{ display: "grid", gap: 2, color: "#475569", fontSize: 12 }}>
                              <div>
                                Includes: {includedLobCount} LoBs, {includedProductCount} Products
                              </div>
                              {hasExcludes ? (
                                <div>
                                  Excludes: {excludedLobCount} LoBs, {excludedProductCount} Products
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: "#0f172a" }}>{bucketUsage.get(b.id) || 0} use(s)</div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              {section === "bonuses" ? (
                <>
                  <section id="bonuses">
            <h2 style={{ marginTop: 0 }}>Bonuses / Scorecard / Subtractor</h2>
            <div style={{ marginBottom: 8, color: "#6b7280" }}>
              Create bonuses, scorecards, or subtractors with conditions on apps/premium/activities and rewards as flat $ / % of bucket / multiplier. Drag products to scope.
            </div>
            <form action={addBonusModule} style={{ display: "grid", gap: 12 }}>
              <BonusComposer
                products={products.map((p) => ({ id: p.id, name: p.name, usage: productUsage.get(p.id) || 0 }))}
                buckets={buckets.map((b) => ({ id: b.id, name: b.name }))}
              />
              <button
                type="submit"
                className="btn primary"
                style={{ justifySelf: "start", padding: "10px 12px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}
              >
                Save bonus module
              </button>
            </form>
            <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
              <h3 style={{ margin: "0 0 8px 0" }}>Activity Bonus Builder</h3>
              <form action={addActivityBonus} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    Name
                    <input name="name" placeholder="Activity bonus name" style={{ padding: 8 }} />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    Timeframe
                    <select name="timeframe" style={{ padding: 8 }}>
                      <option value="MONTH">Month</option>
                      <option value="DAY">Day</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    Requires
                    <select name="requiresAll" style={{ padding: 8 }}>
                      <option value="ALL">All</option>
                      <option value="ANY">Any</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    Payout type
                    <select name="payoutType" style={{ padding: 8 }}>
                      <option value="FLAT">Flat</option>
                      <option value="PER_UNIT">Per unit</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                    Payout value
                    <input name="payoutValue" type="number" step="0.01" style={{ padding: 8 }} />
                  </label>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Requirements (up to 5)</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <div key={`activity-req-${idx}`} style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr" }}>
                        <select name="activityTypeId" style={{ padding: 8 }}>
                          <option value="">Select activity</option>
                          {activityTypes.map((activity) => (
                            <option key={activity.id} value={activity.id}>
                              {activity.name}
                            </option>
                          ))}
                        </select>
                        <input name="activityMin" type="number" placeholder="Min" style={{ padding: 8 }} />
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  style={{ justifySelf: "start", padding: "10px 12px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}
                >
                  Add activity bonus
                </button>
              </form>
            </div>
          </section>
                  <section>
                    <h2 style={{ marginTop: 0 }}>Bonuses</h2>
                    <div style={{ display: "grid", gap: 12 }}>
                      {version?.bonusModules.map((bm) => (
                        <div key={bm.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{bm.name}</div>
                              <div style={{ color: "#555", fontSize: 13 }}>{bm.bonusType}</div>
                            </div>
                            <form action={deleteBonusModule} style={{ margin: 0 }}>
                              <input type="hidden" name="bonusModuleId" value={bm.id} />
                              <button
                                type="submit"
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 999,
                                  border: "1px solid #dc2626",
                                  color: "#b91c1c",
                                  background: "white",
                                  fontWeight: 700,
                                }}
                              >
                                Delete
                              </button>
                            </form>
                          </div>
                          {bm.bonusType === CompBonusType.SCORECARD_TIER ? (
                            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                              {bm.scorecardTiers.map((tier) => {
                                const conditionGroups = tier.conditionGroups || [];
                                const conditionCount = conditionGroups.length
                                  ? conditionGroups.reduce((sum, group) => sum + group.conditions.length, 0)
                                  : tier.conditions.length;
                                const productNameById = new Map(products.map((p) => [p.id, p.name]));
                                const lobNameById = new Map(lobs.map((l) => [l.id, l.name]));
                                return (
                                  <div key={tier.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                                    <div style={{ fontWeight: 600 }}>{tier.name}</div>
                                    <div style={{ color: "#555", fontSize: 13 }}>
                                      Requirement rows: {conditionGroups.length} • Conditions: {conditionCount} • Rewards: {tier.rewards.length}
                                    </div>
                                    <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                                      Each requirement row is an OR (any condition can satisfy the row). All rows must be met.
                                    </div>
                                    {conditionGroups.length ? (
                                      <>
                                        <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>All requirement rows must be met (AND)</div>
                                        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                                          {conditionGroups.map((group, groupIndex) => {
                                            const groupLabel = `Requirement ${groupIndex + 1}`;
                                            return (
                                              <div
                                                key={group.id}
                                                className="scorecard-requirement-row"
                                                style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, position: "relative" }}
                                              >
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 32 }}>
                                                  <span style={{ fontWeight: 600, fontSize: 13 }}>{groupLabel}</span>
                                                  <span
                                                    style={{
                                                      fontSize: 11,
                                                      fontWeight: 700,
                                                      padding: "2px 6px",
                                                      borderRadius: 999,
                                                      background: "#f1f5f9",
                                                      color: "#64748b",
                                                      border: "1px solid #e2e8f0",
                                                    }}
                                                  >
                                                    OR
                                                  </span>
                                                </div>
                                              {group.conditions.length ? (
                                                <div style={{ marginTop: 6, display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                                                  {group.conditions.map((cond) => {
                                                    const bucketName = cond.bucketId ? buckets.find((b) => b.id === cond.bucketId)?.name || "Unknown bucket" : "";
                                                    const filters = (cond.filters as { productIds?: string[]; lobIds?: string[]; activityTypeIds?: string[] }) || {};
                                                    const productNames = Array.isArray(filters.productIds)
                                                      ? filters.productIds.map((id) => productNameById.get(id) || id)
                                                      : [];
                                                    const lobNames = Array.isArray(filters.lobIds)
                                                      ? filters.lobIds.map((id) => lobNameById.get(id) || id)
                                                      : [];
                                                    const activityTypeNames = Array.isArray(filters.activityTypeIds)
                                                      ? filters.activityTypeIds.map((id) => activityTypeNameById.get(id) || id)
                                                      : [];
                                                    const scopeDetail = productNames.length
                                                      ? `products: ${productNames.join(", ")}`
                                                      : lobNames.length
                                                        ? `lobs: ${lobNames.join(", ")}`
                                                        : null;
                                                    const activityDetail = activityTypeNames.length ? `activity: ${activityTypeNames.join(", ")}` : null;
                                                    const detailParts = [
                                                      cond.metricSource === CompMetricSource.BUCKET && bucketName ? `bucket: ${bucketName}` : null,
                                                      cond.metricSource === CompMetricSource.PREMIUM_CATEGORY && cond.premiumCategory
                                                        ? `category: ${cond.premiumCategory}`
                                                        : null,
                                                      cond.statusFilter ? `status: ${cond.statusFilter}` : null,
                                                      activityDetail,
                                                      scopeDetail,
                                                    ].filter(Boolean);
                                                    return (
                                                      <div key={cond.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                                        <div>
                                                          <span style={{ fontWeight: 600 }}>{cond.metricSource}</span> {cond.operator} {cond.value}
                                                          {detailParts.length ? <span style={{ color: "#64748b" }}> {" | "}{detailParts.join(" | ")}</span> : null}
                                                        </div>
                                                        <form action={removeCondition} style={{ margin: 0 }}>
                                                          <input type="hidden" name="conditionId" value={cond.id} />
                                                          <button type="submit" className="btn danger" style={{ padding: "2px 8px", fontSize: 11 }}>
                                                            Remove condition
                                                          </button>
                                                        </form>
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              ) : null}
                                              <details style={{ position: "absolute", top: 8, right: 8 }}>
                                                <summary
                                                  data-tip="Add an OR condition to this requirement row (any condition in the row can satisfy it)."
                                                  aria-label="Add an OR condition to this requirement row (any condition in the row can satisfy it)."
                                                  style={{
                                                    width: 24,
                                                    height: 24,
                                                    borderRadius: 6,
                                                    border: "1px solid #e2e8f0",
                                                    background: "#f8fafc",
                                                    fontWeight: 700,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    cursor: "pointer",
                                                    listStyle: "none",
                                                  }}
                                                >
                                                  +
                                                </summary>
                                                <form action={addCondition} style={{ marginTop: 6, display: "grid", gap: 6 }} className="scorecard-condition-form">
                                                  <input type="hidden" name="tierId" value={tier.id} />
                                                  <input type="hidden" name="groupId" value={group.id} />
                                                  <div style={{ display: "grid", gap: 6 }}>
                                                    <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
                                                      <select name="preset" defaultValue="APPS_ALL" style={{ padding: 8 }}>
                                                        <option value="">Manual / Custom (advanced)</option>
                                                        <optgroup label="Apps">
                                                          <option value="APPS_ALL">All apps</option>
                                                          <option value="APPS_PC">P&amp;C apps</option>
                                                          <option value="APPS_FS">FS apps</option>
                                                          <option value="APPS_BUSINESS">Business apps</option>
                                                          <option value="APPS_PRODUCT">Specific product apps</option>
                                                        </optgroup>
                                                        <optgroup label="Premium">
                                                          <option value="PREMIUM_ALL">All premium</option>
                                                          <option value="PREMIUM_PC">P&amp;C premium</option>
                                                          <option value="PREMIUM_FS">FS premium</option>
                                                          <option value="PREMIUM_PRODUCT">Specific product premium</option>
                                                        </optgroup>
                                                        <optgroup label="Activity">
                                                          <option value="ACTIVITY_TYPES">Activity (selected types)</option>
                                                        </optgroup>
                                                      </select>
                                                      <select name="operator" defaultValue={ConditionOperator.GTE} style={{ padding: 8 }}>
                                                        <option value={ConditionOperator.GTE}>GTE (&gt;=)</option>
                                                        <option value={ConditionOperator.GT}>GT (&gt;)</option>
                                                        <option value={ConditionOperator.LTE}>LTE (&lt;=)</option>
                                                        <option value={ConditionOperator.LT}>LT (&lt;)</option>
                                                        <option value={ConditionOperator.EQ}>EQ (=)</option>
                                                      </select>
                                                      <input name="value" type="number" step="0.01" placeholder="Value" style={{ padding: 8 }} />
                                                      <button type="submit" style={{ padding: "8px 10px" }}>
                                                        Add OR condition
                                                      </button>
                                                    </div>
                                                    <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                                                      <label className="preset-product-fields" style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                                                        Specific products (only for specific product presets)
                                                        <select name="presetProductIds" multiple style={{ padding: 8 }}>
                                                          {products.map((p) => (
                                                            <option key={p.id} value={p.id}>
                                                              {p.name}
                                                            </option>
                                                          ))}
                                                        </select>
                                                      </label>
                                                      <label className="preset-activity-fields" style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                                                        Activity types (only for Activity count)
                                                        <select name="presetActivityTypeIds" multiple style={{ padding: 8 }}>
                                                          {activityTypes.map((activity) => (
                                                            <option key={activity.id} value={activity.id}>
                                                              {activity.name}
                                                            </option>
                                                          ))}
                                                        </select>
                                                      </label>
                                                    </div>
                                                    <style>{`
                                                      .scorecard-condition-form .preset-product-fields,
                                                      .scorecard-condition-form .preset-activity-fields {
                                                        display: none !important;
                                                      }
                                                      .scorecard-condition-form .preset-product-fields select,
                                                      .scorecard-condition-form .preset-activity-fields select {
                                                        pointer-events: none;
                                                        visibility: hidden;
                                                        height: 0;
                                                        max-height: 0;
                                                        overflow: hidden;
                                                      }
                                                      .scorecard-condition-form .preset-advanced-fields {
                                                        display: none !important;
                                                      }
                                                      .scorecard-condition-form:has(select[name="preset"] option[value="APPS_PRODUCT"]:checked) .preset-product-fields,
                                                      .scorecard-condition-form:has(select[name="preset"] option[value="PREMIUM_PRODUCT"]:checked) .preset-product-fields {
                                                        display: grid !important;
                                                      }
                                                      .scorecard-condition-form:has(select[name="preset"] option[value="APPS_PRODUCT"]:checked) .preset-product-fields select,
                                                      .scorecard-condition-form:has(select[name="preset"] option[value="PREMIUM_PRODUCT"]:checked) .preset-product-fields select {
                                                        pointer-events: auto;
                                                        visibility: visible;
                                                        height: auto;
                                                        max-height: none;
                                                      }
                                                      .scorecard-condition-form:has(select[name="preset"] option[value="ACTIVITY_TYPES"]:checked) .preset-activity-fields {
                                                        display: grid !important;
                                                      }
                                                      .scorecard-condition-form:has(select[name="preset"] option[value="ACTIVITY_TYPES"]:checked) .preset-activity-fields select {
                                                        pointer-events: auto;
                                                        visibility: visible;
                                                        height: auto;
                                                        max-height: none;
                                                      }
                                                      .scorecard-condition-form:has(select[name="preset"] option[value=""]:checked) .preset-advanced-fields {
                                                        display: block !important;
                                                      }
                                                    `}</style>
                                                  </div>
                                                  <details className="preset-advanced-fields">
                                                    <summary style={{ cursor: "pointer", fontSize: 12, color: "#475569" }}>Advanced</summary>
                                                    <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                                                      <div style={{ fontSize: 12, color: "#64748b" }}>
                                                        Only fill what applies to the selected preset.
                                                      </div>
                                                      <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                                                        <select name="bucketId" style={{ padding: 8 }}>
                                                          <option value="">Bucket (optional)</option>
                                                          {buckets.map((b) => (
                                                            <option key={b.id} value={b.id}>
                                                              {b.name}
                                                            </option>
                                                          ))}
                                                        </select>
                                                        <select name="premiumCategory" style={{ padding: 8 }}>
                                                          <option value="">Premium category (optional)</option>
                                                          {Object.values(PremiumCategory).map((pc) => (
                                                            <option key={pc} value={pc}>
                                                              {pc}
                                                            </option>
                                                          ))}
                                                        </select>
                                                        <select name="statusFilter" style={{ padding: 8 }}>
                                                          <option value="">Status (optional)</option>
                                                          {Object.values(PolicyStatus).map((s) => (
                                                            <option key={s} value={s}>
                                                              {s}
                                                            </option>
                                                          ))}
                                                        </select>
                                                      </div>
                                                    </div>
                                                  </details>
                                                </form>
                                              </details>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </>
                                    ) : null}
                                    {conditionGroups.length === 0 ? (
                                      <div style={{ marginTop: 6, display: "grid", gap: 6, fontSize: 12, color: "#475569" }}>
                                        <div>No requirement rows yet.</div>
                                        <form action={addConditionGroup} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                          <input type="hidden" name="tierId" value={tier.id} />
                                          <button
                                            type="submit"
                                            className="scorecard-add-row-plus"
                                            data-tip="Add a new requirement row (AND). All requirement rows must be met."
                                            style={{
                                              width: 24,
                                              height: 24,
                                              borderRadius: 6,
                                              border: "1px solid #e2e8f0",
                                              background: "#f8fafc",
                                              fontWeight: 700,
                                              lineHeight: "1",
                                              cursor: "pointer",
                                            }}
                                          >
                                            +
                                          </button>
                                        </form>
                                      </div>
                                    ) : null}
                                    {conditionGroups.length > 0 ? (
                                      <form action={addConditionGroup} style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                                        <input type="hidden" name="tierId" value={tier.id} />
                                        <button
                                          type="submit"
                                          className="scorecard-add-row-plus"
                                          data-tip="Add a new requirement row (AND). All requirement rows must be met."
                                          style={{
                                            width: 24,
                                            height: 24,
                                            borderRadius: 6,
                                            border: "1px solid #e2e8f0",
                                            background: "#f8fafc",
                                            fontWeight: 700,
                                            lineHeight: "1",
                                            cursor: "pointer",
                                          }}
                                        >
                                          +
                                        </button>
                                      </form>
                                    ) : null}
                                    <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                                      % reward uses bucket if selected, else premium category if selected, else total premium.
                                    </div>
                                    <details className="reward-details" style={{ marginTop: 6 }}>
                                      <summary
                                        aria-label="Add reward"
                                        style={{
                                          width: 24,
                                          height: 24,
                                          borderRadius: 6,
                                          border: "1px solid #e2e8f0",
                                          background: "#f8fafc",
                                          fontWeight: 700,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          cursor: "pointer",
                                        }}
                                      >
                                        +
                                      </summary>
                                      <form
                                        action={addReward}
                                        className="reward-form"
                                        style={{ marginTop: 6, display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
                                      >
                                        <input type="hidden" name="tierId" value={tier.id} />
                                        <select name="rewardPreset" defaultValue="MANUAL" style={{ padding: 8 }}>
                                          <option value="PCT_PREMIUM_ALL">% of premium (All)</option>
                                          <option value="PCT_PREMIUM_PC">% of premium (P&amp;C)</option>
                                          <option value="PCT_PREMIUM_FS">% of premium (FS)</option>
                                          <option value="FLAT_DOLLARS">Flat $</option>
                                          <option value="MANUAL">Manual (advanced)</option>
                                        </select>
                                        <select name="rewardType" style={{ padding: 8 }}>
                                          <option value={CompRewardType.ADD_PERCENT_OF_BUCKET}>Add % (bucket / premium)</option>
                                          <option value={CompRewardType.ADD_FLAT_DOLLARS}>Add $</option>
                                          <option value={CompRewardType.MULTIPLIER}>Multiplier</option>
                                        </select>
                                        <input
                                          name="percentValue"
                                          className="reward-percent-field"
                                          type="number"
                                          step="0.01"
                                          placeholder="% (if % type)"
                                          style={{ padding: 8 }}
                                        />
                                        <input
                                          name="dollarValue"
                                          className="reward-dollar-field"
                                          type="number"
                                          step="0.01"
                                          placeholder="$ (if flat)"
                                          style={{ padding: 8 }}
                                        />
                                        <select name="bucketId" style={{ padding: 8 }}>
                                          <option value="">Bucket</option>
                                          {buckets.map((b) => (
                                            <option key={b.id} value={b.id}>
                                              {b.name}
                                            </option>
                                          ))}
                                        </select>
                                        <select name="premiumCategory" style={{ padding: 8 }}>
                                          <option value="">Premium category</option>
                                          {Object.values(PremiumCategory).map((pc) => (
                                            <option key={pc} value={pc}>
                                              {pc}
                                            </option>
                                          ))}
                                        </select>
                                        <button type="submit" style={{ padding: "8px 10px" }}>Save reward</button>
                                      </form>
                                    </details>
                                    <style>{`
                                      .reward-form:has(select[name="rewardPreset"] option[value^="PCT_PREMIUM_"]:checked) .reward-dollar-field {
                                        display: none;
                                      }
                                      .reward-form:has(select[name="rewardPreset"] option[value="FLAT_DOLLARS"]:checked) .reward-percent-field {
                                        display: none;
                                      }
                                    `}</style>
                                  </div>
                                );
                              })}
                              <form action={addScorecardTier} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <input type="hidden" name="bonusModuleId" value={bm.id} />
                                <input name="name" placeholder="Add tier name" style={{ padding: 8 }} />
                                <button type="submit" style={{ padding: "8px 10px" }}>Add tier</button>
                              </form>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ Add Bonus Module</summary>
                      <form action={addBonusModule} style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                        <input name="name" placeholder="Module name" style={{ padding: 10 }} />
                        <select name="bonusType" style={{ padding: 10 }}>
                          <option value={CompBonusType.SCORECARD_TIER}>Scorecard tiers</option>
                          <option value={CompBonusType.GOAL_BONUS}>Goal bonus</option>
                          <option value={CompBonusType.ACTIVITY_BONUS}>Activity bonus</option>
                          <option value={CompBonusType.WTD_BONUS}>WTD bonus</option>
                          <option value={CompBonusType.PRODUCT_BONUS}>Product bonus</option>
                          <option value={CompBonusType.CUSTOM}>Custom</option>
                        </select>
                        <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
                          Save module
                        </button>
                      </form>
                    </details>
                  </section>
                </>
              ) : null}
              {section === "assign" ? (
                <section>
                  <h2 style={{ marginTop: 0 }}>Assignments</h2>
                  <div style={{ display: "grid", gap: 6 }}>
                    {plan.assignments.map((a) => (
                      <div key={a.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                        {a.scopeType} • {a.scopeId || "all"} • Effective {a.effectiveStartMonth || "current"}
                      </div>
                    ))}
                  </div>
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ Add Assignment</summary>
                        <form action={addAssignment} style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                          <label>
                            Scope type
                        <select name="scopeType" style={{ padding: 10, width: "100%" }}>
                          <option value={CompAssignmentScope.PERSON}>Person</option>
                          <option value={CompAssignmentScope.ROLE}>Role</option>
                          <option value={CompAssignmentScope.TEAM}>Team</option>
                          <option value={CompAssignmentScope.TEAM_TYPE}>Team type</option>
                          <option value={CompAssignmentScope.AGENCY}>Agency</option>
                        </select>
                      </label>
                      <label>
                        Scope value
                        <select name="scopeId" style={{ padding: 10, width: "100%" }}>
                          <option value="">(none)</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              Person: {p.fullName}
                            </option>
                          ))}
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              Team: {t.name}
                            </option>
                          ))}
                          {teams.flatMap((t) =>
                            t.roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                Role: {t.name} / {r.name}
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                      <label>
                        Effective start month
                        <input name="effectiveStartMonth" type="month" style={{ padding: 10, width: "100%" }} />
                      </label>
                      <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
                        Save assignment
                      </button>
                    </form>
                  </details>
                </section>
              ) : null}
              {section === "preview" ? (
                <section>
                  <h2 style={{ marginTop: 0 }}>Preview / Test</h2>
                  <form action={preview} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                    <label>
                      Person
                      <select name="personId" style={{ padding: 10, width: "100%" }}>
                        <option value="">Select</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Month (YYYY-MM)
                      <input name="month" placeholder="2025-01" style={{ padding: 10, width: "100%" }} />
                    </label>
                    <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
                      Run Preview
                    </button>
                  </form>
                  {previewResult ? (
                    <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                      <div style={{ fontWeight: 700 }}>Preview for {sp.previewMonth}</div>
                      {previewResult.unmappedSoldCount > 0 ? (
                        <div
                          style={{
                            color: "#b45309",
                            background: "#fef3c7",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid #fcd34d",
                            fontSize: 13,
                          }}
                        >
                          Data integrity: {previewResult.unmappedSoldCount} sold records reference products not found in this agency catalog and may be excluded from calculations.
                        </div>
                      ) : null}
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <div>Base: ${previewResult.baseEarnings.toFixed(2)}</div>
                        <div>Bonus: ${previewResult.bonusEarnings.toFixed(2)}</div>
                        <div>Total: ${previewResult.totalEarnings.toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Base breakdown</div>
                        {(previewResult.breakdown.baseResults || []).map((r) => (
                          <div key={r.ruleId} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                            <div style={{ fontWeight: 600 }}>{r.detail}</div>
                            <div style={{ color: "#111" }}>${r.amount.toFixed(2)}</div>
                            {r.records?.length ? (
                              <details style={{ marginTop: 4 }}>
                                <summary style={{ cursor: "pointer", fontSize: 13 }}>Show records ({r.records.length})</summary>
                                <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                                  {r.records.slice(0, 10).map((rec, idx) => (
                                    <div key={idx} style={{ fontSize: 12, color: "#555" }}>
                                      {rec.product} • ${rec.premium.toFixed(2)} • {rec.status} • {rec.dateSold}
                                    </div>
                                  ))}
                                  {r.records.length > 10 ? <div style={{ fontSize: 12, color: "#888" }}>+{r.records.length - 10} more…</div> : null}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      <div>
                        {(() => {
                          const bonusDetails = previewResult.breakdown.bonusDetails || [];
                          const activityBonuses = bonusDetails.filter((b) => b.name.includes("Activity"));
                          const otherBonuses = bonusDetails.filter((b) => !b.name.includes("Activity"));
                          return (
                            <div style={{ display: "grid", gap: 8 }}>
                              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>Scorecard & Plan Bonuses</div>
                                {otherBonuses.map((b, idx) => (
                                  <div key={`other-${idx}`} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                                    <div>{b.name}</div>
                                    <div>${b.amount.toFixed(2)}</div>
                                  </div>
                                ))}
                                {otherBonuses.length === 0 ? <div style={{ color: "#555" }}>No bonuses earned.</div> : null}
                              </div>
                              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>Activity Bonuses</div>
                                {activityBonuses.map((b, idx) => (
                                  <div key={`activity-${idx}`} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                                    <div>{b.name}</div>
                                    <div>${b.amount.toFixed(2)}</div>
                                  </div>
                                ))}
                                {activityBonuses.length === 0 ? <div style={{ color: "#555" }}>No bonuses earned.</div> : null}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
          </div>

            {section === "lob" ? (
              <ProductSidebarClient
                products={products.map((p) => ({
                  id: p.id,
                  name: p.name,
                  usage: productUsage.get(p.id) || 0,
                  lobName: p.lobName,
                }))}
                lobName={selectedLob?.name}
              />
            ) : (
              <div style={{ width: 260 }} />
            )}
          </section>
        </PlanBuilderSelectionProvider>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function fmtMoneyNumber(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtPercentNumber(n: number): string {
  return `${n.toFixed(2)}%`;
}

function ruleSummary(rb: RuleBlockExpanded) {
  const apply = (rb.applyFilters as ApplyFilters) || {};
  let scopeDetail = "";
  if (rb.applyScope === "PRODUCT" && apply.productIds?.length) {
    scopeDetail = `products (${apply.productIds.length})`;
  } else if (rb.applyScope === "LOB" && apply.lobIds?.length) {
    scopeDetail = `LoBs (${apply.lobIds.length})`;
  } else if (rb.applyScope === "PRODUCT_TYPE" && apply.productTypes?.length) {
    scopeDetail = `types: ${apply.productTypes.join(", ")}`;
  } else if (rb.applyScope === "PREMIUM_CATEGORY" && apply.premiumCategories?.length) {
    scopeDetail = `premium: ${apply.premiumCategories.join(", ")}`;
  } else if (rb.applyScope === "BUCKET") {
    scopeDetail = "bucket";
  } else {
    scopeDetail = "scope not set";
  }

  const baseValue = rb.basePayoutValue ?? 0;
  const payout =
    rb.payoutType === "FLAT_PER_APP"
      ? `${fmtMoneyNumber(baseValue)}/app`
      : rb.payoutType === "PERCENT_OF_PREMIUM"
        ? `${fmtPercentNumber(baseValue)} of premium`
        : `${fmtMoneyNumber(baseValue)} lump sum`;

  const tierLabel =
    rb.tierMode === "TIERS" && rb.tierBasis
      ? ` • tiered on ${rb.tierBasis === "APP_COUNT" ? "app count" : rb.tierBasis === "PREMIUM_SUM" ? "premium" : "bucket"}`
      : "";
  const thresholdLabel = rb.minThreshold ? ` • min ${rb.minThreshold}` : "";

  return `${payout} for ${scopeDetail}${tierLabel}${thresholdLabel}`;
}

function payoutUnitLabel(payoutType: CompPayoutType) {
  if (payoutType === CompPayoutType.PERCENT_OF_PREMIUM) return "% premium";
  if (payoutType === CompPayoutType.FLAT_PER_APP) return "/app";
  return "lump sum";
}

type RuleBlockExpanded = Prisma.CompPlanRuleBlockGetPayload<{ include: { tiers: true } }>;
type SoldWithMeta = Prisma.SoldProductGetPayload<{ include: { product: { include: { lineOfBusiness: true } }; household: true } }>;
type ProductMeta = { lob: { id: string; name: string; premiumCategory: PremiumCategory }; product: { id: string; name: string; productType: string } };

async function computePreview(planId: string, planVersionId: string, personId: string, month: string) {
  const plan = await prisma.compPlan.findUnique({
    where: { id: planId },
    include: {
      versions: {
        where: { id: planVersionId },
        include: {
          ruleBlocks: { include: { tiers: true } },
          gates: true,
          bonusModules: {
            include: {
              scorecardTiers: {
                include: { conditionGroups: { include: { conditions: true }, orderBy: { orderIndex: "asc" } }, conditions: true, rewards: true },
              },
            },
          },
        },
      },
      agency: { include: { linesOfBusiness: { include: { products: true } }, premiumBuckets: true } },
    },
  });
  if (!plan || !plan.versions[0]) {
    return { baseEarnings: 0, bonusEarnings: 0, totalEarnings: 0, breakdown: {}, bucketValues: {} };
  }
  // honor assignment effective start month (person scope; extend later for role/team)
  const assignment = await prisma.compPlanAssignment.findFirst({
    where: { planId, scopeType: CompAssignmentScope.PERSON, scopeId: personId, active: true },
    orderBy: { effectiveStartMonth: "desc" },
  });

  const version = plan.versions[0];
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  if (assignment?.effectiveStartMonth) {
    const eff = new Date(`${assignment.effectiveStartMonth}-01T00:00:00Z`);
    if (start < eff) {
      return {
        baseEarnings: 0,
        bonusEarnings: 0,
        totalEarnings: 0,
        bucketValues: {},
        breakdown: { baseResults: [{ ruleId: "info", amount: 0, detail: "Assignment not effective for this month." }] },
      };
    }
  }

  const sold = await prisma.soldProduct.findMany({
    where: {
      soldByPersonId: personId,
      dateSold: { gte: start, lt: end },
      ...(plan.agencyId ? { agencyId: plan.agencyId } : {}),
    },
    include: { product: { include: { lineOfBusiness: true } }, household: true },
  });

  const defaultStatuses = plan.defaultStatusEligibility.length ? plan.defaultStatusEligibility : [PolicyStatus.ISSUED, PolicyStatus.PAID];

  // bucket values
  const bucketValues: Record<string, number> = {};
  const productsById = new Map<string, ProductMeta>(
    plan.agency?.linesOfBusiness.flatMap((lob) =>
      lob.products.map((p) => [
        p.id,
        { lob: { id: lob.id, name: lob.name, premiumCategory: lob.premiumCategory }, product: { id: p.id, name: p.name, productType: p.productType } },
      ])
    ) || []
  );
  const unmappedSoldCount = sold.filter((s) => !productsById.get(s.productId)).length;

  const premiumBuckets = plan.agency?.premiumBuckets || [];
  for (const bucket of premiumBuckets) {
    const excludesProducts = (bucket as any).excludesProducts || [];
    const excludesLobs = (bucket as any).excludesLobs || [];
    const value = sold
      .filter((s) => defaultStatuses.includes(s.status))
      .filter((s) => {
        const meta = productsById.get(s.productId);
        if (!meta) return false;
        if (excludesProducts.includes(meta.product.name)) return false;
        if (excludesLobs.includes(meta.lob.name)) return false;
        if (bucket.includesProducts.includes(meta.product.name)) return true;
        if (bucket.includesLobs.includes(meta.lob.name)) return true;
        return false;
      })
      .reduce((sum, s) => sum + s.premium, 0);
    bucketValues[bucket.id] = value;
  }

  const baseResults: { ruleId: string; amount: number; detail: string }[] = [];
  let baseTotal = 0;

  for (const rb of version.ruleBlocks) {
    const statuses = rb.statusEligibilityOverride.length ? rb.statusEligibilityOverride : defaultStatuses;
    const scoped = sold.filter((s) => statuses.includes(s.status)).filter((s) => matchesScope(rb, s, productsById, bucketValues));
    const appCount = scoped.length;
    const premiumSum = scoped.reduce((sum, s) => sum + s.premium, 0);
    const basisValue =
      rb.tierBasis === CompTierBasis.APP_COUNT
        ? appCount
        : rb.tierBasis === CompTierBasis.BUCKET_VALUE && rb.bucketId
          ? bucketValues[rb.bucketId] || 0
          : premiumSum;

    if (rb.minThreshold != null && basisValue < rb.minThreshold) {
      baseResults.push({
        ruleId: rb.id,
        amount: 0,
        detail: `${ruleSummary(rb)} | below threshold (${basisValue} < ${rb.minThreshold})`,
      });
      continue;
    }

    let rate = rb.basePayoutValue || 0;
    if (rb.tierMode === CompTierMode.TIERS) {
      const tier = rb.tiers.find((t) => basisValue >= t.minValue && (t.maxValue === null || basisValue <= t.maxValue));
      if (tier) rate = tier.payoutValue;
    }

    let amount = 0;
    if (rb.payoutType === CompPayoutType.FLAT_PER_APP) amount = rate * appCount;
    else if (rb.payoutType === CompPayoutType.PERCENT_OF_PREMIUM) amount = (rate / 100) * premiumSum;
    else amount = rate;

    baseResults.push({ ruleId: rb.id, amount, detail: `${ruleSummary(rb)} | apps ${appCount} | premium ${premiumSum}` });
    baseTotal += amount;
  }

  // Gates (simple: if unmet zero the affected amounts)
  for (const gate of version.gates) {
    if (!gate.enabled) continue;
    let metric = 0;
    if (gate.gateType === CompGateType.MIN_APPS) {
      metric = sold.length;
    } else if (gate.gateType === CompGateType.MIN_PREMIUM) {
      metric = sold.reduce((sum, s) => sum + s.premium, 0);
    } else if (gate.gateType === CompGateType.MIN_BUCKET && gate.bucketId) {
      metric = bucketValues[gate.bucketId] || 0;
    }
    if (metric < gate.thresholdValue) {
      if (gate.scope === CompGateScope.PLAN) {
        baseTotal = 0;
        baseResults.forEach((r) => (r.amount = 0));
      } else if (gate.scope === CompGateScope.RULE_BLOCKS) {
        baseResults
          .filter((r) => gate.ruleBlockIds.includes(r.ruleId))
          .forEach((r) => {
            baseTotal -= r.amount;
            r.amount = 0;
          });
      }
    }
  }

  // Bonuses (scorecard only)
  let bonusTotal = 0;
  const bonusDetails: { name: string; amount: number }[] = [];
  const activityCountCache = new Map<string, number>();
  const activityCacheKeyPrefix = `${personId}|${start.toISOString()}|${end.toISOString()}`;
  for (const bm of version.bonusModules) {
    if (bm.bonusType !== CompBonusType.SCORECARD_TIER) continue;
    const achieved: { tier: string; amount: number }[] = [];
    for (const tier of bm.scorecardTiers) {
      const conditionMet = async (cond: (typeof tier.conditions)[number]) => {
        let value = 0;
        const filters = (cond.filters as any) || {};
        const productIds: string[] = Array.isArray(filters.productIds) ? filters.productIds : [];
        const lobIds: string[] = Array.isArray(filters.lobIds) ? filters.lobIds : [];
        const activityTypeIds: string[] = Array.isArray(filters.activityTypeIds) ? filters.activityTypeIds : [];
        const statusFilter = cond.statusFilter ? (s: SoldWithMeta) => s.status === cond.statusFilter : (s: SoldWithMeta) => defaultStatuses.includes(s.status);
        let scopedSold = sold.filter((s) => statusFilter(s));
        if (productIds.length) {
          scopedSold = scopedSold.filter((s) => productIds.includes(s.productId));
        } else if (lobIds.length) {
          scopedSold = scopedSold.filter((s) => {
            const meta = productsById.get(s.productId);
            return meta ? lobIds.includes(meta.lob.id) : false;
          });
        }
        if (cond.metricSource === "BUCKET" && cond.bucketId) {
          value = bucketValues[cond.bucketId] || 0;
        } else if (cond.metricSource === "PREMIUM_CATEGORY") {
          const targetCategory = cond.premiumCategory as PremiumCategory | null;
          value = targetCategory
            ? scopedSold
                .reduce((sum, s) => {
                  const meta = productsById.get(s.productId);
                  if (!meta) return sum;
                  return meta.lob.premiumCategory === targetCategory ? sum + s.premium : sum;
                }, 0)
            : 0;
        } else if (cond.metricSource === "APPS_COUNT") {
          value = scopedSold.length;
        } else if (cond.metricSource === CompMetricSource.TOTAL_PREMIUM) {
          value = scopedSold.reduce((sum, sp) => sum + (sp.premium ?? 0), 0);
        } else if (cond.metricSource === "ACTIVITY") {
          const activityTypeIdsSorted = [...activityTypeIds].filter((id) => id).sort();
          const cacheKey = `${activityCacheKeyPrefix}|${activityTypeIdsSorted.join(",") || "ALL"}`;
          if (!activityCountCache.has(cacheKey)) {
            const count = await prisma.activityEvent.count({
              where: {
                personId,
                occurredAt: { gte: start, lt: end },
                ...(activityTypeIdsSorted.length ? { activityTypeId: { in: activityTypeIdsSorted } } : {}),
              },
            });
            activityCountCache.set(cacheKey, count);
          }
          value = activityCountCache.get(cacheKey) || 0;
        }
        switch (cond.operator) {
          case ConditionOperator.GTE:
            return value >= cond.value;
          case ConditionOperator.GT:
            return value > cond.value;
          case ConditionOperator.LTE:
            return value <= cond.value;
          case ConditionOperator.LT:
            return value < cond.value;
          case ConditionOperator.EQ:
            return value === cond.value;
          default:
            return false;
        }
      };
      let conditionsMet = false;
      if (tier.conditionGroups?.length) {
        conditionsMet = true;
        for (const group of tier.conditionGroups) {
          let groupMet = group.mode === "ALL";
          for (const cond of group.conditions) {
            const ok = await conditionMet(cond);
            if (group.mode === "ALL") groupMet = groupMet && ok;
            else groupMet = groupMet || ok;
          }
          if (!groupMet) {
            conditionsMet = false;
            break;
          }
        }
      } else {
        conditionsMet = tier.requiresAllConditions;
        for (const cond of tier.conditions) {
          const ok = await conditionMet(cond);
          if (tier.requiresAllConditions) conditionsMet = conditionsMet && ok;
          else conditionsMet = conditionsMet || ok;
        }
      }
      if (conditionsMet) {
        let rewardAmount = 0;
        for (const r of tier.rewards) {
          if (r.rewardType === CompRewardType.ADD_FLAT_DOLLARS && r.dollarValue) rewardAmount += r.dollarValue;
          if (r.rewardType === CompRewardType.ADD_PERCENT_OF_BUCKET && r.percentValue) {
            if (r.bucketId) {
              rewardAmount += (r.percentValue / 100) * (bucketValues[r.bucketId] || 0);
            } else if (r.premiumCategory) {
              const categoryPremium = sold
                .filter((s) => defaultStatuses.includes(s.status))
                .reduce((sum, s) => {
                  const meta = productsById.get(s.productId);
                  if (!meta) return sum;
                  return meta.lob.premiumCategory === r.premiumCategory ? sum + s.premium : sum;
                }, 0);
              rewardAmount += (r.percentValue / 100) * categoryPremium;
            } else {
              const totalPremium = sold.filter((s) => defaultStatuses.includes(s.status)).reduce((sum, s) => sum + s.premium, 0);
              rewardAmount += (r.percentValue / 100) * totalPremium;
            }
          }
          if (r.rewardType === CompRewardType.MULTIPLIER && r.percentValue) {
            rewardAmount += baseTotal * (r.percentValue - 1);
          }
        }
        achieved.push({ tier: tier.name, amount: rewardAmount });
      }
    }
    if (achieved.length) {
      const winner = bm.highestTierWins ? achieved[achieved.length - 1] : { tier: achieved.map((a) => a.tier).join(", "), amount: achieved.reduce((s, a) => s + a.amount, 0) };
      bonusTotal += winner.amount;
      bonusDetails.push({ name: `${bm.name} (${winner.tier})`, amount: winner.amount });
    }
  }

  const totalEarnings = baseTotal + bonusTotal;
  return { baseEarnings: baseTotal, bonusEarnings: bonusTotal, totalEarnings, bucketValues, breakdown: { baseResults, bonusDetails }, unmappedSoldCount };
}

function matchesScope(
  rb: RuleBlockExpanded,
  s: SoldWithMeta,
  productsById: Map<string, ProductMeta>,
  bucketValues: Record<string, number>
) {
  type ApplyFilters = { productIds?: string[]; lobIds?: string[]; productTypes?: string[]; premiumCategories?: string[] };
  const apply = (rb.applyFilters as ApplyFilters) || {};
  const meta = productsById.get(s.productId);
  if (!meta) return false;
  if (rb.applyScope === CompApplyScope.PRODUCT && apply?.productIds?.length) {
    return apply.productIds.includes(s.productId);
  }
  if (rb.applyScope === CompApplyScope.LOB && apply?.lobIds?.length) {
    return apply.lobIds.includes(meta.lob.id);
  }
  if (rb.applyScope === CompApplyScope.PRODUCT_TYPE && apply?.productTypes?.length) {
    return apply.productTypes.includes(meta.product.productType);
  }
  if (rb.applyScope === CompApplyScope.PREMIUM_CATEGORY && apply?.premiumCategories?.length) {
    return apply.premiumCategories.includes(meta.lob.premiumCategory);
  }
  if (rb.applyScope === CompApplyScope.BUCKET && rb.bucketId) {
    return (bucketValues[rb.bucketId] || 0) > 0;
  }
  return true;
}

function ruleWarnings(rb: RuleBlockExpanded) {
  const warnings: string[] = [];
  if (rb.payoutType === CompPayoutType.PERCENT_OF_PREMIUM && (rb.basePayoutValue || 0) > 30) {
    warnings.push("Percent over 30% — double-check if intended.");
  }
  if (rb.payoutType !== CompPayoutType.PERCENT_OF_PREMIUM && (rb.basePayoutValue || 0) < 0) {
    warnings.push("Payout must be >= 0.");
  }
  if (rb.tierMode === CompTierMode.TIERS) {
    if (!rb.tiers.length) warnings.push("Tiering enabled but no tiers defined.");
    const sorted = [...rb.tiers].sort((a, b) => a.minValue - b.minValue);
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      if (t.minValue < 0) warnings.push("Tier min must be >= 0.");
      if (t.maxValue !== null && t.maxValue <= t.minValue) warnings.push("Tier max must be > min.");
      if (i > 0) {
        const prev = sorted[i - 1];
        if (prev.maxValue === null || prev.maxValue >= t.minValue) {
          warnings.push(
            `Tier ${i} (${prev.minValue}-${prev.maxValue ?? "∞"}) overlaps Tier ${i + 1} (${t.minValue}-${t.maxValue ?? "∞"}). Set the previous max below the next min.`
          );
        }
      }
    }
  }
  return warnings.length ? (
    <div style={{ marginTop: 6, color: "#b45309", background: "#fef3c7", padding: "6px 8px", borderRadius: 8, border: "1px solid #fcd34d", fontSize: 13 }}>
      {warnings.map((w, i) => (
        <div key={i}>• {w}</div>
      ))}
    </div>
  ) : null;
}
