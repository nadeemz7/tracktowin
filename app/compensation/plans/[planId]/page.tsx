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
import ScorecardReorderClient from "./ScorecardReorderClient";

type Params = { params: Promise<{ planId: string }>; searchParams?: Promise<Record<string, string | undefined>> };

export default async function CompPlanDetailPage({ params, searchParams }: Params) {
  const sp = (await searchParams) || {};
  const rawSection = sp.section || "lob";
  const section = rawSection === "buckets" ? "lob" : rawSection;
  const bonusTab =
    sp.bonusTab === "bonuses" || sp.bonusTab === "subtractors" || sp.bonusTab === "scorecards" ? sp.bonusTab : "scorecards";
  const selectedLobId = sp.lob || undefined;
  const openBm = typeof sp.openBm === "string" ? sp.openBm : "";
  const { planId } = await params;
  const redirectLobParam = selectedLobId ? `&lob=${selectedLobId}` : "";
  const bonusesBaseUrl = `?section=bonuses${redirectLobParam}`;
  const scorecardsReturnUrl = `/compensation/plans/${planId}?section=bonuses&bonusTab=scorecards${redirectLobParam}`;
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
  const gateErrMessage =
    sp.gateErr === "missing_fields"
      ? "Gate requires a name, type, threshold, behavior, and scope."
      : sp.gateErr === "missing_rule_blocks"
        ? "Select at least one rule block when scope is set to Specific rule blocks."
      : sp.gateErr === "update_failed"
        ? "We could not update this gate. Try again."
        : sp.gateErr === "create_failed"
          ? "We could not add this gate. Try again."
          : sp.gateErr === "delete_failed"
            ? "We could not delete this gate. Try again."
            : "";
  const gateSuccessMessage =
    sp.gateMsg === "created" ? "Gate added." : sp.gateMsg === "updated" ? "Gate updated." : sp.gateMsg === "deleted" ? "Gate deleted." : "";
  const bonusErrMessage =
    sp.bonusErr === "missing_fields"
      ? "Bonus name, payout type, and at least one tier are required."
      : sp.bonusErr === "invalid_tiers"
        ? "Each tier needs a positive min and payout, and max must be >= min."
        : sp.bonusErr === "overlap_tiers"
          ? "Tier thresholds overlap. Adjust the ranges so each tier is distinct."
        : sp.bonusErr === "invalid_conditions"
          ? "Bonus rules need a name, metric, operator, and positive value."
          : sp.bonusErr === "update_failed"
            ? "We could not update this bonus. Try again."
            : sp.bonusErr === "create_failed"
              ? "We could not create this bonus. Try again."
          : "";
  const bonusMsgMessage =
    sp.bonusMsg === "bonus_created"
      ? "Bonus saved."
      : sp.bonusMsg === "rules_saved"
        ? "Bonus rules updated successfully."
        : sp.bonusMsg === "rule_deleted"
          ? "Bonus rule deleted."
          : sp.bonusMsg === "rule_restored"
            ? "Bonus rule restored."
            : "";
  const bonusModuleErrMessage =
    sp.bonusModuleErr === "missing_fields"
      ? "Bonus module name and type are required."
      : sp.bonusModuleErr === "invalid_scorecard"
        ? "Scorecard condition needs a metric, operator, and positive value."
      : sp.bonusModuleErr === "invalid_custom"
        ? "Custom bonus needs a valid value."
        : sp.bonusModuleErr === "create_failed"
          ? "We could not create this bonus module. Try again."
          : sp.bonusModuleErr === "delete_failed"
            ? "We could not delete this bonus module. Try again."
            : "";
  const bonusModuleMsgMessage =
    sp.bonusModuleMsg === "created"
      ? "Bonus module created successfully."
      : sp.bonusModuleMsg === "deleted"
        ? "Bonus module deleted."
        : "";
  const subtractorErrMessage =
    sp.subtractorErr === "missing_fields"
      ? "Subtractor name, operator, and value are required."
      : sp.subtractorErr === "invalid_value"
        ? "Subtractor value must be a positive number."
        : sp.subtractorErr === "create_failed"
          ? "We could not create this subtractor. Try again."
          : sp.subtractorErr === "update_failed"
            ? "We could not update this subtractor. Try again."
            : "";
  const subtractorMsgMessage =
    sp.subtractorMsg === "created" ? "Subtractor saved." : sp.subtractorMsg === "updated" ? "Subtractor updated." : "";
  const bonusUndoPayload = typeof sp.undoRule === "string" ? sp.undoRule : "";
  const bonusFormOpen = sp.bonusForm === "open" || Boolean(bonusErrMessage);
  const bonusModuleFormOpen = sp.bonusModuleForm === "open" || Boolean(bonusModuleErrMessage);
  const subtractorFormOpen = sp.subtractorForm === "open" || (Boolean(subtractorErrMessage) && !openBm);
  const bonusRuleMetricValues = new Set(["APPS_COUNT", "TOTAL_PREMIUM", "PREMIUM_CATEGORY", "ACTIVITY"]);
  const bonusRuleOperatorValues = new Set([">=", ">", "<=", "<", "="]);
  const subtractorOperatorValues = new Set(["SUBTRACT", "REMOVE"]);
  const specialRuleErr = typeof sp.specialRuleErr === "string" ? sp.specialRuleErr : "";
  const specialRuleErrRuleId = typeof sp.specialRuleId === "string" ? sp.specialRuleId : "";
  function specialRuleErrMessage(code: string): string {
    if (code === "MISSING_LOB") return "Missing line of business. Please re-open this LoB and try again.";
    if (code === "NAME_REQUIRED") return "Please enter a rule name.";
    if (code === "PRODUCTS_REQUIRED") return "Please select at least one product.";
    if (code === "BAD_THRESHOLD") return "Please enter a valid premium threshold (0 or more).";
    if (code === "BAD_PAYOUT") return "Please enter a valid payout value.";
    if (code === "PERCENT_OVER_100") return "Percent payout cannot be greater than 100%.";
    return "";
  }
  const specialRuleErrMessageText = specialRuleErrMessage(specialRuleErr);
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
  const bonusEditId = bonusTab === "bonuses" ? openBm : "";
  const bonusToEdit =
    bonusEditId && version
      ? (version.bonusModules || []).find((bm) => bm.id === bonusEditId && bm.bonusType === CompBonusType.GOAL_BONUS)
      : null;
  const bonusEditConfig =
    bonusToEdit?.config && typeof bonusToEdit.config === "object" && !Array.isArray(bonusToEdit.config)
      ? (bonusToEdit.config as Record<string, unknown>)
      : {};
  const bonusEditConditions = Array.isArray(bonusEditConfig.conditions) ? (bonusEditConfig.conditions as Record<string, unknown>[]) : [];
  const bonusEditTiers = Array.isArray(bonusEditConfig.tiers) ? (bonusEditConfig.tiers as Record<string, unknown>[]) : [];
  const bonusEditConditionRows = Math.max(3, bonusEditConditions.length || 0);
  const bonusEditTierRows = Math.max(3, bonusEditTiers.length || 0);
  const agencyId = plan.agencyId || undefined;
  const activityTypes = await prisma.activityType.findMany({
    where: agencyId ? { agencyId, active: true } : { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const activityTypeNameById = new Map(activityTypes.map((activity) => [activity.id, activity.name]));

  const summarizeSubtractor = (config: SubtractorConfig) => {
    const value = typeof config.value === "number" && Number.isFinite(config.value) ? config.value : null;
    const operator = config.operator === "REMOVE" ? "REMOVE" : "SUBTRACT";
    const penalty =
      value == null
        ? "penalty not set"
        : operator === "REMOVE"
          ? "remove $" + value + " from earnings"
          : "subtract " + value + "% of earnings";
    const groups = Array.isArray(config.conditionGroups) ? config.conditionGroups : [];
    const conditionsText = groups.length
      ? groups
          .map((group) => {
            const conditions = Array.isArray(group.conditions) ? group.conditions : [];
            if (!conditions.length) return "at least ...";
            return conditions
              .map((cond) => {
                const metric = cond.metric || "APP_COUNT";
                let numericValue = typeof cond.value === "number" && Number.isFinite(cond.value) ? cond.value : null;
                if (metric === "ACTIVITY") {
                  const activityValue =
                    typeof cond.activityThreshold === "number" && Number.isFinite(cond.activityThreshold)
                      ? cond.activityThreshold
                      : numericValue;
                  numericValue = activityValue;
                }
                const valueText = numericValue == null ? "..." : String(numericValue);
                let text = "at least " + valueText;
                if (metric === "APP_COUNT") {
                  text += " apps";
                } else if (metric === "PREMIUM") {
                  text = "at least $" + valueText + " premium";
                  const scopeSuffix =
                    cond.scope === "PC" ? "P&C" : cond.scope === "FS" ? "FS" : cond.scope === "BUSINESS" ? "Business" : "";
                  if (scopeSuffix) text += " (" + scopeSuffix + ")";
                } else if (metric === "ACTIVITY") {
                  text += " activity";
                  if (cond.activityTypeId) {
                    const activityName = activityTypeNameById.get(cond.activityTypeId) || "";
                    if (activityName) text += " (" + activityName + ")";
                  }
                }
                return text;
              })
              .join(" OR ");
          })
          .join(" AND ")
      : "at least ...";
    return "If minimums are not met: " + penalty + ". Requires: " + conditionsText + ".";
  };

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
  const sortedProducts = [...products].sort((a, b) => {
    const lobA = a.lobName || "";
    const lobB = b.lobName || "";
    if (lobA !== lobB) return lobA.localeCompare(lobB);
    return a.name.localeCompare(b.name);
  });
  const sortedLobs = [...lobs].sort((a, b) => a.name.localeCompare(b.name));
  const scorecardModulesRaw = (version?.bonusModules || []).filter((bm) => bm.bonusType === CompBonusType.SCORECARD_TIER);
  const scorecardModulesOrdered = scorecardModulesRaw
    .map((bm, index) => {
      const configValue = bm.config;
      const orderValue =
        configValue && typeof configValue === "object" && !Array.isArray(configValue)
          ? (configValue as { orderIndex?: unknown }).orderIndex
          : undefined;
      const orderIndex = typeof orderValue === "number" && Number.isFinite(orderValue) ? orderValue : index;
      return { bm, orderIndex, fallbackIndex: index };
    })
    .sort((a, b) => (a.orderIndex === b.orderIndex ? a.fallbackIndex - b.fallbackIndex : a.orderIndex - b.orderIndex))
    .map(({ bm }) => bm);
  const subtractorModules = (version?.bonusModules || []).filter((bm) => bm.bonusType === CompBonusType.CUSTOM);
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

  const teams = await prisma.team.findMany({ orderBy: { name: "asc" }, include: { roles: true } });
  const people = await prisma.person.findMany({
    where: agencyId ? { primaryAgencyId: agencyId } : {},
    orderBy: { fullName: "asc" },
    include: { team: true, role: true },
  });
  const selectedLob = lobs.find((l) => l.id === selectedLobId) || lobs[0] || null;

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
    const redirectHash = String(formData.get("redirectHash") || "").trim();
    const tierEditIds = formData.getAll("tierEditId").map(String);
    const tierEditMins = formData.getAll("tierEditMin").map((value) => String(value));
    const tierEditMaxs = formData.getAll("tierEditMax").map((value) => String(value));
    const tierEditPayouts = formData.getAll("tierEditPayout").map((value) => String(value));
    const tierEdits = tierEditIds
      .map((id, index) => {
        const minRaw = (tierEditMins[index] || "").trim();
        const maxRaw = (tierEditMaxs[index] || "").trim();
        const payoutRaw = (tierEditPayouts[index] || "").trim();
        const minValue = minRaw === "" ? null : Number(minRaw);
        const maxValue = maxRaw === "" ? null : Number(maxRaw);
        const payoutValue = payoutRaw === "" ? null : Number(payoutRaw);
        return { id, minValue, maxValue, payoutValue, minRaw, maxRaw, payoutRaw };
      })
      .filter((edit) => edit.id);
    let tierEditErr: "bad_tier_input" | "invalid_tier_rows" | "" = "";
    const cleanedTierEdits: { id: string; minValue: number; maxValue: number | null; payoutValue: number }[] = [];
    for (const edit of tierEdits) {
      if (edit.minValue == null || Number.isNaN(edit.minValue) || edit.payoutValue == null || Number.isNaN(edit.payoutValue)) {
        tierEditErr = "bad_tier_input";
        break;
      }
      if (edit.maxRaw && (edit.maxValue == null || Number.isNaN(edit.maxValue))) {
        tierEditErr = "bad_tier_input";
        break;
      }
      if (edit.maxValue != null && edit.maxValue < edit.minValue) {
        tierEditErr = "invalid_tier_rows";
        break;
      }
      cleanedTierEdits.push({
        id: edit.id,
        minValue: edit.minValue,
        maxValue: edit.maxValue == null || Number.isNaN(edit.maxValue) ? null : edit.maxValue,
        payoutValue: edit.payoutValue,
      });
    }

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

    if (tierEditErr) {
      const dest = `/compensation/plans/${planId}?section=${section}${selectedLobId ? `&lob=${selectedLobId}` : ""}&err=${tierEditErr}`;
      return redirect(dest);
    }

    await prisma.$transaction(async (tx) => {
      await tx.compPlanRuleBlock.update({
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

      if (cleanedTierEdits.length) {
        const allowedTierIds = await tx.compPlanTierRow.findMany({
          where: { id: { in: cleanedTierEdits.map((tier) => tier.id) }, ruleBlockId },
          select: { id: true },
        });
        const allowed = new Set(allowedTierIds.map((tier) => tier.id));
        for (const tier of cleanedTierEdits) {
          if (!allowed.has(tier.id)) continue;
          await tx.compPlanTierRow.update({
            where: { id: tier.id },
            data: {
              minValue: tier.minValue,
              maxValue: tier.maxValue,
              payoutValue: tier.payoutValue,
            },
          });
        }
      }
    });
    revalidatePath(`/compensation/plans/${planId}`);
    const redirectBase = `/compensation/plans/${planId}?section=${section}${selectedLobId ? `&lob=${selectedLobId}` : ""}`;
    const normalizedHash = redirectHash ? (redirectHash.startsWith("#") ? redirectHash : `#${redirectHash}`) : "";
    return redirect(`${redirectBase}${normalizedHash}`);
  }

  async function addSpecialRule(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const lobId = String(formData.get("lobId") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const enabledValue = formData.get("enabled");
    const enabled = enabledValue === "on" || enabledValue === "true";
    const statusEligibility = formData.getAll("statusEligibility").map(String) as PolicyStatus[];
    const productIds = formData.getAll("productIds").map(String).filter(Boolean);
    const thresholdPremium = Number(formData.get("thresholdPremium") || 0);
    const payoutTypeRaw = String(formData.get("payoutType") || "");
    const payoutType =
      payoutTypeRaw === "PERCENT" || payoutTypeRaw === "FLAT" ? (payoutTypeRaw as SpecialRule["payoutType"]) : null;
    const payoutValue = Number(formData.get("payoutValue") || 0);
    const redirectAddErr = (code: string) => {
      const lobParam = lobId ? `&lob=${lobId}` : "";
      const hash = lobId ? `#add-special-rule-${lobId}` : "";
      return redirect(`/compensation/plans/${planId}?section=lob${lobParam}&specialRuleErr=${code}${hash}`);
    };
    const interactionModeRaw = String(formData.get("interactionMode") || "");
    if (
      interactionModeRaw !== "OVERRIDE_SPECIAL" &&
      interactionModeRaw !== "HIGHER_OF_BASE_OR_SPECIAL" &&
      interactionModeRaw !== "ADD_ON_TOP_OF_BASE"
    ) {
      return redirectAddErr("BAD_PAYOUT");
    }
    const interactionMode = interactionModeRaw as SpecialRule["interactionMode"];
    const contributesToTierBasisValue = formData.get("contributesToTierBasis");
    const contributesToTierBasis = contributesToTierBasisValue === "on" || contributesToTierBasisValue === "true";
    if (!lobId) return redirectAddErr("MISSING_LOB");
    if (!name) return redirectAddErr("NAME_REQUIRED");
    if (productIds.length === 0) return redirectAddErr("PRODUCTS_REQUIRED");
    if (!Number.isFinite(thresholdPremium) || thresholdPremium < 0) return redirectAddErr("BAD_THRESHOLD");
    if (!Number.isFinite(payoutValue) || payoutValue <= 0) return redirectAddErr("BAD_PAYOUT");
    if (!payoutType) return redirectAddErr("BAD_PAYOUT");
    if (payoutType === "PERCENT" && payoutValue > 100) return redirectAddErr("PERCENT_OVER_100");

    const currentVersion = await prisma.compPlanVersion.findUnique({ where: { id: versionId } });
    if (!currentVersion) return;
    const currentConfigValue = (currentVersion as { config?: unknown }).config;
    const baseConfig =
      currentConfigValue && typeof currentConfigValue === "object" && !Array.isArray(currentConfigValue)
        ? (currentConfigValue as Record<string, unknown>)
        : {};
    const existingByLob =
      baseConfig.specialRulesByLobId && typeof baseConfig.specialRulesByLobId === "object" && !Array.isArray(baseConfig.specialRulesByLobId)
        ? (baseConfig.specialRulesByLobId as Record<string, unknown>)
        : {};
    const existingRules = Array.isArray(existingByLob[lobId]) ? (existingByLob[lobId] as SpecialRule[]) : [];
    const newRule: SpecialRule = {
      id: crypto.randomUUID(),
      lobId,
      name,
      enabled,
      statusEligibility,
      productIds,
      thresholdPremium,
      payoutType,
      payoutValue,
      interactionMode,
      contributesToTierBasis,
      orderIndex: existingRules.length,
      createdAt: new Date().toISOString(),
    };
    const nextConfig = {
      ...baseConfig,
      specialRulesByLobId: {
        ...existingByLob,
        [lobId]: [...existingRules, newRule],
      },
    };

    await prisma.compPlanVersion.update({
      where: { id: versionId },
      data: { config: nextConfig } as Prisma.CompPlanVersionUpdateInput,
    });
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`/compensation/plans/${planId}?section=lob&lob=${lobId}`);
  }

  async function updateSpecialRule(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const lobId = String(formData.get("lobId") || "").trim();
    const specialRuleId = String(formData.get("specialRuleId") || "").trim();
    const name = String(formData.get("name") || "").trim();
    const enabledValue = formData.get("enabled");
    const enabled = enabledValue === "on" || enabledValue === "true";
    const statusEligibility = formData.getAll("statusEligibility").map(String) as PolicyStatus[];
    const productIds = formData.getAll("productIds").map(String).filter(Boolean);
    const thresholdPremium = Number(formData.get("thresholdPremium") || 0);
    const payoutTypeRaw = String(formData.get("payoutType") || "");
    const payoutType =
      payoutTypeRaw === "PERCENT" || payoutTypeRaw === "FLAT" ? (payoutTypeRaw as SpecialRule["payoutType"]) : null;
    const payoutValue = Number(formData.get("payoutValue") || 0);
    const redirectEditErr = (code: string) => {
      const lobParam = lobId ? `&lob=${lobId}` : "";
      const ruleParam = specialRuleId ? `&specialRuleId=${specialRuleId}` : "";
      const hash = specialRuleId ? `#edit-special-rule-${specialRuleId}` : "";
      return redirect(`/compensation/plans/${planId}?section=lob${lobParam}${ruleParam}&specialRuleErr=${code}${hash}`);
    };
    const interactionModeRaw = String(formData.get("interactionMode") || "");
    if (
      interactionModeRaw !== "OVERRIDE_SPECIAL" &&
      interactionModeRaw !== "HIGHER_OF_BASE_OR_SPECIAL" &&
      interactionModeRaw !== "ADD_ON_TOP_OF_BASE"
    ) {
      return redirectEditErr("BAD_PAYOUT");
    }
    const interactionMode = interactionModeRaw as SpecialRule["interactionMode"];
    const contributesToTierBasisValue = formData.get("contributesToTierBasis");
    const contributesToTierBasis = contributesToTierBasisValue === "on" || contributesToTierBasisValue === "true";
    if (!lobId) return redirectEditErr("MISSING_LOB");
    if (!specialRuleId) return redirectEditErr("MISSING_LOB");
    if (!name) return redirectEditErr("NAME_REQUIRED");
    if (productIds.length === 0) return redirectEditErr("PRODUCTS_REQUIRED");
    if (!Number.isFinite(thresholdPremium) || thresholdPremium < 0) return redirectEditErr("BAD_THRESHOLD");
    if (!Number.isFinite(payoutValue) || payoutValue <= 0) return redirectEditErr("BAD_PAYOUT");
    if (!payoutType) return redirectEditErr("BAD_PAYOUT");
    if (payoutType === "PERCENT" && payoutValue > 100) return redirectEditErr("PERCENT_OVER_100");

    const currentVersion = await prisma.compPlanVersion.findUnique({ where: { id: versionId } });
    if (!currentVersion) return;
    const currentConfigValue = (currentVersion as { config?: unknown }).config;
    const baseConfig =
      currentConfigValue && typeof currentConfigValue === "object" && !Array.isArray(currentConfigValue)
        ? (currentConfigValue as Record<string, unknown>)
        : {};
    const existingByLob =
      baseConfig.specialRulesByLobId && typeof baseConfig.specialRulesByLobId === "object" && !Array.isArray(baseConfig.specialRulesByLobId)
        ? (baseConfig.specialRulesByLobId as Record<string, unknown>)
        : {};
    const existingRules = Array.isArray(existingByLob[lobId]) ? (existingByLob[lobId] as SpecialRule[]) : [];
    let updated = false;
    const nextRules = existingRules.map((rule) => {
      if (rule.id !== specialRuleId) return rule;
      updated = true;
      return {
        ...rule,
        lobId,
        name,
        enabled,
        statusEligibility,
        productIds,
        thresholdPremium,
        payoutType,
        payoutValue,
        interactionMode,
        contributesToTierBasis,
      };
    });
    if (!updated) return;

    const nextConfig = {
      ...baseConfig,
      specialRulesByLobId: {
        ...existingByLob,
        [lobId]: nextRules,
      },
    };

    await prisma.compPlanVersion.update({
      where: { id: versionId },
      data: { config: nextConfig } as Prisma.CompPlanVersionUpdateInput,
    });
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`/compensation/plans/${planId}?section=lob&lob=${lobId}`);
  }

  async function deleteSpecialRule(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const lobId = String(formData.get("lobId") || "").trim();
    const specialRuleId = String(formData.get("specialRuleId") || "").trim();
    if (!lobId || !specialRuleId) return;

    const currentVersion = await prisma.compPlanVersion.findUnique({ where: { id: versionId } });
    if (!currentVersion) return;
    const currentConfigValue = (currentVersion as { config?: unknown }).config;
    const baseConfig =
      currentConfigValue && typeof currentConfigValue === "object" && !Array.isArray(currentConfigValue)
        ? (currentConfigValue as Record<string, unknown>)
        : {};
    const existingByLob =
      baseConfig.specialRulesByLobId && typeof baseConfig.specialRulesByLobId === "object" && !Array.isArray(baseConfig.specialRulesByLobId)
        ? (baseConfig.specialRulesByLobId as Record<string, unknown>)
        : {};
    const existingRules = Array.isArray(existingByLob[lobId]) ? (existingByLob[lobId] as SpecialRule[]) : [];
    const nextConfig = {
      ...baseConfig,
      specialRulesByLobId: {
        ...existingByLob,
        [lobId]: existingRules.filter((rule) => rule.id !== specialRuleId),
      },
    };

    await prisma.compPlanVersion.update({
      where: { id: versionId },
      data: { config: nextConfig } as Prisma.CompPlanVersionUpdateInput,
    });
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`/compensation/plans/${planId}?section=lob&lob=${lobId}`);
  }

  async function cloneSpecialRule(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const lobId = String(formData.get("lobId") || "").trim();
    const specialRuleId = String(formData.get("specialRuleId") || "").trim();
    if (!lobId || !specialRuleId) return;

    const currentVersion = await prisma.compPlanVersion.findUnique({ where: { id: versionId } });
    if (!currentVersion) return;
    const currentConfigValue = (currentVersion as { config?: unknown }).config;
    const baseConfig =
      currentConfigValue && typeof currentConfigValue === "object" && !Array.isArray(currentConfigValue)
        ? (currentConfigValue as Record<string, unknown>)
        : {};
    const existingByLob =
      baseConfig.specialRulesByLobId && typeof baseConfig.specialRulesByLobId === "object" && !Array.isArray(baseConfig.specialRulesByLobId)
        ? (baseConfig.specialRulesByLobId as Record<string, unknown>)
        : {};
    const existingRules = Array.isArray(existingByLob[lobId]) ? (existingByLob[lobId] as SpecialRule[]) : [];
    const originalRule = existingRules.find((rule) => rule.id === specialRuleId);
    if (!originalRule) return;
    const baseName = typeof originalRule.name === "string" && originalRule.name.trim() ? originalRule.name.trim() : "Untitled rule";
    const newRule: SpecialRule = {
      ...originalRule,
      id: crypto.randomUUID(),
      lobId,
      name: `${baseName} (copy)`,
      createdAt: new Date().toISOString(),
      orderIndex: existingRules.length,
    };
    const nextConfig = {
      ...baseConfig,
      specialRulesByLobId: {
        ...existingByLob,
        [lobId]: [...existingRules, newRule],
      },
    };

    await prisma.compPlanVersion.update({
      where: { id: versionId },
      data: { config: nextConfig } as Prisma.CompPlanVersionUpdateInput,
    });
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`/compensation/plans/${planId}?section=lob&lob=${lobId}`);
  }

  async function moveSpecialRule(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const lobId = String(formData.get("lobId") || "").trim();
    const specialRuleId = String(formData.get("specialRuleId") || "").trim();
    const direction = String(formData.get("direction") || "").trim();
    if (!lobId || !specialRuleId) return;
    if (direction !== "up" && direction !== "down") return;

    const currentVersion = await prisma.compPlanVersion.findUnique({ where: { id: versionId } });
    if (!currentVersion) return;
    const currentConfigValue = (currentVersion as { config?: unknown }).config;
    const baseConfig =
      currentConfigValue && typeof currentConfigValue === "object" && !Array.isArray(currentConfigValue)
        ? (currentConfigValue as Record<string, unknown>)
        : {};
    const existingByLob =
      baseConfig.specialRulesByLobId && typeof baseConfig.specialRulesByLobId === "object" && !Array.isArray(baseConfig.specialRulesByLobId)
        ? (baseConfig.specialRulesByLobId as Record<string, unknown>)
        : {};
    const existingRules = Array.isArray(existingByLob[lobId]) ? (existingByLob[lobId] as SpecialRule[]) : [];
    const orderedRules = existingRules
      .map((rule, idx) => {
        const orderIndex = typeof rule.orderIndex === "number" && Number.isFinite(rule.orderIndex) ? rule.orderIndex : 100000 + idx;
        return { rule, orderIndex };
      })
      .sort((a, b) => {
        if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
        const aCreated = typeof a.rule.createdAt === "string" ? a.rule.createdAt : "";
        const bCreated = typeof b.rule.createdAt === "string" ? b.rule.createdAt : "";
        if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
        return a.rule.id.localeCompare(b.rule.id);
      })
      .map((entry) => entry.rule);
    const currentIndex = orderedRules.findIndex((rule) => rule.id === specialRuleId);
    if (currentIndex === -1) return;
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= orderedRules.length) return;
    const nextOrdered = [...orderedRules];
    [nextOrdered[currentIndex], nextOrdered[swapIndex]] = [nextOrdered[swapIndex], nextOrdered[currentIndex]];
    const nextRules = nextOrdered.map((rule, index) => ({ ...rule, orderIndex: index }));
    const nextConfig = {
      ...baseConfig,
      specialRulesByLobId: {
        ...existingByLob,
        [lobId]: nextRules,
      },
    };

    await prisma.compPlanVersion.update({
      where: { id: versionId },
      data: { config: nextConfig } as Prisma.CompPlanVersionUpdateInput,
    });
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`/compensation/plans/${planId}?section=lob&lob=${lobId}`);
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
    const thresholdValueRaw = String(formData.get("thresholdValue") || "").trim();
    const thresholdValue = thresholdValueRaw === "" ? Number.NaN : Number(thresholdValueRaw);
    const bucketId = String(formData.get("bucketId") || "") || null;
    const ruleBlockIds = formData.getAll("ruleBlockIds").map(String);
    const redirectBase = `/compensation/plans/${planId}?section=${section}${selectedLobId ? `&lob=${selectedLobId}` : ""}`;
    if (!name || !gateType || !behavior || !scope || Number.isNaN(thresholdValue)) {
      return redirect(`${redirectBase}&gateErr=missing_fields`);
    }
    if (scope === CompGateScope.RULE_BLOCKS && ruleBlockIds.length === 0) {
      return redirect(`${redirectBase}&gateErr=missing_rule_blocks`);
    }
    try {
      await prisma.compPlanGate.create({
        data: { planVersionId: versionId, name, gateType, behavior, scope, thresholdValue, bucketId, ruleBlockIds },
      });
    } catch {
      return redirect(`${redirectBase}&gateErr=create_failed`);
    }
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`${redirectBase}&gateMsg=created`);
  }

  async function updateGate(formData: FormData) {
    "use server";
    const gateId = String(formData.get("gateId") || "");
    if (!gateId) return;
    const name = String(formData.get("name") || "").trim();
    const gateType = formData.get("gateType") as CompGateType | null;
    const behavior = formData.get("behavior") as CompGateBehavior | null;
    const scope = formData.get("scope") as CompGateScope | null;
    const thresholdValueRaw = String(formData.get("thresholdValue") || "").trim();
    const thresholdValue = thresholdValueRaw === "" ? Number.NaN : Number(thresholdValueRaw);
    const bucketId = String(formData.get("bucketId") || "") || null;
    const ruleBlockIds = formData.getAll("ruleBlockIds").map(String);
    const enabled = formData.get("enabled") === "on";
    const redirectSection = String(formData.get("redirectSection") || section);
    const redirectLob = String(formData.get("redirectLob") || selectedLobId || "");
    const redirectBase = `/compensation/plans/${planId}?section=${redirectSection}${redirectLob ? `&lob=${redirectLob}` : ""}`;
    if (!name || !gateType || !behavior || !scope || Number.isNaN(thresholdValue)) {
      return redirect(`${redirectBase}&gateErr=missing_fields`);
    }
    if (scope === CompGateScope.RULE_BLOCKS && ruleBlockIds.length === 0) {
      return redirect(`${redirectBase}&gateErr=missing_rule_blocks`);
    }
    try {
      await prisma.compPlanGate.update({
        where: { id: gateId },
        data: { name, gateType, behavior, scope, thresholdValue, bucketId, ruleBlockIds, enabled },
      });
    } catch {
      return redirect(`${redirectBase}&gateErr=update_failed`);
    }
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`${redirectBase}&gateMsg=updated`);
  }

  async function deleteGate(formData: FormData) {
    "use server";
    const gateId = String(formData.get("gateId") || "");
    if (!gateId) return;
    const redirectSection = String(formData.get("redirectSection") || section);
    const redirectLob = String(formData.get("redirectLob") || selectedLobId || "");
    const redirectBase = `/compensation/plans/${planId}?section=${redirectSection}${redirectLob ? `&lob=${redirectLob}` : ""}`;
    try {
      await prisma.compPlanGate.delete({ where: { id: gateId } });
    } catch {
      return redirect(`${redirectBase}&gateErr=delete_failed`);
    }
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`${redirectBase}&gateMsg=deleted`);
  }

  async function updateBucketConfig(formData: FormData) {
    "use server";
    const bucketId = String(formData.get("bucketId") || "");
    if (!bucketId) return;
    const includesLobs = formData.getAll("includesLobs").map(String).filter(Boolean);
    const includesProducts = formData.getAll("includesProducts").map(String).filter(Boolean);
    const excludesLobs = formData.getAll("excludesLobs").map(String).filter(Boolean);
    const excludesProducts = formData.getAll("excludesProducts").map(String).filter(Boolean);
    const redirectSection = String(formData.get("redirectSection") || "buckets");
    const redirectLob = String(formData.get("redirectLob") || "");
    const redirectBucketId = String(formData.get("redirectBucketId") || "");
    const redirectBase = `/compensation/plans/${planId}?section=${redirectSection}${redirectLob ? `&lob=${redirectLob}` : ""}${
      redirectBucketId ? `&bucketId=${redirectBucketId}` : ""
    }`;

    let bucketErr = "";
    try {
      await prisma.premiumBucket.update({
        where: { id: bucketId },
        data: { includesLobs, includesProducts, excludesLobs, excludesProducts } as Prisma.PremiumBucketUpdateInput,
      });
    } catch {
      try {
        await prisma.premiumBucket.update({
          where: { id: bucketId },
          data: { includesLobs, includesProducts },
        });
        if (excludesLobs.length || excludesProducts.length) bucketErr = "excludes_unavailable";
      } catch {
        return redirect(`${redirectBase}&bucketErr=update_failed`);
      }
    }
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`${redirectBase}${bucketErr ? `&bucketErr=${bucketErr}` : "&bucketMsg=updated"}`);
  }

  async function addScorecardTier(formData: FormData) {
    "use server";
    const bonusModuleId = String(formData.get("bonusModuleId") || "");
    if (!bonusModuleId) return;
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    await prisma.$transaction(async (tx) => {
      const orderIndex = (await tx.compPlanScorecardTier.count({ where: { bonusModuleId } })) || 0;
      await tx.compPlanScorecardTier.create({ data: { bonusModuleId, name, orderIndex } });
      if (orderIndex === 0) {
        await tx.compPlanBonusModule.update({ where: { id: bonusModuleId }, data: { name } });
      }
    });
    revalidatePath(`/compensation/plans/${planId}`);
  }

  async function createScorecardModule() {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const orderIndex = await prisma.compPlanBonusModule.count({
      where: { planVersionId: versionId, bonusType: CompBonusType.SCORECARD_TIER },
    });
    const created = await prisma.compPlanBonusModule.create({
      data: { planVersionId: versionId, bonusType: CompBonusType.SCORECARD_TIER, name: "Scorecard", config: { orderIndex } },
    });
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=scorecards#bm-${created.id}`);
  }

  async function updateScorecardOrder(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const orderedIdsRaw = formData.get("orderedIds");
    if (!orderedIdsRaw) return;
    let orderedIds: string[] = [];
    try {
      const parsed = JSON.parse(String(orderedIdsRaw));
      if (Array.isArray(parsed)) orderedIds = parsed.map(String).filter(Boolean);
    } catch {
      return;
    }
    if (!orderedIds.length) return;
    const uniqueIds = Array.from(new Set(orderedIds));
    const modules = await prisma.compPlanBonusModule.findMany({
      where: { id: { in: uniqueIds }, planVersionId: versionId, bonusType: CompBonusType.SCORECARD_TIER },
      select: { id: true, config: true },
    });
    if (!modules.length) return;
    const moduleMap = new Map(modules.map((module) => [module.id, module]));
    const updates = uniqueIds.reduce<Prisma.PrismaPromise<unknown>[]>((acc, id, index) => {
      const module = moduleMap.get(id);
      if (!module) return acc;
      const baseConfig =
        module.config && typeof module.config === "object" && !Array.isArray(module.config)
          ? (module.config as Record<string, unknown>)
          : {};
      const nextConfig = { ...baseConfig, orderIndex: index };
      acc.push(prisma.compPlanBonusModule.update({ where: { id }, data: { config: nextConfig } }));
      return acc;
    }, []);
    if (!updates.length) return;
    await prisma.$transaction(updates);
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

  async function addBonusModuleShell(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const name = String(formData.get("name") || "").trim();
    const bonusType = formData.get("bonusType") as CompBonusType | null;
    const redirectBase = `/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=bonuses`;
    if (!name || !bonusType) {
      return redirect(`${redirectBase}&bonusModuleErr=missing_fields&bonusModuleForm=open`);
    }

    if (bonusType === CompBonusType.ACTIVITY_BONUS) {
      const timeframe = formData.get("timeframe") as "MONTH" | "DAY" | null;
      const requiresAll = (formData.get("requiresAll") as string) === "ALL";
      const payoutType = formData.get("payoutType") as "FLAT" | "PER_UNIT" | null;
      const payoutValueRaw = Number(formData.get("payoutValue") || 0);
      if (!timeframe || !payoutType) {
        return redirect(`${redirectBase}&bonusModuleErr=missing_fields&bonusModuleForm=open`);
      }
      const activityTypeIds = formData.getAll("activityTypeId").map(String);
      const activityMins = formData.getAll("activityMin").map((value) => (value === "" ? null : Number(value)));
      const requirements = activityTypeIds
        .map((activityTypeId, index) => {
          if (!activityTypeId) return null;
          const min = activityMins[index];
          return { activityTypeId, min: min == null || Number.isNaN(min) ? 0 : min };
        })
        .filter((req): req is { activityTypeId: string; min: number } => Boolean(req));

      try {
        const created = await prisma.compPlanBonusModule.create({
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
        return redirect(`${redirectBase}&bonusModuleMsg=created#bm-${created.id}`);
      } catch {
        return redirect(`${redirectBase}&bonusModuleErr=create_failed&bonusModuleForm=open`);
      }
    }

    if (bonusType === CompBonusType.SCORECARD_TIER) {
      const scorecardTierName = String(formData.get("scorecardTierName") || "").trim();
      const conditionPreset = String(formData.get("scorecardConditionPreset") || "").trim();
      const conditionOperatorRaw = String(formData.get("scorecardConditionOperator") || "");
      const conditionValueRaw = String(formData.get("scorecardConditionValue") || "").trim();
      const scorecardActivityTypeIds = formData
        .getAll("scorecardActivityTypeIds")
        .map(String)
        .filter((id) => id);
      const hasTierInput = Boolean(scorecardTierName || conditionPreset);
      let metricSource: CompMetricSource | null = null;
      let premiumCategory: PremiumCategory | null = null;
      const filters: Record<string, string | string[]> = {};
      let conditionOperator: ConditionOperator | null = null;
      let conditionValue: number | null = null;
      if (conditionPreset) {
        conditionOperator = conditionOperatorRaw as ConditionOperator;
        conditionValue = conditionValueRaw === "" ? null : Number(conditionValueRaw);
        if (
          !conditionOperator ||
          !Object.values(ConditionOperator).includes(conditionOperator) ||
          conditionValue == null ||
          Number.isNaN(conditionValue) ||
          conditionValue <= 0
        ) {
          return redirect(`${redirectBase}&bonusModuleErr=invalid_scorecard&bonusModuleForm=open`);
        }
        switch (conditionPreset) {
          case "APPS_ALL":
            metricSource = CompMetricSource.APPS_COUNT;
            break;
          case "APPS_PC": {
            metricSource = CompMetricSource.APPS_COUNT;
            const pcProductIds = products.filter((p) => p.premiumCategory === PremiumCategory.PC).map((p) => p.id);
            filters.productIds = pcProductIds;
            break;
          }
          case "APPS_FS": {
            metricSource = CompMetricSource.APPS_COUNT;
            const fsProductIds = products.filter((p) => p.premiumCategory === PremiumCategory.FS).map((p) => p.id);
            filters.productIds = fsProductIds;
            break;
          }
          case "APPS_BUSINESS": {
            metricSource = CompMetricSource.APPS_COUNT;
            const businessProductIds = products.filter((p) => p.productType === "BUSINESS").map((p) => p.id);
            filters.productIds = businessProductIds;
            break;
          }
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
          case "ACTIVITY_TYPES":
            metricSource = CompMetricSource.ACTIVITY;
            if (!scorecardActivityTypeIds.length) {
              return redirect(`${redirectBase}&bonusModuleErr=invalid_scorecard&bonusModuleForm=open`);
            }
            filters.activityTypeIds = scorecardActivityTypeIds;
            break;
          default:
            metricSource = null;
            break;
        }
        if (!metricSource) {
          return redirect(`${redirectBase}&bonusModuleErr=invalid_scorecard&bonusModuleForm=open`);
        }
        filters.presetKey = conditionPreset;
        if (premiumCategory) filters.premiumCategory = premiumCategory;
      }
      const orderIndex = await prisma.compPlanBonusModule.count({
        where: { planVersionId: versionId, bonusType: CompBonusType.SCORECARD_TIER },
      });
      try {
        const created = await prisma.compPlanBonusModule.create({
          data: { planVersionId: versionId, bonusType, name, config: { orderIndex } },
        });
        if (hasTierInput) {
          const tierName = scorecardTierName || name || "Tier 1";
          const tier = await prisma.compPlanScorecardTier.create({
            data: { bonusModuleId: created.id, name: tierName, orderIndex: 0 },
          });
          if (conditionPreset && metricSource && conditionOperator && conditionValue != null) {
            const group = await prisma.compPlanScorecardConditionGroup.create({
              data: { tierId: tier.id, mode: CompScorecardConditionGroupMode.ANY, name: "", orderIndex: 0 },
            });
            await prisma.compPlanScorecardCondition.create({
              data: {
                tierId: tier.id,
                groupId: group.id,
                metricSource,
                operator: conditionOperator,
                value: conditionValue,
                filters: Object.keys(filters).length ? filters : null,
              },
            });
          }
        }
        revalidatePath(`/compensation/plans/${planId}`);
        return redirect(`/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=scorecards&openBm=${created.id}#bm-${created.id}`);
      } catch {
        return redirect(`${redirectBase}&bonusModuleErr=create_failed&bonusModuleForm=open`);
      }
    }

    if (bonusType === CompBonusType.CUSTOM) {
      const customMode = String(formData.get("customMode") || "").trim();
      const customValueRaw = String(formData.get("customValue") || "").trim();
      const customValue = customValueRaw === "" ? null : Number(customValueRaw);
      if (customMode && (customValue == null || Number.isNaN(customValue) || customValue <= 0)) {
        return redirect(`${redirectBase}&bonusModuleErr=invalid_custom&bonusModuleForm=open`);
      }
      try {
        const created = await prisma.compPlanBonusModule.create({
          data: {
            planVersionId: versionId,
            bonusType,
            name,
            config: customMode ? { customMode, customValue } : undefined,
          },
        });
        revalidatePath(`/compensation/plans/${planId}`);
        return redirect(`${redirectBase}&bonusModuleMsg=created#bm-${created.id}`);
      } catch {
        return redirect(`${redirectBase}&bonusModuleErr=create_failed&bonusModuleForm=open`);
      }
    }
  }

  async function addSubtractor(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const name = String(formData.get("name") || "").trim();
    const operator = String(formData.get("operator") || "").trim();
    const valueRaw = String(formData.get("value") || "").trim();
    const value = valueRaw === "" ? null : Number(valueRaw);
    const validProductIds = new Set(products.map((p) => p.id));
    const validLobIds = new Set(lobs.map((l) => l.id));
    const rawConditionGroups = parseSubtractorConditionConfig(String(formData.get("subtractorConditionConfig") || ""));
    const conditionGroups = rawConditionGroups.map((group) => ({
      ...group,
      conditions: group.conditions.map((condition) => ({
        ...condition,
        productIds: condition.productIds.filter((id) => validProductIds.has(id)),
      })),
    }));
    const conditionProductIds = conditionGroups.flatMap((group) => group.conditions.flatMap((condition) => condition.productIds));
    const productIds = conditionProductIds.length
      ? Array.from(new Set(conditionProductIds))
      : formData.getAll("productIds").map(String).filter((id) => validProductIds.has(id));
    const lobIds = formData.getAll("lobIds").map(String).filter((id) => validLobIds.has(id));
    const redirectBase = `/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=subtractors`;
    if (!name || !operator || !subtractorOperatorValues.has(operator) || value == null) {
      return redirect(`${redirectBase}&subtractorErr=missing_fields&subtractorForm=open`);
    }
    if (Number.isNaN(value) || value <= 0) {
      return redirect(`${redirectBase}&subtractorErr=invalid_value&subtractorForm=open`);
    }
    let createdId = "";
    try {
      const created = await prisma.compPlanBonusModule.create({
        data: {
          planVersionId: versionId,
          name,
          bonusType: CompBonusType.CUSTOM,
          config: { subtractor: { operator, value, productIds, lobIds, conditionGroups } },
        },
      });
      createdId = created.id;
    } catch {
      return redirect(`${redirectBase}&subtractorErr=create_failed&subtractorForm=open`);
    }
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`${redirectBase}&subtractorMsg=created#bm-${createdId}`);
  }

  async function updateSubtractor(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const bonusModuleId = String(formData.get("bonusModuleId") || "");
    if (!bonusModuleId) return;
    const name = String(formData.get("name") || "").trim();
    const operator = String(formData.get("operator") || "").trim();
    const valueRaw = String(formData.get("value") || "").trim();
    const value = valueRaw === "" ? null : Number(valueRaw);
    const validProductIds = new Set(products.map((p) => p.id));
    const validLobIds = new Set(lobs.map((l) => l.id));
    const lobIds = formData.getAll("lobIds").map(String).filter((id) => validLobIds.has(id));
    const redirectBase = `/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=subtractors&openBm=${bonusModuleId}`;
    if (!name || !operator || !subtractorOperatorValues.has(operator) || value == null) {
      return redirect(`${redirectBase}&subtractorErr=missing_fields#bm-${bonusModuleId}`);
    }
    if (Number.isNaN(value) || value <= 0) {
      return redirect(`${redirectBase}&subtractorErr=invalid_value#bm-${bonusModuleId}`);
    }
    const module = await prisma.compPlanBonusModule.findFirst({
      where: { id: bonusModuleId, planVersionId: versionId, bonusType: CompBonusType.CUSTOM },
      select: { config: true },
    });
    if (!module) return;
    const baseConfig =
      module.config && typeof module.config === "object" && !Array.isArray(module.config)
        ? (module.config as Record<string, unknown>)
        : {};
    const conditionConfigRaw = formData.get("subtractorConditionConfig");
    const rawConditionGroups = conditionConfigRaw
      ? parseSubtractorConditionConfig(String(conditionConfigRaw))
      : resolveSubtractorConfig(module.config).conditionGroups;
    const conditionGroups = rawConditionGroups.map((group) => ({
      ...group,
      conditions: group.conditions.map((condition) => ({
        ...condition,
        productIds: condition.productIds.filter((id) => validProductIds.has(id)),
      })),
    }));
    const conditionProductIds = conditionGroups.flatMap((group) => group.conditions.flatMap((condition) => condition.productIds));
    const productIds = conditionProductIds.length
      ? Array.from(new Set(conditionProductIds))
      : formData.getAll("productIds").map(String).filter((id) => validProductIds.has(id));
    const nextConfig = {
      ...baseConfig,
      subtractor: {
        ...(baseConfig.subtractor && typeof baseConfig.subtractor === "object" && !Array.isArray(baseConfig.subtractor)
          ? (baseConfig.subtractor as Record<string, unknown>)
          : {}),
        operator,
        value,
        productIds,
        lobIds,
        conditionGroups,
      },
    };
    try {
      await prisma.compPlanBonusModule.update({
        where: { id: bonusModuleId },
        data: { name, config: nextConfig },
      });
    } catch {
      return redirect(`${redirectBase}&subtractorErr=update_failed#bm-${bonusModuleId}`);
    }
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`${redirectBase}&subtractorMsg=updated#bm-${bonusModuleId}`);
  }

  async function addConfiguredBonus(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const name = String(formData.get("name") || "").trim();
    const payoutType = String(formData.get("payoutType") || "");
    const bonusErrorBase = `/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=bonuses&bonusForm=open`;
    if (!name || !payoutType) {
      return redirect(`${bonusErrorBase}&bonusErr=missing_fields`);
    }

    const conditionNames = formData.getAll("conditionName").map((value) => String(value));
    const conditionMetrics = formData.getAll("conditionMetric").map(String);
    const conditionOperators = formData.getAll("conditionOperator").map(String);
    const conditionValues = formData.getAll("conditionValue").map((value) => String(value));
    const conditionCategories = formData.getAll("conditionPremiumCategory").map(String);
    let hasConditionError = false;

    const conditions = conditionMetrics
      .map((metric, index) => {
        const name = (conditionNames[index] || "").trim();
        const operator = conditionOperators[index] || ">=";
        const valueRaw = conditionValues[index] || "";
        const premiumCategory = conditionCategories[index] || "";
        const hasAny = Boolean(name || metric || valueRaw || premiumCategory);
        if (!hasAny) return null;
        const value = valueRaw === "" ? null : Number(valueRaw);
        if (
          !name ||
          !metric ||
          !bonusRuleMetricValues.has(metric) ||
          !operator ||
          !bonusRuleOperatorValues.has(operator) ||
          value == null ||
          Number.isNaN(value) ||
          value <= 0
        ) {
          hasConditionError = true;
          return null;
        }
        if (metric === "PREMIUM_CATEGORY" && !premiumCategory) {
          hasConditionError = true;
          return null;
        }
        return { name, metric, operator, value, premiumCategory: premiumCategory || null };
      })
      .filter(
        (condition): condition is { name: string; metric: string; operator: string; value: number; premiumCategory: string | null } =>
          Boolean(condition)
      );

    const tierMins = formData.getAll("tierMin").map((value) => String(value));
    const tierMaxes = formData.getAll("tierMax").map((value) => String(value));
    const tierPayouts = formData.getAll("tierPayout").map((value) => String(value));
    let hasTierError = false;

    const tiers = tierMins
      .map((minRaw, index) => {
        const min = minRaw === "" ? null : Number(minRaw);
        const maxRaw = tierMaxes[index] || "";
        const max = maxRaw === "" ? null : Number(maxRaw);
        const payoutRaw = tierPayouts[index] || "";
        const payout = payoutRaw === "" ? null : Number(payoutRaw);
        const hasAny = Boolean(minRaw || maxRaw || payoutRaw);
        if (!hasAny) return null;
        if (min == null || payout == null || Number.isNaN(min) || Number.isNaN(payout)) {
          hasTierError = true;
          return null;
        }
        if (min <= 0 || payout <= 0) {
          hasTierError = true;
          return null;
        }
        const normalizedMax = max == null || Number.isNaN(max) ? null : max;
        if (normalizedMax != null && normalizedMax < min) {
          hasTierError = true;
          return null;
        }
        return { min, max: normalizedMax, payout };
      })
      .filter((tier): tier is { min: number; max: number | null; payout: number } => Boolean(tier));

    if (!tiers.length) {
      return redirect(`${bonusErrorBase}&bonusErr=missing_fields`);
    }
    if (hasTierError) {
      return redirect(`${bonusErrorBase}&bonusErr=invalid_tiers`);
    }
    const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);
    for (let i = 1; i < sortedTiers.length; i++) {
      const prev = sortedTiers[i - 1];
      const next = sortedTiers[i];
      if (prev.max == null || prev.max >= next.min) {
        return redirect(`${bonusErrorBase}&bonusErr=overlap_tiers`);
      }
    }
    if (hasConditionError) {
      return redirect(`${bonusErrorBase}&bonusErr=invalid_conditions`);
    }

    try {
      const created = await prisma.compPlanBonusModule.create({
        data: {
          planVersionId: versionId,
          name,
          bonusType: CompBonusType.GOAL_BONUS,
          enabled: true,
          config: { payoutType, conditions, tiers },
        },
      });

      revalidatePath(`/compensation/plans/${planId}`);
      return redirect(`/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=bonuses&bonusMsg=bonus_created#bm-${created.id}`);
    } catch {
      return redirect(`${bonusErrorBase}&bonusErr=create_failed`);
    }
  }

  async function updateConfiguredBonus(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const bonusModuleId = String(formData.get("bonusModuleId") || "");
    if (!bonusModuleId) return;
    const name = String(formData.get("name") || "").trim();
    const payoutType = String(formData.get("payoutType") || "");
    const bonusErrorBase = `/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=bonuses&bonusForm=open&openBm=${bonusModuleId}`;
    if (!name || !payoutType) {
      return redirect(`${bonusErrorBase}&bonusErr=missing_fields`);
    }

    const conditionNames = formData.getAll("conditionName").map((value) => String(value));
    const conditionMetrics = formData.getAll("conditionMetric").map(String);
    const conditionOperators = formData.getAll("conditionOperator").map(String);
    const conditionValues = formData.getAll("conditionValue").map((value) => String(value));
    const conditionCategories = formData.getAll("conditionPremiumCategory").map(String);
    let hasConditionError = false;

    const conditions = conditionMetrics
      .map((metric, index) => {
        const name = (conditionNames[index] || "").trim();
        const operator = conditionOperators[index] || ">=";
        const valueRaw = conditionValues[index] || "";
        const premiumCategory = conditionCategories[index] || "";
        const hasAny = Boolean(name || metric || valueRaw || premiumCategory);
        if (!hasAny) return null;
        const value = valueRaw === "" ? null : Number(valueRaw);
        if (
          !name ||
          !metric ||
          !bonusRuleMetricValues.has(metric) ||
          !operator ||
          !bonusRuleOperatorValues.has(operator) ||
          value == null ||
          Number.isNaN(value) ||
          value <= 0
        ) {
          hasConditionError = true;
          return null;
        }
        if (metric === "PREMIUM_CATEGORY" && !premiumCategory) {
          hasConditionError = true;
          return null;
        }
        return { name, metric, operator, value, premiumCategory: premiumCategory || null };
      })
      .filter(
        (condition): condition is { name: string; metric: string; operator: string; value: number; premiumCategory: string | null } =>
          Boolean(condition)
      );

    const tierMins = formData.getAll("tierMin").map((value) => String(value));
    const tierMaxes = formData.getAll("tierMax").map((value) => String(value));
    const tierPayouts = formData.getAll("tierPayout").map((value) => String(value));
    let hasTierError = false;

    const tiers = tierMins
      .map((minRaw, index) => {
        const min = minRaw === "" ? null : Number(minRaw);
        const maxRaw = tierMaxes[index] || "";
        const max = maxRaw === "" ? null : Number(maxRaw);
        const payoutRaw = tierPayouts[index] || "";
        const payout = payoutRaw === "" ? null : Number(payoutRaw);
        const hasAny = Boolean(minRaw || maxRaw || payoutRaw);
        if (!hasAny) return null;
        if (min == null || payout == null || Number.isNaN(min) || Number.isNaN(payout)) {
          hasTierError = true;
          return null;
        }
        if (min <= 0 || payout <= 0) {
          hasTierError = true;
          return null;
        }
        const normalizedMax = max == null || Number.isNaN(max) ? null : max;
        if (normalizedMax != null && normalizedMax < min) {
          hasTierError = true;
          return null;
        }
        return { min, max: normalizedMax, payout };
      })
      .filter((tier): tier is { min: number; max: number | null; payout: number } => Boolean(tier));

    if (!tiers.length) {
      return redirect(`${bonusErrorBase}&bonusErr=missing_fields`);
    }
    if (hasTierError) {
      return redirect(`${bonusErrorBase}&bonusErr=invalid_tiers`);
    }
    const sortedTiers = [...tiers].sort((a, b) => a.min - b.min);
    for (let i = 1; i < sortedTiers.length; i++) {
      const prev = sortedTiers[i - 1];
      const next = sortedTiers[i];
      if (prev.max == null || prev.max >= next.min) {
        return redirect(`${bonusErrorBase}&bonusErr=overlap_tiers`);
      }
    }
    if (hasConditionError) {
      return redirect(`${bonusErrorBase}&bonusErr=invalid_conditions`);
    }

    const module = await prisma.compPlanBonusModule.findFirst({
      where: { id: bonusModuleId, planVersionId: versionId, bonusType: CompBonusType.GOAL_BONUS },
      select: { id: true },
    });
    if (!module) return;

    try {
      await prisma.compPlanBonusModule.update({
        where: { id: bonusModuleId },
        data: {
          name,
          config: { payoutType, conditions, tiers },
        },
      });

      revalidatePath(`/compensation/plans/${planId}`);
      return redirect(
        `/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=bonuses&openBm=${bonusModuleId}&bonusMsg=rules_saved#bm-${bonusModuleId}`
      );
    } catch {
      return redirect(`${bonusErrorBase}&bonusErr=update_failed`);
    }
  }

  async function deleteConfiguredBonusTier(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const bonusModuleId = String(formData.get("bonusModuleId") || "");
    const tierIndexRaw = String(formData.get("tierIndex") || "");
    const tierIndex = Number(tierIndexRaw);
    if (!bonusModuleId || Number.isNaN(tierIndex)) return;

    const module = await prisma.compPlanBonusModule.findFirst({
      where: { id: bonusModuleId, planVersionId: versionId, bonusType: CompBonusType.GOAL_BONUS },
      select: { id: true, config: true },
    });
    if (!module) return;
    const config =
      module.config && typeof module.config === "object" && !Array.isArray(module.config)
        ? (module.config as Record<string, unknown>)
        : {};
    const tiers = Array.isArray(config.tiers) ? (config.tiers as Record<string, unknown>[]) : [];
    if (!tiers.length || tierIndex < 0 || tierIndex >= tiers.length) return;
    const nextTiers = tiers.filter((_, idx) => idx !== tierIndex);
    await prisma.compPlanBonusModule.update({
      where: { id: bonusModuleId },
      data: { config: { ...config, tiers: nextTiers } },
    });

    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=bonuses&openBm=${bonusModuleId}#bm-${bonusModuleId}`);
  }

  async function deleteConfiguredBonusRule(formData: FormData) {
    "use server";
    const versionId = version?.id;
    if (!versionId) return;
    const bonusModuleId = String(formData.get("bonusModuleId") || "");
    const ruleIndexRaw = String(formData.get("ruleIndex") || "");
    const ruleIndex = Number(ruleIndexRaw);
    if (!bonusModuleId || Number.isNaN(ruleIndex)) return;

    const module = await prisma.compPlanBonusModule.findFirst({
      where: { id: bonusModuleId, planVersionId: versionId, bonusType: CompBonusType.GOAL_BONUS },
      select: { id: true, config: true },
    });
    if (!module) return;
    const config =
      module.config && typeof module.config === "object" && !Array.isArray(module.config)
        ? (module.config as Record<string, unknown>)
        : {};
    const conditions = Array.isArray(config.conditions) ? (config.conditions as Record<string, unknown>[]) : [];
    if (!conditions.length || ruleIndex < 0 || ruleIndex >= conditions.length) return;
    const nextConditions = conditions.filter((_, idx) => idx !== ruleIndex);
    try {
      await prisma.compPlanBonusModule.update({
        where: { id: bonusModuleId },
        data: { config: { ...config, conditions: nextConditions } },
      });

      revalidatePath(`/compensation/plans/${planId}`);
      return redirect(
        `/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=bonuses&openBm=${bonusModuleId}&bonusMsg=rule_deleted#bm-${bonusModuleId}`
      );
    } catch {
      return redirect(`/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=bonuses&openBm=${bonusModuleId}&bonusErr=update_failed`);
    }
  }

  async function deleteBonusModule(formData: FormData) {
    "use server";
    const bonusModuleId = String(formData.get("bonusModuleId") || "");
    if (!bonusModuleId) return;
    const destBase = `/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=${bonusTab}`;
    try {
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
      return redirect(`${destBase}&bonusModuleMsg=deleted`);
    } catch {
      return redirect(`${destBase}&bonusModuleErr=delete_failed`);
    }
  }

  async function cloneScorecardModule(formData: FormData) {
    "use server";
    const sourceBonusModuleId = String(formData.get("sourceBonusModuleId") || "");
    if (!sourceBonusModuleId) return;
    const newModuleId = await prisma.$transaction(async (tx) => {
      const source = await tx.compPlanBonusModule.findUnique({
        where: { id: sourceBonusModuleId },
        include: {
          scorecardTiers: {
            include: {
              conditionGroups: { include: { conditions: true }, orderBy: { orderIndex: "asc" } },
              conditions: true,
              rewards: true,
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      });
      if (!source || source.bonusType !== CompBonusType.SCORECARD_TIER) return null;
      const isSingleTier = source.scorecardTiers.length === 1;
      const baseModuleName = source.name || "Scorecard";
      const singleTierName = source.scorecardTiers[0]?.name || baseModuleName;
      const moduleCopyName = isSingleTier ? formatCopiedTierName(singleTierName) : `${baseModuleName} (Copy)`;
      const orderIndex = await tx.compPlanBonusModule.count({
        where: { planVersionId: source.planVersionId, bonusType: CompBonusType.SCORECARD_TIER },
      });
      const newModule = await tx.compPlanBonusModule.create({
        data: {
          planVersionId: source.planVersionId,
          bonusType: CompBonusType.SCORECARD_TIER,
          name: moduleCopyName,
          config: { orderIndex },
        },
      });
      for (const tier of source.scorecardTiers) {
        const tierCopyName = isSingleTier ? moduleCopyName : formatCopiedTierName(tier.name || "Tier");
        const newTier = await tx.compPlanScorecardTier.create({
          data: {
            bonusModuleId: newModule.id,
            name: tierCopyName,
            orderIndex: tier.orderIndex,
          },
        });
        const groupIdMap = new Map<string, string>();
        for (const group of tier.conditionGroups) {
          const newGroup = await tx.compPlanScorecardConditionGroup.create({
            data: { tierId: newTier.id, mode: group.mode, name: group.name, orderIndex: group.orderIndex },
          });
          groupIdMap.set(group.id, newGroup.id);
          for (const condition of group.conditions) {
            await tx.compPlanScorecardCondition.create({
              data: {
                tierId: newTier.id,
                groupId: newGroup.id,
                metricSource: condition.metricSource,
                operator: condition.operator,
                value: condition.value,
                statusFilter: condition.statusFilter,
                bucketId: condition.bucketId,
                activityTypeId: condition.activityTypeId,
                timeframe: condition.timeframe,
                filters: condition.filters ? (condition.filters as Prisma.InputJsonValue) : null,
              },
            });
          }
        }
        const groupedConditionIds = new Set(
          tier.conditionGroups.flatMap((group) => group.conditions.map((condition) => condition.id))
        );
        for (const condition of tier.conditions) {
          if (groupedConditionIds.has(condition.id)) continue;
          await tx.compPlanScorecardCondition.create({
            data: {
              tierId: newTier.id,
              groupId: condition.groupId ? groupIdMap.get(condition.groupId) || null : null,
              metricSource: condition.metricSource,
              operator: condition.operator,
              value: condition.value,
              statusFilter: condition.statusFilter,
              bucketId: condition.bucketId,
              activityTypeId: condition.activityTypeId,
              timeframe: condition.timeframe,
              filters: condition.filters ? (condition.filters as Prisma.InputJsonValue) : null,
            },
          });
        }
        for (const reward of tier.rewards) {
          await tx.compPlanScorecardReward.create({
            data: {
              tierId: newTier.id,
              rewardType: reward.rewardType,
              bucketId: reward.bucketId,
              premiumCategory: reward.premiumCategory,
              percentValue: reward.percentValue,
              dollarValue: reward.dollarValue,
            },
          });
        }
      }
      return newModule.id;
    });
    if (!newModuleId) return;
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=scorecards#bm-${newModuleId}`);
  }

  async function cloneBonusModule(formData: FormData) {
    "use server";
    const sourceBonusModuleId = String(formData.get("sourceBonusModuleId") || "");
    if (!sourceBonusModuleId) return;
    const source = await prisma.compPlanBonusModule.findUnique({
      where: { id: sourceBonusModuleId },
      select: { planVersionId: true, bonusType: true, name: true, enabled: true, config: true },
    });
    if (!source) return;
    if (source.bonusType === CompBonusType.SCORECARD_TIER || source.bonusType === CompBonusType.CUSTOM) return;
    const created = await prisma.compPlanBonusModule.create({
      data: {
        planVersionId: source.planVersionId,
        bonusType: source.bonusType,
        name: `${source.name || "Bonus"} (Copy)`,
        enabled: source.enabled,
        config: source.config ? (source.config as Prisma.InputJsonValue) : null,
      },
    });
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=bonuses#bm-${created.id}`);
  }

  async function cloneSubtractorModule(formData: FormData) {
    "use server";
    const sourceBonusModuleId = String(formData.get("sourceBonusModuleId") || "");
    if (!sourceBonusModuleId) return;
    const source = await prisma.compPlanBonusModule.findUnique({
      where: { id: sourceBonusModuleId },
      select: { planVersionId: true, bonusType: true, name: true, enabled: true, config: true },
    });
    if (!source) return;
    if (source.bonusType !== CompBonusType.CUSTOM) return;
    const created = await prisma.compPlanBonusModule.create({
      data: {
        planVersionId: source.planVersionId,
        bonusType: CompBonusType.CUSTOM,
        name: `${source.name || "Subtractor"} (Copy)`,
        enabled: source.enabled,
        config: source.config ? (source.config as Prisma.InputJsonValue) : null,
      },
    });
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(`/compensation/plans/${planId}${bonusesBaseUrl}&bonusTab=subtractors#bm-${created.id}`);
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
    const tier = await prisma.compPlanScorecardTier.findUnique({
      where: { id: tierId },
      select: { bonusModuleId: true },
    });
    if (!tier) return;
    const orderIndex = (await prisma.compPlanScorecardConditionGroup.count({ where: { tierId } })) || 0;
    const created = await prisma.compPlanScorecardConditionGroup.create({
      data: { tierId, mode: CompScorecardConditionGroupMode.ANY, name: "", orderIndex },
    });
    revalidatePath(`/compensation/plans/${planId}`);
    const dest = `${scorecardsReturnUrl}&openBm=${tier.bonusModuleId}#add-row-${tierId}`;
    return redirect(dest);
  }

  async function addCondition(formData: FormData) {
    "use server";
    const tierId = String(formData.get("tierId") || "");
    const groupId = String(formData.get("groupId") || "");
    if (!tierId || !groupId) return;
    const presetKey = String(formData.get("preset") || "").trim();
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
    if (presetKey && presetKey !== "MANUAL") {
      if (presetKey === "APPS_ALL" || presetKey === "APPS_PC" || presetKey === "APPS_FS" || presetKey === "APPS_BUSINESS") {
        metricSource = CompMetricSource.APPS_COUNT;
        premiumCategory = null;
      } else if (presetKey === "PREMIUM_ALL") {
        metricSource = CompMetricSource.TOTAL_PREMIUM;
        premiumCategory = null;
      } else if (presetKey === "PREMIUM_PC") {
        metricSource = CompMetricSource.PREMIUM_CATEGORY;
        premiumCategory = PremiumCategory.PC;
      } else if (presetKey === "PREMIUM_FS") {
        metricSource = CompMetricSource.PREMIUM_CATEGORY;
        premiumCategory = PremiumCategory.FS;
      } else if (presetKey === "ACTIVITY_TYPES") {
        metricSource = CompMetricSource.ACTIVITY;
        premiumCategory = null;
      }
    }
    const filters: Record<string, string[] | string> = {};
    let scopeMode: string = "ANY";
    let productIds: string[] = [];
    let lobIds: string[] = [];
    let activityTypeIds: string[] = [];
    if (presetKey && presetKey !== "MANUAL") {
      switch (presetKey) {
        case "APPS_ALL":
          metricSource = CompMetricSource.APPS_COUNT;
          break;
        case "APPS_PC": {
          metricSource = CompMetricSource.APPS_COUNT;
          const pcProductIds = products.filter((p) => p.premiumCategory === PremiumCategory.PC).map((p) => p.id);
          const selectedProductIds = (presetProductIds.length ? presetProductIds : pcProductIds).filter((id) => pcProductIds.includes(id));
          if (!selectedProductIds.length) return;
          filters.productIds = selectedProductIds;
          break;
        }
        case "APPS_FS": {
          metricSource = CompMetricSource.APPS_COUNT;
          const fsProductIds = products.filter((p) => p.premiumCategory === PremiumCategory.FS).map((p) => p.id);
          const selectedProductIds = (presetProductIds.length ? presetProductIds : fsProductIds).filter((id) => fsProductIds.includes(id));
          if (!selectedProductIds.length) return;
          filters.productIds = selectedProductIds;
          break;
        }
        case "APPS_BUSINESS": {
          metricSource = CompMetricSource.APPS_COUNT;
          const businessProductIds = products.filter((p) => p.productType === "BUSINESS").map((p) => p.id);
          const selectedProductIds = (presetProductIds.length ? presetProductIds : businessProductIds).filter((id) =>
            businessProductIds.includes(id)
          );
          if (!selectedProductIds.length) return;
          filters.productIds = selectedProductIds;
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
    if (presetKey) {
      filters.presetKey = presetKey;
    }
    if (metricSource === CompMetricSource.PREMIUM_CATEGORY && premiumCategory) {
      filters.premiumCategory = premiumCategory;
    }
    if (!metricSource || !operator || valueRaw === "") return;
    const value = Number(valueRaw);
    if (Number.isNaN(value)) return;
    if (metricSource === CompMetricSource.PREMIUM_CATEGORY && !premiumCategory) return;
    const created = await prisma.compPlanScorecardCondition.create({
      data: {
        tierId,
        groupId,
        metricSource,
        operator,
        value,
        statusFilter,
        bucketId: metricSource === CompMetricSource.BUCKET ? bucketId : null,
        filters: Object.keys(filters).length ? filters : null,
      },
    });
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(scorecardsReturnUrl);
  }

  async function removeCondition(formData: FormData) {
    "use server";
    const conditionId = String(formData.get("conditionId") || "");
    if (!conditionId) return;
    await prisma.compPlanScorecardCondition.delete({ where: { id: conditionId } });
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(scorecardsReturnUrl);
  }

  async function removeConditionGroup(formData: FormData) {
    "use server";
    const groupId = String(formData.get("groupId") || "");
    if (!groupId) return;
    const group = await prisma.compPlanScorecardConditionGroup.findUnique({
      where: { id: groupId },
      select: { tierId: true, tier: { select: { bonusModuleId: true } } },
    });
    if (!group) return;
    await prisma.$transaction([
      prisma.compPlanScorecardCondition.deleteMany({ where: { groupId } }),
      prisma.compPlanScorecardConditionGroup.delete({ where: { id: groupId } }),
    ]);
    revalidatePath(`/compensation/plans/${planId}`);
    const dest = `${scorecardsReturnUrl}&openBm=${group.tier.bonusModuleId}`;
    return redirect(dest);
  }

  async function updateScorecardCondition(formData: FormData) {
    "use server";
    const conditionId = String(formData.get("conditionId") || "");
    const operatorRaw = String(formData.get("operator") || "");
    const presetKey = String(formData.get("preset") || "").trim();
    const presetProductIds = formData
      .getAll("presetProductIds")
      .map(String)
      .filter((id) => id);
    const presetActivityTypeIds = formData
      .getAll("presetActivityTypeIds")
      .map(String)
      .filter((id) => id);
    const valueRaw = String(formData.get("value") || "").trim();
    if (!conditionId) return;
    if (!operatorRaw || !Object.values(ConditionOperator).includes(operatorRaw as ConditionOperator)) return;
    if (valueRaw === "") return;
    const value = Number(valueRaw);
    if (Number.isNaN(value)) return;
    const existing = await prisma.compPlanScorecardCondition.findUnique({
      where: { id: conditionId },
      select: { filters: true },
    });
    const existingFilters = (existing?.filters as Record<string, unknown> | null) || {};
    if (presetKey === "APPS_PC") {
      const pcProductIds = products.filter((p) => p.premiumCategory === PremiumCategory.PC).map((p) => p.id);
      const selectedProductIds = (presetProductIds.length ? presetProductIds : pcProductIds).filter((id) => pcProductIds.includes(id));
      if (selectedProductIds.length) existingFilters.productIds = selectedProductIds;
      else delete existingFilters.productIds;
    } else if (presetKey === "APPS_FS") {
      const fsProductIds = products.filter((p) => p.premiumCategory === PremiumCategory.FS).map((p) => p.id);
      const selectedProductIds = (presetProductIds.length ? presetProductIds : fsProductIds).filter((id) => fsProductIds.includes(id));
      if (selectedProductIds.length) existingFilters.productIds = selectedProductIds;
      else delete existingFilters.productIds;
    } else if (presetKey === "APPS_BUSINESS") {
      const businessProductIds = products.filter((p) => p.productType === "BUSINESS").map((p) => p.id);
      const selectedProductIds = (presetProductIds.length ? presetProductIds : businessProductIds).filter((id) =>
        businessProductIds.includes(id)
      );
      if (selectedProductIds.length) existingFilters.productIds = selectedProductIds;
      else delete existingFilters.productIds;
    } else if (presetKey === "APPS_PRODUCT" || presetKey === "PREMIUM_PRODUCT") {
      if (presetProductIds.length) {
        existingFilters.productIds = presetProductIds;
      } else {
        delete existingFilters.productIds;
      }
    } else {
      delete existingFilters.productIds;
    }
    if (presetKey === "ACTIVITY_TYPES") {
      if (presetActivityTypeIds.length) {
        existingFilters.activityTypeIds = presetActivityTypeIds;
      } else {
        delete existingFilters.activityTypeIds;
      }
    } else {
      delete existingFilters.activityTypeIds;
    }
    let metricSourceUpdate: CompMetricSource | null = null;
    let premiumCategoryUpdate: PremiumCategory | null = null;
    if (presetKey && presetKey !== "MANUAL") {
      if (presetKey === "APPS_ALL" || presetKey === "APPS_PC" || presetKey === "APPS_FS" || presetKey === "APPS_BUSINESS") {
        metricSourceUpdate = CompMetricSource.APPS_COUNT;
        premiumCategoryUpdate = null;
      } else if (presetKey === "PREMIUM_ALL") {
        metricSourceUpdate = CompMetricSource.TOTAL_PREMIUM;
        premiumCategoryUpdate = null;
      } else if (presetKey === "PREMIUM_PC") {
        metricSourceUpdate = CompMetricSource.PREMIUM_CATEGORY;
        premiumCategoryUpdate = PremiumCategory.PC;
      } else if (presetKey === "PREMIUM_FS") {
        metricSourceUpdate = CompMetricSource.PREMIUM_CATEGORY;
        premiumCategoryUpdate = PremiumCategory.FS;
      } else if (presetKey === "ACTIVITY_TYPES") {
        metricSourceUpdate = CompMetricSource.ACTIVITY;
        premiumCategoryUpdate = null;
      }
    }
    if (premiumCategoryUpdate) {
      existingFilters.premiumCategory = premiumCategoryUpdate;
    } else {
      delete existingFilters.premiumCategory;
    }
    await prisma.compPlanScorecardCondition.update({
      where: { id: conditionId },
      data: {
        operator: operatorRaw as ConditionOperator,
        value,
        filters: { ...existingFilters, presetKey },
        ...(metricSourceUpdate ? { metricSource: metricSourceUpdate } : {}),
      },
    });
    revalidatePath(`/compensation/plans/${plan.id}`);
    return redirect(scorecardsReturnUrl);
  }

  async function updateScorecardTierName(formData: FormData) {
    "use server";
    const tierId = String(formData.get("tierId") || "");
    const name = String(formData.get("name") || "").trim();
    if (!tierId || !name) return;
    const tier = await prisma.compPlanScorecardTier.findUnique({
      where: { id: tierId },
      select: { bonusModuleId: true },
    });
    if (!tier) return;
    const module = await prisma.compPlanBonusModule.findUnique({
      where: { id: tier.bonusModuleId },
      select: { bonusType: true, scorecardTiers: { select: { id: true } } },
    });
    if (!module || module.bonusType !== CompBonusType.SCORECARD_TIER) return;
    const updates = [prisma.compPlanScorecardTier.update({ where: { id: tierId }, data: { name } })];
    if (module.scorecardTiers.length === 1) {
      updates.push(prisma.compPlanBonusModule.update({ where: { id: tier.bonusModuleId }, data: { name } }));
    }
    await prisma.$transaction(updates);
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(scorecardsReturnUrl);
  }

  async function updateScorecardModuleName(formData: FormData) {
    "use server";
    const bonusModuleId = String(formData.get("bonusModuleId") || "");
    const name = String(formData.get("name") || "").trim();
    if (!bonusModuleId || !name) return;
    const module = await prisma.compPlanBonusModule.findUnique({
      where: { id: bonusModuleId },
      select: { bonusType: true, scorecardTiers: { select: { id: true } } },
    });
    if (!module || module.bonusType !== CompBonusType.SCORECARD_TIER) return;
    const updates = [prisma.compPlanBonusModule.update({ where: { id: bonusModuleId }, data: { name } })];
    if (module.scorecardTiers.length === 1) {
      updates.push(prisma.compPlanScorecardTier.update({ where: { id: module.scorecardTiers[0].id }, data: { name } }));
    }
    await prisma.$transaction(updates);
    revalidatePath(`/compensation/plans/${planId}`);
    return redirect(scorecardsReturnUrl);
  }

  async function removeReward(formData: FormData) {
    "use server";
    const rewardId = String(formData.get("rewardId") || "");
    if (!rewardId) return;
    await prisma.compPlanScorecardReward.delete({ where: { id: rewardId } });
    revalidatePath(`/compensation/plans/${plan.id}`);
    return redirect(scorecardsReturnUrl);
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
    return redirect(scorecardsReturnUrl);
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

  const defaultSubtractorConditionGroups = normalizeSubtractorConditionGroups(undefined);
  const defaultSubtractorConditionConfigValue = JSON.stringify({ conditionGroups: defaultSubtractorConditionGroups });
  const renderSubtractorConditionItem = (
    condition: SubtractorCondition,
    rowId: string,
    rowIndex: number,
    conditionIndex: number,
    subtractorKey: string
  ) => {
    const metric = condition.metric || "APP_COUNT";
    const scopeValue = condition.scope || "ALL";
    let valueText = typeof condition.value === "number" && Number.isFinite(condition.value) ? String(condition.value) : "";
    if (metric === "ACTIVITY") {
      const activityValue =
        typeof condition.activityThreshold === "number" && Number.isFinite(condition.activityThreshold)
          ? String(condition.activityThreshold)
          : "";
      if (activityValue) valueText = activityValue;
    }
    if (metric === "PREMIUM" && valueText) valueText = "$" + valueText;
    const metricLabel = metric === "PREMIUM" ? "Premium" : metric === "ACTIVITY" ? "Activity" : "App Count";
    const scopeLabel =
      scopeValue === "PC" ? "P&C" : scopeValue === "FS" ? "FS" : scopeValue === "BUSINESS" ? "Business" : "";
    const activityLabel =
      metric === "ACTIVITY" && condition.activityTypeId
        ? (activityTypes.find((activity) => activity.id === condition.activityTypeId)?.name || "").trim()
        : "";
    const labelSuffix = [scopeLabel, activityLabel].filter(Boolean).join(" / ");
    const labelText = labelSuffix ? metricLabel + " (" + labelSuffix + ")" : metricLabel;
    const displayValue = valueText ? "At least " + valueText : "At least ...";
    const pillId = `subtractor-pill-toggle-${subtractorKey}-${rowIndex}-${conditionIndex}`;
    return (
    <div
      key={condition.id}
      className="subtractor-condition-item scorecard-condition-item"
      data-condition-id={condition.id}
      data-condition-index={conditionIndex}
      data-row-index={rowIndex}
      data-condition-row-id={rowId}
    >
      <details className="subtractor-condition-details">
        <summary className="subtractor-condition-pill">
          <span className="subtractor-condition-pill-value" data-subtractor-value>
            {displayValue}
          </span>
          <span className="subtractor-condition-pill-label" data-subtractor-label>
            {labelText}
          </span>
        </summary>
        <div className="subtractor-condition-panel">
          <div className="subtractor-panel-header">
            <span>Edit condition</span>
            <button type="button" className="subtractor-panel-close" aria-label="Close condition editor">
              X
            </button>
          </div>
          <div className="subtractor-condition-editor">
            <div className="subtractor-field-row">
              <label className="scorecard-field-label">
                Operator
                <select name="subtractorConditionOperator" defaultValue={ConditionOperator.GTE}>
                  <option value={ConditionOperator.GTE}>At least (&ge;)</option>
                </select>
              </label>
              <label className="scorecard-field-label">
                Value
                <input
                  name="subtractorConditionValue"
                  type="number"
                  step="0.01"
                  placeholder="Value"
                  defaultValue={condition.value == null ? "" : condition.value}
                />
              </label>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "#475569" }}>Condition Type</div>
              <div className="subtractor-chip-group" data-select="subtractorConditionType">
                <button
                  type="button"
                  className={"subtractor-chip" + (metric === "APP_COUNT" ? " is-active" : "")}
                  data-value="APP_COUNT"
                  aria-pressed={metric === "APP_COUNT" ? "true" : "false"}
                >
                  App Count
                </button>
                <button
                  type="button"
                  className={"subtractor-chip" + (metric === "PREMIUM" ? " is-active" : "")}
                  data-value="PREMIUM"
                  aria-pressed={metric === "PREMIUM" ? "true" : "false"}
                >
                  Premium
                </button>
                <button
                  type="button"
                  className={"subtractor-chip" + (metric === "ACTIVITY" ? " is-active" : "")}
                  data-value="ACTIVITY"
                  aria-pressed={metric === "ACTIVITY" ? "true" : "false"}
                >
                  Activity
                </button>
              </div>
              <select
                name="subtractorConditionType"
                defaultValue={metric}
                className="subtractor-hidden-select"
                tabIndex={-1}
                aria-hidden="true"
              >
                <option value="ACTIVITY">Activity</option>
                <option value="PREMIUM">Premium</option>
                <option value="APP_COUNT">App Count</option>
              </select>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "#475569" }}>Scope</div>
              <div className="subtractor-chip-group" data-select="subtractorScope">
                <button
                  type="button"
                  className={"subtractor-chip" + (scopeValue === "ALL" ? " is-active" : "")}
                  data-value="ALL"
                  aria-pressed={scopeValue === "ALL" ? "true" : "false"}
                >
                  All
                </button>
                <button
                  type="button"
                  className={"subtractor-chip" + (scopeValue === "PC" ? " is-active" : "")}
                  data-value="PC"
                  aria-pressed={scopeValue === "PC" ? "true" : "false"}
                >
                  P&amp;C
                </button>
                <button
                  type="button"
                  className={"subtractor-chip" + (scopeValue === "FS" ? " is-active" : "")}
                  data-value="FS"
                  aria-pressed={scopeValue === "FS" ? "true" : "false"}
                >
                  FS
                </button>
                <button
                  type="button"
                  className={"subtractor-chip" + (scopeValue === "BUSINESS" ? " is-active" : "")}
                  data-value="BUSINESS"
                  aria-pressed={scopeValue === "BUSINESS" ? "true" : "false"}
                >
                  Business
                </button>
                <button
                  type="button"
                  className={"subtractor-chip" + (scopeValue === "PRODUCTS" ? " is-active" : "")}
                  data-value="PRODUCTS"
                  aria-pressed={scopeValue === "PRODUCTS" ? "true" : "false"}
                >
                  Specific Products
                </button>
              </div>
              <select
                name="subtractorScope"
                defaultValue={scopeValue}
                className="subtractor-hidden-select"
                tabIndex={-1}
                aria-hidden="true"
              >
                <option value="ALL">All</option>
                <option value="PC">P&amp;C</option>
                <option value="FS">FS</option>
                <option value="BUSINESS">Business</option>
                <option value="PRODUCTS">Specific Products</option>
              </select>
            </div>
            <div className="subtractor-condition-extra activity">
              <label className="scorecard-field-label">
                Activity Name
                <select name="subtractorActivityTypeId" defaultValue={condition.activityTypeId || ""}>
                  <option value="">Select activity</option>
                  {activityTypes.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="scorecard-field-label">
                Threshold
                <input
                  name="subtractorActivityThreshold"
                  type="number"
                  step="1"
                  placeholder="Threshold"
                  defaultValue={condition.activityThreshold == null ? "" : condition.activityThreshold}
                />
              </label>
            </div>
            <div className="subtractor-condition-products">
              <div style={{ fontWeight: 600, fontSize: 12 }}>Products</div>
              <div className="scorecard-pill-picker subtractor-pill-picker">
                <input
                  id={pillId}
                  type="checkbox"
                  className="scorecard-pill-toggle subtractor-pill-toggle"
                />
                <div className="scorecard-pill-selected">
                  <div className="scorecard-pill-selected-title">Selected products</div>
                  <div className="scorecard-pill-empty">No products selected.</div>
                  <div className="scorecard-pill-list">
                    {sortedProducts.map((product) => (
                      <div
                        key={product.id}
                        className="scorecard-pill-item subtractor-pill-item"
                        data-premium={product.premiumCategory}
                        data-type={product.productType}
                      >
                        <label className="scorecard-pill-label">
                          <input
                            className="scorecard-pill-input"
                            type="checkbox"
                            name="productIds"
                            value={product.id}
                            defaultChecked={condition.productIds.includes(product.id)}
                          />
                          <span>{product.lobName ? `${product.lobName} - ${product.name}` : product.name}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <label
                  className="scorecard-pill-toggle-control"
                  data-subtractor-pill-toggle
                  htmlFor={pillId}
                >
                  <span className="pill-toggle-open">Add products</span>
                  <span className="pill-toggle-close">Done</span>
                </label>
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>Leave products blank to apply to all.</div>
            </div>
          </div>
        </div>
      </details>
      <button
        type="button"
        className="scorecard-condition-delete subtractor-condition-remove"
        aria-label="Remove condition"
        title="Remove condition"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
        </svg>
      </button>
    </div>
    );
  };

  return (
    <AppShell title={plan.name} subtitle="Modular plan builder with guided steps.">
      {/* modal styling via :target (no client JS needed) */}
      <style>{`
        .modal-close-overlay {
          position: absolute;
          inset: 0;
          z-index: 0 !important;
        }
        .modal-card {
          position: relative !important;
          z-index: 1 !important;
          background: #fff;
          width: 100%;
          max-width: 520px;
          max-height: 85vh;
          overflow: auto;
          border-radius: 14px;
          border: 1px solid #dfe5d6;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25);
          padding: 14px 16px 18px;
        }
        .modal-card form {
          gap: 6px !important;
        }
        .modal-card label {
          gap: 3px !important;
          margin: 0;
        }
        .modal-card input,
        .modal-card select {
          width: 100%;
          box-sizing: border-box;
        }
        .modal-card select[multiple] {
          max-height: 120px;
          overflow: auto;
        }
        .rule-block-save {
          cursor: pointer;
          background: #2563eb;
          color: #fff;
          border: 1px solid transparent;
          border-radius: 10px;
          padding: 8px 12px;
          font-weight: 600;
          box-shadow: 0 10px 24px rgba(37, 99, 235, 0.22);
        }
        .rule-block-save:hover {
          background: #1d4ed8;
          box-shadow: 0 12px 26px rgba(37, 99, 235, 0.28);
        }
        .rule-block-cancel {
          cursor: pointer;
          background: transparent;
          border: 1px solid #e5e7eb;
          color: #475569;
          border-radius: 10px;
          padding: 8px 12px;
          font-weight: 600;
          text-decoration: none;
        }
        .rule-block-cancel:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
        }
        .tier-edit-icon {
          width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #475569;
          font-size: 12px;
          cursor: pointer;
          pointer-events: auto;
        }
        .tier-edit-icon:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          color: #0f172a;
        }
        details.module-card > summary {
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-right: 56px;
        }
        details.module-card > summary::-webkit-details-marker {
          display: none;
        }
        details.module-card .module-chevron {
          transition: transform 0.15s ease;
          color: #94a3b8;
        }
        details.module-card[open] .module-chevron {
          transform: rotate(180deg);
        }
        .scorecard-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: flex-start;
        }
        .scorecard-grid--dnd {
          position: relative;
        }
        .scorecard-dnd-item {
          position: relative;
          flex: 0 1 calc(25% - 12px);
          min-width: 280px;
        }
        .scorecard-dnd-item.is-dragging {
          opacity: 0.65;
        }
        .scorecard-dnd-item.is-dragging .scorecard-card {
          box-shadow: 0 16px 36px rgba(15, 23, 42, 0.2);
        }
        .scorecard-dnd-handle {
          position: absolute;
          top: 10px;
          left: 10px;
          z-index: 3;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #64748b;
          font-weight: 700;
          font-size: 12px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
        }
        .scorecard-dnd-handle:hover {
          background: #f8fafc;
          border-color: #cbd5e1;
          color: #1d4ed8;
          box-shadow: 0 6px 12px rgba(15, 23, 42, 0.08);
        }
        .scorecard-dnd-handle:active {
          cursor: grabbing;
        }
        .scorecard-dnd-item .scorecard-card summary {
          padding-left: 36px;
        }
        .scorecard-lift {
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
        }
        .scorecard-card {
          animation: scorecardEnter 0.2s ease;
        }
        .scorecard-card summary {
          transition: color 0.18s ease;
        }
        .scorecard-card:hover {
          transform: translateY(-2px);
          border-color: #cbd5e1;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
        }
        .scorecard-card:hover summary {
          color: #1d4ed8;
        }
        .scorecard-card[open] {
          border-color: #2563eb;
          box-shadow: 0 14px 32px rgba(37, 99, 235, 0.18);
        }
        .scorecard-card[open]:hover {
          box-shadow: 0 16px 36px rgba(37, 99, 235, 0.24);
        }
        .scorecard-add-card:hover button {
          transform: translateY(-2px);
          border-color: #2563eb;
          background: #eff6ff;
          box-shadow: 0 10px 24px rgba(37, 99, 235, 0.18);
        }
        .scorecard-add-card:active button {
          transform: translateY(0);
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.2);
        }
        .scorecard-or-modal-form {
          display: grid;
          gap: 10px;
        }
        .scorecard-or-modal-form .scorecard-field-row {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          align-items: end;
        }
        .scorecard-or-modal-form .scorecard-field-label {
          display: grid;
          gap: 4px;
          font-size: 12px;
          color: #475569;
        }
        .scorecard-pill-picker {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .scorecard-pill-selected {
          display: grid;
          gap: 6px;
        }
        .scorecard-pill-selected-title {
          font-size: 12px;
          font-weight: 600;
          color: #475569;
        }
        .scorecard-pill-empty {
          font-size: 12px;
          color: #94a3b8;
        }
        .scorecard-pill-toggle {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .scorecard-pill-toggle-control {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px dashed #cbd5e1;
          background: #fff;
          color: #2563eb;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .scorecard-pill-toggle-control .pill-toggle-close {
          display: none;
        }
        .scorecard-pill-toggle:checked ~ .scorecard-pill-toggle-control .pill-toggle-open {
          display: none;
        }
        .scorecard-pill-toggle:checked ~ .scorecard-pill-toggle-control .pill-toggle-close {
          display: inline;
        }
        .scorecard-pill-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          max-height: 180px;
          overflow: auto;
          padding: 2px;
        }
        .scorecard-pill-toggle:checked ~ .scorecard-pill-selected .scorecard-pill-list {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 6px;
          background: #f8fafc;
        }
        .scorecard-pill-item {
          display: none;
        }
        .scorecard-pill-item:has(.scorecard-pill-input:checked) {
          display: inline-flex;
        }
        .scorecard-pill-toggle:checked ~ .scorecard-pill-selected .scorecard-pill-item {
          display: inline-flex;
        }
        .scorecard-pill-picker:has(.scorecard-pill-input:checked) .scorecard-pill-empty {
          display: none;
        }
        .scorecard-pill-input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .scorecard-pill-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #475569;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .scorecard-pill-label::after {
          margin-left: 6px;
          font-size: 12px;
          line-height: 1;
        }
        .scorecard-pill-item:has(.scorecard-pill-input:checked) .scorecard-pill-label {
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
        }
        .scorecard-pill-item:has(.scorecard-pill-input:checked) .scorecard-pill-label::after {
          content: "x";
          font-weight: 700;
        }
        .scorecard-pill-item:not(:has(.scorecard-pill-input:checked)) .scorecard-pill-label::after {
          content: "+";
          font-weight: 700;
        }
        .scorecard-condition-item {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .scorecard-delete-condition {
          margin: 0;
        }
        .scorecard-delete-condition-group {
          margin: 0;
          display: inline-flex;
          align-items: center;
        }
        .scorecard-empty-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .scorecard-empty-link {
          flex: 1;
          min-width: 0;
        }
        .scorecard-empty-row .scorecard-delete-condition-group {
          margin-left: auto;
        }
        .scorecard-condition-delete {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          border: 1px solid #fecaca;
          background: #fff;
          color: #dc2626;
          cursor: pointer;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
        }
        .scorecard-row-delete {
          position: static;
          z-index: 1;
        }
        .scorecard-delete-condition-group .scorecard-condition-delete {
          opacity: 1;
          pointer-events: auto;
        }
        .scorecard-condition-item:hover .scorecard-condition-delete,
        .scorecard-condition-item:focus-within .scorecard-condition-delete {
          opacity: 1;
          pointer-events: auto;
        }
        .scorecard-condition-delete:hover {
          background: #fee2e2;
          border-color: #f87171;
        }
        .scorecard-condition-delete svg {
          width: 14px;
          height: 14px;
        }
        .scorecard-or-modal-form:has(input[name="preset"][value="APPS_PC"]:checked) .scorecard-pill-item:not([data-premium="PC"]),
        .scorecard-edit-modal-form:has(input[name="preset"][value="APPS_PC"]:checked) .scorecard-pill-item:not([data-premium="PC"]) {
          display: none !important;
        }
        .scorecard-or-modal-form:has(input[name="preset"][value="APPS_FS"]:checked) .scorecard-pill-item:not([data-premium="FS"]),
        .scorecard-edit-modal-form:has(input[name="preset"][value="APPS_FS"]:checked) .scorecard-pill-item:not([data-premium="FS"]) {
          display: none !important;
        }
        .scorecard-or-modal-form:has(input[name="preset"][value="APPS_BUSINESS"]:checked) .scorecard-pill-item:not([data-type="BUSINESS"]),
        .scorecard-edit-modal-form:has(input[name="preset"][value="APPS_BUSINESS"]:checked) .scorecard-pill-item:not([data-type="BUSINESS"]) {
          display: none !important;
        }
        .scorecard-or-modal-form:has(input[name="preset"][value="APPS_PC"]:checked)
          .scorecard-pill-selected:not(:has(.scorecard-pill-item[data-premium="PC"] .scorecard-pill-input:checked))
          .scorecard-pill-empty,
        .scorecard-edit-modal-form:has(input[name="preset"][value="APPS_PC"]:checked)
          .scorecard-pill-selected:not(:has(.scorecard-pill-item[data-premium="PC"] .scorecard-pill-input:checked))
          .scorecard-pill-empty,
        .scorecard-or-modal-form:has(input[name="preset"][value="APPS_FS"]:checked)
          .scorecard-pill-selected:not(:has(.scorecard-pill-item[data-premium="FS"] .scorecard-pill-input:checked))
          .scorecard-pill-empty,
        .scorecard-edit-modal-form:has(input[name="preset"][value="APPS_FS"]:checked)
          .scorecard-pill-selected:not(:has(.scorecard-pill-item[data-premium="FS"] .scorecard-pill-input:checked))
          .scorecard-pill-empty,
        .scorecard-or-modal-form:has(input[name="preset"][value="APPS_BUSINESS"]:checked)
          .scorecard-pill-selected:not(:has(.scorecard-pill-item[data-type="BUSINESS"] .scorecard-pill-input:checked))
          .scorecard-pill-empty,
        .scorecard-edit-modal-form:has(input[name="preset"][value="APPS_BUSINESS"]:checked)
          .scorecard-pill-selected:not(:has(.scorecard-pill-item[data-type="BUSINESS"] .scorecard-pill-input:checked))
          .scorecard-pill-empty {
          display: block !important;
        }
        .scorecard-or-modal-form input,
        .scorecard-or-modal-form select,
        .scorecard-edit-modal-form input,
        .scorecard-edit-modal-form select {
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #111827;
          font-size: 13px;
        }
        .scorecard-or-modal-form option,
        .scorecard-edit-modal-form option {
          padding: 6px 10px;
        }
        .scorecard-or-modal-form input:focus,
        .scorecard-or-modal-form select:focus,
        .scorecard-edit-modal-form input:focus,
        .scorecard-edit-modal-form select:focus {
          outline: 2px solid rgba(37, 99, 235, 0.35);
          border-color: #2563eb;
        }
        .scorecard-modal-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .scorecard-modal-primary {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #2563eb;
          background: #2563eb;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .scorecard-modal-primary:hover {
          background: #1d4ed8;
          border-color: #1d4ed8;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.2);
        }
        .scorecard-modal-cancel {
          color: #64748b;
          text-decoration: none;
          font-weight: 600;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid transparent;
          transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
        }
        .scorecard-modal-cancel:hover {
          color: #0f172a;
          border-color: #e2e8f0;
          background: #f8fafc;
        }
        .bonus-tier-list {
          display: grid;
          gap: 8px;
        }
        .bonus-tier-row {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(3, minmax(140px, 1fr)) auto;
          align-items: center;
        }
        .bonus-tier-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .bonus-rule-list {
          display: grid;
          gap: 8px;
        }
        .bonus-rule-row {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(5, minmax(140px, 1fr)) auto;
          align-items: start;
          scroll-margin-top: 120px;
        }
        .bonus-rule-actions {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .bonus-rule-row:target {
          box-shadow: 0 0 0 2px #93c5fd;
          border-radius: 10px;
          background: #eff6ff;
        }
        .bonus-rule-summary {
          display: grid;
          gap: 8px;
        }
        .bonus-rule-summary-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .bonus-rule-summary-item:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
        }
        .bonus-rule-summary-main {
          display: grid;
          gap: 4px;
        }
        .bonus-rule-summary-name {
          font-weight: 700;
          color: #0f172a;
        }
        .bonus-rule-summary-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
        }
        .bonus-rule-summary-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .bonus-rule-summary-edit {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #2563eb;
          text-decoration: none;
          font-weight: 600;
          font-size: 12px;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .bonus-rule-summary-edit:hover {
          background: #eff6ff;
          border-color: #93c5fd;
          color: #1d4ed8;
        }
        .bonus-rule-summary-empty {
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px dashed #e5e7eb;
          background: #f8fafc;
          color: #94a3b8;
          font-size: 12px;
        }
        .bonus-module-form {
          display: grid;
          gap: 12px;
        }
        .bonus-module-extra {
          display: none;
          gap: 8px;
        }
        .bonus-module-form:has(select[name="bonusType"] option[value="SCORECARD_TIER"]:checked) .bonus-module-extra.scorecard,
        .bonus-module-form:has(select[name="bonusType"] option[value="CUSTOM"]:checked) .bonus-module-extra.custom,
        .bonus-module-form:has(select[name="bonusType"] option[value="ACTIVITY_BONUS"]:checked) .bonus-module-extra.activity {
          display: grid;
        }
        .bonus-module-list {
          display: grid;
          gap: 10px;
        }
        .bonus-module-card {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fff;
          padding: 8px 10px;
        }
        .bonus-module-card summary {
          cursor: pointer;
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          font-weight: 700;
        }
        .bonus-module-meta {
          font-size: 12px;
          color: #64748b;
        }
        .bonus-module-actions {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 8px;
        }
        .bonus-module-edit {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #2563eb;
          text-decoration: none;
          font-weight: 600;
          font-size: 12px;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .bonus-module-edit:hover {
          background: #eff6ff;
          border-color: #93c5fd;
          color: #1d4ed8;
        }
        .bonus-module-error {
          color: #b91c1c;
          background: #fee2e2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12px;
        }
        .bonus-module-empty {
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px dashed #e5e7eb;
          background: #f8fafc;
          color: #94a3b8;
          font-size: 12px;
        }
        .subtractor-list {
          display: grid;
          gap: 12px;
        }
        .subtractor-card {
          position: relative;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fff;
          padding: 12px;
        }
        .subtractor-card summary {
          cursor: pointer;
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }
        .subtractor-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
        }
        .subtractor-name-link {
          display: inline-block;
          color: inherit;
          text-decoration: none;
          cursor: pointer;
        }
        .subtractor-name-link:hover {
          text-decoration: underline;
        }
        .all-modules-actions a,
        .all-modules-actions button {
          cursor: pointer;
        }
        .subtractor-scope {
          margin-top: 8px;
          display: grid;
          gap: 4px;
          font-size: 12px;
          color: #475569;
        }
        .subtractor-form {
          display: grid;
          gap: 10px;
          margin-top: 12px;
        }
        .subtractor-builder-card {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          background: #f8fafc;
          padding: 14px;
          display: grid;
          gap: 12px;
        }
        .subtractor-builder-card .subtractor-builder-section {
          border: none;
          border-radius: 0;
          background: transparent;
          padding: 0;
        }
        .subtractor-builder-card .subtractor-conditions {
          border: none;
          border-radius: 0;
          background: transparent;
          padding: 0;
        }
        .subtractor-builder-card .subtractor-amount {
          border: none;
          border-radius: 0;
          background: transparent;
          padding: 0;
        }
        .subtractor-builder-divider {
          border-top: 1px solid #e5e7eb;
          margin: 6px 0 0;
          padding-top: 10px;
        }
        .subtractor-form input,
        .subtractor-form select {
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #111827;
          font-size: 13px;
          padding: 8px;
        }
        .subtractor-form select[multiple] {
          min-height: 120px;
        }
        .subtractor-form input:focus,
        .subtractor-form select:focus {
          outline: 2px solid rgba(37, 99, 235, 0.35);
          border-color: #2563eb;
        }
        .subtractor-conditions {
          display: grid;
          gap: 10px;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fff;
        }
        .subtractor-condition-list {
          display: grid;
          gap: 8px;
        }
        .subtractor-condition-row {
          display: grid;
          gap: 8px;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          position: relative;
        }
        .subtractor-condition-row-main {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }
        .subtractor-condition-row-items {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          align-items: start;
          gap: 12px;
          width: 100%;
        }
        @media (max-width: 1100px) {
          .subtractor-condition-row-items {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 720px) {
          .subtractor-condition-row-items {
            grid-template-columns: 1fr;
          }
        }
        .subtractor-condition-row-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          order: -1;
          width: 100%;
        }
        .subtractor-condition-item {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
          width: 100%;
          max-width: none;
          min-width: 0;
        }
        .subtractor-condition-item:has(.subtractor-condition-details[open]) {
          align-items: flex-start;
          width: 100%;
          max-width: none;
        }
        .subtractor-or-pill {
          display: none;
          height: 24px;
          padding: 0 8px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #475569;
          font-weight: 700;
          font-size: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          white-space: nowrap;
        }
        .subtractor-condition-details {
          display: grid;
          gap: 8px;
        }
        .subtractor-condition-details summary {
          list-style: none;
        }
        .subtractor-condition-details summary::-webkit-details-marker {
          display: none;
        }
        .subtractor-condition-pill {
          display: inline-flex;
          flex-direction: column;
          gap: 2px;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #2563eb;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          min-width: 120px;
        }
        .subtractor-condition-pill-value {
          color: #111827;
          font-size: 12px;
          font-weight: 700;
        }
        .subtractor-condition-pill-label {
          color: #2563eb;
          font-size: 11px;
          font-weight: 600;
        }
        .subtractor-field-row {
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          align-items: end;
        }
        .subtractor-condition-panel {
          display: grid;
          gap: 8px;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
        }
        .subtractor-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          font-weight: 700;
          color: #475569;
        }
        .subtractor-panel-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border-radius: 6px;
          border: 1px solid transparent;
          background: transparent;
          color: #94a3b8;
          font-weight: 700;
          cursor: pointer;
        }
        .subtractor-panel-close:hover {
          border-color: #e2e8f0;
          background: #fff;
          color: #475569;
        }
        .subtractor-condition-editor {
          display: grid;
          gap: 8px;
        }
        .subtractor-chip-group {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .subtractor-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #475569;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
        }
        .subtractor-chip.is-active {
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.2);
        }
        .subtractor-hidden-select {
          position: absolute;
          opacity: 0;
          pointer-events: none;
          height: 0;
          width: 0;
        }
        .subtractor-conditions .scorecard-field-label {
          display: grid;
          gap: 4px;
          font-size: 12px;
          color: #475569;
        }
        .subtractor-condition-extra {
          display: none;
          gap: 8px;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          align-items: end;
        }
        .subtractor-condition-item:has(select[name="subtractorConditionType"] option[value="ACTIVITY"]:checked) .subtractor-condition-extra.activity {
          display: grid;
          animation: presetFadeIn 0.15s ease;
        }
        .subtractor-condition-item:has(select[name="subtractorScope"] option[value="PRODUCTS"]:checked) .subtractor-condition-products,
        .subtractor-condition-item:has(select[name="subtractorScope"] option[value="PC"]:checked) .subtractor-condition-products,
        .subtractor-condition-item:has(select[name="subtractorScope"] option[value="FS"]:checked) .subtractor-condition-products,
        .subtractor-condition-item:has(select[name="subtractorScope"] option[value="BUSINESS"]:checked) .subtractor-condition-products {
          display: grid;
          animation: presetFadeIn 0.15s ease;
        }
        .subtractor-condition-products {
          display: none;
          gap: 8px;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
        }
        .subtractor-condition-products .scorecard-pill-picker {
          gap: 6px;
        }
        .subtractor-or-add {
          height: 24px;
          min-width: 32px;
          padding: 0 8px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #475569;
          font-weight: 700;
          font-size: 11px;
          cursor: pointer;
        }
        .subtractor-condition-and {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10px;
          color: #94a3b8;
        }
        .subtractor-condition-and::before,
        .subtractor-condition-and::after {
          content: "";
          flex: 1;
          height: 1px;
          background: #e5e7eb;
        }
        .subtractor-condition-row:last-of-type .subtractor-condition-and {
          display: none;
        }
        .subtractor-condition-group-actions {
          display: flex;
          justify-content: center;
        }
        .subtractor-condition-group-add {
          color: #2563eb;
          font-size: 12px;
          font-weight: 600;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 0;
        }
        .subtractor-amount {
          display: grid;
          gap: 8px;
          padding: 8px;
          border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .subtractor-amount-panel {
          display: grid;
          gap: 8px;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
        }
        .subtractor-amount summary {
          list-style: none;
        }
        .subtractor-amount summary::-webkit-details-marker {
          display: none;
        }
        .subtractor-amount-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          color: #2563eb;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
        }
        .subtractor-amount-value {
          color: #475569;
          font-weight: 600;
        }
        .subtractor-product-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
        }
        .subtractor-product-item {
          position: relative;
        }
        .subtractor-product-input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .subtractor-product-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #475569;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          position: relative;
        }
        .subtractor-product-label:has(.subtractor-product-input:checked) {
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
        }
        .subtractor-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .subtractor-primary {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #2563eb;
          background: #2563eb;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .subtractor-primary:hover {
          background: #1d4ed8;
          border-color: #1d4ed8;
          box-shadow: 0 8px 18px rgba(37, 99, 235, 0.2);
        }
        .subtractor-cancel {
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          color: #64748b;
          font-weight: 600;
          cursor: pointer;
          transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
        }
        .subtractor-cancel:hover {
          color: #0f172a;
          border-color: #cbd5e1;
          background: #f8fafc;
        }
        .subtractor-delete {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid #fecaca;
          background: #fff;
          color: #b91c1c;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
        }
        .subtractor-delete:hover {
          background: #fee2e2;
          border-color: #f87171;
          color: #991b1b;
          box-shadow: 0 6px 12px rgba(220, 38, 38, 0.15);
        }
        .bonus-msg {
          margin: 8px 0 0;
          color: #065f46;
          background: #d1fae5;
          border: 1px solid #86efac;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 600;
        }
        .bonus-field {
          display: grid;
          gap: 4px;
        }
        .bonus-field-error {
          min-height: 14px;
          font-size: 11px;
          color: #b91c1c;
        }
        .bonus-field-invalid {
          border-color: #fca5a5;
          background: #fef2f2;
        }
        .bonus-tier-remove,
        .bonus-tier-delete {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: 1px solid #fecaca;
          background: #fff;
          color: #dc2626;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
        }
        .bonus-tier-remove:hover,
        .bonus-tier-delete:hover {
          background: #fee2e2;
          border-color: #f87171;
        }
        .bonus-tier-remove svg,
        .bonus-tier-delete svg {
          width: 14px;
          height: 14px;
        }
        .bonus-rule-remove,
        .bonus-rule-delete {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: 1px solid #fecaca;
          background: #fff;
          color: #dc2626;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
        }
        .bonus-rule-remove:hover,
        .bonus-rule-delete:hover {
          background: #fee2e2;
          border-color: #f87171;
        }
        .bonus-rule-remove svg,
        .bonus-rule-delete svg {
          width: 14px;
          height: 14px;
        }
        .bonus-tier-add {
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px dashed #cbd5e1;
          background: #fff;
          color: #2563eb;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .bonus-tier-add:hover {
          background: #eff6ff;
          border-color: #93c5fd;
          color: #1d4ed8;
        }
        .bonus-rule-add {
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px dashed #cbd5e1;
          background: #fff;
          color: #2563eb;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .bonus-rule-add:hover {
          background: #eff6ff;
          border-color: #93c5fd;
          color: #1d4ed8;
        }
        @media (max-width: 600px) {
          .scorecard-modal-actions {
            flex-direction: column;
            align-items: stretch;
          }
          .scorecard-modal-actions .scorecard-modal-primary,
          .scorecard-modal-actions .scorecard-modal-cancel {
            width: 100%;
            text-align: center;
          }
          .bonus-tier-row {
            grid-template-columns: 1fr;
          }
          .bonus-tier-actions {
            justify-content: flex-start;
          }
          .bonus-rule-row {
            grid-template-columns: 1fr;
          }
          .bonus-rule-actions {
            justify-content: flex-start;
          }
          .bonus-rule-summary-item {
            flex-direction: column;
            align-items: stretch;
          }
          .bonus-rule-summary-actions {
            justify-content: flex-start;
          }
        }
        .scorecard-or-modal-form .preset-product-fields,
        .scorecard-edit-modal-form .preset-product-fields,
        .scorecard-or-modal-form .preset-activity-fields,
        .scorecard-edit-modal-form .preset-activity-fields {
          display: none;
          pointer-events: none;
          visibility: hidden;
          height: 0;
          max-height: 0;
          overflow: hidden;
        }
        .scorecard-or-modal-form:has(input[name="preset"][value="APPS_PRODUCT"]:checked) .preset-product-fields,
        .scorecard-or-modal-form:has(input[name="preset"][value="APPS_PC"]:checked) .preset-product-fields,
        .scorecard-or-modal-form:has(input[name="preset"][value="APPS_FS"]:checked) .preset-product-fields,
        .scorecard-or-modal-form:has(input[name="preset"][value="APPS_BUSINESS"]:checked) .preset-product-fields,
        .scorecard-or-modal-form:has(input[name="preset"][value="PREMIUM_PRODUCT"]:checked) .preset-product-fields,
        .scorecard-edit-modal-form:has(input[name="metricUi"][value="APPS"]:checked):has(input[name="preset"][value="APPS_PRODUCT"]:checked) .preset-product-fields,
        .scorecard-edit-modal-form:has(input[name="metricUi"][value="APPS"]:checked):has(input[name="preset"][value="APPS_PC"]:checked) .preset-product-fields,
        .scorecard-edit-modal-form:has(input[name="metricUi"][value="APPS"]:checked):has(input[name="preset"][value="APPS_FS"]:checked) .preset-product-fields,
        .scorecard-edit-modal-form:has(input[name="metricUi"][value="APPS"]:checked):has(input[name="preset"][value="APPS_BUSINESS"]:checked) .preset-product-fields,
        .scorecard-edit-modal-form:has(input[name="metricUi"][value="PREMIUM"]:checked):has(input[name="preset"][value="PREMIUM_PRODUCT"]:checked) .preset-product-fields {
          display: grid;
          pointer-events: auto;
          visibility: visible;
          height: auto;
          max-height: none;
          animation: presetFadeIn 0.15s ease;
        }
        .scorecard-or-modal-form:has(input[name="preset"][value="ACTIVITY_TYPES"]:checked) .preset-activity-fields,
        .scorecard-edit-modal-form:has(input[name="metricUi"][value="ACTIVITY"]:checked):has(input[name="preset"][value="ACTIVITY_TYPES"]:checked) .preset-activity-fields {
          display: grid;
          pointer-events: auto;
          visibility: visible;
          height: auto;
          max-height: none;
          animation: presetFadeIn 0.15s ease;
        }
        .scorecard-or-modal-form .preset-group-title,
        .scorecard-edit-modal-form .preset-group-title {
          font-size: 12px;
          font-weight: 600;
          color: #475569;
        }
        .scorecard-or-modal-form .preset-chips,
        .scorecard-edit-modal-form .preset-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .scorecard-or-modal-form .preset-chip,
        .scorecard-edit-modal-form .preset-chip {
          position: relative;
          display: inline-flex;
          align-items: center;
          cursor: pointer;
        }
        .scorecard-or-modal-form .preset-chip input,
        .scorecard-edit-modal-form .preset-chip input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .scorecard-or-modal-form .preset-chip span,
        .scorecard-edit-modal-form .preset-chip span {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          font-size: 12px;
          font-weight: 600;
          color: #111827;
          transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .scorecard-or-modal-form .preset-chip input:checked + span,
        .scorecard-edit-modal-form .preset-chip input:checked + span {
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
        }
        .scorecard-or-modal-form .scope-row,
        .scorecard-edit-modal-form .scope-row {
          display: none;
        }
        .scorecard-or-modal-form:has(input[name="metricUi"][value="APPS"]:checked) .scope-row.apps,
        .scorecard-edit-modal-form:has(input[name="metricUi"][value="APPS"]:checked) .scope-row.apps {
          display: flex;
          animation: presetFadeIn 0.15s ease;
        }
        .scorecard-or-modal-form:has(input[name="metricUi"][value="PREMIUM"]:checked) .scope-row.premium,
        .scorecard-edit-modal-form:has(input[name="metricUi"][value="PREMIUM"]:checked) .scope-row.premium {
          display: flex;
          animation: presetFadeIn 0.15s ease;
        }
        .scorecard-or-modal-form:has(input[name="metricUi"][value="ACTIVITY"]:checked) .scope-row.activity,
        .scorecard-edit-modal-form:has(input[name="metricUi"][value="ACTIVITY"]:checked) .scope-row.activity {
          display: flex;
          animation: presetFadeIn 0.15s ease;
        }
        .scorecard-or-modal-form:has(input[name="metricUi"][value="MANUAL"]:checked) .scope-row.manual,
        .scorecard-edit-modal-form:has(input[name="metricUi"][value="MANUAL"]:checked) .scope-row.manual {
          display: flex;
          animation: presetFadeIn 0.15s ease;
        }
        .scorecard-edit-modal-form .preset-quick-selects {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .scorecard-edit-modal-form .preset-quick-pill {
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
        }
        .scorecard-edit-modal-form .preset-quick-note {
          font-size: 11px;
          color: #94a3b8;
        }
        .scorecard-edit-modal-form .preset-business-note {
          display: none;
          font-size: 11px;
          color: #64748b;
        }
        .scorecard-edit-modal-form:has(input[name="preset"][value="PREMIUM_PRODUCT"][data-scope="BUSINESS"]:checked) .preset-business-note {
          display: block;
        }
        @keyframes scorecardEnter {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes presetFadeIn {
          from {
            opacity: 0;
            transform: translateY(-2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .modal-target {
          display: none !important;
          position: fixed !important;
          inset: 0 !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 40px 16px !important;
          background: rgba(0,0,0,0.45) !important;
          overflow: auto !important;
          isolation: isolate !important;
          z-index: 9999 !important;
        }
        .modal-target:target {
          display: flex !important;
        }
        .modal-target.scorecard-modal-target {
          position: absolute !important;
          inset: 10px !important;
          padding: 10px !important;
          align-items: flex-start !important;
          justify-content: flex-start !important;
          background: rgba(248, 250, 252, 0.96) !important;
          overflow: auto !important;
          border-radius: 12px !important;
          z-index: 5 !important;
        }
        .modal-target.scorecard-modal-target:target {
          display: flex !important;
        }
        .modal-target.scorecard-modal-target .modal-card {
          max-width: 100%;
          max-height: 100%;
          width: 100%;
        }
        .modal-target.scorecard-modal-target:target .modal-card {
          animation: scorecardModalIn 0.16s ease;
        }
        @media (max-width: 900px) {
          .modal-target.scorecard-modal-target {
            position: relative !important;
            inset: auto !important;
            padding: 0 !important;
            background: transparent !important;
            border-radius: 0 !important;
            display: none !important;
          }
          .modal-target.scorecard-modal-target:target {
            display: block !important;
          }
          .modal-target.scorecard-modal-target .modal-card {
            max-height: none;
            box-shadow: none;
          }
        }
        html, body {
          transform: none !important;
          filter: none !important;
          perspective: none !important;
        }
        @keyframes scorecardModalIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        #__next {
          transform: none !important;
          filter: none !important;
          perspective: none !important;
          contain: none !important;
        }
      `}</style>
      <script
        dangerouslySetInnerHTML={{
          __html: `
(() => {
  if (typeof window === "undefined") return;
  const scopePresets = new Set(["APPS_PC", "APPS_FS", "APPS_BUSINESS"]);
  const matchesScope = (preset, item) => {
    const premium = item.getAttribute("data-premium") || "";
    const type = item.getAttribute("data-type") || "";
    if (preset === "APPS_PC") return premium === "PC";
    if (preset === "APPS_FS") return premium === "FS";
    if (preset === "APPS_BUSINESS") return type === "BUSINESS";
    return false;
  };
  const syncSelection = (form, preset, force) => {
    if (!scopePresets.has(preset)) return;
    const items = Array.from(form.querySelectorAll(".scorecard-pill-item"));
    if (!items.length) return;
    const matchingItems = items.filter((item) => matchesScope(preset, item));
    if (!force) {
      const hasChecked = matchingItems.some((item) => {
        const input = item.querySelector(".scorecard-pill-input");
        return input instanceof HTMLInputElement && input.checked;
      });
      if (hasChecked) return;
    }
    items.forEach((item) => {
      const input = item.querySelector(".scorecard-pill-input");
      if (!(input instanceof HTMLInputElement)) return;
      input.checked = matchesScope(preset, item);
    });
  };
  const initForms = (force) => {
    document.querySelectorAll(".scorecard-or-modal-form, .scorecard-edit-modal-form").forEach((form) => {
      const checkedPreset = form.querySelector('input[name="preset"]:checked');
      if (!(checkedPreset instanceof HTMLInputElement)) return;
      syncSelection(form, checkedPreset.value, force);
    });
  };
  const syncSpecialRuleSelectedCount = (form) => {
    const count = form.querySelectorAll('input[name="productIds"]:checked').length;
    const label = form.querySelector("[data-special-rule-selected-count]");
    if (label instanceof HTMLElement) {
      label.textContent = "Selected: " + count;
    }
  };
  const initSpecialRuleForms = () => {
    document.querySelectorAll('[data-special-rule-form="true"]').forEach((form) => {
      if (form instanceof HTMLFormElement) syncSpecialRuleSelectedCount(form);
    });
  };
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "preset") return;
    const form = target.closest(".scorecard-or-modal-form, .scorecard-edit-modal-form");
    if (!(form instanceof HTMLFormElement)) return;
    syncSelection(form, target.value, true);
  });
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name !== "productIds") return;
    const form = target.closest('[data-special-rule-form="true"]');
    if (!(form instanceof HTMLFormElement)) return;
    syncSpecialRuleSelectedCount(form);
  });
  const initAll = () => {
    initForms(false);
    initSubtractorUI();
    initSpecialRuleForms();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initAll(), { once: true });
  } else {
    initAll();
  }
  const bonusRuleMetrics = new Set(["APPS_COUNT", "TOTAL_PREMIUM", "PREMIUM_CATEGORY", "ACTIVITY"]);
  const bonusRuleOperators = new Set([">=", ">", "<=", "<", "="]);
  const clearBonusRuleErrors = (form) => {
    form.querySelectorAll(".bonus-field-error").forEach((node) => {
      if (node instanceof HTMLElement) node.textContent = "";
    });
    form.querySelectorAll(".bonus-field-invalid").forEach((node) => {
      if (node instanceof HTMLElement) node.classList.remove("bonus-field-invalid");
    });
  };
  const setBonusRuleError = (field, message) => {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) return;
    field.classList.add("bonus-field-invalid");
    const wrapper = field.closest(".bonus-field");
    if (!wrapper) return;
    const error = wrapper.querySelector(".bonus-field-error");
    if (error instanceof HTMLElement) error.textContent = message;
  };
  const validateBonusRuleForm = (form) => {
    clearBonusRuleErrors(form);
    let hasErrors = false;
    const rows = Array.from(form.querySelectorAll(".bonus-rule-row"));
    rows.forEach((row) => {
      const nameField = row.querySelector('input[name="conditionName"]');
      const metricField = row.querySelector('select[name="conditionMetric"]');
      const operatorField = row.querySelector('select[name="conditionOperator"]');
      const valueField = row.querySelector('input[name="conditionValue"]');
      const premiumField = row.querySelector('select[name="conditionPremiumCategory"]');
      const name = nameField instanceof HTMLInputElement ? nameField.value.trim() : "";
      const metric = metricField instanceof HTMLSelectElement ? metricField.value : "";
      const operator = operatorField instanceof HTMLSelectElement ? operatorField.value : "";
      const valueRaw = valueField instanceof HTMLInputElement ? valueField.value.trim() : "";
      const premiumCategory = premiumField instanceof HTMLSelectElement ? premiumField.value : "";
      const hasAny = Boolean(name || metric || valueRaw || premiumCategory);
      if (!hasAny) return;
      if (!name) {
        setBonusRuleError(nameField, "Name cannot be empty.");
        hasErrors = true;
      }
      if (!metric || !bonusRuleMetrics.has(metric)) {
        setBonusRuleError(metricField, "Select a valid metric.");
        hasErrors = true;
      }
      if (!operator || !bonusRuleOperators.has(operator)) {
        setBonusRuleError(operatorField, "Select a valid operator.");
        hasErrors = true;
      }
      const value = valueRaw === "" ? Number.NaN : Number(valueRaw);
      if (Number.isNaN(value) || value <= 0) {
        setBonusRuleError(valueField, "Value must be a positive number.");
        hasErrors = true;
      }
      if (metric === "PREMIUM_CATEGORY" && !premiumCategory) {
        setBonusRuleError(premiumField, "Select a premium category.");
        hasErrors = true;
      }
    });
    return hasErrors;
  };
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const form = target.closest(".bonus-config-form");
    if (!(form instanceof HTMLFormElement)) return;
    target.classList.remove("bonus-field-invalid");
    const wrapper = target.closest(".bonus-field");
    if (!wrapper) return;
    const error = wrapper.querySelector(".bonus-field-error");
    if (error instanceof HTMLElement) error.textContent = "";
  });
  const clearBonusModuleError = (form) => {
    const error = form.querySelector(".bonus-module-error");
    if (error instanceof HTMLElement) error.textContent = "";
  };
  const subtractorTypeLabels = { APP_COUNT: "App Count", PREMIUM: "Premium", ACTIVITY: "Activity" };
  const subtractorScopeLabels = { PC: "P&C", FS: "FS", BUSINESS: "Business", PRODUCTS: "Specific products" };
  const subtractorScopePresets = new Set(["PC", "FS", "BUSINESS"]);
  let subtractorConditionRowId = 0;
  let subtractorConditionId = 0;
  const matchesSubtractorScope = (scope, item) => {
    const premium = item.getAttribute("data-premium") || "";
    const type = item.getAttribute("data-type") || "";
    if (scope === "PC") return premium === "PC";
    if (scope === "FS") return premium === "FS";
    if (scope === "BUSINESS") return type === "BUSINESS";
    return false;
  };
  const ensureSubtractorPillToggle = (item) => {
    if (!(item instanceof HTMLElement)) return;
    item.querySelectorAll(".subtractor-pill-picker").forEach((picker) => {
      const toggle = picker.querySelector(".subtractor-pill-toggle");
      const control = picker.querySelector("[data-subtractor-pill-toggle]");
      if (!(toggle instanceof HTMLInputElement) || !(control instanceof HTMLLabelElement)) return;
    });
  };
  const getSubtractorModuleKey = (element) => {
    const form = element?.closest(".subtractor-form");
    const moduleInput = form ? form.querySelector('input[name="bonusModuleId"]') : null;
    if (moduleInput instanceof HTMLInputElement && moduleInput.value) return moduleInput.value;
    return "new";
  };
  const applySubtractorPillToggleIds = (container, moduleKey, rowIndex, startIndex = 0) => {
    if (!container || !container.querySelectorAll) return;
    const items = Array.from(container.querySelectorAll(".subtractor-condition-item"));
    items.forEach((item, idx) => {
      const toggle = item.querySelector(".subtractor-pill-toggle");
      const control = item.querySelector("[data-subtractor-pill-toggle]");
      const pillId = "subtractor-pill-toggle-" + moduleKey + "-" + rowIndex + "-" + (startIndex + idx);
      if (toggle instanceof HTMLInputElement) toggle.id = pillId;
      if (control instanceof HTMLLabelElement) control.htmlFor = pillId;
    });
  };
  const ensureSubtractorConditionRowMeta = (row, rowIndex) => {
    if (!(row instanceof HTMLElement)) return;
    let rowId = row.getAttribute("data-condition-row-id");
    if (!rowId) {
      subtractorConditionRowId += 1;
      rowId = "subtractor-row-" + subtractorConditionRowId;
      row.setAttribute("data-condition-row-id", rowId);
    } else {
      const rowMatch = rowId.match(/^subtractor-row-(\d+)$/);
      if (rowMatch) {
        subtractorConditionRowId = Math.max(subtractorConditionRowId, Number(rowMatch[1]));
      }
    }
    row.setAttribute("data-row-index", String(rowIndex));
    const addButton = row.querySelector(".subtractor-condition-add");
    if (addButton instanceof HTMLButtonElement) {
      addButton.setAttribute("data-condition-row-id", rowId);
      addButton.setAttribute("data-row-index", String(rowIndex));
    }
    const items = Array.from(row.querySelectorAll(".subtractor-condition-item"));
    items.forEach((item, conditionIndex) => {
      if (!(item instanceof HTMLElement)) return;
      let conditionId = item.getAttribute("data-condition-id");
      if (!conditionId) {
        subtractorConditionId += 1;
        conditionId = "subtractor-cond-" + subtractorConditionId;
        item.setAttribute("data-condition-id", conditionId);
      } else {
        const conditionMatch = conditionId.match(/^subtractor-cond-(\d+)$/);
        if (conditionMatch) {
          subtractorConditionId = Math.max(subtractorConditionId, Number(conditionMatch[1]));
        }
      }
      item.setAttribute("data-condition-index", String(conditionIndex));
      item.setAttribute("data-row-index", String(rowIndex));
      item.setAttribute("data-condition-row-id", rowId);
    });
  };
  const syncSubtractorConditionAnd = (row, isLast) => {
    if (!(row instanceof HTMLElement)) return;
    const existing = row.querySelector(".subtractor-condition-and");
    if (isLast) {
      if (existing) existing.remove();
      return;
    }
    if (!existing) {
      const divider = document.createElement("div");
      divider.className = "subtractor-condition-and";
      divider.textContent = "And";
      row.appendChild(divider);
    }
  };
  const syncSubtractorOrPills = (row) => {
    if (!(row instanceof HTMLElement)) return;
    const list = row.querySelector(".subtractor-condition-items");
    const container = list instanceof HTMLElement ? list : row;
    if (!(container instanceof HTMLElement)) return;
    container.querySelectorAll(".subtractor-or-pill").forEach((pill) => pill.remove());
    const items = Array.from(container.querySelectorAll(".subtractor-condition-item"));
    items.forEach((item, index) => {
      if (index >= items.length - 1) return;
      const pill = document.createElement("span");
      pill.className = "subtractor-or-pill";
      pill.textContent = "OR";
      item.insertAdjacentElement("afterend", pill);
    });
  };
  const buildSubtractorFormConfig = (form) => {
    if (!(form instanceof HTMLFormElement)) return null;
    const list = form.querySelector(".subtractor-condition-list");
    if (!(list instanceof HTMLElement)) return null;
    const rows = Array.from(list.querySelectorAll(".subtractor-condition-row"));
    const conditionGroups = rows.map((row, rowIndex) => {
      const rowId = row.getAttribute("data-condition-row-id") || "row-" + (rowIndex + 1);
      const items = Array.from(row.querySelectorAll(".subtractor-condition-item"));
      const conditions = items.map((item, conditionIndex) => {
        const conditionId = item.getAttribute("data-condition-id") || "subtractor-cond-" + rowIndex + "-" + conditionIndex;
        const operatorSelect = item.querySelector('select[name="subtractorConditionOperator"]');
        const valueField = item.querySelector('input[name="subtractorConditionValue"]');
        const typeSelect = item.querySelector('select[name="subtractorConditionType"]');
        const scopeSelect = item.querySelector('select[name="subtractorScope"]');
        const activityTypeSelect = item.querySelector('select[name="subtractorActivityTypeId"]');
        const activityThresholdField = item.querySelector('input[name="subtractorActivityThreshold"]');
        const valueRaw = valueField instanceof HTMLInputElement ? valueField.value.trim() : "";
        const valueValue = valueRaw === "" ? null : Number(valueRaw);
        const thresholdRaw = activityThresholdField instanceof HTMLInputElement ? activityThresholdField.value.trim() : "";
        const thresholdValue = thresholdRaw === "" ? null : Number(thresholdRaw);
        const activityTypeValue = activityTypeSelect instanceof HTMLSelectElement ? activityTypeSelect.value.trim() : "";
        const productIds = Array.from(item.querySelectorAll('input[name="productIds"]:checked'))
          .map((input) => (input instanceof HTMLInputElement ? input.value : ""))
          .filter((id) => id);
        return {
          id: conditionId,
          operator: "GTE",
          value: Number.isFinite(valueValue) ? valueValue : null,
          metric: typeSelect instanceof HTMLSelectElement ? typeSelect.value : "APP_COUNT",
          scope: scopeSelect instanceof HTMLSelectElement ? scopeSelect.value : "ALL",
          activityTypeId: activityTypeValue || null,
          activityThreshold: Number.isFinite(thresholdValue) ? thresholdValue : null,
          productIds,
        };
      });
      if (!conditions.length) {
        conditions.push({
          id: rowId + "-cond-1",
          operator: "GTE",
          value: null,
          metric: "APP_COUNT",
          scope: "ALL",
          activityTypeId: null,
          activityThreshold: null,
          productIds: [],
        });
      }
      return { id: rowId, conditions };
    });
    return { conditionGroups };
  };
  const syncSubtractorFormConfig = (form) => {
    if (!(form instanceof HTMLFormElement)) return;
    const configField = form.querySelector('input[name="subtractorConditionConfig"]');
    if (!(configField instanceof HTMLInputElement)) return;
    const payload = buildSubtractorFormConfig(form);
    if (!payload) return;
    configField.value = JSON.stringify(payload);
  };
  const syncSubtractorFormState = (form) => {
    if (!(form instanceof HTMLFormElement)) return;
    const rows = Array.from(form.querySelectorAll(".subtractor-condition-row"));
    rows.forEach((row, rowIndex) => {
      ensureSubtractorConditionRowMeta(row, rowIndex);
      syncSubtractorOrPills(row);
      syncSubtractorConditionAnd(row, rowIndex === rows.length - 1);
    });
    syncSubtractorFormConfig(form);
  };
  const syncSubtractorScopeProducts = (item, scope) => {
    if (!(item instanceof HTMLElement)) return;
    const pills = Array.from(item.querySelectorAll(".subtractor-pill-item"));
    if (!pills.length) return;
    if (scope === "ALL") {
      pills.forEach((pill) => {
        const input = pill.querySelector(".scorecard-pill-input");
        if (input instanceof HTMLInputElement) input.checked = false;
      });
      return;
    }
    if (!subtractorScopePresets.has(scope)) return;
    pills.forEach((pill) => {
      const input = pill.querySelector(".scorecard-pill-input");
      if (!(input instanceof HTMLInputElement)) return;
      input.checked = matchesSubtractorScope(scope, pill);
    });
  };
  const syncSubtractorChipGroup = (group, value) => {
    if (!(group instanceof HTMLElement)) return;
    group.querySelectorAll(".subtractor-chip").forEach((chip) => {
      if (!(chip instanceof HTMLButtonElement)) return;
      const isActive = chip.getAttribute("data-value") === value;
      const hasActive = chip.classList.contains("is-active");
      if (hasActive !== isActive) chip.classList.toggle("is-active", isActive);
      const pressedValue = isActive ? "true" : "false";
      if (chip.getAttribute("aria-pressed") !== pressedValue) chip.setAttribute("aria-pressed", pressedValue);
    });
  };
  const syncSubtractorCondition = (item) => {
    if (!(item instanceof HTMLElement)) return;
    ensureSubtractorPillToggle(item);
    const typeSelect = item.querySelector('select[name="subtractorConditionType"]');
    const scopeSelect = item.querySelector('select[name="subtractorScope"]');
    if (typeSelect instanceof HTMLSelectElement) {
      const group = item.querySelector('.subtractor-chip-group[data-select="subtractorConditionType"]');
      syncSubtractorChipGroup(group, typeSelect.value);
    }
    const scopeValue = scopeSelect instanceof HTMLSelectElement ? scopeSelect.value : "ALL";
    if (scopeSelect instanceof HTMLSelectElement) {
      const group = item.querySelector('.subtractor-chip-group[data-select="subtractorScope"]');
      syncSubtractorChipGroup(group, scopeSelect.value);
    }
    if (scopeValue) syncSubtractorScopeProducts(item, scopeValue);
    const typeValue = typeSelect instanceof HTMLSelectElement ? typeSelect.value : "APP_COUNT";
    const valueField = item.querySelector('input[name="subtractorConditionValue"]');
    const activityField = item.querySelector('input[name="subtractorActivityThreshold"]');
    let valueText = valueField instanceof HTMLInputElement ? valueField.value.trim() : "";
    if (typeValue === "ACTIVITY") {
      const activityValue = activityField instanceof HTMLInputElement ? activityField.value.trim() : "";
      if (activityValue) valueText = activityValue;
    }
    if (typeValue === "PREMIUM" && valueText) valueText = "$" + valueText;
    const valueLabel = item.querySelector("[data-subtractor-value]");
    const typeLabel = item.querySelector("[data-subtractor-label]");
    const activityTypeSelect = item.querySelector('select[name="subtractorActivityTypeId"]');
    const scopeLabel =
      scopeValue === "PC" || scopeValue === "FS" || scopeValue === "BUSINESS" ? subtractorScopeLabels[scopeValue] || scopeValue : "";
    const metricLabel = subtractorTypeLabels[typeValue] || "Condition";
    const activityLabel =
      typeValue === "ACTIVITY" && activityTypeSelect instanceof HTMLSelectElement && activityTypeSelect.value
        ? (activityTypeSelect.selectedOptions[0]?.textContent || "").trim()
        : "";
    const labelSuffix = [scopeLabel, activityLabel].filter(Boolean).join(" / ");
    const labelText = labelSuffix ? metricLabel + " (" + labelSuffix + ")" : metricLabel;
    const displayValue = valueText ? "At least " + valueText : "At least ...";
    if (valueLabel instanceof HTMLElement && valueLabel.textContent !== displayValue) valueLabel.textContent = displayValue;
    if (typeLabel instanceof HTMLElement && typeLabel.textContent !== labelText) typeLabel.textContent = labelText;
  };
  const syncSubtractorAmount = (container) => {
    if (!(container instanceof HTMLElement)) return;
    const valueField = container.querySelector('input[name="value"]');
    const operatorField = container.querySelector('select[name="operator"]');
    const valueRaw = valueField instanceof HTMLInputElement ? valueField.value.trim() : "";
    const operator = operatorField instanceof HTMLSelectElement ? operatorField.value : "SUBTRACT";
    const isRemove = operator === "REMOVE";
    const valueLabel = container.querySelector("[data-subtractor-amount]");
    const amountLabel = container.querySelector("[data-subtractor-penalty-label]");
    const amountInput = container.querySelector("[data-subtractor-penalty-input]");
    const amountChip = container.querySelector("[data-subtractor-amount-chip]");
    const amountLabelText = isRemove ? "Penalty amount ($)" : "Penalty amount (%)";
    const placeholderText = isRemove ? "Dollars (e.g., 25)" : "Percent (e.g., 25)";
    const displayValue = valueRaw
      ? isRemove
        ? "Remove $" + valueRaw + " from earnings"
        : "Subtract " + valueRaw + "% of earnings"
      : isRemove
        ? "Set penalty ($)"
        : "Set penalty (%)";
    const chipText = valueRaw ? (isRemove ? "Remove $" + valueRaw : "Subtract " + valueRaw + "%") : "Edit penalty";
    if (valueLabel instanceof HTMLElement && valueLabel.textContent !== displayValue) valueLabel.textContent = displayValue;
    if (amountLabel instanceof HTMLElement && amountLabel.textContent !== amountLabelText) amountLabel.textContent = amountLabelText;
    if (amountInput instanceof HTMLInputElement && amountInput.placeholder !== placeholderText) amountInput.placeholder = placeholderText;
    if (amountChip instanceof HTMLElement && amountChip.textContent !== chipText) amountChip.textContent = chipText;
  };
  const setTierRowNames = (row, enable) => {
    if (!(row instanceof HTMLElement)) return;
    const idInput = row.querySelector("[data-tier-id-input]");
    const minInput = row.querySelector('[data-tier-input="min"]');
    const maxInput = row.querySelector('[data-tier-input="max"]');
    const payoutInput = row.querySelector('[data-tier-input="payout"]');
    if (idInput instanceof HTMLInputElement) {
      if (enable) idInput.name = "tierEditId";
      else idInput.removeAttribute("name");
    }
    if (minInput instanceof HTMLInputElement) {
      if (enable) minInput.name = "tierEditMin";
      else minInput.removeAttribute("name");
    }
    if (maxInput instanceof HTMLInputElement) {
      if (enable) maxInput.name = "tierEditMax";
      else maxInput.removeAttribute("name");
    }
    if (payoutInput instanceof HTMLInputElement) {
      if (enable) payoutInput.name = "tierEditPayout";
      else payoutInput.removeAttribute("name");
    }
  };
  const setTierRowError = (row, message) => {
    if (!(row instanceof HTMLElement)) return;
    const error = row.querySelector("[data-tier-error]");
    if (!(error instanceof HTMLElement)) return;
    error.textContent = message;
    error.style.display = message ? "block" : "none";
  };
  const updateTierSummary = (row) => {
    if (!(row instanceof HTMLElement)) return;
    const summary = row.querySelector("[data-tier-summary]");
    if (!(summary instanceof HTMLElement)) return;
    const minInput = row.querySelector('[data-tier-input="min"]');
    const maxInput = row.querySelector('[data-tier-input="max"]');
    const payoutInput = row.querySelector('[data-tier-input="payout"]');
    const minText = minInput instanceof HTMLInputElement ? minInput.value.trim() : "";
    const payoutText = payoutInput instanceof HTMLInputElement ? payoutInput.value.trim() : "";
    if (!minText || !payoutText) return;
    const maxText = maxInput instanceof HTMLInputElement ? maxInput.value.trim() : "";
    const unit = row.getAttribute("data-tier-unit") || "";
    const maxDisplay = maxText ? maxText : "\u221e";
    const unitSuffix = unit === "%" ? unit : unit ? " " + unit : "";
    summary.textContent = minText + "-" + maxDisplay + " => " + payoutText + unitSuffix;
  };
  const setTierRowEditing = (row, editing) => {
    if (!(row instanceof HTMLElement)) return;
    const summary = row.querySelector("[data-tier-summary]");
    const editBlock = row.querySelector("[data-tier-edit]");
    const button = row.querySelector(".tier-edit-icon");
    const inputs = row.querySelectorAll("[data-tier-input]");
    const isEditing = row.getAttribute("data-tier-editing") === "true";
    if (editing === isEditing) return;
    row.setAttribute("data-tier-editing", editing ? "true" : "false");
    if (summary instanceof HTMLElement) summary.style.display = editing ? "none" : "block";
    if (editBlock instanceof HTMLElement) editBlock.style.display = editing ? "grid" : "none";
    if (editing) {
      row.setAttribute("data-tier-edited", "true");
      setTierRowNames(row, true);
      inputs.forEach((input) => {
        if (input instanceof HTMLInputElement) input.disabled = false;
      });
      setTierRowError(row, "");
      if (button instanceof HTMLButtonElement) {
        button.textContent = "\u2713";
        button.setAttribute("aria-label", "Done editing tier");
      }
      const firstInput = row.querySelector('[data-tier-input="min"]');
      if (firstInput instanceof HTMLInputElement) firstInput.focus();
    } else {
      updateTierSummary(row);
      const isEdited = row.getAttribute("data-tier-edited") === "true";
      setTierRowNames(row, isEdited);
      inputs.forEach((input) => {
        if (input instanceof HTMLInputElement) input.disabled = !isEdited;
      });
      if (button instanceof HTMLButtonElement) {
        button.textContent = "\u270E";
        button.setAttribute("aria-label", "Edit tier");
      }
    }
  };
  const validateTierRow = (row) => {
    if (!(row instanceof HTMLElement)) return true;
    const isEdited = row.getAttribute("data-tier-edited") === "true";
    if (!isEdited) return true;
    const minInput = row.querySelector('[data-tier-input="min"]');
    const maxInput = row.querySelector('[data-tier-input="max"]');
    const payoutInput = row.querySelector('[data-tier-input="payout"]');
    const minRaw = minInput instanceof HTMLInputElement ? minInput.value.trim() : "";
    const maxRaw = maxInput instanceof HTMLInputElement ? maxInput.value.trim() : "";
    const payoutRaw = payoutInput instanceof HTMLInputElement ? payoutInput.value.trim() : "";
    const minValue = minRaw === "" ? Number.NaN : Number(minRaw);
    const payoutValue = payoutRaw === "" ? Number.NaN : Number(payoutRaw);
    if (Number.isNaN(minValue)) {
      setTierRowError(row, "Min must be a number.");
      return false;
    }
    if (Number.isNaN(payoutValue)) {
      setTierRowError(row, "Payout must be a number.");
      return false;
    }
    if (maxRaw) {
      const maxValue = Number(maxRaw);
      if (Number.isNaN(maxValue)) {
        setTierRowError(row, "Max must be a number.");
        return false;
      }
      if (maxValue < minValue) {
        setTierRowError(row, "Max must be >= min.");
        return false;
      }
    }
    setTierRowError(row, "");
    return true;
  };
  const setSubtractorInlineError = (form, selector, message) => {
    if (!(form instanceof HTMLFormElement)) return;
    const error = form.querySelector(selector);
    if (!(error instanceof HTMLElement)) return;
    if (message) error.textContent = message;
    error.style.display = message ? "block" : "none";
  };
  const clearSubtractorErrors = (form) => {
    if (!(form instanceof HTMLFormElement)) return;
    setSubtractorInlineError(form, "[data-subtractor-name-error]", "");
    setSubtractorInlineError(form, "[data-subtractor-penalty-error]", "");
    setSubtractorInlineError(form, "[data-subtractor-condition-error]", "");
  };
  const validateSubtractorForm = (form) => {
    if (!(form instanceof HTMLFormElement)) return true;
    if (!form.classList.contains("subtractor-form")) return true;
    clearSubtractorErrors(form);
    let hasError = false;
    let focusTarget = null;
    const nameInput = form.querySelector('input[name="name"]');
    const nameValue = nameInput instanceof HTMLInputElement ? nameInput.value.trim() : "";
    if (!nameValue) {
      setSubtractorInlineError(form, "[data-subtractor-name-error]", "Please add a name.");
      hasError = true;
      if (!focusTarget && nameInput instanceof HTMLInputElement) focusTarget = nameInput;
    }
    const operatorField = form.querySelector('select[name="operator"]');
    const valueField = form.querySelector('input[name="value"]');
    const operatorValue = operatorField instanceof HTMLSelectElement ? operatorField.value : "";
    const valueRaw = valueField instanceof HTMLInputElement ? valueField.value.trim() : "";
    const valueNumber = valueRaw === "" ? Number.NaN : Number(valueRaw);
    let penaltyMessage = "";
    if (!operatorValue) {
      penaltyMessage = "Select a penalty operator.";
    } else if (Number.isNaN(valueNumber)) {
      penaltyMessage = "Enter a numeric penalty value.";
    } else if (operatorValue === "SUBTRACT" && (valueNumber < 0 || valueNumber > 100)) {
      penaltyMessage = "Penalty percent must be between 0 and 100.";
    }
    if (penaltyMessage) {
      setSubtractorInlineError(form, "[data-subtractor-penalty-error]", penaltyMessage);
      hasError = true;
      if (!focusTarget && valueField instanceof HTMLInputElement) focusTarget = valueField;
    }
    let conditionMessage = "";
    let conditionFocus = null;
    const items = Array.from(form.querySelectorAll(".subtractor-condition-item"));
    for (const item of items) {
      if (!(item instanceof HTMLElement)) continue;
      const typeSelect = item.querySelector('select[name="subtractorConditionType"]');
      const scopeSelect = item.querySelector('select[name="subtractorScope"]');
      const typeValue = typeSelect instanceof HTMLSelectElement ? typeSelect.value : "APP_COUNT";
      const scopeValue = scopeSelect instanceof HTMLSelectElement ? scopeSelect.value : "ALL";
      if (typeValue === "ACTIVITY") {
        const activitySelect = item.querySelector('select[name="subtractorActivityTypeId"]');
        const activityValue = activitySelect instanceof HTMLSelectElement ? activitySelect.value.trim() : "";
        if (!activityValue) {
          conditionMessage = "Select an activity type for activity conditions.";
          conditionFocus = activitySelect;
          break;
        }
        const activityField = item.querySelector('input[name="subtractorActivityThreshold"]');
        const activityRaw = activityField instanceof HTMLInputElement ? activityField.value.trim() : "";
        const activityNumber = activityRaw === "" ? Number.NaN : Number(activityRaw);
        if (Number.isNaN(activityNumber)) {
          conditionMessage = "Enter a numeric activity threshold.";
          conditionFocus = activityField;
          break;
        }
      } else {
        const conditionValueField = item.querySelector('input[name="subtractorConditionValue"]');
        const conditionRaw = conditionValueField instanceof HTMLInputElement ? conditionValueField.value.trim() : "";
        const conditionNumber = conditionRaw === "" ? Number.NaN : Number(conditionRaw);
        if (Number.isNaN(conditionNumber)) {
          conditionMessage = "Enter a numeric value for each condition.";
          conditionFocus = conditionValueField;
          break;
        }
      }
      if (scopeValue === "PRODUCTS") {
        const selectedProducts = item.querySelectorAll('input[name="productIds"]:checked');
        if (!selectedProducts.length) {
          conditionMessage = "Select at least one product when scope is Specific Products.";
          conditionFocus = item.querySelector('input[name="productIds"]');
          break;
        }
      }
    }
    if (conditionMessage) {
      setSubtractorInlineError(form, "[data-subtractor-condition-error]", conditionMessage);
      hasError = true;
      if (!focusTarget && conditionFocus instanceof HTMLElement) focusTarget = conditionFocus;
    }
    if (hasError) {
      if (focusTarget instanceof HTMLElement) focusTarget.focus();
      return false;
    }
    return true;
  };
  const initSubtractorUI = () => {
    document.querySelectorAll(".subtractor-condition-item").forEach((item) => syncSubtractorCondition(item));
    document.querySelectorAll(".subtractor-amount").forEach((item) => syncSubtractorAmount(item));
    document.querySelectorAll(".subtractor-form").forEach((form) => syncSubtractorFormState(form));
  };
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.classList.contains("subtractor-form")) return;
    const isValid = validateSubtractorForm(form);
    if (!isValid) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.hasAttribute("data-tier-input")) return;
    const row = target.closest("[data-tier-row]");
    if (!(row instanceof HTMLElement)) return;
    setTierRowError(row, "");
  });
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const form = target.closest(".bonus-module-form");
    if (!(form instanceof HTMLFormElement)) return;
    clearBonusModuleError(form);
  });
  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const conditionItem = target.closest(".subtractor-condition-item");
    if (conditionItem instanceof HTMLElement) syncSubtractorCondition(conditionItem);
    const amountBlock = target.closest(".subtractor-amount");
    if (amountBlock instanceof HTMLElement) syncSubtractorAmount(amountBlock);
    const subtractorForm = target.closest(".subtractor-form");
    if (subtractorForm instanceof HTMLFormElement) {
      syncSubtractorFormConfig(subtractorForm);
      if (target instanceof HTMLInputElement && target.name === "name" && target.value.trim()) {
        setSubtractorInlineError(subtractorForm, "[data-subtractor-name-error]", "");
      }
      if (target.name === "value") {
        setSubtractorInlineError(subtractorForm, "[data-subtractor-penalty-error]", "");
      }
      if (target.name === "subtractorConditionValue" || target.name === "subtractorActivityThreshold") {
        setSubtractorInlineError(subtractorForm, "[data-subtractor-condition-error]", "");
      }
    }
  });
  document.addEventListener("change", (event) => {
    const raw = event.target;
    if (!(raw instanceof HTMLElement)) return;

    let el = null;
    if (raw instanceof HTMLSelectElement || raw instanceof HTMLInputElement) {
      el = raw;
    } else {
      const closest = raw.closest("select, input");
      if (closest instanceof HTMLSelectElement || closest instanceof HTMLInputElement) {
        el = closest;
      }
    }

    if (!el) return;

    const amountBlock = el.closest(".subtractor-amount");
    if (amountBlock instanceof HTMLElement) {
      syncSubtractorAmount(amountBlock);
      const subtractorForm = el.closest(".subtractor-form");
      if (subtractorForm instanceof HTMLFormElement && el instanceof HTMLSelectElement && el.name === "operator") {
        setSubtractorInlineError(subtractorForm, "[data-subtractor-penalty-error]", "");
      }
      return;
    }
    const subtractorForm = el.closest(".subtractor-form");
    if (subtractorForm instanceof HTMLFormElement) {
      subtractorForm.querySelectorAll(".subtractor-amount").forEach((item) => syncSubtractorAmount(item));
      if (el instanceof HTMLSelectElement && el.name === "operator") {
        setSubtractorInlineError(subtractorForm, "[data-subtractor-penalty-error]", "");
      }
      if (
        el.name === "subtractorConditionType" ||
        el.name === "subtractorScope" ||
        el.name === "subtractorActivityTypeId" ||
        el.name === "productIds"
      ) {
        setSubtractorInlineError(subtractorForm, "[data-subtractor-condition-error]", "");
      }
    }
  });
  document.addEventListener("click", (event) => {
    const rawTarget = event.target;
    const target = rawTarget instanceof Element ? rawTarget : rawTarget instanceof Node ? rawTarget.parentElement : null;
    if (!target) return;
    const tierEditButton = target.closest("[data-tier-edit-trigger]");
    if (tierEditButton instanceof HTMLElement) {
      event.preventDefault();
      const row = tierEditButton.closest("[data-tier-row]");
      if (!(row instanceof HTMLElement)) return;
      const isEditing = row.getAttribute("data-tier-editing") === "true";
      if (!isEditing) {
        const container = row.closest(".modal-card") || row.parentElement;
        if (container) {
          container.querySelectorAll('[data-tier-row][data-tier-editing="true"]').forEach((el) => {
            if (el instanceof HTMLElement && el !== row) setTierRowEditing(el, false);
          });
        }
        setTierRowEditing(row, true);
      } else {
        setTierRowEditing(row, false);
      }
      return;
    }
    const subtractorPanelClose = target.closest(".subtractor-panel-close");
    if (subtractorPanelClose instanceof HTMLButtonElement) {
      event.preventDefault();
      const details = subtractorPanelClose.closest("details");
      if (details instanceof HTMLDetailsElement) details.open = false;
      return;
    }
    const addButton = target.closest(".bonus-tier-add");
    if (addButton instanceof HTMLButtonElement) {
      event.preventDefault();
      const targetId = addButton.getAttribute("data-target");
      const templateId = addButton.getAttribute("data-template");
      if (!targetId || !templateId) return;
      const list = document.getElementById(targetId);
      const template = document.getElementById(templateId);
      if (!list || !(template instanceof HTMLTemplateElement)) return;
      list.appendChild(template.content.cloneNode(true));
      return;
    }
    const removeButton = target.closest(".bonus-tier-remove");
    if (removeButton instanceof HTMLButtonElement) {
      event.preventDefault();
      const row = removeButton.closest(".bonus-tier-row");
      if (row) row.remove();
      return;
    }
    const ruleAddButton = target.closest(".bonus-rule-add");
    if (ruleAddButton instanceof HTMLButtonElement) {
      event.preventDefault();
      const targetId = ruleAddButton.getAttribute("data-target");
      const templateId = ruleAddButton.getAttribute("data-template");
      if (!targetId || !templateId) return;
      const list = document.getElementById(targetId);
      const template = document.getElementById(templateId);
      if (!list || !(template instanceof HTMLTemplateElement)) return;
      list.appendChild(template.content.cloneNode(true));
      return;
    }
    const ruleRemoveButton = target.closest(".bonus-rule-remove");
    if (ruleRemoveButton instanceof HTMLButtonElement) {
      event.preventDefault();
      const row = ruleRemoveButton.closest(".bonus-rule-row");
      if (row) row.remove();
      return;
    }
    const subtractorChip = target.closest(".subtractor-chip");
    if (subtractorChip instanceof HTMLButtonElement) {
      event.preventDefault();
      const group = subtractorChip.closest(".subtractor-chip-group");
      if (!group) return;
      const selectName = group.getAttribute("data-select");
      if (!selectName) return;
      const conditionItem = subtractorChip.closest(".subtractor-condition-item");
      if (!(conditionItem instanceof HTMLElement)) return;
      const select = conditionItem.querySelector('select[name="' + selectName + '"]');
      if (select instanceof HTMLSelectElement) {
        const nextValue = subtractorChip.getAttribute("data-value") || "";
        if (nextValue) select.value = nextValue;
      }
      if (select instanceof HTMLSelectElement) {
        syncSubtractorChipGroup(group, select.value);
      }
      syncSubtractorCondition(conditionItem);
      const subtractorForm = subtractorChip.closest(".subtractor-form");
      if (subtractorForm instanceof HTMLFormElement) syncSubtractorFormConfig(subtractorForm);
      return;
    }
    const subtractorAddButton = target.closest(".subtractor-condition-add");
    if (subtractorAddButton instanceof HTMLButtonElement) {
      event.preventDefault();
      const rowId = subtractorAddButton.getAttribute("data-condition-row-id");
      const row = rowId
        ? subtractorAddButton.closest('.subtractor-condition-row[data-condition-row-id="' + rowId + '"]')
        : subtractorAddButton.closest(".subtractor-condition-row");
      const rowMain = row ? row.querySelector(".subtractor-condition-row-main") : null;
      const list = rowMain ? rowMain.querySelector(".subtractor-condition-items") : null;
      const actions = rowMain ? rowMain.querySelector(".subtractor-condition-row-actions") : null;
      const template = document.getElementById("subtractor-condition-template");
      if (!(template instanceof HTMLElement)) return;
      const fragment = document.createDocumentFragment();
      Array.from(template.children).forEach((child) => fragment.appendChild(child.cloneNode(true)));
      const moduleKey = getSubtractorModuleKey(subtractorAddButton);
      const rowIndex = Number(row?.getAttribute("data-row-index") || 0);
      let nextConditionIndex = 0;
      if (row) {
        const prefix = "subtractor-pill-toggle-" + moduleKey + "-" + rowIndex + "-";
        row.querySelectorAll(".subtractor-pill-toggle").forEach((toggle) => {
          if (!(toggle instanceof HTMLInputElement)) return;
          if (!toggle.id.startsWith(prefix)) return;
          const suffix = toggle.id.slice(prefix.length);
          const idx = Number(suffix);
          if (Number.isFinite(idx)) nextConditionIndex = Math.max(nextConditionIndex, idx + 1);
        });
      }
      applySubtractorPillToggleIds(fragment, moduleKey, rowIndex, nextConditionIndex);
      fragment.querySelectorAll(".subtractor-condition-item").forEach((item) => syncSubtractorCondition(item));
      // SUBTRACTOR_OR_INSERT_BEGIN
      const container = list || null;

      if (container) {
        container.appendChild(fragment);
      } else if (rowMain && actions) {
        rowMain.insertBefore(fragment, actions);
      } else {
        return;
      }

      const host = container || rowMain;
      const nextItem = host ? host.querySelector(".subtractor-condition-item:last-child") : null;
      if (nextItem instanceof HTMLElement) {
        const details = nextItem.querySelector(".subtractor-condition-details");
        if (details instanceof HTMLDetailsElement) details.open = true;
      }
      // SUBTRACTOR_OR_INSERT_END
      const subtractorForm = subtractorAddButton.closest(".subtractor-form");
      if (subtractorForm instanceof HTMLFormElement) syncSubtractorFormState(subtractorForm);
      return;
    }
    const subtractorGroupAddButton = target.closest(".subtractor-condition-group-add");
    if (subtractorGroupAddButton instanceof HTMLButtonElement) {
      event.preventDefault();
      const list = subtractorGroupAddButton.closest(".subtractor-conditions")?.querySelector(".subtractor-condition-list");
      const template = document.getElementById("subtractor-condition-group-template");
      if (!list || !(template instanceof HTMLElement)) return;
      const fragment = document.createDocumentFragment();
      Array.from(template.children).forEach((child) => fragment.appendChild(child.cloneNode(true)));
      const moduleKey = getSubtractorModuleKey(subtractorGroupAddButton);
      const rowIndex = list.querySelectorAll(".subtractor-condition-row").length;
      applySubtractorPillToggleIds(fragment, moduleKey, rowIndex, 0);
      fragment.querySelectorAll(".subtractor-condition-item").forEach((item) => syncSubtractorCondition(item));
      const nextItem = fragment.querySelector(".subtractor-condition-item");
      if (nextItem instanceof HTMLElement) {
        const details = nextItem.querySelector(".subtractor-condition-details");
        if (details instanceof HTMLDetailsElement) details.open = true;
      }
      list.appendChild(fragment);
      const subtractorForm = subtractorGroupAddButton.closest(".subtractor-form");
      if (subtractorForm instanceof HTMLFormElement) syncSubtractorFormState(subtractorForm);
      return;
    }
    const subtractorRemoveButton = target.closest(".subtractor-condition-remove");
    if (subtractorRemoveButton instanceof HTMLButtonElement) {
      event.preventDefault();
      const item = subtractorRemoveButton.closest(".subtractor-condition-item");
      const row = item ? item.closest(".subtractor-condition-row") : null;
      if (!item || !row) return;
      const items = row.querySelectorAll(".subtractor-condition-item");
      if (items.length <= 1) return;
      item.remove();
      const subtractorForm = subtractorRemoveButton.closest(".subtractor-form");
      if (subtractorForm instanceof HTMLFormElement) syncSubtractorFormState(subtractorForm);
      return;
    }
    const subtractorGroupRemoveButton = target.closest(".subtractor-condition-group-remove");
    if (subtractorGroupRemoveButton instanceof HTMLButtonElement) {
      event.preventDefault();
      const row = subtractorGroupRemoveButton.closest(".subtractor-condition-row");
      const list = row ? row.parentElement : null;
      if (!row || !list) return;
      const rows = list.querySelectorAll(".subtractor-condition-row");
      if (rows.length <= 1) return;
      row.remove();
      const subtractorForm = subtractorGroupRemoveButton.closest(".subtractor-form");
      if (subtractorForm instanceof HTMLFormElement) syncSubtractorFormState(subtractorForm);
      return;
    }
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.classList.contains("rule-block-edit-form")) {
      const submitter = event.submitter;
      if (submitter instanceof HTMLButtonElement && submitter.classList.contains("tier-remove")) {
        return;
      }
      let hasErrors = false;
      const rows = Array.from(form.querySelectorAll("[data-tier-row]"));
      rows.forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        const isEdited = row.getAttribute("data-tier-edited") === "true";
        setTierRowNames(row, isEdited);
        const isValid = validateTierRow(row);
        if (!isValid) {
          hasErrors = true;
          if (row.getAttribute("data-tier-editing") !== "true") setTierRowEditing(row, true);
        }
      });
      if (hasErrors) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (form.classList.contains("bonus-module-form")) {
      const nameField = form.querySelector('input[name="name"]');
      const typeField = form.querySelector('select[name="bonusType"]');
      const name = nameField instanceof HTMLInputElement ? nameField.value.trim() : "";
      const type = typeField instanceof HTMLSelectElement ? typeField.value : "";
      const error = form.querySelector(".bonus-module-error");
      if (!name || !type) {
        if (error instanceof HTMLElement) error.textContent = "Bonus module name and type are required.";
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (type === "CUSTOM") {
        const customValueField = form.querySelector('input[name="customValue"]');
        const customValueRaw = customValueField instanceof HTMLInputElement ? customValueField.value.trim() : "";
        if (customValueRaw) {
          const customValue = Number(customValueRaw);
          if (Number.isNaN(customValue) || customValue <= 0) {
            if (error instanceof HTMLElement) error.textContent = "Custom value must be a positive number.";
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
      }
      if (type === "SCORECARD_TIER") {
        const presetField = form.querySelector('select[name="scorecardConditionPreset"]');
        const preset = presetField instanceof HTMLSelectElement ? presetField.value.trim() : "";
        if (preset) {
          const operatorField = form.querySelector('select[name="scorecardConditionOperator"]');
          const valueField = form.querySelector('input[name="scorecardConditionValue"]');
          const operator = operatorField instanceof HTMLSelectElement ? operatorField.value : "";
          const valueRaw = valueField instanceof HTMLInputElement ? valueField.value.trim() : "";
          const value = valueRaw === "" ? Number.NaN : Number(valueRaw);
          if (!operator || valueRaw === "" || Number.isNaN(value) || value <= 0) {
            if (error instanceof HTMLElement) error.textContent = "Scorecard condition needs an operator and positive value.";
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          if (preset === "ACTIVITY_TYPES") {
            const activityField = form.querySelector('select[name="scorecardActivityTypeIds"]');
            const hasActivity =
              activityField instanceof HTMLSelectElement && Array.from(activityField.selectedOptions).some((option) => option.value);
            if (!hasActivity) {
              if (error instanceof HTMLElement) error.textContent = "Select at least one activity type.";
              event.preventDefault();
              event.stopPropagation();
              return;
            }
          }
        }
      }
    }
    if (form.classList.contains("bonus-config-form")) {
      const submitter = event.submitter;
      const skipValidation =
        submitter instanceof HTMLButtonElement &&
        (submitter.formNoValidate || submitter.classList.contains("bonus-rule-delete") || submitter.classList.contains("bonus-tier-delete"));
      if (!skipValidation) {
        const hasErrors = validateBonusRuleForm(form);
        if (hasErrors) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    }
    const submitter = event.submitter;
    if (
      submitter instanceof HTMLButtonElement &&
      submitter.classList.contains("bonus-rule-delete") &&
      !submitter.classList.contains("bonus-module-delete")
    ) {
      const ok = window.confirm("Are you sure you want to delete this bonus rule?");
      if (!ok) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (submitter instanceof HTMLButtonElement && submitter.classList.contains("bonus-module-delete")) {
      const ok = window.confirm("Are you sure you want to delete this bonus module?");
      if (!ok) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    const isConditionDelete = form.classList.contains("scorecard-delete-condition");
    const isGroupDelete = form.classList.contains("scorecard-delete-condition-group");
    if (!isConditionDelete && !isGroupDelete) return;
    const ok = window.confirm(isGroupDelete ? "Are you sure you want to delete this condition row?" : "Are you sure you want to delete this condition?");
    if (!ok) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
})();
          `,
        }}
      />
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
                        {(() => {
                          const primaryActionStyle = {
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "1px solid #2563eb",
                            background: "#2563eb",
                            color: "white",
                            fontWeight: 700,
                            cursor: "pointer",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                          };
                          const secondaryActionStyle = {
                            padding: "8px 12px",
                            borderRadius: 10,
                            border: "1px solid #d1d5db",
                            background: "white",
                            color: "#2563eb",
                            fontWeight: 700,
                            cursor: "pointer",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 6,
                          };
                          return (
                        <section style={{ marginTop: 16, display: "grid", gap: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 16 }}>Special Rules</div>
                              <div style={{ fontSize: 12, color: "#6b7280" }}>
                                Per-policy overrides (e.g., pay a higher % when a single policy premium exceeds a threshold).
                              </div>
                            </div>
                            <a
                              href={`#add-special-rule-${selectedLob.id}`}
                              className="btn primary"
                              style={{ textDecoration: "none", padding: "8px 12px", cursor: "pointer" }}
                            >
                              + Add special rule
                            </a>
                          </div>
                          {(() => {
                            const specialRulesByLobId = (version as { config?: { specialRulesByLobId?: Record<string, SpecialRule[]> } })?.config
                              ?.specialRulesByLobId;
                            const rules = Array.isArray(specialRulesByLobId?.[selectedLob.id])
                              ? (specialRulesByLobId[selectedLob.id] as SpecialRule[])
                              : [];
                            const rulesSorted = rules
                              .map((rule, idx) => {
                                const orderIndex =
                                  typeof rule.orderIndex === "number" && Number.isFinite(rule.orderIndex) ? rule.orderIndex : 100000 + idx;
                                return { rule, orderIndex };
                              })
                              .sort((a, b) => {
                                if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
                                const aCreated = typeof a.rule.createdAt === "string" ? a.rule.createdAt : "";
                                const bCreated = typeof b.rule.createdAt === "string" ? b.rule.createdAt : "";
                                if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
                                return a.rule.id.localeCompare(b.rule.id);
                              })
                              .map((entry) => entry.rule);
                            const normalizeRuleName = (rule: SpecialRule) =>
                              typeof rule.name === "string" && rule.name.trim() ? rule.name.trim() : "Untitled rule";
                            const getProductSet = (rule: SpecialRule) => new Set(Array.isArray(rule.productIds) ? rule.productIds : []);
                            const getStatusInfo = (rule: SpecialRule) => {
                              const statuses = Array.isArray(rule.statusEligibility) ? rule.statusEligibility : [];
                              return { isDefault: statuses.length === 0, statusSet: new Set(statuses) };
                            };
                            const overlaps = (a: SpecialRule, b: SpecialRule) => {
                              if (!Boolean(a.enabled) || !Boolean(b.enabled)) return false;
                              const productsA = getProductSet(a);
                              const productsB = getProductSet(b);
                              let hasProductOverlap = false;
                              for (const id of productsA) {
                                if (productsB.has(id)) {
                                  hasProductOverlap = true;
                                  break;
                                }
                              }
                              if (!hasProductOverlap) return false;
                              const { isDefault: aDefault, statusSet: aStatusSet } = getStatusInfo(a);
                              const { isDefault: bDefault, statusSet: bStatusSet } = getStatusInfo(b);
                              if (aDefault && bDefault) return true;
                              if (aDefault || bDefault) return false;
                              for (const status of aStatusSet) {
                                if (bStatusSet.has(status)) return true;
                              }
                              return false;
                            };
                            if (!rules.length) {
                              return (
                                <div
                                  style={{
                                    border: "1px dashed #e5e7eb",
                                    borderRadius: 10,
                                    padding: 12,
                                    background: "#f8fafc",
                                    color: "#94a3b8",
                                    fontSize: 13,
                                  }}
                                >
                                  No special rules yet.
                                </div>
                              );
                            }
                            return (
                              <div style={{ display: "grid", gap: 8 }}>
                                {rulesSorted.map((rule, ruleIndex) => {
                                  const ruleName = normalizeRuleName(rule);
                                  const selectedProductIds = Array.isArray(rule.productIds) ? rule.productIds : [];
                                  const productCount = selectedProductIds.length;
                                  const thresholdValue =
                                    typeof rule.thresholdPremium === "number" && Number.isFinite(rule.thresholdPremium) ? rule.thresholdPremium : 0;
                                  const thresholdDefaultValue =
                                    typeof rule.thresholdPremium === "number" && Number.isFinite(rule.thresholdPremium) ? rule.thresholdPremium : "";
                                  const payoutValue = typeof rule.payoutValue === "number" && Number.isFinite(rule.payoutValue) ? rule.payoutValue : 0;
                                  const payoutDefaultValue =
                                    typeof rule.payoutValue === "number" && Number.isFinite(rule.payoutValue) ? rule.payoutValue : "";
                                  const payoutTypeValue = rule.payoutType === "FLAT" ? "FLAT" : "PERCENT";
                                  const interactionModeValue =
                                    rule.interactionMode === "OVERRIDE_SPECIAL" ||
                                    rule.interactionMode === "HIGHER_OF_BASE_OR_SPECIAL" ||
                                    rule.interactionMode === "ADD_ON_TOP_OF_BASE"
                                      ? rule.interactionMode
                                      : "HIGHER_OF_BASE_OR_SPECIAL";
                                  const statusEligibilityValues = Array.isArray(rule.statusEligibility) ? rule.statusEligibility : [];
                                  const statusText =
                                    statusEligibilityValues.length ? statusEligibilityValues.join(", ") : "Default";
                                  const payoutText =
                                    rule.payoutType === "PERCENT"
                                      ? `Pays ${payoutValue}% per policy`
                                      : `Pays ${fmtMoneyNumber(payoutValue)} per policy`;
                                  const interactionText =
                                    rule.interactionMode === "OVERRIDE_SPECIAL"
                                      ? "Override base payout"
                                      : rule.interactionMode === "ADD_ON_TOP_OF_BASE"
                                        ? "Add on top of base payout"
                                        : "Higher of base or special";
                                  const enabled = Boolean(rule.enabled);
                                  const enabledLabel = enabled ? "Enabled" : "Disabled";
                                  const enabledStyles = enabled ? { background: "#dcfce7", color: "#15803d" } : { background: "#fee2e2", color: "#b91c1c" };
                                  const showEditError = Boolean(specialRuleErrMessageText && specialRuleErrRuleId === rule.id);
                                  const isFirst = ruleIndex === 0;
                                  const isLast = ruleIndex === rulesSorted.length - 1;
                                  const overlappingNames = rulesSorted
                                    .filter((other) => other.id !== rule.id && overlaps(rule, other))
                                    .map((other) => normalizeRuleName(other));
                                  const overlapVisible = overlappingNames.slice(0, 3);
                                  const overlapExtra = overlappingNames.length - overlapVisible.length;
                                  const overlapText =
                                    overlapVisible.join(", ") + (overlapExtra > 0 ? ` and ${overlapExtra} more` : "");
                                  const showOverlapWarning = enabled && overlapVisible.length > 0;
                                  return (
                                    <div key={rule.id} style={{ position: "relative" }}>
                                      <a
                                        href={`#edit-special-rule-${rule.id}`}
                                        style={{ textDecoration: "none", color: "inherit", display: "block", cursor: "pointer" }}
                                      >
                                        <div
                                          style={{
                                            border: "1px solid #e5e7eb",
                                            borderRadius: 10,
                                            padding: 10,
                                            paddingRight: 96,
                                            background: "white",
                                            display: "grid",
                                            gap: 6,
                                          }}
                                        >
                                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                          <div style={{ fontWeight: 700 }}>{ruleName}</div>
                                          <span
                                            style={{
                                              fontSize: 11,
                                              fontWeight: 700,
                                              padding: "2px 8px",
                                              borderRadius: 999,
                                              ...enabledStyles,
                                            }}
                                          >
                                            {enabledLabel}
                                          </span>
                                        </div>
                                        <div style={{ fontSize: 12, color: "#475569", display: "flex", flexWrap: "wrap", gap: 8 }}>
                                          <span>Products: {productCount} selected</span>
                                          <span>•</span>
                                          <span>Trigger: Single policy premium &gt;= {fmtMoneyNumber(thresholdValue)}</span>
                                          <span>•</span>
                                          <span>Payout: {payoutText}</span>
                                          <span>•</span>
                                          <span>Interaction: {interactionText}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: "#475569", display: "flex", flexWrap: "wrap", gap: 8 }}>
                                          <span>Contributes to tier premium: {rule.contributesToTierBasis ? "Yes" : "No"}</span>
                                          <span>•</span>
                                          <span>Status eligibility: {statusText}</span>
                                        </div>
                                        {showOverlapWarning ? (
                                          <div style={{ fontSize: 12, background: "#fef9c3", border: "1px solid #fde68a", color: "#92400e", padding: "6px 8px", borderRadius: 8 }}>
                                            Overlaps with: {overlapText}
                                          </div>
                                        ) : null}
                                      </div>
                                      </a>
                                      <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6 }}>
                                        <form action={moveSpecialRule} style={{ margin: 0 }}>
                                          <input type="hidden" name="lobId" value={selectedLob.id} />
                                          <input type="hidden" name="specialRuleId" value={rule.id} />
                                          <input type="hidden" name="direction" value="up" />
                                          <button
                                            type="submit"
                                            disabled={isFirst}
                                            style={{
                                              padding: "4px 10px",
                                              borderRadius: 999,
                                              border: "1px solid #d1d5db",
                                              color: "#2563eb",
                                              background: "white",
                                              fontWeight: 700,
                                              cursor: isFirst ? "not-allowed" : "pointer",
                                              opacity: isFirst ? 0.5 : 1,
                                            }}
                                          >
                                            Up
                                          </button>
                                        </form>
                                        <form action={moveSpecialRule} style={{ margin: 0 }}>
                                          <input type="hidden" name="lobId" value={selectedLob.id} />
                                          <input type="hidden" name="specialRuleId" value={rule.id} />
                                          <input type="hidden" name="direction" value="down" />
                                          <button
                                            type="submit"
                                            disabled={isLast}
                                            style={{
                                              padding: "4px 10px",
                                              borderRadius: 999,
                                              border: "1px solid #d1d5db",
                                              color: "#2563eb",
                                              background: "white",
                                              fontWeight: 700,
                                              cursor: isLast ? "not-allowed" : "pointer",
                                              opacity: isLast ? 0.5 : 1,
                                            }}
                                          >
                                            Down
                                          </button>
                                        </form>
                                        <a
                                          href={`#edit-special-rule-${rule.id}`}
                                          style={{
                                            padding: "4px 10px",
                                            borderRadius: 999,
                                            border: "1px solid #d1d5db",
                                            color: "#2563eb",
                                            background: "white",
                                            fontWeight: 700,
                                            cursor: "pointer",
                                            textDecoration: "none",
                                          }}
                                        >
                                          Edit
                                        </a>
                                        <form action={cloneSpecialRule} style={{ margin: 0 }}>
                                          <input type="hidden" name="lobId" value={selectedLob.id} />
                                          <input type="hidden" name="specialRuleId" value={rule.id} />
                                          <button
                                            type="submit"
                                            style={{
                                              padding: "4px 10px",
                                              borderRadius: 999,
                                              border: "1px solid #d1d5db",
                                              color: "#2563eb",
                                              background: "white",
                                              fontWeight: 700,
                                              cursor: "pointer",
                                            }}
                                          >
                                            Clone
                                          </button>
                                        </form>
                                        <form
                                          action={deleteSpecialRule}
                                          onSubmit={(e) => {
                                            if (!window.confirm("Delete this special rule?")) {
                                              e.preventDefault();
                                              e.stopPropagation();
                                            }
                                          }}
                                          style={{ margin: 0 }}
                                        >
                                          <input type="hidden" name="lobId" value={selectedLob.id} />
                                          <input type="hidden" name="specialRuleId" value={rule.id} />
                                          <button
                                            type="submit"
                                            style={{
                                              padding: "4px 10px",
                                              borderRadius: 999,
                                              border: "1px solid #dc2626",
                                              color: "#b91c1c",
                                              background: "white",
                                              fontWeight: 700,
                                              cursor: "pointer",
                                            }}
                                          >
                                            Delete
                                          </button>
                                        </form>
                                      </div>
                                      <div id={`edit-special-rule-${rule.id}`} className="modal-target">
                                        <a href="#" className="modal-close-overlay" aria-label="Close modal"></a>
                                        <div
                                          className="modal-card"
                                          style={{
                                            width: 560,
                                            maxWidth: "92vw",
                                            maxHeight: "80vh",
                                            overflow: "auto",
                                            padding: 16,
                                            display: "grid",
                                            gap: 12,
                                          }}
                                        >
                                          <a
                                            href="#"
                                            style={{
                                              position: "absolute",
                                              top: 10,
                                              right: 12,
                                              textDecoration: "none",
                                              color: "#64748b",
                                              fontWeight: 700,
                                            }}
                                          >
                                            X
                                          </a>
                                          <div style={{ fontWeight: 800, fontSize: 16 }}>Edit special rule</div>
                                          {showEditError ? (
                                            <div style={{ background: "#fee", border: "1px solid #f99", padding: "10px 12px", borderRadius: 8, marginBottom: 12, color: "#900" }}>
                                              {specialRuleErrMessageText}
                                            </div>
                                          ) : null}
                                          <form action={updateSpecialRule} data-special-rule-form="true" style={{ display: "grid", gap: 12 }}>
                                            <input type="hidden" name="lobId" value={selectedLob.id} />
                                            <input type="hidden" name="specialRuleId" value={rule.id} />
                                            <label style={{ display: "grid", gap: 4 }}>
                                              <span style={{ fontWeight: 600 }}>Rule name</span>
                                              <input name="name" defaultValue={rule.name || ""} placeholder="Rule name" style={{ padding: 10 }} />
                                            </label>
                                            <div style={{ display: "grid", gap: 6 }}>
                                              <div style={{ fontWeight: 600 }}>Status eligibility</div>
                                              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                                                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                                  <input type="checkbox" name="statusEligibility" value="WRITTEN" defaultChecked={statusEligibilityValues.includes("WRITTEN")} /> WRITTEN
                                                </label>
                                                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                                  <input type="checkbox" name="statusEligibility" value="ISSUED" defaultChecked={statusEligibilityValues.includes("ISSUED")} /> ISSUED
                                                </label>
                                                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                                  <input type="checkbox" name="statusEligibility" value="PAID" defaultChecked={statusEligibilityValues.includes("PAID")} /> PAID
                                                </label>
                                                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                                  <input type="checkbox" name="statusEligibility" value="CANCELLED" defaultChecked={statusEligibilityValues.includes("CANCELLED")} /> CANCELLED
                                                </label>
                                                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                                  <input type="checkbox" name="statusEligibility" value="STATUS_CHECK" defaultChecked={statusEligibilityValues.includes("STATUS_CHECK")} /> STATUS_CHECK
                                                </label>
                                                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                                  <input type="checkbox" name="enabled" value="true" defaultChecked={enabled} /> Enabled
                                                </label>
                                              </div>
                                            </div>
                                            <div style={{ display: "grid", gap: 6 }}>
                                              <div style={{ fontWeight: 600 }}>Products scope</div>
                                              <div style={{ display: "grid", gap: 8 }}>
                                                <div style={{ fontSize: 12, color: "#6b7280" }} data-special-rule-selected-count>
                                                  Selected: {productCount}
                                                </div>
                                                <div
                                                  style={{
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: 10,
                                                    background: "#f8fafc",
                                                    padding: 8,
                                                    display: "grid",
                                                    gap: 6,
                                                  }}
                                                >
                                                  {products
                                                    .filter((p) => p.lobName === selectedLob.name)
                                                    .map((p) => (
                                                      <label
                                                        key={`${rule.id}-${p.id}`}
                                                        style={{
                                                          display: "flex",
                                                          alignItems: "center",
                                                          justifyContent: "space-between",
                                                          gap: 8,
                                                          padding: "6px 8px",
                                                          borderRadius: 8,
                                                          background: "white",
                                                          border: "1px solid #e5e7eb",
                                                          cursor: "pointer",
                                                        }}
                                                      >
                                                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                                          <input type="checkbox" name="productIds" value={p.id} defaultChecked={selectedProductIds.includes(p.id)} />
                                                          <span>{p.name}</span>
                                                        </span>
                                                        <span style={{ fontSize: 12, color: "#94a3b8" }}>
                                                          Used: {productUsage.get(p.id) || 0}
                                                        </span>
                                                      </label>
                                                    ))}
                                                </div>
                                              </div>
                                            </div>
                                            <label style={{ display: "grid", gap: 4 }}>
                                              <span style={{ fontWeight: 600 }}>Trigger</span>
                                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                                <span style={{ fontSize: 13 }}>If single policy premium &gt;=</span>
                                                <input
                                                  type="number"
                                                  name="thresholdPremium"
                                                  step="0.01"
                                                  defaultValue={thresholdDefaultValue}
                                                  placeholder="0.00"
                                                  style={{ padding: "6px 8px", width: 140 }}
                                                />
                                              </div>
                                            </label>
                                            <label style={{ display: "grid", gap: 4 }}>
                                              <span style={{ fontWeight: 600 }}>Payout type</span>
                                              <select name="payoutType" defaultValue={payoutTypeValue} style={{ padding: "6px 8px" }}>
                                                <option value="PERCENT">Percent of policy premium</option>
                                                <option value="FLAT">Flat $ per policy</option>
                                              </select>
                                            </label>
                                            <label style={{ display: "grid", gap: 4 }}>
                                              <span style={{ fontWeight: 600 }}>Payout value</span>
                                              <span style={{ fontSize: 12, color: "#6b7280" }}>Use % for percent or $ for flat per policy.</span>
                                              <input
                                                type="number"
                                                name="payoutValue"
                                                step="0.01"
                                                defaultValue={payoutDefaultValue}
                                                placeholder="0.00"
                                                style={{ padding: "6px 8px", width: 140 }}
                                              />
                                            </label>
                                            <label style={{ display: "grid", gap: 4 }}>
                                              <span style={{ fontWeight: 600 }}>When this special rule applies.</span>
                                              <select name="interactionMode" defaultValue={interactionModeValue} style={{ padding: "6px 8px" }}>
                                                <option value="OVERRIDE_SPECIAL">Override base payout</option>
                                                <option value="HIGHER_OF_BASE_OR_SPECIAL">Pay higher of base or special</option>
                                                <option value="ADD_ON_TOP_OF_BASE">Add on top of base payout</option>
                                              </select>
                                              <span style={{ fontSize: 12, color: "#6b7280" }}>If payout types differ from the base rule, Paychecks will treat this as override.</span>
                                            </label>
                                            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                              <input type="checkbox" name="contributesToTierBasis" defaultChecked={Boolean(rule.contributesToTierBasis)} /> Premium contributes toward tier premium
                                            </label>
                                            <div style={{ display: "flex", gap: 8 }}>
                                              <button type="submit" className="btn primary" style={primaryActionStyle}>Save changes</button>
                                              <a href="#" className="btn" style={secondaryActionStyle}>Cancel</a>
                                            </div>
                                          </form>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          <div id={`add-special-rule-${selectedLob.id}`} className="modal-target">
                            <a href="#" className="modal-close-overlay" aria-label="Close modal"></a>
                            <div
                              className="modal-card"
                              style={{
                                width: 560,
                                maxWidth: "92vw",
                                maxHeight: "80vh",
                                overflow: "auto",
                                padding: 16,
                                display: "grid",
                                gap: 12,
                              }}
                            >
                              <a href="#" style={{ position: "absolute", top: 10, right: 12, textDecoration: "none", color: "#64748b", fontWeight: 700 }}>
                                ✕
                              </a>
                              <div style={{ fontWeight: 800, fontSize: 16 }}>Add special rule</div>
                              {specialRuleErrMessageText && !specialRuleErrRuleId ? (
                                <div style={{ background: "#fee", border: "1px solid #f99", padding: "10px 12px", borderRadius: 8, marginBottom: 12, color: "#900" }}>
                                  {specialRuleErrMessageText}
                                </div>
                              ) : null}
                              <form action={addSpecialRule} data-special-rule-form="true" style={{ display: "grid", gap: 12 }}>
                                <input type="hidden" name="lobId" value={selectedLob.id} />
                              <label style={{ display: "grid", gap: 4 }}>
                                <span style={{ fontWeight: 600 }}>Rule name</span>
                                <input name="name" placeholder="Rule name" style={{ padding: 10 }} />
                              </label>
                              <div style={{ display: "grid", gap: 6 }}>
                                <div style={{ fontWeight: 600 }}>Status eligibility</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                    <input type="checkbox" name="statusEligibility" value="WRITTEN" /> WRITTEN
                                  </label>
                                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                    <input type="checkbox" name="statusEligibility" value="ISSUED" /> ISSUED
                                  </label>
                                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                    <input type="checkbox" name="statusEligibility" value="PAID" /> PAID
                                  </label>
                                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                    <input type="checkbox" name="statusEligibility" value="CANCELLED" /> CANCELLED
                                  </label>
                                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                    <input type="checkbox" name="statusEligibility" value="STATUS_CHECK" /> STATUS_CHECK
                                  </label>
                                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                    <input type="checkbox" name="enabled" value="true" /> Enabled
                                  </label>
                                </div>
                              </div>
                              <div style={{ display: "grid", gap: 6 }}>
                                <div style={{ fontWeight: 600 }}>Products scope</div>
                                <div style={{ display: "grid", gap: 8 }}>
                                  <div style={{ fontSize: 12, color: "#6b7280" }} data-special-rule-selected-count>
                                    Selected: 0
                                  </div>
                                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#f8fafc", padding: 8, display: "grid", gap: 6 }}>
                                    {products
                                      .filter((p) => p.lobName === selectedLob.name)
                                      .map((p) => (
                                        <label
                                          key={p.id}
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: 8,
                                            padding: "6px 8px",
                                            borderRadius: 8,
                                            background: "white",
                                            border: "1px solid #e5e7eb",
                                            cursor: "pointer",
                                          }}
                                        >
                                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                            <input type="checkbox" name="productIds" value={p.id} />
                                            <span>{p.name}</span>
                                          </span>
                                          <span style={{ fontSize: 12, color: "#94a3b8" }}>Used: {productUsage.get(p.id) || 0}</span>
                                        </label>
                                      ))}
                                  </div>
                                </div>
                              </div>
                              <label style={{ display: "grid", gap: 4 }}>
                                <span style={{ fontWeight: 600 }}>Trigger</span>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                                  <span style={{ fontSize: 13 }}>If single policy premium &gt;=</span>
                                  <input type="number" name="thresholdPremium" step="0.01" placeholder="0.00" style={{ padding: "6px 8px", width: 140 }} />
                                </div>
                              </label>
                              <label style={{ display: "grid", gap: 4 }}>
                                <span style={{ fontWeight: 600 }}>Payout type</span>
                                <select name="payoutType" defaultValue="PERCENT" style={{ padding: "6px 8px" }}>
                                  <option value="PERCENT">Percent of policy premium</option>
                                  <option value="FLAT">Flat $ per policy</option>
                                </select>
                              </label>
                              <label style={{ display: "grid", gap: 4 }}>
                                <span style={{ fontWeight: 600 }}>Payout value</span>
                                <span style={{ fontSize: 12, color: "#6b7280" }}>Use % for percent or $ for flat per policy.</span>
                                <input type="number" name="payoutValue" step="0.01" placeholder="0.00" style={{ padding: "6px 8px", width: 140 }} />
                              </label>
                              <label style={{ display: "grid", gap: 4 }}>
                                <span style={{ fontWeight: 600 }}>When this special rule applies…</span>
                                <select name="interactionMode" defaultValue="HIGHER_OF_BASE_OR_SPECIAL" style={{ padding: "6px 8px" }}>
                                  <option value="OVERRIDE_SPECIAL">Override base payout</option>
                                  <option value="HIGHER_OF_BASE_OR_SPECIAL">Pay higher of base or special</option>
                                  <option value="ADD_ON_TOP_OF_BASE">Add on top of base payout</option>
                                </select>
                                <span style={{ fontSize: 12, color: "#6b7280" }}>
                                  If payout types differ from the base rule, Paychecks will treat this as override.
                                </span>
                              </label>
                              <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <input type="checkbox" name="contributesToTierBasis" defaultChecked /> Premium contributes toward tier premium
                              </label>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button type="submit" className="btn primary" style={primaryActionStyle}>Save special rule</button>
                                <a href="#" className="btn" style={secondaryActionStyle}>Cancel</a>
                              </div>
                              </form>
                            </div>
                          </div>
                        </section>
                          );
                        })()}
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
                          {t.minValue}-{t.maxValue ?? "∞"} =&gt;{" "}
                          {rb.payoutType === CompPayoutType.PERCENT_OF_PREMIUM
                            ? `${t.payoutValue}%`
                            : `${t.payoutValue} ${t.payoutUnit || payoutUnitLabel(rb.payoutType)}`}
                        </div>
                      ))}
                  </div>
                ) : null}

                {/* Edit modal for this block */} 
                <div id={`edit-${rb.id}`} className="modal-target">
                  <div
                    className="modal-card"
                    style={{
                      width: 520,
                      maxWidth: "92vw",
                      maxHeight: "80vh",
                      overflow: "auto",
                      padding: 16,
                      display: "grid",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                        background: "#fff",
                        paddingBottom: 8,
                        borderBottom: "1px solid #e5e7eb",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 16 }}>Edit rule block</div>
                      <a
                        href="#"
                        style={{
                          textDecoration: "none",
                          padding: "6px 10px",
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          background: "#f8fafc",
                          color: "#475569",
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        Close
                      </a>
                    </div>
                    <form action={updateRuleBlock} className="rule-block-edit-form" style={{ display: "grid", gap: 12 }}>
                      <input type="hidden" name="ruleBlockId" value={rb.id} />
                      <input type="hidden" name="redirectHash" value="" />
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Basics</div>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontWeight: 600 }}>Rule name</span>
                          <input name="name" defaultValue={rb.name} style={{ padding: 10 }} />
                        </label>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          Tip: Clear "Min threshold" to remove the gate requirement. Adjust tiers below or remove them to change the sentence.
                        </div>
                        <div
                          style={{
                            padding: 10,
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#f8fafc",
                            display: "grid",
                            gap: 4,
                          }}
                        >
                          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            Current sentence
                          </div>
                          <div style={{ fontSize: 13, color: "#0f172a" }}>{ruleSummary(rb)}</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Payout settings</div>
                        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
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
                            <input name="basePayoutValue" type="number" step="any" inputMode="decimal" defaultValue={rb.basePayoutValue ?? 0} style={{ padding: 10 }} />
                          </label>
                          <label style={{ display: "grid", gap: 4 }}>
                            <span style={{ fontWeight: 600 }}>Minimum threshold (apps/premium)</span>
                            <input name="minThreshold" type="number" step="0.01" defaultValue={rb.minThreshold ?? ""} style={{ padding: 10 }} />
                          </label>
                        </div>
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Statuses</div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#475569" }}>
                          {[PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID, PolicyStatus.CANCELLED, PolicyStatus.STATUS_CHECK].map((s) => (
                            <label key={`edit-status-${rb.id}-${s}`} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                              <input type="checkbox" name="statusOverride" value={s} defaultChecked={rb.statusEligibilityOverride.includes(s)} /> {s}
                            </label>
                          ))}
                        </div>
                        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: "#475569" }}>
                          <input type="checkbox" name="enabled" defaultChecked={rb.enabled} /> Enabled
                        </label>
                      </div>
                      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "grid", gap: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>Tiers</div>
                        {rb.tiers
                          .sort((a, b) => a.orderIndex - b.orderIndex)
                          .map((t) => (
                            <div
                              key={t.id}
                              data-tier-row
                              data-tier-id={t.id}
                              data-tier-unit={rb.payoutType === CompPayoutType.PERCENT_OF_PREMIUM ? "%" : t.payoutUnit || payoutUnitLabel(rb.payoutType)}
                              data-tier-editing="false"
                              data-tier-edited="true"
                              style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(0, 1fr) auto",
                                gap: 8,
                                alignItems: "center",
                                padding: "8px 10px",
                                border: "1px solid #e5e7eb",
                                borderRadius: 8,
                                background: "#f8fafc",
                              }}
                            >
                              <details className="tier-edit-details" style={{ display: "grid", gap: 6 }}>
                                <summary
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 8,
                                    cursor: "pointer",
                                    listStyle: "none",
                                  }}
                                  aria-label="Edit tier"
                                >
                                  <span data-tier-summary style={{ fontSize: 12, color: "#111" }}>
                                    {t.minValue}-{t.maxValue ?? "∞"} =&gt;{" "}
                                    {rb.payoutType === CompPayoutType.PERCENT_OF_PREMIUM
                                      ? `${t.payoutValue}%`
                                      : `${t.payoutValue} ${t.payoutUnit || payoutUnitLabel(rb.payoutType)}`}
                                  </span>
                                  <span className="tier-edit-icon" aria-hidden="true">
                                    {"\u270E"}
                                  </span>
                                </summary>
                                <input type="hidden" name="tierEditId" value={t.id} data-tier-id-input />
                                <div
                                  data-tier-edit
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                                    gap: 6,
                                  }}
                                >
                                  <input
                                    type="number"
                                    step="0.01"
                                    name="tierEditMin"
                                    data-tier-input="min"
                                    defaultValue={t.minValue}
                                    placeholder="Min"
                                    style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    name="tierEditMax"
                                    data-tier-input="max"
                                    defaultValue={t.maxValue ?? ""}
                                    placeholder="Max"
                                    style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    name="tierEditPayout"
                                    data-tier-input="payout"
                                    defaultValue={t.payoutValue}
                                    placeholder="Payout"
                                    style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                                  />
                                </div>
                                <div data-tier-error style={{ display: "none", fontSize: 11, color: "#b91c1c" }}></div>
                              </details>
                              <button type="submit" form={`remove-tier-${t.id}`} className="btn danger tier-remove" style={{ padding: "4px 8px" }}>
                                Remove tier
                              </button>
                            </div>
                          ))}
                        {rb.tiers.length === 0 ? <div style={{ fontSize: 12, color: "#6b7280" }}>No tiers yet.</div> : null}
                        <div style={{ fontSize: 12, color: "#6b7280" }}>Edit tier values with the pencil, then save changes.</div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                        <button type="submit" className="btn rule-block-save">
                          Save changes
                        </button>
                        <a href="#" className="btn rule-block-cancel">
                          Cancel
                        </a>
                      </div>
                    </form>
                    {rb.tiers.map((t) => (
                      <form key={`remove-tier-${t.id}`} id={`remove-tier-${t.id}`} action={removeTier} style={{ display: "none" }}>
                        <input type="hidden" name="tierId" value={t.id} />
                        <button type="submit" className="btn danger">
                          Remove tier
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

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
                    {gateSuccessMessage ? (
                      <div style={{ marginBottom: 8, color: "#166534", background: "#dcfce7", padding: "8px 10px", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 13 }}>
                        {gateSuccessMessage}
                      </div>
                    ) : null}
                    {gateErrMessage ? (
                      <div style={{ marginBottom: 8, color: "#b91c1c", background: "#fee2e2", padding: "8px 10px", borderRadius: 8, border: "1px solid #fecaca", fontSize: 13 }}>
                        {gateErrMessage}
                      </div>
                    ) : null}
                    {(() => {
                      const bucketNameById = new Map(buckets.map((b) => [b.id, b.name]));
                      const ruleBlockNameById = new Map((version?.ruleBlocks || []).map((rb) => [rb.id, rb.name]));
                      const gates = version?.gates || [];
                      return (
                        <div style={{ display: "grid", gap: 10 }}>
                          {gates.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 12 }}>No gates yet.</div> : null}
                          {gates.map((g) => {
                            const bucketName = g.bucketId ? bucketNameById.get(g.bucketId) || "Unknown bucket" : null;
                            const scopedRuleNames = g.ruleBlockIds.map((id) => ruleBlockNameById.get(id) || "Unknown rule");
                            return (
                              <div key={g.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                                  <div>
                                    <div style={{ fontWeight: 700 }}>{g.name}</div>
                                    <div style={{ color: "#555", fontSize: 13 }}>
                                      {g.gateType} • Threshold {g.thresholdValue} • {g.behavior} • Scope {g.scope}
                                    </div>
                                    {bucketName ? <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>Bucket: {bucketName}</div> : null}
                                    {g.scope === CompGateScope.RULE_BLOCKS ? (
                                      <div style={{ color: "#475569", fontSize: 12, marginTop: 4 }}>
                                        Rule blocks: {scopedRuleNames.length ? scopedRuleNames.join(", ") : "None selected"}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 12, color: g.enabled ? "#15803d" : "#b91c1c" }}>{g.enabled ? "Enabled" : "Disabled"}</span>
                                    <a
                                      href={`#edit-gate-${g.id}`}
                                      style={{
                                        textDecoration: "none",
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #d1d5db",
                                        color: "#2563eb",
                                        fontWeight: 700,
                                      }}
                                    >
                                      Edit
                                    </a>
                                    <form action={deleteGate} style={{ margin: 0 }}>
                                      <input type="hidden" name="gateId" value={g.id} />
                                      <input type="hidden" name="redirectSection" value={section} />
                                      <input type="hidden" name="redirectLob" value={selectedLobId || ""} />
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

                                <div id={`edit-gate-${g.id}`} className="modal-target">
                                  <a href="#" className="modal-close-overlay" aria-label="Close modal"></a>
                                  <div className="modal-card">
                                    <a href="#" style={{ position: "absolute", top: 10, right: 12, textDecoration: "none", color: "#64748b", fontWeight: 700 }}>
                                      ✕
                                    </a>
                                    <div style={{ fontWeight: 800, marginBottom: 10 }}>Edit requirement</div>
                                    <form action={updateGate} style={{ display: "grid", gap: 10 }}>
                                      <input type="hidden" name="gateId" value={g.id} />
                                      <input type="hidden" name="redirectSection" value={section} />
                                      <input type="hidden" name="redirectLob" value={selectedLobId || ""} />
                                      <label style={{ display: "grid", gap: 4 }}>
                                        <span style={{ fontWeight: 600 }}>Gate name</span>
                                        <input name="name" defaultValue={g.name} required style={{ padding: 10 }} />
                                      </label>
                                      <label style={{ display: "grid", gap: 4 }}>
                                        <span style={{ fontWeight: 600 }}>Gate type</span>
                                        <select name="gateType" defaultValue={g.gateType} required style={{ padding: 10 }}>
                                          <option value={CompGateType.MIN_APPS}>Min apps</option>
                                          <option value={CompGateType.MIN_PREMIUM}>Min premium</option>
                                          <option value={CompGateType.MIN_BUCKET}>Min bucket</option>
                                        </select>
                                      </label>
                                      <label style={{ display: "grid", gap: 4 }}>
                                        <span style={{ fontWeight: 600 }}>Threshold</span>
                                        <input name="thresholdValue" type="number" step="0.01" defaultValue={g.thresholdValue} required style={{ padding: 10 }} />
                                      </label>
                                      <label style={{ display: "grid", gap: 4 }}>
                                        <span style={{ fontWeight: 600 }}>Behavior</span>
                                        <select name="behavior" defaultValue={g.behavior} required style={{ padding: 10 }}>
                                          <option value={CompGateBehavior.HARD_GATE}>Hard gate</option>
                                          <option value={CompGateBehavior.RETROACTIVE}>Retroactive</option>
                                          <option value={CompGateBehavior.NON_RETROACTIVE}>Non-retro</option>
                                        </select>
                                      </label>
                                      <label style={{ display: "grid", gap: 4 }}>
                                        <span style={{ fontWeight: 600 }}>Scope</span>
                                        <select name="scope" defaultValue={g.scope} required style={{ padding: 10 }}>
                                          <option value={CompGateScope.PLAN}>Entire plan</option>
                                          <option value={CompGateScope.RULE_BLOCKS}>Specific rule blocks</option>
                                        </select>
                                      </label>
                                      <label style={{ display: "grid", gap: 4 }}>
                                        <span style={{ fontWeight: 600 }}>Bucket (optional)</span>
                                        <select name="bucketId" defaultValue={g.bucketId || ""} style={{ padding: 10 }}>
                                          <option value="">(none)</option>
                                          {buckets.map((b) => (
                                            <option key={b.id} value={b.id}>
                                              {b.name}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <div style={{ display: "grid", gap: 6 }}>
                                        <div style={{ fontWeight: 600 }}>Apply to rule blocks (optional)</div>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                          {(version?.ruleBlocks || []).map((rb) => (
                                            <label key={`gate-${g.id}-rb-${rb.id}`} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                              <input type="checkbox" name="ruleBlockIds" value={rb.id} defaultChecked={g.ruleBlockIds.includes(rb.id)} /> {rb.name}
                                            </label>
                                          ))}
                                        </div>
                                      </div>
                                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                        <input type="checkbox" name="enabled" defaultChecked={g.enabled} /> Enabled
                                      </label>
                                      <div style={{ display: "flex", gap: 8 }}>
                                        <button type="submit" className="btn primary">Save changes</button>
                                        <a href="#" className="btn">Cancel</a>
                                      </div>
                                    </form>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ Add Requirement</summary>
                      <form action={addGate} style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                        <input name="name" placeholder="Gate name" required style={{ padding: 10, width: "100%" }} />
                        <select name="gateType" required style={{ padding: 10 }}>
                          <option value={CompGateType.MIN_APPS}>Min apps</option>
                          <option value={CompGateType.MIN_PREMIUM}>Min premium</option>
                          <option value={CompGateType.MIN_BUCKET}>Min bucket</option>
                        </select>
                        <input name="thresholdValue" type="number" step="0.01" placeholder="Threshold" required style={{ padding: 10 }} />
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
                          <select name="behavior" required style={{ padding: 10 }}>
                            <option value={CompGateBehavior.HARD_GATE}>Hard gate</option>
                            <option value={CompGateBehavior.RETROACTIVE}>Retroactive</option>
                            <option value={CompGateBehavior.NON_RETROACTIVE}>Non-retro</option>
                          </select>
                        </label>
                        <select name="scope" required style={{ padding: 10 }}>
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
          </section>
                  <section>
                    <h2 style={{ marginTop: 0 }}>Bonuses</h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <div style={{ display: "inline-flex", border: "1px solid #e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                        <a
                          href={`?section=bonuses${selectedLobId ? `&lob=${selectedLobId}` : ""}&bonusTab=scorecards`}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            textDecoration: "none",
                            color: bonusTab === "scorecards" ? "#fff" : "#111",
                            background: bonusTab === "scorecards" ? "#2563eb" : "white",
                            borderRight: "1px solid #e5e7eb",
                          }}
                        >
                          Scorecards
                        </a>
                        <a
                          href={`?section=bonuses${selectedLobId ? `&lob=${selectedLobId}` : ""}&bonusTab=bonuses`}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            textDecoration: "none",
                            color: bonusTab === "bonuses" ? "#fff" : "#111",
                            background: bonusTab === "bonuses" ? "#2563eb" : "white",
                            borderRight: "1px solid #e5e7eb",
                          }}
                        >
                          Bonuses
                        </a>
                        <a
                          href={`?section=bonuses${selectedLobId ? `&lob=${selectedLobId}` : ""}&bonusTab=subtractors`}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            textDecoration: "none",
                            color: bonusTab === "subtractors" ? "#fff" : "#111",
                            background: bonusTab === "subtractors" ? "#2563eb" : "white",
                          }}
                        >
                          Subtractors
                        </a>
                      </div>
                    </div>
                    {bonusTab === "scorecards" ? (
                      <>
                        {(() => {
                          const scorecardModules = scorecardModulesOrdered;
                          const hasScorecards = scorecardModules.length > 0;
                          return (
                            <>
                              {!hasScorecards ? (
                                <div style={{ marginBottom: 8, fontSize: 12, color: "#6b7280" }}>
                                  No scorecards yet. Use + to create one.
                                </div>
                              ) : null}
                              <ScorecardReorderClient items={scorecardModules.map((bm) => {
                                  const tiersCount = bm.scorecardTiers.length;
                                  const rowsCount = bm.scorecardTiers.reduce((sum, tier) => sum + (tier.conditionGroups ? tier.conditionGroups.length : 0), 0);
                                  const conditionsCount = bm.scorecardTiers.reduce((sum, tier) => {
                                    const groups = tier.conditionGroups || [];
                                    return sum + groups.reduce((groupSum, group) => groupSum + (group.conditions ? group.conditions.length : 0), 0);
                                  }, 0);
                                  const rewardsCount = bm.scorecardTiers.reduce((sum, tier) => sum + (tier.rewards ? tier.rewards.length : 0), 0);
                                  const scorecardName = resolveScorecardModuleName(bm);
                                  const isSingleTier = bm.scorecardTiers.length === 1;
                                  return {
                                    id: bm.id,
                                    content: (
                                      <ScorecardModuleCard
                                        key={bm.id}
                                        id={bm.id}
                                        name={scorecardName}
                                        bonusType={bm.bonusType}
                                        stats={{ tiersCount, rowsCount, conditionsCount, rewardsCount }}
                                        open={openBm === bm.id}
                                        onDelete={deleteBonusModule}
                                      >
                                      {(() => {
                                        const bucketNameById = new Map(buckets.map((b) => [b.id, b.name]));
                                        return (
                                          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
                                            {bm.scorecardTiers.map((tier) => {
                                              const conditionGroups = tier.conditionGroups || [];
                                              const tierDisplayName = isSingleTier ? scorecardName : tier.name || scorecardName;
                                              return (
                                                <div
                                                  key={tier.id}
                                                  style={{
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: 8,
                                                    overflow: "hidden",
                                                    padding: 0,
                                                    flex: "1 1 320px",
                                                    minWidth: 300,
                                                    maxWidth: 420,
                                                    background: "#fff",
                                                  }}
                                                >
                                                  <div style={{ background: "#2563eb", padding: "8px 10px", color: "#fff", fontWeight: 700 }}>
                                                    <a href={`#edit-tier-${tier.id}`} style={{ color: "#fff", textDecoration: "none", fontWeight: 700 }}>
                                                      {tierDisplayName}
                                                    </a>
                                                  </div>
                                                  <div style={{ padding: "8px 10px" }}>
                                          {conditionGroups.length ? (
                                            <>
                                              <div style={{ marginTop: 4, display: "grid", gap: 6 }}>
                                          {conditionGroups.map((group, groupIndex) => {
                                            return [
                                              <div
                                                key={group.id}
                                                className="scorecard-requirement-row"
                                                style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, position: "relative" }}
                                              >
                                                {group.conditions.length ? (
                                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 12, color: "#475569" }}>
                                                    {group.conditions.map((cond, condIndex) => {
                                                      const filters =
                                                        (cond.filters as { presetKey?: string; premiumCategory?: string } | null) || {};
                                                      const presetKey = filters.presetKey;
                                                      const resolvedPremiumCategory =
                                                        typeof filters.premiumCategory === "string"
                                                          ? filters.premiumCategory
                                                          : presetKey === "PREMIUM_PC"
                                                            ? PremiumCategory.PC
                                                            : presetKey === "PREMIUM_FS"
                                                              ? PremiumCategory.FS
                                                              : null;
                                                      const isPremiumTarget =
                                                        cond.metricSource === CompMetricSource.TOTAL_PREMIUM || cond.metricSource === CompMetricSource.PREMIUM_CATEGORY;
                                                      const targetValue = isPremiumTarget ? `$${cond.value}` : String(cond.value);
                                                      const presetLabels: Record<string, string> = {
                                                        APPS_ALL: "All apps",
                                                        APPS_PC: "P&C apps",
                                                        APPS_FS: "FS apps",
                                                        APPS_BUSINESS: "Business apps",
                                                        PREMIUM_ALL: "All premium",
                                                        PREMIUM_PC: "P&C premium",
                                                        PREMIUM_FS: "FS premium",
                                                        ACTIVITY_TYPES: "Activity",
                                                      };
                                                      const presetLabel = presetKey && presetKey !== "MANUAL" ? presetLabels[presetKey] : undefined;
                                                      const fallbackLabel =
                                                        cond.metricSource === CompMetricSource.PREMIUM_CATEGORY && resolvedPremiumCategory
                                                          ? `${resolvedPremiumCategory} premium`
                                                          : cond.metricSource === CompMetricSource.TOTAL_PREMIUM
                                                            ? "Total premium"
                                                            : cond.metricSource === CompMetricSource.APPS_COUNT
                                                              ? "Apps"
                                                              : cond.metricSource === CompMetricSource.ACTIVITY
                                                                ? "Activity"
                                                                : String(cond.metricSource);
                                                      const label = presetLabel ?? fallbackLabel;
                                                      const showOr = condIndex < group.conditions.length - 1;
                                                      return (
                                                        <div key={cond.id} className="scorecard-condition-item">
                                                          <a
                                                            href={`#edit-cond-${cond.id}`}
                                                            style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: 13, lineHeight: 1.25 }}
                                                          >
                                                            <span style={{ display: "block" }}>{targetValue}</span>
                                                            <span style={{ display: "block" }}>{label}</span>
                                                          </a>
                                                          {showOr ? (
                                                            <span
                                                              style={{
                                                                height: 24,
                                                                padding: "0 8px",
                                                                borderRadius: 6,
                                                                border: "1px solid #e2e8f0",
                                                                background: "#f8fafc",
                                                                color: "#475569",
                                                                fontWeight: 700,
                                                                display: "inline-flex",
                                                                alignItems: "center",
                                                                justifyContent: "center",
                                                                lineHeight: 1,
                                                              }}
                                                            >
                                                              OR
                                                            </span>
                                                          ) : null}
                                                          <form action={removeCondition} className="scorecard-delete-condition">
                                                            <input type="hidden" name="conditionId" value={cond.id} />
                                                            <button type="submit" className="scorecard-condition-delete" aria-label="Delete condition" title="Delete condition">
                                                              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                                                <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                                                              </svg>
                                                            </button>
                                                          </form>
                                                        </div>
                                                      );
                                                    })}
                                                    <a
                                                      href={`#add-cond-${group.id}`}
                                                      aria-label="Add OR condition"
                                                      style={{
                                                        height: 24,
                                                        minWidth: 32,
                                                        padding: "0 8px",
                                                        borderRadius: 6,
                                                        border: "1px solid #e2e8f0",
                                                        background: "#f8fafc",
                                                        color: "#475569",
                                                        fontWeight: 700,
                                                        textDecoration: "none",
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        lineHeight: 1,
                                                      }}
                                                    >
                                                      +OR
                                                    </a>
                                                  </div>
                                                ) : (
                                                  <div className="scorecard-empty-row">
                                                    <a
                                                      href={`#add-cond-${group.id}`}
                                                      className="scorecard-empty-link"
                                                      style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        padding: "8px 10px",
                                                        border: "1px solid #e5e7eb",
                                                        borderRadius: "8px",
                                                        background: "#f8fafc",
                                                        color: "#2563eb",
                                                        textDecoration: "none",
                                                        fontWeight: 600,
                                                        fontSize: 12,
                                                      }}
                                                    >
                                                      <span>Enter new condition</span>
                                                      <span
                                                        aria-hidden="true"
                                                        style={{
                                                          width: 24,
                                                          height: 24,
                                                          borderRadius: 6,
                                                          border: "1px solid #e2e8f0",
                                                          background: "#f8fafc",
                                                          color: "#475569",
                                                          fontWeight: 700,
                                                          display: "inline-flex",
                                                          alignItems: "center",
                                                          justifyContent: "center",
                                                          lineHeight: 1,
                                                          pointerEvents: "none",
                                                        }}
                                                      >
                                                        +
                                                      </span>
                                                    </a>
                                                    <form action={removeConditionGroup} className="scorecard-delete-condition-group">
                                                      <input type="hidden" name="groupId" value={group.id} />
                                                      <button type="submit" className="scorecard-condition-delete scorecard-row-delete" aria-label="Delete row" title="Delete row">
                                                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                                                        </svg>
                                                      </button>
                                                    </form>
                                                  </div>
                                                )}
                                              </div>,
                                              groupIndex < conditionGroups.length - 1 ? (
                                                <div key={`${group.id}-and`} style={{ textAlign: "center", fontSize: 10, color: "#94a3b8" }}>
                                                  And
                                                </div>
                                              ) : null,
                                            ];
                                          })}
                                              </div>
                                            </>
                                          ) : null}
                                    {conditionGroups.length ? (
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          gap: 8,
                                          fontSize: 10,
                                          color: "#94a3b8",
                                          marginTop: 6,
                                        }}
                                      >
                                        <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                                        <span>And</span>
                                        <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
                                      </div>
                                    ) : null}
                                    <div style={{ marginTop: 4, display: "flex", justifyContent: "center" }}>
                                      <a
                                        href={`#add-row-${tier.id}`}
                                        style={{
                                          color: "#2563eb",
                                          fontSize: 12,
                                          fontWeight: 600,
                                          textDecoration: "none",
                                        }}
                                      >
                                        + Add another condition
                                      </a>
                                    </div>
                                    <div style={{ marginTop: 4, display: "grid", gap: 4 }}>
                                      <div style={{ fontSize: 12, color: "#64748b" }}>Payout if all conditions met</div>
                                      <div style={{ display: "grid", gap: 2, fontSize: 12, color: "#475569" }}>
                                        {tier.rewards.length ? (
                                          tier.rewards.map((reward) => {
                                            const percentValue = reward.percentValue ?? 0;
                                            let rewardText = "";
                                            if (reward.rewardType === CompRewardType.ADD_FLAT_DOLLARS) {
                                              rewardText = `Pays $${reward.dollarValue ?? 0}`;
                                            } else if (reward.rewardType === CompRewardType.ADD_PERCENT_OF_BUCKET) {
                                              if (reward.bucketId) {
                                                const bucketName = bucketNameById.get(reward.bucketId) || "Unknown bucket";
                                                rewardText = `Pays ${percentValue}% of ${bucketName}`;
                                              } else if (reward.premiumCategory) {
                                                rewardText = `Pays ${percentValue}% of ${reward.premiumCategory} premium`;
                                              } else {
                                                rewardText = `Pays ${percentValue}% of total premium`;
                                              }
                                            } else if (reward.rewardType === CompRewardType.MULTIPLIER) {
                                              rewardText = `Multiplier: ${percentValue}x`;
                                            }
                                            if (!rewardText) return null;
                                            return <div key={reward.id}>{rewardText}</div>;
                                          })
                                        ) : (
                                          <div style={{ color: "#94a3b8" }}>No payout set yet.</div>
                                        )}
                                      </div>
                                      <a
                                        href={`#edit-payout-${tier.id}`}
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          padding: "6px 10px",
                                          borderRadius: 999,
                                          border: "1px solid #e5e7eb",
                                          background: "#f8fafc",
                                          color: "#2563eb",
                                          textDecoration: "none",
                                          fontWeight: 700,
                                          fontSize: 12,
                                        }}
                                      >
                                        Edit/Add Payout
                                      </a>
                                    </div>
                                    <style>{`
                                      .reward-form:has(select[name="rewardPreset"] option[value^="PCT_PREMIUM_"]:checked) .reward-dollar-field {
                                        display: none;
                                      }
                                      .reward-form:has(select[name="rewardPreset"] option[value="FLAT_DOLLARS"]:checked) .reward-percent-field {
                                        display: none;
                                      }
                                    `}</style>
                                    </div>
                                  </div>
                                );
                              })}
                              {bm.scorecardTiers.map((tier) =>
                                  (tier.conditionGroups || []).map((group) =>
                                    group.conditions.map((cond) => {
                                      const modalFilters =
                                        (cond.filters as { presetKey?: string; productIds?: string[]; activityTypeIds?: string[] } | null) || {};
                                      const presetKey = modalFilters.presetKey ?? "MANUAL";
                                      const rawPresetProductIds = Array.isArray(modalFilters.productIds) ? modalFilters.productIds : [];
                                      const fallbackPresetProductIds =
                                        presetKey === "APPS_PC"
                                          ? products.filter((p) => p.premiumCategory === PremiumCategory.PC).map((p) => p.id)
                                          : presetKey === "APPS_FS"
                                            ? products.filter((p) => p.premiumCategory === PremiumCategory.FS).map((p) => p.id)
                                            : presetKey === "APPS_BUSINESS"
                                              ? products.filter((p) => p.productType === "BUSINESS").map((p) => p.id)
                                              : [];
                                      const presetProductIds = rawPresetProductIds.length ? rawPresetProductIds : fallbackPresetProductIds;
                                      const presetActivityTypeIds = Array.isArray(modalFilters.activityTypeIds) ? modalFilters.activityTypeIds : [];
                                      const metricUi = presetKey.startsWith("APPS_")
                                        ? "APPS"
                                        : presetKey.startsWith("PREMIUM_")
                                          ? "PREMIUM"
                                          : presetKey === "ACTIVITY_TYPES"
                                            ? "ACTIVITY"
                                            : "MANUAL";
                                      return (
                                      <div key={`edit-cond-modal-${cond.id}`} id={`edit-cond-${cond.id}`} className="modal-target scorecard-modal-target">
                                        <a href="#" className="modal-close-overlay" aria-label="Close modal"></a>
                                        <div className="modal-card">
                                          <a href="#" style={{ position: "absolute", top: 10, right: 12, textDecoration: "none", color: "#64748b", fontWeight: 700 }}>
                                            ✕
                                          </a>
                                          <div style={{ fontWeight: 700, marginBottom: 10 }}>Edit condition</div>
                                          <form
                                            action={updateScorecardCondition}
                                            className="scorecard-edit-modal-form"
                                            style={{ display: "grid", gap: 10 }}
                                          >
                                            <input type="hidden" name="conditionId" value={cond.id} />
                                            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
                                              <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                                                Operator
                                                <select name="operator" defaultValue={cond.operator} style={{ padding: 8 }}>
                                                  <option value={ConditionOperator.GTE}>&gt;=</option>
                                                  <option value={ConditionOperator.GT}>&gt;</option>
                                                  <option value={ConditionOperator.LTE}>&lt;=</option>
                                                  <option value={ConditionOperator.LT}>&lt;</option>
                                                  <option value={ConditionOperator.EQ}>=</option>
                                                </select>
                                              </label>
                                              <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                                                Value
                                                <input name="value" type="number" step="0.01" defaultValue={cond.value} style={{ padding: 8 }} />
                                              </label>
                                            </div>
                                            <div style={{ display: "grid", gap: 6 }}>
                                              <div className="preset-group-title">Metric</div>
                                              <div className="preset-chips metric-chips">
                                                <label className="preset-chip" htmlFor={`metric-ui-apps-${cond.id}`}>
                                                  <input
                                                    id={`metric-ui-apps-${cond.id}`}
                                                    type="radio"
                                                    name="metricUi"
                                                    value="APPS"
                                                    defaultChecked={metricUi === "APPS"}
                                                  />
                                                  <span>Apps</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`metric-ui-premium-${cond.id}`}>
                                                  <input
                                                    id={`metric-ui-premium-${cond.id}`}
                                                    type="radio"
                                                    name="metricUi"
                                                    value="PREMIUM"
                                                    defaultChecked={metricUi === "PREMIUM"}
                                                  />
                                                  <span>Premium</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`metric-ui-activity-${cond.id}`}>
                                                  <input
                                                    id={`metric-ui-activity-${cond.id}`}
                                                    type="radio"
                                                    name="metricUi"
                                                    value="ACTIVITY"
                                                    defaultChecked={metricUi === "ACTIVITY"}
                                                  />
                                                  <span>Activity</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`metric-ui-manual-${cond.id}`}>
                                                  <input
                                                    id={`metric-ui-manual-${cond.id}`}
                                                    type="radio"
                                                    name="metricUi"
                                                    value="MANUAL"
                                                    defaultChecked={metricUi === "MANUAL"}
                                                  />
                                                  <span>Manual</span>
                                                </label>
                                              </div>
                                            </div>
                                            <div style={{ display: "grid", gap: 6 }}>
                                              <div className="preset-group-title">Scope</div>
                                              <div className="preset-chips scope-row apps">
                                                <label className="preset-chip" htmlFor={`preset-apps-all-${cond.id}`}>
                                                  <input
                                                    id={`preset-apps-all-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="APPS_ALL"
                                                    defaultChecked={presetKey === "APPS_ALL"}
                                                  />
                                                  <span>All</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`preset-apps-pc-${cond.id}`}>
                                                  <input
                                                    id={`preset-apps-pc-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="APPS_PC"
                                                    defaultChecked={presetKey === "APPS_PC"}
                                                  />
                                                  <span>P&amp;C</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`preset-apps-fs-${cond.id}`}>
                                                  <input
                                                    id={`preset-apps-fs-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="APPS_FS"
                                                    defaultChecked={presetKey === "APPS_FS"}
                                                  />
                                                  <span>FS</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`preset-apps-business-${cond.id}`}>
                                                  <input
                                                    id={`preset-apps-business-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="APPS_BUSINESS"
                                                    defaultChecked={presetKey === "APPS_BUSINESS"}
                                                  />
                                                  <span>Business</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`preset-apps-product-${cond.id}`}>
                                                  <input
                                                    id={`preset-apps-product-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="APPS_PRODUCT"
                                                    defaultChecked={presetKey === "APPS_PRODUCT"}
                                                  />
                                                  <span>Specific products</span>
                                                </label>
                                              </div>
                                              <div className="preset-chips scope-row premium">
                                                <label className="preset-chip" htmlFor={`preset-premium-all-${cond.id}`}>
                                                  <input
                                                    id={`preset-premium-all-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="PREMIUM_ALL"
                                                    defaultChecked={presetKey === "PREMIUM_ALL"}
                                                  />
                                                  <span>All</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`preset-premium-pc-${cond.id}`}>
                                                  <input
                                                    id={`preset-premium-pc-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="PREMIUM_PC"
                                                    defaultChecked={presetKey === "PREMIUM_PC"}
                                                  />
                                                  <span>P&amp;C</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`preset-premium-fs-${cond.id}`}>
                                                  <input
                                                    id={`preset-premium-fs-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="PREMIUM_FS"
                                                    defaultChecked={presetKey === "PREMIUM_FS"}
                                                  />
                                                  <span>FS</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`preset-premium-business-${cond.id}`}>
                                                  <input
                                                    id={`preset-premium-business-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="PREMIUM_PRODUCT"
                                                    data-scope="BUSINESS"
                                                  />
                                                  <span>Business</span>
                                                </label>
                                                <label className="preset-chip" htmlFor={`preset-premium-product-${cond.id}`}>
                                                  <input
                                                    id={`preset-premium-product-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="PREMIUM_PRODUCT"
                                                    data-scope="PRODUCT"
                                                    defaultChecked={presetKey === "PREMIUM_PRODUCT"}
                                                  />
                                                  <span>Specific products</span>
                                                </label>
                                              </div>
                                              <div className="preset-chips scope-row activity">
                                                <label className="preset-chip" htmlFor={`preset-activity-${cond.id}`}>
                                                  <input
                                                    id={`preset-activity-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="ACTIVITY_TYPES"
                                                    defaultChecked={presetKey === "ACTIVITY_TYPES"}
                                                  />
                                                  <span>Selected types</span>
                                                </label>
                                              </div>
                                              <div className="preset-chips scope-row manual">
                                                <label className="preset-chip" htmlFor={`preset-manual-${cond.id}`}>
                                                  <input
                                                    id={`preset-manual-${cond.id}`}
                                                    type="radio"
                                                    name="preset"
                                                    value="MANUAL"
                                                    defaultChecked={presetKey === "MANUAL"}
                                                  />
                                                  <span>Manual</span>
                                                </label>
                                              </div>
                                            </div>
                                            <div
                                              className="preset-product-fields"
                                              style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569", gridColumn: "1 / -1" }}
                                            >
                                              <span style={{ fontWeight: 600 }}>Specific products</span>
                                              <div className="preset-quick-selects">
                                                <span className="preset-quick-pill">P&amp;C</span>
                                                <span className="preset-quick-pill">FS</span>
                                                <span className="preset-quick-pill">Business</span>
                                                <span className="preset-quick-pill">All</span>
                                              </div>
                                              <div className="preset-quick-note">Quick selects are visual only. Use the list below.</div>
                                              <div className="preset-business-note">
                                                Business premium uses specific products. Choose the products below.
                                              </div>
                                              <div className="scorecard-pill-picker">
                                                <input
                                                  id={`edit-cond-pill-toggle-${cond.id}`}
                                                  type="checkbox"
                                                  className="scorecard-pill-toggle"
                                                />
                                                <div className="scorecard-pill-selected">
                                                  <div className="scorecard-pill-selected-title">Selected Products</div>
                                                  <div className="scorecard-pill-empty">No products selected.</div>
                                                  <div className="scorecard-pill-list">
                                                    {sortedProducts.map((p) => (
                                                      <div
                                                        className="scorecard-pill-item"
                                                        key={p.id}
                                                        data-premium={p.premiumCategory}
                                                        data-type={p.productType}
                                                      >
                                                        <input
                                                          id={`edit-cond-pill-${cond.id}-${p.id}`}
                                                          className="scorecard-pill-input"
                                                          type="checkbox"
                                                          name="presetProductIds"
                                                          value={p.id}
                                                          defaultChecked={presetProductIds.includes(p.id)}
                                                        />
                                                        <label htmlFor={`edit-cond-pill-${cond.id}-${p.id}`} className="scorecard-pill-label">
                                                          {p.name}
                                                        </label>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                                <label htmlFor={`edit-cond-pill-toggle-${cond.id}`} className="scorecard-pill-toggle-control">
                                                  <span className="pill-toggle-open">Add products</span>
                                                  <span className="pill-toggle-close">Done</span>
                                                </label>
                                              </div>
                                            </div>
                                            <label
                                              className="preset-activity-fields"
                                              style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569", gridColumn: "1 / -1" }}
                                            >
                                              <span style={{ fontWeight: 600 }}>Activity types</span>
                                              <select name="presetActivityTypeIds" multiple defaultValue={presetActivityTypeIds} style={{ padding: 8 }}>
                                                {activityTypes.map((activity) => (
                                                  <option key={activity.id} value={activity.id}>
                                                    {activity.name}
                                                  </option>
                                                ))}
                                              </select>
                                            </label>
                                            <div className="scorecard-modal-actions">
                                              <button type="submit" className="scorecard-modal-primary">
                                                Save
                                              </button>
                                              <a href="#" className="scorecard-modal-cancel">
                                                Cancel
                                              </a>
                                            </div>
                                          </form>
                                        </div>
                                      </div>
                                    );
                                  })
                                )
                              )}
                              {bm.scorecardTiers.map((tier) => (
                                <div key={`edit-payout-modal-${tier.id}`} id={`edit-payout-${tier.id}`} className="modal-target scorecard-modal-target">
                                  <a href="#" className="modal-close-overlay" aria-label="Close modal"></a>
                                  <div className="modal-card">
                                    <a href="#" style={{ position: "absolute", top: 10, right: 12, textDecoration: "none", color: "#64748b", fontWeight: 700 }}>
                                      ✕
                                    </a>
                                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Edit/Add Payout</div>
                                    <div style={{ marginBottom: 8, fontSize: 12, color: "#64748b" }}>
                                      {tier.rewards.length ? "Existing payouts" : "No payouts yet. Add one below."}
                                    </div>
                                    <div style={{ display: "grid", gap: 6, fontSize: 13, color: "#334155" }}>
                                      {tier.rewards.length
                                        ? tier.rewards.map((reward) => {
                                            const percentValue = reward.percentValue ?? 0;
                                            let rewardText = "";
                                            if (reward.rewardType === CompRewardType.ADD_FLAT_DOLLARS) {
                                              rewardText = `Pays $${reward.dollarValue ?? 0}`;
                                            } else if (reward.rewardType === CompRewardType.ADD_PERCENT_OF_BUCKET) {
                                              if (reward.bucketId) {
                                                const bucketName = bucketNameById.get(reward.bucketId) || "Unknown bucket";
                                                rewardText = `Pays ${percentValue}% of ${bucketName}`;
                                              } else if (reward.premiumCategory) {
                                                rewardText = `Pays ${percentValue}% of ${reward.premiumCategory} premium`;
                                              } else {
                                                rewardText = `Pays ${percentValue}% of total premium`;
                                              }
                                            } else if (reward.rewardType === CompRewardType.MULTIPLIER) {
                                              rewardText = `Multiplier: ${percentValue}x`;
                                            }
                                            if (!rewardText) return null;
                                            return (
                                              <div key={reward.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                                                <span>{rewardText}</span>
                                                <form action={removeReward} style={{ margin: 0 }}>
                                                  <input type="hidden" name="rewardId" value={reward.id} />
                                                  <button
                                                    type="submit"
                                                    style={{
                                                      padding: "2px 8px",
                                                      fontSize: 11,
                                                      borderRadius: 999,
                                                      border: "1px solid #e2e8f0",
                                                      background: "#fff",
                                                      color: "#64748b",
                                                    }}
                                                  >
                                                    Remove
                                                  </button>
                                                </form>
                                              </div>
                                            );
                                          })
                                        : null}
                                    </div>
                                    <form
                                      action={addReward}
                                      className="reward-form"
                                      style={{ marginTop: 10, display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
                                    >
                                      <input type="hidden" name="tierId" value={tier.id} />
                                      <select name="rewardPreset" defaultValue="MANUAL" style={{ padding: 8 }}>
                                        <option value="PCT_PREMIUM_ALL">% of premium (All)</option>
                                        <option value="PCT_PREMIUM_PC">% of premium (P&amp;C)</option>
                                        <option value="PCT_PREMIUM_FS">% of premium (FS)</option>
                                        <option value="FLAT_DOLLARS">Flat $</option>
                                        <option value="MANUAL">Manual (advanced)</option>
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
                                      <button type="submit" style={{ padding: "8px 10px" }}>
                                        {tier.rewards.length ? "Save Edit" : "Add payout"}
                                      </button>
                                    </form>
                                    <div style={{ marginTop: 12 }}>
                                      <a href="#" style={{ color: "#64748b", textDecoration: "none", fontWeight: 600 }}>
                                        Cancel
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {bm.scorecardTiers.map((tier) => (
                                <div key={`add-row-modal-${tier.id}`} id={`add-row-${tier.id}`} className="modal-target scorecard-modal-target">
                                  <a href="#" className="modal-close-overlay" aria-label="Close modal"></a>
                                  <div className="modal-card">
                                    <a href="#" style={{ position: "absolute", top: 10, right: 12, textDecoration: "none", color: "#64748b", fontWeight: 700 }}>
                                      ✕
                                    </a>
                                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Add requirement row</div>
                                    <form action={addConditionGroup} style={{ display: "grid", gap: 10 }}>
                                      <input type="hidden" name="tierId" value={tier.id} />
                                      <input type="hidden" name="mode" value={CompScorecardConditionGroupMode.ANY} />
                                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        <button
                                          type="submit"
                                          style={{
                                            padding: "8px 12px",
                                            borderRadius: 8,
                                            border: "1px solid #2563eb",
                                            background: "#2563eb",
                                            color: "#fff",
                                            fontWeight: 600,
                                          }}
                                        >
                                          Add row
                                        </button>
                                        <a href="#" style={{ color: "#64748b", textDecoration: "none", fontWeight: 600 }}>
                                          Cancel
                                        </a>
                                      </div>
                                    </form>
                                  </div>
                                </div>
                              ))}
                              {bm.scorecardTiers.map((tier) =>
                                (tier.conditionGroups || []).map((group) => (
                                  <div key={`add-cond-modal-${group.id}`} id={`add-cond-${group.id}`} className="modal-target scorecard-modal-target">
                                    <a href="#" className="modal-close-overlay" aria-label="Close modal"></a>
                                    <div className="modal-card">
                                      <a href="#" style={{ position: "absolute", top: 10, right: 12, textDecoration: "none", color: "#64748b", fontWeight: 700 }}>
                                        ✕
                                      </a>
                                      <div style={{ fontWeight: 700, marginBottom: 6 }}>Add OR condition</div>
                                      <form action={addCondition} className="scorecard-or-modal-form">
                                        <input type="hidden" name="tierId" value={tier.id} />
                                        <input type="hidden" name="groupId" value={group.id} />
                                        <div className="scorecard-field-row">
                                          <label className="scorecard-field-label">
                                            Operator
                                            <select name="operator" defaultValue={ConditionOperator.GTE} style={{ padding: 8 }}>
                                              <option value={ConditionOperator.GTE}>GTE (&gt;=)</option>
                                              <option value={ConditionOperator.GT}>GT (&gt;)</option>
                                              <option value={ConditionOperator.LTE}>LTE (&lt;=)</option>
                                              <option value={ConditionOperator.LT}>LT (&lt;)</option>
                                              <option value={ConditionOperator.EQ}>EQ (=)</option>
                                            </select>
                                          </label>
                                          <label className="scorecard-field-label">
                                            Value
                                            <input name="value" type="number" step="0.01" placeholder="Value" style={{ padding: 8 }} />
                                          </label>
                                        </div>
                                        <div style={{ display: "grid", gap: 6 }}>
                                          <div className="preset-group-title">Metric</div>
                                          <div className="preset-chips metric-chips">
                                            <label className="preset-chip" htmlFor={`add-cond-metric-ui-apps-${group.id}`}>
                                              <input id={`add-cond-metric-ui-apps-${group.id}`} type="radio" name="metricUi" value="APPS" defaultChecked />
                                              <span>Apps</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-metric-ui-premium-${group.id}`}>
                                              <input id={`add-cond-metric-ui-premium-${group.id}`} type="radio" name="metricUi" value="PREMIUM" />
                                              <span>Premium</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-metric-ui-activity-${group.id}`}>
                                              <input id={`add-cond-metric-ui-activity-${group.id}`} type="radio" name="metricUi" value="ACTIVITY" />
                                              <span>Activity</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-metric-ui-manual-${group.id}`}>
                                              <input id={`add-cond-metric-ui-manual-${group.id}`} type="radio" name="metricUi" value="MANUAL" />
                                              <span>Manual</span>
                                            </label>
                                          </div>
                                        </div>
                                        <div style={{ display: "grid", gap: 6 }}>
                                          <div className="preset-group-title">Scope</div>
                                          <div className="preset-chips scope-row apps">
                                            <label className="preset-chip" htmlFor={`add-cond-preset-apps-all-${group.id}`}>
                                              <input
                                                id={`add-cond-preset-apps-all-${group.id}`}
                                                type="radio"
                                                name="preset"
                                                value="APPS_ALL"
                                                defaultChecked
                                              />
                                              <span>All</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-preset-apps-pc-${group.id}`}>
                                              <input id={`add-cond-preset-apps-pc-${group.id}`} type="radio" name="preset" value="APPS_PC" />
                                              <span>P&amp;C</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-preset-apps-fs-${group.id}`}>
                                              <input id={`add-cond-preset-apps-fs-${group.id}`} type="radio" name="preset" value="APPS_FS" />
                                              <span>FS</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-preset-apps-business-${group.id}`}>
                                              <input id={`add-cond-preset-apps-business-${group.id}`} type="radio" name="preset" value="APPS_BUSINESS" />
                                              <span>Business</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-preset-apps-product-${group.id}`}>
                                              <input id={`add-cond-preset-apps-product-${group.id}`} type="radio" name="preset" value="APPS_PRODUCT" />
                                              <span>Specific products</span>
                                            </label>
                                          </div>
                                          <div className="preset-chips scope-row premium">
                                            <label className="preset-chip" htmlFor={`add-cond-preset-premium-all-${group.id}`}>
                                              <input id={`add-cond-preset-premium-all-${group.id}`} type="radio" name="preset" value="PREMIUM_ALL" />
                                              <span>All</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-preset-premium-pc-${group.id}`}>
                                              <input id={`add-cond-preset-premium-pc-${group.id}`} type="radio" name="preset" value="PREMIUM_PC" />
                                              <span>P&amp;C</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-preset-premium-fs-${group.id}`}>
                                              <input id={`add-cond-preset-premium-fs-${group.id}`} type="radio" name="preset" value="PREMIUM_FS" />
                                              <span>FS</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-preset-premium-business-${group.id}`}>
                                              <input
                                                id={`add-cond-preset-premium-business-${group.id}`}
                                                type="radio"
                                                name="preset"
                                                value="PREMIUM_PRODUCT"
                                                data-scope="BUSINESS"
                                              />
                                              <span>Business</span>
                                            </label>
                                            <label className="preset-chip" htmlFor={`add-cond-preset-premium-product-${group.id}`}>
                                              <input
                                                id={`add-cond-preset-premium-product-${group.id}`}
                                                type="radio"
                                                name="preset"
                                                value="PREMIUM_PRODUCT"
                                                data-scope="PRODUCT"
                                              />
                                              <span>Specific products</span>
                                            </label>
                                          </div>
                                          <div className="preset-chips scope-row activity">
                                            <label className="preset-chip" htmlFor={`add-cond-preset-activity-${group.id}`}>
                                              <input id={`add-cond-preset-activity-${group.id}`} type="radio" name="preset" value="ACTIVITY_TYPES" />
                                              <span>Selected types</span>
                                            </label>
                                          </div>
                                          <div className="preset-chips scope-row manual">
                                            <label className="preset-chip" htmlFor={`add-cond-preset-manual-${group.id}`}>
                                              <input id={`add-cond-preset-manual-${group.id}`} type="radio" name="preset" value="MANUAL" />
                                              <span>Manual</span>
                                            </label>
                                          </div>
                                        </div>
                                        <div className="preset-product-fields" style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569", gridColumn: "1 / -1" }}>
                                          <span style={{ fontWeight: 600 }}>Specific products</span>
                                          <div className="scorecard-pill-picker">
                                            <input
                                              id={`add-cond-pill-toggle-${group.id}`}
                                              type="checkbox"
                                              className="scorecard-pill-toggle"
                                            />
                                            <div className="scorecard-pill-selected">
                                              <div className="scorecard-pill-selected-title">Selected Products</div>
                                              <div className="scorecard-pill-empty">No products selected.</div>
                                              <div className="scorecard-pill-list">
                                                {sortedProducts.map((p) => (
                                                  <div
                                                    className="scorecard-pill-item"
                                                    key={p.id}
                                                    data-premium={p.premiumCategory}
                                                    data-type={p.productType}
                                                  >
                                                    <input
                                                      id={`add-cond-pill-${group.id}-${p.id}`}
                                                      className="scorecard-pill-input"
                                                      type="checkbox"
                                                      name="presetProductIds"
                                                      value={p.id}
                                                    />
                                                    <label htmlFor={`add-cond-pill-${group.id}-${p.id}`} className="scorecard-pill-label">
                                                      {p.name}
                                                    </label>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                            <label htmlFor={`add-cond-pill-toggle-${group.id}`} className="scorecard-pill-toggle-control">
                                              <span className="pill-toggle-open">Add products</span>
                                              <span className="pill-toggle-close">Done</span>
                                            </label>
                                          </div>
                                        </div>
                                        <label className="preset-activity-fields" style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569", gridColumn: "1 / -1" }}>
                                          <span style={{ fontWeight: 600 }}>Activity types</span>
                                          <select name="presetActivityTypeIds" multiple style={{ padding: 8 }}>
                                            {activityTypes.map((activity) => (
                                              <option key={activity.id} value={activity.id}>
                                                {activity.name}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <div className="scorecard-modal-actions">
                                          <button type="submit" className="scorecard-modal-primary">
                                            Add OR condition
                                          </button>
                                          <a href="#" className="scorecard-modal-cancel">
                                            Cancel
                                          </a>
                                        </div>
                                      </form>
                                    </div>
                                  </div>
                                ))
                              )}
                              {bm.scorecardTiers.map((tier) => {
                                const tierDisplayName = isSingleTier ? scorecardName : tier.name || scorecardName;
                                return (
                                <div key={`edit-tier-modal-${tier.id}`} id={`edit-tier-${tier.id}`} className="modal-target scorecard-modal-target">
                                  <a href="#" className="modal-close-overlay" aria-label="Close modal"></a>
                                  <div className="modal-card">
                                    <a href="#" style={{ position: "absolute", top: 10, right: 12, textDecoration: "none", color: "#64748b", fontWeight: 700 }}>
                                      ✕
                                    </a>
                                    <div style={{ fontWeight: 700, marginBottom: 10 }}>Change Name</div>
                                    <form action={updateScorecardTierName} style={{ display: "grid", gap: 10 }}>
                                      <input type="hidden" name="tierId" value={tier.id} />
                                      <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                                        Name
                                        <input name="name" defaultValue={tierDisplayName} style={{ padding: 8 }} />
                                      </label>
                                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        <button
                                          type="submit"
                                          style={{
                                            padding: "8px 12px",
                                            borderRadius: 8,
                                          border: "1px solid #2563eb",
                                          background: "#2563eb",
                                          color: "#fff",
                                          fontWeight: 600,
                                        }}
                                      >
                                          Save name
                                        </button>
                                        <a href="#" style={{ color: "#64748b", textDecoration: "none", fontWeight: 600 }}>
                                          Cancel
                                        </a>
                                      </div>
                                    </form>
                                  </div>
                                </div>
                              );
                              })}
                              <div id={`edit-module-${bm.id}`} className="modal-target scorecard-modal-target">
                                <a href="#" className="modal-close-overlay" aria-label="Close modal"></a>
                                <div className="modal-card">
                                  <a href="#" style={{ position: "absolute", top: 10, right: 12, textDecoration: "none", color: "#64748b", fontWeight: 700 }}>
                                    ✕
                                  </a>
                                  <div style={{ fontWeight: 700, marginBottom: 10 }}>Change Name</div>
                                  <form action={updateScorecardModuleName} style={{ display: "grid", gap: 10 }}>
                                    <input type="hidden" name="bonusModuleId" value={bm.id} />
                                    <label style={{ display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
                                      Name
                                      <input name="name" defaultValue={scorecardName} style={{ padding: 8 }} />
                                    </label>
                                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                      <button
                                        type="submit"
                                        style={{
                                          padding: "8px 12px",
                                          borderRadius: 8,
                                        border: "1px solid #2563eb",
                                        background: "#2563eb",
                                        color: "#fff",
                                        fontWeight: 600,
                                      }}
                                    >
                                        Save name
                                      </button>
                                      <a href="#" style={{ color: "#64748b", textDecoration: "none", fontWeight: 600 }}>
                                        Cancel
                                      </a>
                                    </div>
                                  </form>
                                </div>
                              </div>
                            </div>
                              );
                            })()}
                          </ScorecardModuleCard>
                        ),
                      };
                    })}
                    onReorder={updateScorecardOrder}
                    footer={<ScorecardAddCard onCreate={createScorecardModule} />}
                  />
                            </>
                          );
                        })()}
                      </>
                    ) : null}
                    {bonusTab === "bonuses" ? (
                      <>
                        <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
                          <h3 style={{ margin: "0 0 8px 0" }}>Bonus Configuration</h3>
                          {bonusMsgMessage ? (
                            <div className="bonus-msg" role="status">
                              {bonusMsgMessage}
                            </div>
                          ) : null}
                          {bonusModuleMsgMessage ? (
                            <div className="bonus-msg" role="status">
                              {bonusModuleMsgMessage}
                            </div>
                          ) : null}
                          <details style={{ marginTop: 10 }} open={bonusModuleFormOpen}>
                            <summary
                              style={{
                                cursor: "pointer",
                                listStyle: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "1px solid #e5e7eb",
                                background: "#f8fafc",
                                fontWeight: 700,
                                color: "#2563eb",
                              }}
                            >
                              Add Bonus Module
                            </summary>
                            {bonusModuleErrMessage ? (
                              <div className="bonus-module-error" style={{ marginTop: 10 }}>
                                {bonusModuleErrMessage}
                              </div>
                            ) : null}
                            <form action={addBonusModuleShell} className="bonus-module-form" style={{ marginTop: 12 }}>
                              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                  Bonus module name
                                  <input name="name" placeholder="Module name" style={{ padding: 8 }} />
                                </label>
                                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                  Bonus type
                                  <select name="bonusType" defaultValue="" style={{ padding: 8 }}>
                                    <option value="" disabled>
                                      Select type
                                    </option>
                                    <option value={CompBonusType.CUSTOM}>Custom</option>
                                    <option value={CompBonusType.ACTIVITY_BONUS}>Activity Bonus</option>
                                  </select>
                                </label>
                              </div>
                              <div className="bonus-module-extra scorecard">
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Initial scorecard setup (optional)</div>
                                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Tier name
                                    <input name="scorecardTierName" placeholder="Tier name" style={{ padding: 8 }} />
                                  </label>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Condition preset
                                    <select name="scorecardConditionPreset" defaultValue="" style={{ padding: 8 }}>
                                      <option value="">No initial condition</option>
                                      <optgroup label="Apps">
                                        <option value="APPS_ALL">All apps</option>
                                        <option value="APPS_PC">P&amp;C apps</option>
                                        <option value="APPS_FS">FS apps</option>
                                        <option value="APPS_BUSINESS">Business apps</option>
                                      </optgroup>
                                      <optgroup label="Premium">
                                        <option value="PREMIUM_ALL">All premium</option>
                                        <option value="PREMIUM_PC">P&amp;C premium</option>
                                        <option value="PREMIUM_FS">FS premium</option>
                                      </optgroup>
                                      <optgroup label="Activity">
                                        <option value="ACTIVITY_TYPES">Activity (selected types)</option>
                                      </optgroup>
                                    </select>
                                  </label>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Operator
                                    <select name="scorecardConditionOperator" defaultValue={ConditionOperator.GTE} style={{ padding: 8 }}>
                                      <option value={ConditionOperator.GTE}>GTE (&gt;=)</option>
                                      <option value={ConditionOperator.GT}>GT (&gt;)</option>
                                      <option value={ConditionOperator.LTE}>LTE (&lt;=)</option>
                                      <option value={ConditionOperator.LT}>LT (&lt;)</option>
                                      <option value={ConditionOperator.EQ}>EQ (=)</option>
                                    </select>
                                  </label>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Value
                                    <input name="scorecardConditionValue" type="number" step="0.01" placeholder="Value" style={{ padding: 8 }} />
                                  </label>
                                </div>
                                <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#475569" }}>
                                  Activity types
                                  <select name="scorecardActivityTypeIds" multiple style={{ padding: 8 }}>
                                    {activityTypes.map((activity) => (
                                      <option key={activity.id} value={activity.id}>
                                        {activity.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <div style={{ fontSize: 12, color: "#64748b" }}>
                                  Configure additional tiers and conditions in the Scorecards tab after creation.
                                </div>
                              </div>
                              <div className="bonus-module-extra custom">
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Custom configuration</div>
                                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Adjustment type
                                    <select name="customMode" defaultValue="" style={{ padding: 8 }}>
                                      <option value="">Select</option>
                                      <option value="FLAT">Flat $</option>
                                      <option value="PERCENT">Percent</option>
                                    </select>
                                  </label>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Value
                                    <input name="customValue" type="number" step="0.01" placeholder="Value" style={{ padding: 8 }} />
                                  </label>
                                </div>
                              </div>
                              <div className="bonus-module-extra activity">
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Activity bonus details</div>
                                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Timeframe
                                    <select name="timeframe" defaultValue="MONTH" style={{ padding: 8 }}>
                                      <option value="MONTH">Month</option>
                                      <option value="DAY">Day</option>
                                    </select>
                                  </label>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Requires
                                    <select name="requiresAll" defaultValue="ALL" style={{ padding: 8 }}>
                                      <option value="ALL">All</option>
                                      <option value="ANY">Any</option>
                                    </select>
                                  </label>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Payout type
                                    <select name="payoutType" defaultValue="FLAT" style={{ padding: 8 }}>
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
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>Activity requirements (up to 3)</div>
                                  <div style={{ display: "grid", gap: 8 }}>
                                    {Array.from({ length: 3 }).map((_, idx) => (
                                      <div key={`module-activity-${idx}`} style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr" }}>
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
                              </div>
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <button
                                  type="submit"
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #2563eb",
                                    background: "#2563eb",
                                    color: "#fff",
                                    fontWeight: 600,
                                  }}
                                >
                                  Create module
                                </button>
                                <button
                                  type="reset"
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #e2e8f0",
                                    background: "#fff",
                                    color: "#64748b",
                                    fontWeight: 600,
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                              <div className="bonus-module-error" role="status"></div>
                            </form>
                          </details>
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Existing bonus modules</div>
                            {version?.bonusModules?.length ? (
                              <div className="bonus-module-list">
                                {(version?.bonusModules || []).filter((bm) => bm.bonusType !== CompBonusType.SCORECARD_TIER).map((bm) => {
                                  const editHref =
                                    bm.bonusType === CompBonusType.SCORECARD_TIER
                                      ? `${bonusesBaseUrl}&bonusTab=scorecards&openBm=${bm.id}#bm-${bm.id}`
                                      : bm.bonusType === CompBonusType.CUSTOM
                                        ? `${bonusesBaseUrl}&bonusTab=subtractors&openBm=${bm.id}#bm-${bm.id}`
                                        : `${bonusesBaseUrl}&bonusTab=bonuses&openBm=${bm.id}#bm-${bm.id}`;
                                  return (
                                    <details key={`bonus-module-${bm.id}`} className="bonus-module-card">
                                      <summary>
                                        <span>{bm.name || "Untitled module"}</span>
                                        <span className="bonus-module-meta">{bm.bonusType}</span>
                                      </summary>
                                      <div className="bonus-module-actions">
                                        <a href={editHref} className="bonus-module-edit">
                                          Edit
                                        </a>
                                        <form action={deleteBonusModule}>
                                          <input type="hidden" name="bonusModuleId" value={bm.id} />
                                          <button type="submit" className="bonus-rule-delete bonus-module-delete" aria-label="Delete module">
                                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                              <path
                                                fill="currentColor"
                                                d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                              />
                                            </svg>
                                          </button>
                                        </form>
                                      </div>
                                    </details>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="bonus-module-empty">No bonus modules added yet.</div>
                            )}
                          </div>
                          <details style={{ marginTop: 8 }} open={bonusFormOpen && !bonusToEdit}>
                            <summary
                              style={{
                                cursor: "pointer",
                                listStyle: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "1px solid #e5e7eb",
                                background: "#f8fafc",
                                fontWeight: 700,
                                color: "#2563eb",
                              }}
                            >
                              Add New Bonus
                            </summary>
                            {!bonusToEdit && bonusErrMessage ? (
                              <div
                                style={{
                                  marginTop: 10,
                                  color: "#b91c1c",
                                  background: "#fee2e2",
                                  border: "1px solid #fecaca",
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                  fontSize: 12,
                                }}
                              >
                                {bonusErrMessage}
                              </div>
                            ) : null}
                            <form action={addConfiguredBonus} className="bonus-config-form" style={{ marginTop: 12, display: "grid", gap: 12 }}>
                              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                  Bonus name
                                  <input name="name" placeholder="Bonus name" style={{ padding: 8 }} />
                                </label>
                                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                  Payout type
                                  <select name="payoutType" style={{ padding: 8 }}>
                                    <option value="FLAT_PER_APP">Flat per app</option>
                                    <option value="PERCENT_OF_PREMIUM">% of premium</option>
                                    <option value="FLAT_LUMP_SUM">Flat lump sum</option>
                                  </select>
                                </label>
                              </div>
                              <div style={{ display: "grid", gap: 8 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Bonus rules</div>
                                <div id="bonus-add-rule-list" className="bonus-rule-list">
                                  {Array.from({ length: 3 }).map((_, idx) => (
                                    <div key={`bonus-cond-${idx}`} className="bonus-rule-row">
                                      <div className="bonus-field">
                                        <input name="conditionName" placeholder="Rule name" style={{ padding: 8 }} />
                                        <div className="bonus-field-error"></div>
                                      </div>
                                      <div className="bonus-field">
                                        <select name="conditionMetric" style={{ padding: 8 }}>
                                          <option value="">Select metric</option>
                                          <option value="APPS_COUNT">Min apps</option>
                                          <option value="TOTAL_PREMIUM">Total premium</option>
                                          <option value="PREMIUM_CATEGORY">Premium category</option>
                                          <option value="ACTIVITY">Activity count</option>
                                        </select>
                                        <div className="bonus-field-error"></div>
                                      </div>
                                      <div className="bonus-field">
                                        <select name="conditionOperator" style={{ padding: 8 }}>
                                          <option value=">=">&gt;=</option>
                                          <option value=">">&gt;</option>
                                          <option value="<=">&lt;=</option>
                                          <option value="<">&lt;</option>
                                          <option value="=">=</option>
                                        </select>
                                        <div className="bonus-field-error"></div>
                                      </div>
                                      <div className="bonus-field">
                                        <input name="conditionValue" type="number" step="0.01" placeholder="Value" style={{ padding: 8 }} />
                                        <div className="bonus-field-error"></div>
                                      </div>
                                      <div className="bonus-field">
                                        <select name="conditionPremiumCategory" style={{ padding: 8 }}>
                                          <option value="">Premium category</option>
                                          <option value={PremiumCategory.PC}>P&amp;C</option>
                                          <option value={PremiumCategory.FS}>FS</option>
                                        </select>
                                        <div className="bonus-field-error"></div>
                                      </div>
                                      <div className="bonus-rule-actions">
                                        <button type="button" className="bonus-rule-remove" aria-label="Remove rule">
                                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                            <path
                                              fill="currentColor"
                                              d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                            />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: "flex", alignItems: "center" }}>
                                  <button
                                    type="button"
                                    className="bonus-rule-add"
                                    data-target="bonus-add-rule-list"
                                    data-template="bonus-add-rule-template"
                                  >
                                    Add rule
                                  </button>
                                </div>
                                <template id="bonus-add-rule-template">
                                  <div className="bonus-rule-row">
                                    <div className="bonus-field">
                                      <input name="conditionName" placeholder="Rule name" style={{ padding: 8 }} />
                                      <div className="bonus-field-error"></div>
                                    </div>
                                    <div className="bonus-field">
                                      <select name="conditionMetric" style={{ padding: 8 }}>
                                        <option value="">Select metric</option>
                                        <option value="APPS_COUNT">Min apps</option>
                                        <option value="TOTAL_PREMIUM">Total premium</option>
                                        <option value="PREMIUM_CATEGORY">Premium category</option>
                                        <option value="ACTIVITY">Activity count</option>
                                      </select>
                                      <div className="bonus-field-error"></div>
                                    </div>
                                    <div className="bonus-field">
                                      <select name="conditionOperator" style={{ padding: 8 }}>
                                        <option value=">=">&gt;=</option>
                                        <option value=">">&gt;</option>
                                        <option value="<=">&lt;=</option>
                                        <option value="<">&lt;</option>
                                        <option value="=">=</option>
                                      </select>
                                      <div className="bonus-field-error"></div>
                                    </div>
                                    <div className="bonus-field">
                                      <input name="conditionValue" type="number" step="0.01" placeholder="Value" style={{ padding: 8 }} />
                                      <div className="bonus-field-error"></div>
                                    </div>
                                    <div className="bonus-field">
                                      <select name="conditionPremiumCategory" style={{ padding: 8 }}>
                                        <option value="">Premium category</option>
                                        <option value={PremiumCategory.PC}>P&amp;C</option>
                                        <option value={PremiumCategory.FS}>FS</option>
                                      </select>
                                      <div className="bonus-field-error"></div>
                                    </div>
                                    <div className="bonus-rule-actions">
                                      <button type="button" className="bonus-rule-remove" aria-label="Remove rule">
                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                          <path
                                            fill="currentColor"
                                            d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </template>
                              </div>
                              <div style={{ display: "grid", gap: 8 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Bonus tiers</div>
                                <div id="bonus-add-tier-list" className="bonus-tier-list">
                                  {[0, 1, 2].map((idx) => (
                                    <div key={`bonus-tier-${idx}`} className="bonus-tier-row">
                                      <input name="tierMin" type="number" step="0.01" placeholder="Min threshold" style={{ padding: 8 }} />
                                      <input name="tierMax" type="number" step="0.01" placeholder="Max threshold (optional)" style={{ padding: 8 }} />
                                      <input name="tierPayout" type="number" step="0.01" placeholder="Payout amount" style={{ padding: 8 }} />
                                      <div className="bonus-tier-actions">
                                        <button type="button" className="bonus-tier-remove" aria-label="Remove tier">
                                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                            <path
                                              fill="currentColor"
                                              d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                            />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: "flex", alignItems: "center" }}>
                                  <button
                                    type="button"
                                    className="bonus-tier-add"
                                    data-target="bonus-add-tier-list"
                                    data-template="bonus-add-tier-template"
                                  >
                                    Add tier
                                  </button>
                                </div>
                                <template id="bonus-add-tier-template">
                                  <div className="bonus-tier-row">
                                    <input name="tierMin" type="number" step="0.01" placeholder="Min threshold" style={{ padding: 8 }} />
                                    <input name="tierMax" type="number" step="0.01" placeholder="Max threshold (optional)" style={{ padding: 8 }} />
                                    <input name="tierPayout" type="number" step="0.01" placeholder="Payout amount" style={{ padding: 8 }} />
                                    <div className="bonus-tier-actions">
                                      <button type="button" className="bonus-tier-remove" aria-label="Remove tier">
                                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                          <path
                                            fill="currentColor"
                                            d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </template>
                              </div>
                              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <button
                                  type="submit"
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #2563eb",
                                    background: "#2563eb",
                                    color: "#fff",
                                    fontWeight: 600,
                                  }}
                                >
                                  Save
                                </button>
                                <button
                                  type="reset"
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #e2e8f0",
                                    background: "#fff",
                                    color: "#64748b",
                                    fontWeight: 600,
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </details>
                          {bonusToEdit ? (
                            <div style={{ marginTop: 16, borderTop: "1px dashed #e2e8f0", paddingTop: 12 }}>
                              <div style={{ fontWeight: 700, marginBottom: 8 }}>Edit Bonus</div>
                              {bonusErrMessage ? (
                                <div
                                  style={{
                                    marginBottom: 10,
                                    color: "#b91c1c",
                                    background: "#fee2e2",
                                    border: "1px solid #fecaca",
                                    borderRadius: 8,
                                    padding: "6px 10px",
                                    fontSize: 12,
                                  }}
                                >
                                  {bonusErrMessage}
                                </div>
                              ) : null}
                              <div style={{ display: "grid", gap: 8, marginBottom: 6 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>Bonus rule list</div>
                                {bonusEditConditions.length ? (
                                  <div className="bonus-rule-summary">
                                    {bonusEditConditions.map((condition, idx) => {
                                      const rule = condition as {
                                        name?: string;
                                        metric?: string;
                                        operator?: string;
                                        value?: number;
                                        premiumCategory?: string | null;
                                      };
                                      const name = typeof rule.name === "string" && rule.name.trim() ? rule.name : `Rule ${idx + 1}`;
                                      const metric = typeof rule.metric === "string" ? rule.metric : "";
                                      const operator = typeof rule.operator === "string" ? rule.operator : "";
                                      const valueText = rule.value != null ? String(rule.value) : "-";
                                      const premiumLabel =
                                        metric === "PREMIUM_CATEGORY" && typeof rule.premiumCategory === "string"
                                          ? rule.premiumCategory === PremiumCategory.PC
                                            ? "P&C"
                                            : rule.premiumCategory === PremiumCategory.FS
                                              ? "FS"
                                              : rule.premiumCategory
                                          : "";
                                      return (
                                        <div key={`bonus-rule-summary-${idx}`} className="bonus-rule-summary-item">
                                          <div className="bonus-rule-summary-main">
                                            <div className="bonus-rule-summary-name">{name}</div>
                                            <div className="bonus-rule-summary-meta">
                                              <span>{bonusRuleMetricLabel(metric)}</span>
                                              <span>{bonusRuleOperatorLabel(operator)}</span>
                                              <span>{valueText}</span>
                                              {premiumLabel ? <span>{premiumLabel}</span> : null}
                                            </div>
                                          </div>
                                          <div className="bonus-rule-summary-actions">
                                            <a
                                              href={`#bonus-rule-${bonusToEdit.id}-${idx}`}
                                              className="bonus-rule-summary-edit"
                                            >
                                              Edit
                                            </a>
                                            <form action={deleteConfiguredBonusRule}>
                                              <input type="hidden" name="bonusModuleId" value={bonusToEdit.id} />
                                              <input type="hidden" name="ruleIndex" value={idx} />
                                              <button type="submit" className="bonus-rule-delete" aria-label="Delete rule">
                                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                  <path
                                                    fill="currentColor"
                                                    d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                                  />
                                                </svg>
                                              </button>
                                            </form>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="bonus-rule-summary-empty">No bonus rules found. Add a rule below.</div>
                                )}
                              </div>
                              <form action={updateConfiguredBonus} className="bonus-config-form" style={{ display: "grid", gap: 12 }}>
                                <input type="hidden" name="bonusModuleId" value={bonusToEdit.id} />
                                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Bonus name
                                    <input name="name" defaultValue={bonusToEdit.name || ""} placeholder="Bonus name" style={{ padding: 8 }} />
                                  </label>
                                  <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                    Payout type
                                    <select
                                      name="payoutType"
                                      defaultValue={typeof bonusEditConfig.payoutType === "string" ? bonusEditConfig.payoutType : "FLAT_PER_APP"}
                                      style={{ padding: 8 }}
                                    >
                                      <option value="FLAT_PER_APP">Flat per app</option>
                                      <option value="PERCENT_OF_PREMIUM">% of premium</option>
                                      <option value="FLAT_LUMP_SUM">Flat lump sum</option>
                                    </select>
                                  </label>
                                </div>
                                <div style={{ display: "grid", gap: 8 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>Bonus rules</div>
                                  <div id={`bonus-edit-rule-list-${bonusToEdit.id}`} className="bonus-rule-list">
                                    {Array.from({ length: bonusEditConditionRows }).map((_, idx) => {
                                      const condition = bonusEditConditions[idx] as {
                                        name?: string;
                                        metric?: string;
                                        operator?: string;
                                        value?: number;
                                        premiumCategory?: string | null;
                                      } | undefined;
                                      const isPersistedRule = idx < bonusEditConditions.length;
                                      return (
                                        <div
                                          key={`bonus-edit-cond-${idx}`}
                                          className="bonus-rule-row"
                                          id={`bonus-rule-${bonusToEdit.id}-${idx}`}
                                        >
                                          <div className="bonus-field">
                                            <input
                                              name="conditionName"
                                              placeholder="Rule name"
                                              defaultValue={isPersistedRule ? condition?.name ?? `Rule ${idx + 1}` : ""}
                                              style={{ padding: 8 }}
                                            />
                                            <div className="bonus-field-error"></div>
                                          </div>
                                          <div className="bonus-field">
                                            <select name="conditionMetric" defaultValue={condition?.metric ?? ""} style={{ padding: 8 }}>
                                              <option value="">Select metric</option>
                                              <option value="APPS_COUNT">Min apps</option>
                                              <option value="TOTAL_PREMIUM">Total premium</option>
                                              <option value="PREMIUM_CATEGORY">Premium category</option>
                                              <option value="ACTIVITY">Activity count</option>
                                            </select>
                                            <div className="bonus-field-error"></div>
                                          </div>
                                          <div className="bonus-field">
                                            <select name="conditionOperator" defaultValue={condition?.operator ?? ">="} style={{ padding: 8 }}>
                                              <option value=">=">&gt;=</option>
                                              <option value=">">&gt;</option>
                                              <option value="<=">&lt;=</option>
                                              <option value="<">&lt;</option>
                                              <option value="=">=</option>
                                            </select>
                                            <div className="bonus-field-error"></div>
                                          </div>
                                          <div className="bonus-field">
                                            <input
                                              name="conditionValue"
                                              type="number"
                                              step="0.01"
                                              placeholder="Value"
                                              defaultValue={condition?.value ?? ""}
                                              style={{ padding: 8 }}
                                            />
                                            <div className="bonus-field-error"></div>
                                          </div>
                                          <div className="bonus-field">
                                            <select
                                              name="conditionPremiumCategory"
                                              defaultValue={condition?.premiumCategory ?? ""}
                                              style={{ padding: 8 }}
                                            >
                                              <option value="">Premium category</option>
                                              <option value={PremiumCategory.PC}>P&amp;C</option>
                                              <option value={PremiumCategory.FS}>FS</option>
                                            </select>
                                            <div className="bonus-field-error"></div>
                                          </div>
                                          <div className="bonus-rule-actions">
                                            {isPersistedRule ? (
                                              <button
                                                type="submit"
                                                formAction={deleteConfiguredBonusRule}
                                                name="ruleIndex"
                                                value={idx}
                                                formNoValidate
                                                className="bonus-rule-delete"
                                                aria-label="Delete rule"
                                              >
                                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                  <path
                                                    fill="currentColor"
                                                    d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                                  />
                                                </svg>
                                              </button>
                                            ) : (
                                              <button type="button" className="bonus-rule-remove" aria-label="Remove rule">
                                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                  <path
                                                    fill="currentColor"
                                                    d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                                  />
                                                </svg>
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center" }}>
                                    <button
                                      type="button"
                                      className="bonus-rule-add"
                                      data-target={`bonus-edit-rule-list-${bonusToEdit.id}`}
                                      data-template={`bonus-edit-rule-template-${bonusToEdit.id}`}
                                    >
                                      Add rule
                                    </button>
                                  </div>
                                  <template id={`bonus-edit-rule-template-${bonusToEdit.id}`}>
                                    <div className="bonus-rule-row">
                                      <div className="bonus-field">
                                        <input name="conditionName" placeholder="Rule name" style={{ padding: 8 }} />
                                        <div className="bonus-field-error"></div>
                                      </div>
                                      <div className="bonus-field">
                                        <select name="conditionMetric" style={{ padding: 8 }}>
                                          <option value="">Select metric</option>
                                          <option value="APPS_COUNT">Min apps</option>
                                          <option value="TOTAL_PREMIUM">Total premium</option>
                                          <option value="PREMIUM_CATEGORY">Premium category</option>
                                          <option value="ACTIVITY">Activity count</option>
                                        </select>
                                        <div className="bonus-field-error"></div>
                                      </div>
                                      <div className="bonus-field">
                                        <select name="conditionOperator" style={{ padding: 8 }}>
                                          <option value=">=">&gt;=</option>
                                          <option value=">">&gt;</option>
                                          <option value="<=">&lt;=</option>
                                          <option value="<">&lt;</option>
                                          <option value="=">=</option>
                                        </select>
                                        <div className="bonus-field-error"></div>
                                      </div>
                                      <div className="bonus-field">
                                        <input name="conditionValue" type="number" step="0.01" placeholder="Value" style={{ padding: 8 }} />
                                        <div className="bonus-field-error"></div>
                                      </div>
                                      <div className="bonus-field">
                                        <select name="conditionPremiumCategory" style={{ padding: 8 }}>
                                          <option value="">Premium category</option>
                                          <option value={PremiumCategory.PC}>P&amp;C</option>
                                          <option value={PremiumCategory.FS}>FS</option>
                                        </select>
                                        <div className="bonus-field-error"></div>
                                      </div>
                                      <div className="bonus-rule-actions">
                                        <button type="button" className="bonus-rule-remove" aria-label="Remove rule">
                                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                            <path
                                              fill="currentColor"
                                              d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                            />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  </template>
                                </div>
                                <div style={{ display: "grid", gap: 8 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13 }}>Bonus tiers</div>
                                  <div id={`bonus-edit-tier-list-${bonusToEdit.id}`} className="bonus-tier-list">
                                    {Array.from({ length: bonusEditTierRows }).map((_, idx) => {
                                      const tier = bonusEditTiers[idx] as { min?: number; max?: number | null; payout?: number } | undefined;
                                      const isPersistedTier = idx < bonusEditTiers.length;
                                      return (
                                        <div
                                          key={`bonus-edit-tier-${idx}`}
                                          className="bonus-tier-row"
                                        >
                                          <input
                                            name="tierMin"
                                            type="number"
                                            step="0.01"
                                            placeholder="Min threshold"
                                            defaultValue={tier?.min ?? ""}
                                            style={{ padding: 8 }}
                                          />
                                          <input
                                            name="tierMax"
                                            type="number"
                                            step="0.01"
                                            placeholder="Max threshold (optional)"
                                            defaultValue={tier?.max ?? ""}
                                            style={{ padding: 8 }}
                                          />
                                          <input
                                            name="tierPayout"
                                            type="number"
                                            step="0.01"
                                            placeholder="Payout amount"
                                            defaultValue={tier?.payout ?? ""}
                                            style={{ padding: 8 }}
                                          />
                                          <div className="bonus-tier-actions">
                                            {isPersistedTier ? (
                                              <button
                                                type="submit"
                                                formAction={deleteConfiguredBonusTier}
                                                name="tierIndex"
                                                value={idx}
                                                formNoValidate
                                                className="bonus-tier-delete"
                                                aria-label="Delete tier"
                                              >
                                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                  <path
                                                    fill="currentColor"
                                                    d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                                  />
                                                </svg>
                                              </button>
                                            ) : (
                                              <button type="button" className="bonus-tier-remove" aria-label="Remove tier">
                                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                                  <path
                                                    fill="currentColor"
                                                    d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                                  />
                                                </svg>
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center" }}>
                                    <button
                                      type="button"
                                      className="bonus-tier-add"
                                      data-target={`bonus-edit-tier-list-${bonusToEdit.id}`}
                                      data-template={`bonus-edit-tier-template-${bonusToEdit.id}`}
                                    >
                                      Add tier
                                    </button>
                                  </div>
                                  <template id={`bonus-edit-tier-template-${bonusToEdit.id}`}>
                                    <div className="bonus-tier-row">
                                      <input name="tierMin" type="number" step="0.01" placeholder="Min threshold" style={{ padding: 8 }} />
                                      <input name="tierMax" type="number" step="0.01" placeholder="Max threshold (optional)" style={{ padding: 8 }} />
                                      <input name="tierPayout" type="number" step="0.01" placeholder="Payout amount" style={{ padding: 8 }} />
                                      <div className="bonus-tier-actions">
                                        <button type="button" className="bonus-tier-remove" aria-label="Remove tier">
                                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                            <path
                                              fill="currentColor"
                                              d="M9 3h6l1 2h4v2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4V5h4l1-2zm1 4v12h2V7h-2zm4 0v12h2V7h-2zM9 5l-.5 1h7L15 5H9z"
                                            />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  </template>
                                </div>
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                  <button
                                    type="submit"
                                    style={{
                                      padding: "8px 12px",
                                      borderRadius: 8,
                                      border: "1px solid #2563eb",
                                      background: "#2563eb",
                                      color: "#fff",
                                      fontWeight: 600,
                                    }}
                                  >
                                    Save changes
                                  </button>
                                  <a
                                    href={`${bonusesBaseUrl}&bonusTab=bonuses`}
                                    style={{ color: "#64748b", textDecoration: "none", fontWeight: 600 }}
                                  >
                                    Cancel
                                  </a>
                                </div>
                              </form>
                            </div>
                          ) : null}
                          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                            {(version?.bonusModules || [])
                              .filter((bm) => bm.bonusType !== CompBonusType.SCORECARD_TIER && bm.bonusType !== CompBonusType.CUSTOM)
                              .map((bm) => {
                                const config =
                                  bm.config && typeof bm.config === "object" && !Array.isArray(bm.config)
                                    ? (bm.config as Record<string, unknown>)
                                    : {};
                                const payoutTypeRaw = typeof config.payoutType === "string" ? config.payoutType : "";
                                const payoutLabel =
                                  payoutTypeRaw === "FLAT_PER_APP"
                                    ? "Flat per app"
                                    : payoutTypeRaw === "PERCENT_OF_PREMIUM"
                                      ? "% of premium"
                                      : payoutTypeRaw === "FLAT_LUMP_SUM"
                                        ? "Flat lump sum"
                                        : payoutTypeRaw === "FLAT"
                                          ? "Flat"
                                          : payoutTypeRaw === "PER_UNIT"
                                            ? "Per unit"
                                            : "Payout type not set";
                                return (
                                  <div
                                    key={bm.id}
                                    id={`bm-${bm.id}`}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      gap: 12,
                                      padding: "10px 12px",
                                      borderRadius: 10,
                                      border: "1px solid #e5e7eb",
                                      background: "#f8fafc",
                                    }}
                                  >
                                    <div>
                                      <div style={{ fontWeight: 700 }}>{bm.name}</div>
                                      <div style={{ fontSize: 12, color: "#6b7280" }}>{payoutLabel}</div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                      {bm.bonusType === CompBonusType.GOAL_BONUS ? (
                                        <a
                                          href={`${bonusesBaseUrl}&bonusTab=bonuses&openBm=${bm.id}#bm-${bm.id}`}
                                          style={{
                                            padding: "4px 10px",
                                            borderRadius: 999,
                                            border: "1px solid #e5e7eb",
                                            background: "#fff",
                                            color: "#2563eb",
                                            textDecoration: "none",
                                            fontWeight: 600,
                                            fontSize: 12,
                                          }}
                                        >
                                          Edit
                                        </a>
                                      ) : null}
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
                                            fontSize: 12,
                                          }}
                                        >
                                          Delete
                                        </button>
                                      </form>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
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
                      </>
                    ) : null}
                    {bonusTab === "subtractors" ? (
                      <>
                        <div style={{ display: "grid", gap: 12 }}>
                          {subtractorMsgMessage ? (
                            <div className="bonus-msg" role="status">
                              {subtractorMsgMessage}
                            </div>
                          ) : null}
                          {subtractorErrMessage && !subtractorFormOpen ? (
                            <div className="bonus-module-error" role="status">
                              {subtractorErrMessage}
                            </div>
                          ) : null}
                          <details style={{ marginTop: 4 }} open={subtractorFormOpen}>
                            <summary
                              style={{
                                cursor: "pointer",
                                listStyle: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "1px solid #e5e7eb",
                                background: "#f8fafc",
                                fontWeight: 700,
                                color: "#2563eb",
                              }}
                            >
                              Add Subtractor
                            </summary>
                            {subtractorErrMessage ? (
                              <div className="bonus-module-error" style={{ marginTop: 10 }}>
                                {subtractorErrMessage}
                              </div>
                            ) : null}
                            <form action={addSubtractor} className="subtractor-form" data-subtractor-create>
                              <div className="subtractor-builder-card">
                                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                  Name
                                  <input name="name" placeholder="Subtractor name" data-subtractor-name />
                                  <span data-subtractor-name-error style={{ color: "#b91c1c", fontSize: 12, display: "none" }}>
                                    Please add a name.
                                  </span>
                                </label>
                                <input type="hidden" name="subtractorConditionConfig" defaultValue={defaultSubtractorConditionConfigValue} />
                                <div className="subtractor-conditions subtractor-builder-section">
                                <div style={{ display: "grid", gap: 4 }}>
                                  <div style={{ fontWeight: 700, fontSize: 14 }}>If the following minimums are NOT reached...</div>
                                  <div style={{ fontSize: 12, color: "#64748b" }}>
                                    One OR condition must be met per row. All rows must be met. If not, the penalty below is applied.
                                  </div>
                                </div>
                                <div id="subtractor-condition-list" className="subtractor-condition-list">
                                  {defaultSubtractorConditionGroups.map((group, groupIndex) => (
                                    <div
                                      key={group.id}
                                      className="subtractor-condition-row"
                                      data-condition-row-id={group.id}
                                      data-row-index={groupIndex}
                                    >
                                        <div className="subtractor-condition-row-main">
                                          <div className="subtractor-condition-items subtractor-condition-row-items">
                                          {group.conditions.flatMap((condition, conditionIndex) => {
                                            const items = [renderSubtractorConditionItem(condition, group.id, groupIndex, conditionIndex, "new")];
                                            if (conditionIndex < group.conditions.length - 1) {
                                              items.push(
                                                <span key={`${group.id}-or-${conditionIndex}`} className="subtractor-or-pill">
                                                  OR
                                                </span>
                                              );
                                            }
                                            return items;
                                          })}
                                          </div>
                                          <div className="subtractor-condition-row-actions">
                                          <button
                                            type="button"
                                            className="subtractor-or-add subtractor-condition-add"
                                            data-condition-row-id={group.id}
                                            data-row-index={groupIndex}
                                          >
                                            +OR
                                          </button>
                                          <div className="scorecard-delete-condition-group">
                                            <button
                                              type="button"
                                              className="scorecard-condition-delete scorecard-row-delete subtractor-condition-group-remove"
                                              aria-label="Remove condition row"
                                              title="Remove condition row"
                                            >
                                              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                                <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                                              </svg>
                                            </button>
                                          </div>
                                          </div>
                                        </div>
                                      {groupIndex < defaultSubtractorConditionGroups.length - 1 ? (
                                        <div className="subtractor-condition-and">And</div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                                <span data-subtractor-condition-error style={{ color: "#b91c1c", fontSize: 12, display: "none" }}></span>
                                <div className="subtractor-condition-group-actions">
                                  <button type="button" className="subtractor-condition-group-add">
                                    + Add another condition
                                  </button>
                                </div>
                                <div className="subtractor-amount subtractor-builder-section subtractor-builder-divider">
                                  <div style={{ fontSize: 12, color: "#64748b" }}>Penalty if requirements are NOT met</div>
                                  <details className="subtractor-amount-details">
                                    <summary className="subtractor-amount-pill">
                                      <span data-subtractor-amount-chip>Edit penalty</span>
                                      <span className="subtractor-amount-value" data-subtractor-amount>
                                        Set penalty (%)
                                      </span>
                                    </summary>
                                    <div className="subtractor-amount-panel">
                                      <div className="subtractor-panel-header">
                                        <span>Edit penalty</span>
                                        <button type="button" className="subtractor-panel-close" aria-label="Close amount editor">
                                          X
                                        </button>
                                      </div>
                                      <div className="subtractor-field-row">
                                        <label className="scorecard-field-label">
                                          Operator
                                          <select name="operator" defaultValue="SUBTRACT">
                                            <option value="SUBTRACT">Subtract % of earnings</option>
                                            <option value="REMOVE">Remove flat amount ($)</option>
                                          </select>
                                        </label>
                                        <label className="scorecard-field-label">
                                          <span data-subtractor-penalty-label>{"Penalty amount (%)"}</span>
                                          <input
                                            name="value"
                                            type="number"
                                            step="0.01"
                                            placeholder="Percent (e.g., 25)"
                                            data-subtractor-penalty-input
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  </details>
                                  <span data-subtractor-penalty-error style={{ color: "#b91c1c", fontSize: 12, display: "none" }}></span>
                                </div>
                              </div>
                              </div>
                              <div className="subtractor-actions">
                                <button type="submit" className="subtractor-primary">
                                  Save subtractor
                                </button>
                                <button type="reset" className="subtractor-cancel">
                                  Cancel
                                </button>
                              </div>
                            </form>
                            <div id="subtractor-condition-template" style={{ display: "none" }}>
                              <div className="subtractor-condition-item scorecard-condition-item" data-condition-id="" data-condition-index={0}>
                                <details className="subtractor-condition-details">
                                  <summary className="subtractor-condition-pill">
                                    <span className="subtractor-condition-pill-value" data-subtractor-value>
                                      At least ...
                                    </span>
                                    <span className="subtractor-condition-pill-label" data-subtractor-label>
                                      App Count
                                    </span>
                                  </summary>
                                  <div className="subtractor-condition-panel">
                                    <div className="subtractor-panel-header">
                                      <span>Edit condition</span>
                                      <button type="button" className="subtractor-panel-close" aria-label="Close condition editor">
                                        X
                                      </button>
                                    </div>
                                    <div className="subtractor-condition-editor">
                                      <div className="subtractor-field-row">
                                        <label className="scorecard-field-label">
                                          Operator
                                          <select name="subtractorConditionOperator" defaultValue={ConditionOperator.GTE}>
                                            <option value={ConditionOperator.GTE}>At least (&ge;)</option>
                                          </select>
                                        </label>
                                        <label className="scorecard-field-label">
                                          Value
                                          <input name="subtractorConditionValue" type="number" step="0.01" placeholder="Value" />
                                        </label>
                                      </div>
                                      <div style={{ display: "grid", gap: 6 }}>
                                        <div style={{ fontWeight: 600, fontSize: 12, color: "#475569" }}>Condition Type</div>
                                        <div className="subtractor-chip-group" data-select="subtractorConditionType">
                                          <button type="button" className="subtractor-chip is-active" data-value="APP_COUNT" aria-pressed="true">
                                            App Count
                                          </button>
                                          <button type="button" className="subtractor-chip" data-value="PREMIUM" aria-pressed="false">
                                            Premium
                                          </button>
                                          <button type="button" className="subtractor-chip" data-value="ACTIVITY" aria-pressed="false">
                                            Activity
                                          </button>
                                        </div>
                                        <select
                                          name="subtractorConditionType"
                                          defaultValue="APP_COUNT"
                                          className="subtractor-hidden-select"
                                          tabIndex={-1}
                                          aria-hidden="true"
                                        >
                                          <option value="ACTIVITY">Activity</option>
                                          <option value="PREMIUM">Premium</option>
                                          <option value="APP_COUNT">App Count</option>
                                        </select>
                                      </div>
                                      <div style={{ display: "grid", gap: 6 }}>
                                        <div style={{ fontWeight: 600, fontSize: 12, color: "#475569" }}>Scope</div>
                                        <div className="subtractor-chip-group" data-select="subtractorScope">
                                          <button type="button" className="subtractor-chip is-active" data-value="ALL" aria-pressed="true">
                                            All
                                          </button>
                                          <button type="button" className="subtractor-chip" data-value="PC" aria-pressed="false">
                                            P&amp;C
                                          </button>
                                          <button type="button" className="subtractor-chip" data-value="FS" aria-pressed="false">
                                            FS
                                          </button>
                                          <button type="button" className="subtractor-chip" data-value="BUSINESS" aria-pressed="false">
                                            Business
                                          </button>
                                          <button type="button" className="subtractor-chip" data-value="PRODUCTS" aria-pressed="false">
                                            Specific Products
                                          </button>
                                        </div>
                                        <select
                                          name="subtractorScope"
                                          defaultValue="ALL"
                                          className="subtractor-hidden-select"
                                          tabIndex={-1}
                                          aria-hidden="true"
                                        >
                                          <option value="ALL">All</option>
                                          <option value="PC">P&amp;C</option>
                                          <option value="FS">FS</option>
                                          <option value="BUSINESS">Business</option>
                                          <option value="PRODUCTS">Specific Products</option>
                                        </select>
                                      </div>
                                      <div className="subtractor-condition-extra activity">
                                        <label className="scorecard-field-label">
                                          Activity Name
                                          <select name="subtractorActivityTypeId" defaultValue="">
                                            <option value="">Select activity</option>
                                            {activityTypes.map((activity) => (
                                              <option key={activity.id} value={activity.id}>
                                                {activity.name}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="scorecard-field-label">
                                          Threshold
                                          <input name="subtractorActivityThreshold" type="number" step="1" placeholder="Threshold" />
                                        </label>
                                      </div>
                                      <div className="subtractor-condition-products">
                                        <div style={{ fontWeight: 600, fontSize: 12 }}>Products</div>
                                        <div className="scorecard-pill-picker subtractor-pill-picker">
                                          <input type="checkbox" className="scorecard-pill-toggle subtractor-pill-toggle" />
                                          <div className="scorecard-pill-selected">
                                            <div className="scorecard-pill-selected-title">Selected products</div>
                                            <div className="scorecard-pill-empty">No products selected.</div>
                                            <div className="scorecard-pill-list">
                                              {sortedProducts.map((product) => (
                                                <div
                                                  key={product.id}
                                                  className="scorecard-pill-item subtractor-pill-item"
                                                  data-premium={product.premiumCategory}
                                                  data-type={product.productType}
                                                >
                                                  <label className="scorecard-pill-label">
                                                    <input
                                                      className="scorecard-pill-input"
                                                      type="checkbox"
                                                      name="productIds"
                                                      value={product.id}
                                                    />
                                                    <span>{product.lobName ? `${product.lobName} - ${product.name}` : product.name}</span>
                                                  </label>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                          <label className="scorecard-pill-toggle-control" data-subtractor-pill-toggle>
                                            <span className="pill-toggle-open">Add products</span>
                                            <span className="pill-toggle-close">Done</span>
                                          </label>
                                        </div>
                                        <div style={{ fontSize: 12, color: "#64748b" }}>Leave products blank to apply to all.</div>
                                      </div>
                                    </div>
                                  </div>
                                </details>
                                <button
                                  type="button"
                                  className="scorecard-condition-delete subtractor-condition-remove"
                                  aria-label="Remove condition"
                                  title="Remove condition"
                                >
                                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                            <div id="subtractor-condition-group-template" style={{ display: "none" }}>
                              <div className="subtractor-condition-row" data-condition-row-id="" data-row-index={0}>
                                <div className="subtractor-condition-row-main">
                                  <div className="subtractor-condition-items subtractor-condition-row-items">
                                    <div className="subtractor-condition-item scorecard-condition-item" data-condition-id="" data-condition-index={0}>
                                    <details className="subtractor-condition-details">
                                      <summary className="subtractor-condition-pill">
                                        <span className="subtractor-condition-pill-value" data-subtractor-value>
                                          At least ...
                                        </span>
                                        <span className="subtractor-condition-pill-label" data-subtractor-label>
                                          App Count
                                        </span>
                                      </summary>
                                      <div className="subtractor-condition-panel">
                                        <div className="subtractor-panel-header">
                                          <span>Edit condition</span>
                                          <button type="button" className="subtractor-panel-close" aria-label="Close condition editor">
                                            X
                                          </button>
                                        </div>
                                        <div className="subtractor-condition-editor">
                                          <div className="subtractor-field-row">
                                            <label className="scorecard-field-label">
                                              Operator
                                              <select name="subtractorConditionOperator" defaultValue={ConditionOperator.GTE}>
                                                <option value={ConditionOperator.GTE}>At least (&ge;)</option>
                                              </select>
                                            </label>
                                            <label className="scorecard-field-label">
                                              Value
                                              <input name="subtractorConditionValue" type="number" step="0.01" placeholder="Value" />
                                            </label>
                                          </div>
                                          <div style={{ display: "grid", gap: 6 }}>
                                            <div style={{ fontWeight: 600, fontSize: 12, color: "#475569" }}>Condition Type</div>
                                            <div className="subtractor-chip-group" data-select="subtractorConditionType">
                                              <button type="button" className="subtractor-chip is-active" data-value="APP_COUNT" aria-pressed="true">
                                                App Count
                                              </button>
                                              <button type="button" className="subtractor-chip" data-value="PREMIUM" aria-pressed="false">
                                                Premium
                                              </button>
                                              <button type="button" className="subtractor-chip" data-value="ACTIVITY" aria-pressed="false">
                                                Activity
                                              </button>
                                            </div>
                                            <select
                                              name="subtractorConditionType"
                                              defaultValue="APP_COUNT"
                                              className="subtractor-hidden-select"
                                              tabIndex={-1}
                                              aria-hidden="true"
                                            >
                                              <option value="ACTIVITY">Activity</option>
                                              <option value="PREMIUM">Premium</option>
                                              <option value="APP_COUNT">App Count</option>
                                            </select>
                                          </div>
                                          <div style={{ display: "grid", gap: 6 }}>
                                            <div style={{ fontWeight: 600, fontSize: 12, color: "#475569" }}>Scope</div>
                                            <div className="subtractor-chip-group" data-select="subtractorScope">
                                              <button type="button" className="subtractor-chip is-active" data-value="ALL" aria-pressed="true">
                                                All
                                              </button>
                                              <button type="button" className="subtractor-chip" data-value="PC" aria-pressed="false">
                                                P&amp;C
                                              </button>
                                              <button type="button" className="subtractor-chip" data-value="FS" aria-pressed="false">
                                                FS
                                              </button>
                                              <button type="button" className="subtractor-chip" data-value="BUSINESS" aria-pressed="false">
                                                Business
                                              </button>
                                              <button type="button" className="subtractor-chip" data-value="PRODUCTS" aria-pressed="false">
                                                Specific Products
                                              </button>
                                            </div>
                                            <select
                                              name="subtractorScope"
                                              defaultValue="ALL"
                                              className="subtractor-hidden-select"
                                              tabIndex={-1}
                                              aria-hidden="true"
                                            >
                                              <option value="ALL">All</option>
                                              <option value="PC">P&amp;C</option>
                                              <option value="FS">FS</option>
                                              <option value="BUSINESS">Business</option>
                                              <option value="PRODUCTS">Specific Products</option>
                                            </select>
                                          </div>
                                          <div className="subtractor-condition-extra activity">
                                            <label className="scorecard-field-label">
                                              Activity Name
                                              <select name="subtractorActivityTypeId" defaultValue="">
                                                <option value="">Select activity</option>
                                                {activityTypes.map((activity) => (
                                                  <option key={activity.id} value={activity.id}>
                                                    {activity.name}
                                                  </option>
                                                ))}
                                              </select>
                                            </label>
                                            <label className="scorecard-field-label">
                                              Threshold
                                              <input name="subtractorActivityThreshold" type="number" step="1" placeholder="Threshold" />
                                            </label>
                                          </div>
                                          <div className="subtractor-condition-products">
                                            <div style={{ fontWeight: 600, fontSize: 12 }}>Products</div>
                                            <div className="scorecard-pill-picker subtractor-pill-picker">
                                              <input type="checkbox" className="scorecard-pill-toggle subtractor-pill-toggle" />
                                              <div className="scorecard-pill-selected">
                                                <div className="scorecard-pill-selected-title">Selected products</div>
                                                <div className="scorecard-pill-empty">No products selected.</div>
                                                <div className="scorecard-pill-list">
                                                  {sortedProducts.map((product) => (
                                                    <div
                                                      key={product.id}
                                                      className="scorecard-pill-item subtractor-pill-item"
                                                      data-premium={product.premiumCategory}
                                                      data-type={product.productType}
                                                    >
                                                      <label className="scorecard-pill-label">
                                                        <input
                                                          className="scorecard-pill-input"
                                                          type="checkbox"
                                                          name="productIds"
                                                          value={product.id}
                                                        />
                                                        <span>{product.lobName ? `${product.lobName} - ${product.name}` : product.name}</span>
                                                      </label>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                              <label className="scorecard-pill-toggle-control" data-subtractor-pill-toggle>
                                                <span className="pill-toggle-open">Add products</span>
                                                <span className="pill-toggle-close">Done</span>
                                              </label>
                                            </div>
                                            <div style={{ fontSize: 12, color: "#64748b" }}>Leave products blank to apply to all.</div>
                                          </div>
                                        </div>
                                      </div>
                                    </details>
                                    <button
                                      type="button"
                                      className="scorecard-condition-delete subtractor-condition-remove"
                                      aria-label="Remove condition"
                                      title="Remove condition"
                                    >
                                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                                      </svg>
                                    </button>
                                    </div>
                                  </div>
                                  <div className="subtractor-condition-row-actions">
                                    <button
                                      type="button"
                                      className="subtractor-or-add subtractor-condition-add"
                                      data-condition-row-id=""
                                      data-row-index={0}
                                    >
                                      +OR
                                    </button>
                                    <div className="scorecard-delete-condition-group">
                                      <button
                                        type="button"
                                        className="scorecard-condition-delete scorecard-row-delete subtractor-condition-group-remove"
                                        aria-label="Remove condition row"
                                        title="Remove condition row"
                                      >
                                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <div className="subtractor-condition-and">And</div>
                              </div>
                            </div>
                          </details>
                          <div className="subtractor-list">
                            {subtractorModules.length ? (
                              subtractorModules.map((bm) => {
                                const config = resolveSubtractorConfig(bm.config);
                                const conditionGroups = config.conditionGroups;
                                const subtractorConditionConfigValue = JSON.stringify({ conditionGroups });
                                const operatorLabel = subtractorOperatorLabel(config.operator);
                                const valueLabel = config.value != null ? fmtMoneyNumber(config.value) : "Not set";
                                const operatorValue = subtractorOperatorValues.has(config.operator) ? config.operator : "SUBTRACT";
                                const hasPenaltyValue = typeof config.value === "number" && Number.isFinite(config.value);
                                const penaltyValueRaw = hasPenaltyValue ? String(config.value) : "";
                                const isRemovePenalty = operatorValue === "REMOVE";
                                const penaltyChipText = penaltyValueRaw
                                  ? isRemovePenalty
                                    ? "Remove $" + penaltyValueRaw
                                    : "Subtract " + penaltyValueRaw + "%"
                                  : "Edit penalty";
                                const penaltyValueText = penaltyValueRaw
                                  ? isRemovePenalty
                                    ? "Remove $" + penaltyValueRaw + " from earnings"
                                    : "Subtract " + penaltyValueRaw + "% of earnings"
                                  : isRemovePenalty
                                    ? "Set penalty ($)"
                                    : "Set penalty (%)";
                                const penaltyLabelText = isRemovePenalty ? "Penalty amount ($)" : "Penalty amount (%)";
                                const penaltyPlaceholder = isRemovePenalty ? "Dollars (e.g., 25)" : "Percent (e.g., 25)";
                                const subtractorConditionListId = `subtractor-condition-list-${bm.id}`;
                                const lobNames = config.lobIds
                                  .map((id) => sortedLobs.find((lob) => lob.id === id)?.name)
                                  .filter((name): name is string => Boolean(name));
                                const productNames = config.productIds
                                  .map((id) => sortedProducts.find((product) => product.id === id)?.name)
                                  .filter((name): name is string => Boolean(name));
                                const lobSummary = formatSubtractorList(lobNames, "All LoBs");
                                const productSummary = formatSubtractorList(productNames, "All products");
                                return (
                                  <details
                                    id={`bm-${bm.id}`}
                                    key={bm.id}
                                    className="module-card subtractor-card"
                                    suppressHydrationWarning
                                    open={openBm === bm.id}
                                  >
                                    <summary>
                                      <div style={{ display: "grid", gap: 4 }}>
                                        <a
                                          href={`${bonusesBaseUrl}&bonusTab=subtractors&openBm=${bm.id}#bm-${bm.id}`}
                                          className="subtractor-name-link"
                                          style={{ fontWeight: 700 }}
                                        >
                                          {bm.name || "Subtractor"}
                                        </a>
                                        <div className="subtractor-meta">
                                          <span>Operator: {operatorLabel}</span>
                                          <span>Value: {valueLabel}</span>
                                        </div>
                                      </div>
                                      <span className="module-chevron" aria-hidden="true">
                                        &#9662;
                                      </span>
                                    </summary>
                                    <form action={deleteBonusModule} style={{ margin: 0, position: "absolute", top: 12, right: 12 }}>
                                      <input type="hidden" name="bonusModuleId" value={bm.id} />
                                      <button type="submit" className="subtractor-delete bonus-module-delete">
                                        Delete
                                      </button>
                                    </form>
                                    <div className="subtractor-scope">
                                      <div>
                                        <strong>LoBs:</strong> {lobSummary}
                                      </div>
                                      <div>
                                        <strong>Products:</strong> {productSummary}
                                      </div>
                                    </div>
                                    <div style={{ marginTop: 10, fontWeight: 600, fontSize: 13 }}>Edit subtractor</div>
                                    <form action={updateSubtractor} className="subtractor-form">
                                      <input type="hidden" name="bonusModuleId" value={bm.id} />
                                      <div className="subtractor-builder-card">
                                        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                                          Name
                                          <input name="name" defaultValue={bm.name || ""} />
                                          <span data-subtractor-name-error style={{ color: "#b91c1c", fontSize: 12, display: "none" }}>
                                            Please add a name.
                                          </span>
                                        </label>
                                        <input type="hidden" name="subtractorConditionConfig" defaultValue={subtractorConditionConfigValue} />
                                        <div className="subtractor-conditions subtractor-builder-section">
                                        <div style={{ display: "grid", gap: 4 }}>
                                          <div style={{ fontWeight: 700, fontSize: 14 }}>If the following minimums are NOT reached...</div>
                                          <div style={{ fontSize: 12, color: "#64748b" }}>
                                            One OR condition must be met per row. All rows must be met. If not, the penalty below is applied.
                                          </div>
                                        </div>
                                        <div id={subtractorConditionListId} className="subtractor-condition-list">
                                          {conditionGroups.map((group, groupIndex) => (
                                            <div
                                              key={group.id}
                                              className="subtractor-condition-row"
                                              data-condition-row-id={group.id}
                                              data-row-index={groupIndex}
                                            >
                                                <div className="subtractor-condition-row-main">
                                                  <div className="subtractor-condition-items subtractor-condition-row-items">
                                                  {group.conditions.flatMap((condition, conditionIndex) => {
                                                    const items = [renderSubtractorConditionItem(condition, group.id, groupIndex, conditionIndex, bm.id)];
                                                    if (conditionIndex < group.conditions.length - 1) {
                                                      items.push(
                                                        <span key={`${group.id}-or-${conditionIndex}`} className="subtractor-or-pill">
                                                          OR
                                                        </span>
                                                      );
                                                    }
                                                    return items;
                                                  })}
                                                  </div>
                                                  <div className="subtractor-condition-row-actions">
                                                  <button
                                                    type="button"
                                                    className="subtractor-or-add subtractor-condition-add"
                                                    data-condition-row-id={group.id}
                                                    data-row-index={groupIndex}
                                                  >
                                                    +OR
                                                  </button>
                                                  <div className="scorecard-delete-condition-group">
                                                    <button
                                                      type="button"
                                                      className="scorecard-condition-delete scorecard-row-delete subtractor-condition-group-remove"
                                                      aria-label="Remove condition row"
                                                      title="Remove condition row"
                                                    >
                                                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                                                      </svg>
                                                    </button>
                                                  </div>
                                                  </div>
                                                </div>
                                              {groupIndex < conditionGroups.length - 1 ? (
                                                <div className="subtractor-condition-and">And</div>
                                              ) : null}
                                            </div>
                                          ))}
                                        </div>
                                        <span data-subtractor-condition-error style={{ color: "#b91c1c", fontSize: 12, display: "none" }}></span>
                                        <div className="subtractor-condition-group-actions">
                                          <button type="button" className="subtractor-condition-group-add">
                                            + Add another condition
                                          </button>
                                        </div>
                                        <div className="subtractor-amount subtractor-builder-section subtractor-builder-divider">
                                          <div style={{ fontSize: 12, color: "#64748b" }}>Penalty if requirements are NOT met</div>
                                          <details className="subtractor-amount-details">
                                            <summary className="subtractor-amount-pill">
                                              <span data-subtractor-amount-chip>{penaltyChipText}</span>
                                              <span className="subtractor-amount-value" data-subtractor-amount>
                                                {penaltyValueText}
                                              </span>
                                            </summary>
                                            <div className="subtractor-amount-panel">
                                              <div className="subtractor-panel-header">
                                                <span>Edit penalty</span>
                                                <button type="button" className="subtractor-panel-close" aria-label="Close amount editor">
                                                  X
                                                </button>
                                              </div>
                                              <div className="subtractor-field-row">
                                                <label className="scorecard-field-label">
                                                  Operator
                                                  <select
                                                    name="operator"
                                                    defaultValue={operatorValue}
                                                  >
                                                    <option value="SUBTRACT">Subtract % of earnings</option>
                                                    <option value="REMOVE">Remove flat amount ($)</option>
                                                  </select>
                                                </label>
                                                <label className="scorecard-field-label">
                                                  <span data-subtractor-penalty-label>{penaltyLabelText}</span>
                                                  <input
                                                    name="value"
                                                    type="number"
                                                    step="0.01"
                                                    defaultValue={config.value == null ? "" : config.value}
                                                    placeholder={penaltyPlaceholder}
                                                    data-subtractor-penalty-input
                                                  />
                                                </label>
                                              </div>
                                            </div>
                                          </details>
                                          <span data-subtractor-penalty-error style={{ color: "#b91c1c", fontSize: 12, display: "none" }}></span>
                                        </div>
                                      </div>
                                      </div>
                                      <div className="subtractor-actions">
                                        <button type="submit" className="subtractor-primary">
                                          Save changes
                                        </button>
                                        <button type="reset" className="subtractor-cancel">
                                          Cancel
                                        </button>
                                      </div>
                                    </form>
                                  </details>
                                );
                              })
                            ) : (
                              <div className="bonus-module-empty">No subtractors added yet.</div>
                            )}
                          </div>
                        </div>
                      </>
                    ) : null}

                    <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fff" }}>
                      <h3 style={{ margin: "0 0 8px 0" }}>All modules</h3>
                      <div style={{ display: "grid", gap: 12 }}>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>Scorecards</div>
                          {scorecardModulesOrdered.map((bm) => {
                              const scorecardName = resolveScorecardModuleName(bm);
                              return (
                              <div
                                key={`all-scorecard-${bm.id}`}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "8px 10px",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 8,
                                  background: "#f8fafc",
                                }}
                              >
                                <a
                                  href={`${bonusesBaseUrl}&bonusTab=scorecards#bm-${bm.id}`}
                                  aria-label={`View ${scorecardName}`}
                                  style={{ textDecoration: "none", color: "inherit" }}
                                >
                                  <div style={{ fontWeight: 700, color: "#111" }}>{scorecardName}</div>
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>{bm.bonusType}</div>
                                </a>
                                <div className="all-modules-actions" style={{ display: "flex", gap: 8 }}>
                                  <a
                                    href={`${bonusesBaseUrl}&bonusTab=scorecards&openBm=${bm.id}#bm-${bm.id}`}
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: 999,
                                      border: "1px solid #e5e7eb",
                                      background: "#fff",
                                      color: "#2563eb",
                                      textDecoration: "none",
                                      fontWeight: 600,
                                      fontSize: 12,
                                    }}
                                  >
                                    Edit
                                  </a>
                                  <form action={cloneScorecardModule} style={{ margin: 0 }}>
                                    <input type="hidden" name="sourceBonusModuleId" value={bm.id} />
                                    <button
                                      type="submit"
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #e5e7eb",
                                        background: "#fff",
                                        color: "#111827",
                                        fontWeight: 600,
                                        fontSize: 12,
                                      }}
                                    >
                                      Clone
                                    </button>
                                  </form>
                                  <form action={deleteBonusModule} style={{ margin: 0 }}>
                                    <input type="hidden" name="bonusModuleId" value={bm.id} />
                                    <button
                                      type="submit"
                                      className="bonus-module-delete"
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #dc2626",
                                        background: "#fff",
                                        color: "#b91c1c",
                                        fontWeight: 600,
                                        fontSize: 12,
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </form>
                                </div>
                              </div>
                              );
                            })}
                        </div>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>Bonuses</div>
                          {(version?.bonusModules || [])
                            .filter((bm) => bm.bonusType !== CompBonusType.SCORECARD_TIER && bm.bonusType !== CompBonusType.CUSTOM)
                            .map((bm) => (
                              <div
                                key={`all-bonus-${bm.id}`}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "8px 10px",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 8,
                                  background: "#f8fafc",
                                }}
                              >
                                <a
                                  href={`${bonusesBaseUrl}&bonusTab=bonuses#bm-${bm.id}`}
                                  aria-label={`View ${bm.name}`}
                                  style={{ textDecoration: "none", color: "inherit" }}
                                >
                                  <div style={{ fontWeight: 700, color: "#111" }}>{bm.name}</div>
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>{bm.bonusType}</div>
                                </a>
                                <div className="all-modules-actions" style={{ display: "flex", gap: 8 }}>
                                  <a
                                    href={`${bonusesBaseUrl}&bonusTab=bonuses&openBm=${bm.id}#bm-${bm.id}`}
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: 999,
                                      border: "1px solid #e5e7eb",
                                      background: "#fff",
                                      color: "#2563eb",
                                      textDecoration: "none",
                                      fontWeight: 600,
                                      fontSize: 12,
                                    }}
                                  >
                                    Edit
                                  </a>
                                  <form action={cloneBonusModule} style={{ margin: 0 }}>
                                    <input type="hidden" name="sourceBonusModuleId" value={bm.id} />
                                    <button
                                      type="submit"
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #e5e7eb",
                                        background: "#fff",
                                        color: "#111827",
                                        fontWeight: 600,
                                        fontSize: 12,
                                      }}
                                    >
                                      Clone
                                    </button>
                                  </form>
                                </div>
                              </div>
                            ))}
                        </div>
                        <div style={{ display: "grid", gap: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>Subtractors</div>
                          {subtractorModules.map((bm) => {
                            const config = resolveSubtractorConfig(bm.config);
                            const summary = summarizeSubtractor(config);
                            return (
                              <div
                                key={`all-subtractor-${bm.id}`}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "8px 10px",
                                  border: "1px solid #e5e7eb",
                                  borderRadius: 8,
                                  background: "#f8fafc",
                                }}
                              >
                                <div style={{ display: "grid", gap: 2 }}>
                                  <a
                                    href={`${bonusesBaseUrl}&bonusTab=subtractors&openBm=${bm.id}#bm-${bm.id}`}
                                    className="subtractor-name-link"
                                    style={{ fontWeight: 700, color: "#111" }}
                                  >
                                    {bm.name || "Subtractor"}
                                  </a>
                                  <div style={{ fontSize: 12, color: "#6b7280" }}>{summary}</div>
                                </div>
                                <div className="all-modules-actions" style={{ display: "flex", gap: 8 }}>
                                  <a
                                    href={`${bonusesBaseUrl}&bonusTab=subtractors&openBm=${bm.id}#bm-${bm.id}`}
                                    style={{
                                      padding: "4px 10px",
                                      borderRadius: 999,
                                      border: "1px solid #e5e7eb",
                                      background: "#fff",
                                      color: "#2563eb",
                                      textDecoration: "none",
                                      fontWeight: 600,
                                      fontSize: 12,
                                    }}
                                  >
                                    Edit
                                  </a>
                                  <form action={cloneSubtractorModule} style={{ margin: 0 }}>
                                    <input type="hidden" name="sourceBonusModuleId" value={bm.id} />
                                    <button
                                      type="submit"
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #e5e7eb",
                                        background: "#fff",
                                        color: "#111827",
                                        fontWeight: 600,
                                        fontSize: 12,
                                      }}
                                    >
                                      Clone
                                    </button>
                                  </form>
                                  <form action={deleteBonusModule} style={{ margin: 0 }}>
                                    <input type="hidden" name="bonusModuleId" value={bm.id} />
                                    <button
                                      type="submit"
                                      className="bonus-module-delete"
                                      style={{
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                        border: "1px solid #dc2626",
                                        background: "#fff",
                                        color: "#b91c1c",
                                        fontWeight: 600,
                                        fontSize: 12,
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </form>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

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
                        <div>Base: {"$"}{previewResult.baseEarnings.toFixed(2)}</div>
                        <div>Bonus: {"$"}{previewResult.bonusEarnings.toFixed(2)}</div>
                        <div>Subtractors: -{"$"}{previewResult.subtractorTotal.toFixed(2)}</div>
                        <div>Total (after subtractors): {"$"}{previewResult.totalEarnings.toFixed(2)}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>Base breakdown</div>
                        {(previewResult.breakdown.baseResults || []).map((r) => (
                          <div key={r.ruleId} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                            <div style={{ fontWeight: 600 }}>{r.detail}</div>
                            <div style={{ color: "#111" }}>{"$"}{r.amount.toFixed(2)}</div>
                            {r.records?.length ? (
                              <details style={{ marginTop: 4 }}>
                                <summary style={{ cursor: "pointer", fontSize: 13 }}>Show records ({r.records.length})</summary>
                                <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                                  {r.records.slice(0, 10).map((rec, idx) => (
                                    <div key={idx} style={{ fontSize: 12, color: "#555" }}>
                                      {rec.product} • {"$"}{rec.premium.toFixed(2)} • {rec.status} • {rec.dateSold}
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
                                    <div>{"$"}{b.amount.toFixed(2)}</div>
                                  </div>
                                ))}
                                {otherBonuses.length === 0 ? <div style={{ color: "#555" }}>No bonuses earned.</div> : null}
                              </div>
                              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>Activity Bonuses</div>
                                {activityBonuses.map((b, idx) => (
                                  <div key={`activity-${idx}`} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                                    <div>{b.name}</div>
                                    <div>{"$"}{b.amount.toFixed(2)}</div>
                                  </div>
                                ))}
                                {activityBonuses.length === 0 ? <div style={{ color: "#555" }}>No bonuses earned.</div> : null}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                        {(() => {
                          const subtractorDetails = previewResult.breakdown.subtractorDetails || [];
                          const appliedSubtractors = subtractorDetails.filter((s) => s.amount > 0);
                          return (
                            <>
                              <div style={{ fontWeight: 700, marginBottom: 4 }}>Subtractors</div>
                              {appliedSubtractors.map((s) => (
                                <div
                                  key={s.id}
                                  style={{ display: "flex", justifyContent: "space-between", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginBottom: 6 }}
                                >
                                  <div>
                                    {s.name} ({subtractorOperatorLabel(s.operator)})
                                  </div>
                                  <div>-{"$"}{s.amount.toFixed(2)}</div>
                                </div>
                              ))}
                              {appliedSubtractors.length === 0 ? <div style={{ color: "#555" }}>No subtractors applied.</div> : null}
                            </>
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

type ScorecardStats = {
  tiersCount: number;
  rowsCount: number;
  conditionsCount: number;
  rewardsCount: number;
};

type ScorecardModuleCardProps = {
  id: string;
  name: string | null;
  bonusType: CompBonusType;
  stats: ScorecardStats;
  open: boolean;
  onDelete: (formData: FormData) => Promise<void>;
  children: JSX.Element | JSX.Element[];
};

function ScorecardModuleCard({ id, name, bonusType, stats, open, onDelete, children }: ScorecardModuleCardProps) {
  const displayName = name || "Scorecard";
  return (
    <details
      id={`bm-${id}`}
      className="module-card scorecard-card scorecard-lift"
      suppressHydrationWarning
      open={open}
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 12,
        position: "relative",
        flex: "0 1 calc(25% - 12px)",
        minWidth: 280,
        background: "#fff",
      }}
    >
      <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div>
          <a href={`#edit-module-${id}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 700, display: "block" }}>
            {displayName}
          </a>
          <div style={{ color: "#555", fontSize: 13 }}>{bonusType}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Tiers: {stats.tiersCount} • Rows: {stats.rowsCount} • Conditions: {stats.conditionsCount} • Rewards: {stats.rewardsCount}
          </div>
          <span className="module-chevron" aria-hidden="true">
            &#9662;
          </span>
        </div>
      </summary>
      <form action={onDelete} style={{ margin: 0, position: "absolute", top: 12, right: 12 }}>
        <input type="hidden" name="bonusModuleId" value={id} />
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
      <div style={{ marginTop: 10 }}>{children}</div>
    </details>
  );
}

type ScorecardAddCardProps = {
  onCreate: () => Promise<void>;
};

function ScorecardAddCard({ onCreate }: ScorecardAddCardProps) {
  return (
    <form
      action={onCreate}
      className="scorecard-add-card"
      style={{
        flex: "0 1 calc(25% - 12px)",
        minWidth: 280,
        marginLeft: "auto",
      }}
    >
      <button
        type="submit"
        className="scorecard-lift"
        style={{
          width: "100%",
          height: "100%",
          minHeight: 96,
          borderRadius: 10,
          border: "1px dashed #cbd5e1",
          background: "#f8fafc",
          color: "#2563eb",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
        <span>New scorecard</span>
      </button>
    </form>
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

function bonusRuleMetricLabel(metric: string | null | undefined) {
  switch (metric) {
    case "APPS_COUNT":
      return "Apps";
    case "TOTAL_PREMIUM":
      return "Total premium";
    case "PREMIUM_CATEGORY":
      return "Premium category";
    case "ACTIVITY":
      return "Activity count";
    default:
      return metric || "Metric";
  }
}

function bonusRuleOperatorLabel(operator: string | null | undefined) {
  switch (operator) {
    case ">=":
      return "At least";
    case ">":
      return "Greater than";
    case "<=":
      return "At most";
    case "<":
      return "Less than";
    case "=":
      return "Equal to";
    default:
      return operator || "Operator";
  }
}

function subtractorOperatorLabel(operator: string | null | undefined) {
  if (operator === "REMOVE") return "Remove";
  if (operator === "SUBTRACT") return "Subtract";
  return operator || "Subtract";
}

function formatCopiedTierName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return "Copy";
  const lower = trimmed.toLowerCase();
  if (lower.endsWith(" copy") || lower.endsWith("(copy)")) return trimmed;
  return `${trimmed} Copy`;
}

function resolveScorecardModuleName(module: { name?: string | null; scorecardTiers: { name?: string | null }[] }) {
  const moduleName = (module.name || "").trim();
  const tierName = (module.scorecardTiers[0]?.name || "").trim();
  if (module.scorecardTiers.length === 1) {
    return moduleName || tierName || "Scorecard";
  }
  return moduleName || "Scorecard";
}

const subtractorConditionTypeValues = new Set<SubtractorConditionMetric>(["APP_COUNT", "PREMIUM", "ACTIVITY"]);
const subtractorConditionScopeValues = new Set<SubtractorConditionScope>(["ALL", "PC", "FS", "BUSINESS", "PRODUCTS"]);
const subtractorConditionOperatorValues = new Set([ConditionOperator.GTE]);

function normalizeSubtractorCondition(raw: unknown, fallbackId: string): SubtractorCondition {
  const data = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const operatorRaw = typeof data.operator === "string" ? data.operator : ConditionOperator.GTE;
  const operator = subtractorConditionOperatorValues.has(operatorRaw) ? (operatorRaw as ConditionOperator) : ConditionOperator.GTE;
  const value = typeof data.value === "number" && Number.isFinite(data.value) ? data.value : null;
  const metricRaw = typeof data.metric === "string" ? data.metric : "APP_COUNT";
  const metric = subtractorConditionTypeValues.has(metricRaw as SubtractorConditionMetric) ? (metricRaw as SubtractorConditionMetric) : "APP_COUNT";
  const scopeRaw = typeof data.scope === "string" ? data.scope : "ALL";
  const scope = subtractorConditionScopeValues.has(scopeRaw as SubtractorConditionScope) ? (scopeRaw as SubtractorConditionScope) : "ALL";
  const activityTypeId = typeof data.activityTypeId === "string" && data.activityTypeId ? data.activityTypeId : null;
  const activityThreshold = typeof data.activityThreshold === "number" && Number.isFinite(data.activityThreshold) ? data.activityThreshold : null;
  const productIds = Array.isArray(data.productIds) ? data.productIds.map(String).filter(Boolean) : [];
  const id = typeof data.id === "string" && data.id ? data.id : fallbackId;
  return { id, operator, value, metric, scope, activityTypeId, activityThreshold, productIds };
}

function normalizeSubtractorConditionGroups(raw: unknown): SubtractorConditionGroup[] {
  const groupsRaw = Array.isArray(raw) ? raw : [];
  const groups = groupsRaw.map((group, groupIndex) => {
    const groupData = group && typeof group === "object" && !Array.isArray(group) ? (group as Record<string, unknown>) : {};
    const rowId = typeof groupData.id === "string" && groupData.id ? groupData.id : `row-${groupIndex + 1}`;
    const conditionsRaw = Array.isArray(groupData.conditions) ? groupData.conditions : [];
    const conditions = conditionsRaw.map((cond, condIndex) => normalizeSubtractorCondition(cond, `${rowId}-cond-${condIndex + 1}`));
    if (!conditions.length) {
      conditions.push(normalizeSubtractorCondition({}, `${rowId}-cond-1`));
    }
    return { id: rowId, conditions };
  });
  if (!groups.length) {
    const rowId = "row-1";
    return [{ id: rowId, conditions: [normalizeSubtractorCondition({}, `${rowId}-cond-1`)] }];
  }
  return groups;
}

function parseSubtractorConditionConfig(raw: string | null | undefined): SubtractorConditionGroup[] {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return normalizeSubtractorConditionGroups([]);
  try {
    const parsed = JSON.parse(value);
    const groups =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as { conditionGroups?: unknown }).conditionGroups
        : parsed;
    return normalizeSubtractorConditionGroups(groups);
  } catch {
    return normalizeSubtractorConditionGroups([]);
  }
}

function resolveSubtractorConfig(config: unknown): SubtractorConfig {
  const baseConfig =
    config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
  const subtractorConfig =
    baseConfig.subtractor && typeof baseConfig.subtractor === "object" && !Array.isArray(baseConfig.subtractor)
      ? (baseConfig.subtractor as Record<string, unknown>)
      : baseConfig;
  const operator = typeof subtractorConfig.operator === "string" ? subtractorConfig.operator : "";
  const value =
    typeof subtractorConfig.value === "number" && Number.isFinite(subtractorConfig.value)
      ? subtractorConfig.value
      : typeof baseConfig.customValue === "number" && Number.isFinite(baseConfig.customValue)
        ? baseConfig.customValue
        : null;
  const productIds = Array.isArray(subtractorConfig.productIds) ? subtractorConfig.productIds.map(String).filter(Boolean) : [];
  const lobIds = Array.isArray(subtractorConfig.lobIds) ? subtractorConfig.lobIds.map(String).filter(Boolean) : [];
  const conditionGroups = normalizeSubtractorConditionGroups(subtractorConfig.conditionGroups);
  return { operator, value, productIds, lobIds, conditionGroups };
}

function formatSubtractorList(items: string[], emptyLabel: string, maxItems = 3) {
  if (!items.length) return emptyLabel;
  const visible = items.slice(0, maxItems).join(", ");
  const remainder = items.length > maxItems ? ` +${items.length - maxItems} more` : "";
  return `${visible}${remainder}`;
}

type SpecialRule = {
  id: string;
  lobId: string;
  name: string;
  enabled: boolean;
  statusEligibility: PolicyStatus[];
  productIds: string[];
  thresholdPremium: number;
  payoutType: "PERCENT" | "FLAT";
  payoutValue: number;
  interactionMode: "OVERRIDE_SPECIAL" | "HIGHER_OF_BASE_OR_SPECIAL" | "ADD_ON_TOP_OF_BASE";
  contributesToTierBasis: boolean;
  orderIndex?: number;
  createdAt: string;
};

type RuleBlockExpanded = Prisma.CompPlanRuleBlockGetPayload<{ include: { tiers: true } }>;
type SoldWithMeta = Prisma.SoldProductGetPayload<{ include: { product: { include: { lineOfBusiness: true } }; household: true } }>;
type ProductMeta = { lob: { id: string; name: string; premiumCategory: PremiumCategory }; product: { id: string; name: string; productType: string } };
type SubtractorConditionMetric = "APP_COUNT" | "PREMIUM" | "ACTIVITY";
type SubtractorConditionScope = "ALL" | "PC" | "FS" | "BUSINESS" | "PRODUCTS";
type SubtractorCondition = {
  id: string;
  operator: ConditionOperator;
  value: number | null;
  metric: SubtractorConditionMetric;
  scope: SubtractorConditionScope;
  productIds: string[];
  activityTypeId: string | null;
  activityThreshold: number | null;
};
type SubtractorConditionGroup = { id: string; conditions: SubtractorCondition[] };
type SubtractorConfig = { operator: string; value: number | null; productIds: string[]; lobIds: string[]; conditionGroups: SubtractorConditionGroup[] };

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
    return {
      baseEarnings: 0,
      bonusEarnings: 0,
      subtractorTotal: 0,
      totalEarnings: 0,
      breakdown: { baseResults: [], bonusDetails: [], subtractorDetails: [] },
      bucketValues: {},
      unmappedSoldCount: 0,
    };
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
        subtractorTotal: 0,
        totalEarnings: 0,
        bucketValues: {},
        breakdown: {
          baseResults: [{ ruleId: "info", amount: 0, detail: "Assignment not effective for this month." }],
          bonusDetails: [],
          subtractorDetails: [],
        },
        unmappedSoldCount: 0,
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

  const subtractorDetails: { id: string; name: string; operator: string; value: number; amount: number }[] = [];
  let subtractorTotal = 0;
  let adjustedTotal = baseTotal + bonusTotal;
  const eligibleSold = sold.filter((s) => defaultStatuses.includes(s.status));
  for (const bm of version.bonusModules) {
    if (bm.bonusType !== CompBonusType.CUSTOM || !bm.enabled) continue;
    const config = resolveSubtractorConfig(bm.config);
    const value = config.value;
    if (value == null || Number.isNaN(value) || value <= 0) continue;
    const hasProductScope = config.productIds.length > 0;
    const hasLobScope = config.lobIds.length > 0;
    let applies = true;
    if (hasProductScope || hasLobScope) {
      applies = eligibleSold.some((s) => {
        if (hasProductScope && config.productIds.includes(s.productId)) return true;
        if (hasLobScope) {
          const meta = productsById.get(s.productId);
          if (meta && config.lobIds.includes(meta.lob.id)) return true;
        }
        return false;
      });
    }
    if (!applies) {
      subtractorDetails.push({ id: bm.id, name: bm.name, operator: config.operator || "SUBTRACT", value, amount: 0 });
      continue;
    }
    const operator = config.operator === "REMOVE" ? "REMOVE" : "SUBTRACT";
    let amount = value;
    if (operator === "REMOVE") {
      const removeBase = Math.max(adjustedTotal, 0);
      amount = Math.min(value, removeBase);
    }
    adjustedTotal -= amount;
    subtractorTotal += amount;
    subtractorDetails.push({ id: bm.id, name: bm.name, operator, value, amount });
  }

  const totalEarnings = adjustedTotal;
  return {
    baseEarnings: baseTotal,
    bonusEarnings: bonusTotal,
    subtractorTotal,
    totalEarnings,
    bucketValues,
    breakdown: { baseResults, bonusDetails, subtractorDetails },
    unmappedSoldCount,
  };
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
