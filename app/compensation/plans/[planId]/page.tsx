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
  CompPayoutType,
  CompRuleType,
  CompTierBasis,
  CompTierMode,
  CompRewardType,
  PolicyStatus,
  PremiumCategory,
  Prisma,
} from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import LobRuleComposer from "./LobRuleComposer";
import BonusComposer from "./BonusComposer";
import ProductSidebarClient from "./ProductSidebarClient";

type Params = { params: Promise<{ planId: string }>; searchParams?: Promise<Record<string, string | undefined>> };

export default async function CompPlanDetailPage({ params, searchParams }: Params) {
  const sp = (await searchParams) || {};
  const section = sp.section || "lob";
  const { planId } = await params;
  const plan = await prisma.compPlan.findUnique({
    where: { id: planId },
    include: {
      versions: {
        where: { isCurrent: true },
        include: {
          ruleBlocks: { include: { tiers: true }, orderBy: { orderIndex: "asc" } },
          gates: true,
          bonusModules: { include: { scorecardTiers: { include: { conditions: true, rewards: true }, orderBy: { orderIndex: "asc" } } } },
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

  async function deletePlanAction() {
    "use server";
    const versions = await prisma.compPlanVersion.findMany({
      where: { planId },
      include: {
        ruleBlocks: { include: { tiers: true } },
        gates: true,
        bonusModules: { include: { scorecardTiers: { include: { conditions: true, rewards: true } } } },
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
    const rewardIds = versions.flatMap((v) =>
      v.bonusModules.flatMap((bm) => bm.scorecardTiers.flatMap((t) => t.rewards.map((r) => r.id)))
    );
    const versionIds = versions.map((v) => v.id);

    await prisma.$transaction([
      prisma.compPlanScorecardCondition.deleteMany({ where: { id: { in: conditionIds } } }),
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

  const teams = await prisma.team.findMany({ where: agencyId ? { agencyId } : {}, orderBy: { name: "asc" }, include: { roles: true } });
  const people = await prisma.person.findMany({
    where: agencyId ? { team: { agencyId } } : {},
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

    // capture up to 5 tier rows on first save
    const tierMins = formData.getAll("tierMin").map((v) => (v === "" ? null : Number(v)));
    const tierMaxs = formData.getAll("tierMax").map((v) => (v === "" ? null : Number(v)));
    const tierPayouts = formData.getAll("tierPayout").map((v) => (v === "" ? null : Number(v)));
    const tierPayoutTypes = formData.getAll("tierPayoutType").map((v) => (v ? (v as CompPayoutType) : payoutType));
    const redirectSection = String(formData.get("redirectSection") || "lob");
    const redirectLob = String(formData.get("redirectLob") || "");

    if (!name || !applyScope || !payoutType) return;

    const orderIndex = (await prisma.compPlanRuleBlock.count({ where: { planVersionId: versionId } })) || 0;

    // ensure primary product is included in the filters list
    if (primaryProductId) {
      if (!productIds.includes(primaryProductId)) productIds.push(primaryProductId);
    }

    const rb = await prisma.compPlanRuleBlock.create({
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

    // create tier rows if provided
    if (tierMode === CompTierMode.TIERS) {
      const tierData: { minValue: number; maxValue: number | null; payoutValue: number; payoutUnit?: string; orderIndex: number }[] = [];
      for (let i = 0; i < Math.max(tierMins.length, tierPayouts.length); i++) {
        const min = tierMins[i];
        const payout = tierPayouts[i];
        if (min == null || payout == null || Number.isNaN(min) || Number.isNaN(payout)) continue;
        const max = tierMaxs[i];
        const payoutTypeOverride = tierPayoutTypes[i] || payoutType;
        tierData.push({
          minValue: min,
          maxValue: max == null || Number.isNaN(max) ? null : max,
          payoutValue: payout,
          payoutUnit: payoutUnitLabel(payoutTypeOverride),
          orderIndex: i,
        });
      }
      if (tierData.length) {
        await prisma.compPlanTierRow.createMany({
          data: tierData.map((t) => ({ ...t, ruleBlockId: rb.id })),
        });
      }
    }

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
    const minValue = Number(formData.get("minValue") || 0);
    const maxValueRaw = String(formData.get("maxValue") || "");
    const maxValue = maxValueRaw ? Number(maxValueRaw) : null;
    const payoutValue = Number(formData.get("payoutValue") || 0);
    const payoutUnit = String(formData.get("payoutUnit") || "") || null;
    const orderIndex = (await prisma.compPlanTierRow.count({ where: { ruleBlockId } })) || 0;

    await prisma.compPlanTierRow.create({
      data: { ruleBlockId, minValue, maxValue, payoutValue, payoutUnit, orderIndex },
    });
    revalidatePath(`/compensation/plans/${planId}`);
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

  async function addReward(formData: FormData) {
    "use server";
    const tierId = String(formData.get("tierId") || "");
    if (!tierId) return;
    const rewardType = formData.get("rewardType") as CompRewardType | null;
    const percentValue = formData.get("percentValue") ? Number(formData.get("percentValue")) : null;
    const dollarValue = formData.get("dollarValue") ? Number(formData.get("dollarValue")) : null;
    const bucketId = String(formData.get("bucketId") || "") || null;
    const premiumCategory = (formData.get("premiumCategory") as PremiumCategory | null) || null;
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
          <div style={{ color: "#555" }}>{plan.description || "No description"}</div>
          <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>
            Default statuses: {plan.defaultStatusEligibility.join(", ") || "Issued, Paid"} • Version: {version?.effectiveStartMonth || "Current"}
          </div>
          {unconfiguredCount > 0 ? (
            <div style={{ marginTop: 8, color: "#b45309", background: "#fef3c7", padding: "8px 10px", borderRadius: 8, border: "1px solid #fcd34d" }}>
              {unconfiguredCount} product(s) have no rule coverage and will currently pay $0. Add rule blocks to cover them.
            </div>
          ) : null}
        </section>

        {section === "lob" ? (
        <section id="lob-nav">
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 260px", gap: 16, alignItems: "start" }}>
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

            <div style={{ display: "grid", gap: 16 }}>
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
                    <form action={addRuleBlock} id="add-rule">
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
            </div>

            <ProductSidebarClient
              products={products.map((p) => ({
                id: p.id,
                name: p.name,
                usage: productUsage.get(p.id) || 0,
                lobName: p.lobName,
              }))}
              lobName={selectedLob?.name}
            />
          </div>
        </section>
        ) : null}

        {section === "buckets" ? (
          <section id="buckets">
            <h2 style={{ marginTop: 0 }}>Buckets</h2>
            <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 10 }}>
              Buckets aggregate premium across products/LoBs. Drag ideas into rules by selecting a bucket in rule scope.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {buckets.length === 0 ? <div style={{ color: "#94a3b8" }}>No buckets defined for this agency.</div> : null}
              {buckets.map((b) => (
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
                    <div style={{ fontWeight: 700 }}>{b.name}</div>
                    <div style={{ color: "#475569", fontSize: 12 }}>
                      Includes LOBs: {b.includesLobs.join(", ") || "—"} • Products: {b.includesProducts.join(", ") || "—"}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#0f172a" }}>{bucketUsage.get(b.id) || 0} use(s)</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {section === "lob" ? (
        <>
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
                {rb.tierMode === CompTierMode.TIERS ? (
                  <form action={addTier} style={{ marginTop: 8, display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
                    <input type="hidden" name="ruleBlockId" value={rb.id} />
                    <input name="minValue" type="number" step="0.01" placeholder="Min" style={{ padding: 8 }} />
                    <input name="maxValue" type="number" step="0.01" placeholder="Max (optional)" style={{ padding: 8 }} />
                    <input name="payoutValue" type="number" step="0.01" placeholder="Payout" style={{ padding: 8 }} />
                    <input name="payoutUnit" placeholder="Unit (optional)" style={{ padding: 8 }} />
                    <button type="submit" style={{ padding: "8px 12px" }}>Add tier</button>
                  </form>
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
          `}</style>
          <div id="add-rule" className="modal-target">
            <div className="modal-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>New Rule Block</div>
                <a href="#" style={{ textDecoration: "none", color: "#b91c1c", fontWeight: 700 }}>✕ Close</a>
              </div>
              <form action={addRuleBlock} style={{ display: "grid", gap: 18 }}>
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Step 1 • Define the rule</div>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>Rule name</span>
                  <input name="name" required style={{ padding: 10, width: "100%" }} placeholder="e.g., Personal Raw New Auto base" />
                </label>
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <label style={{ display: "grid", gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>Applies to</span>
                    <select name="applyScope" style={{ padding: 10, width: "100%" }}>
                      <option value={CompApplyScope.PRODUCT}>Specific products</option>
                      <option value={CompApplyScope.LOB}>Lines of business</option>
                      <option value={CompApplyScope.PRODUCT_TYPE}>Product type</option>
                      <option value={CompApplyScope.PREMIUM_CATEGORY}>Premium category</option>
                      <option value={CompApplyScope.BUCKET}>Premium bucket</option>
                    </select>
                    <span style={{ fontSize: 12, color: "#555" }}>Pick the scope you care about; product is simplest.</span>
                  </label>
                  <label style={{ display: "grid", gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>Payout type</span>
                    <select name="payoutType" style={{ padding: 10, width: "100%" }}>
                      <option value={CompPayoutType.FLAT_PER_APP}>Flat $ per app</option>
                      <option value={CompPayoutType.PERCENT_OF_PREMIUM}>% of premium</option>
                      <option value={CompPayoutType.FLAT_LUMP_SUM}>Flat lump sum</option>
                    </select>
                    <span style={{ fontSize: 12, color: "#555" }}>Flat/app for app tiers; % for premium tiers.</span>
                  </label>
                  <label style={{ display: "grid", gap: 2 }}>
                    <span style={{ fontWeight: 600 }}>Base payout value</span>
                    <input name="basePayoutValue" type="number" step="0.01" defaultValue={0} style={{ padding: 10, width: "100%" }} />
                    <span style={{ fontSize: 12, color: "#555" }}>Used when tiers are off.</span>
                  </label>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Step 2 • Pick products (keep it simple)</div>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontWeight: 600 }}>Primary product (quick pick)</span>
                  <select name="primaryProductId" style={{ padding: 10, width: "100%" }} defaultValue="">
                    <option value="">Select a product</option>
                    {lobs.map((lob) => (
                      <optgroup key={`opt-${lob.id}`} label={`${lob.name}`}>
                        {products
                          .filter((p) => p.lobName === lob.name)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.productType} / {p.premiumCategory})
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>Add more products or groups (optional)</summary>
                  <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>Multi-select</span>
                      <select name="productIds" multiple size={Math.min(8, products.length || 4)} style={{ width: "100%", padding: 8 }}>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.lobName} — {p.name} ({p.productType})
                          </option>
                        ))}
                      </select>
                    </label>
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Personal products</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {products
                            .filter((p) => p.productType === "PERSONAL")
                            .map((p) => (
                              <label key={`personal-${p.id}`} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <input type="checkbox" name="productIds" value={p.id} /> {p.lobName} — {p.name}
                              </label>
                            ))}
                          {products.filter((p) => p.productType === "PERSONAL").length === 0 ? (
                            <div style={{ color: "#777", fontSize: 12 }}>No personal products</div>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>Business products</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {products
                            .filter((p) => p.productType === "BUSINESS")
                            .map((p) => (
                              <label key={`business-${p.id}`} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <input type="checkbox" name="productIds" value={p.id} /> {p.lobName} — {p.name}
                              </label>
                            ))}
                          {products.filter((p) => p.productType === "BUSINESS").length === 0 ? (
                            <div style={{ color: "#777", fontSize: 12 }}>No business products</div>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>PC premium</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {products
                            .filter((p) => p.premiumCategory === PremiumCategory.PC)
                            .map((p) => (
                              <label key={`pc-${p.id}`} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <input type="checkbox" name="productIds" value={p.id} /> {p.lobName} — {p.name}
                              </label>
                            ))}
                          {products.filter((p) => p.premiumCategory === PremiumCategory.PC).length === 0 ? (
                            <div style={{ color: "#777", fontSize: 12 }}>No PC products</div>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>FS premium</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {products
                            .filter((p) => p.premiumCategory === PremiumCategory.FS)
                            .map((p) => (
                              <label key={`fs-${p.id}`} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <input type="checkbox" name="productIds" value={p.id} /> {p.lobName} — {p.name}
                              </label>
                            ))}
                          {products.filter((p) => p.premiumCategory === PremiumCategory.FS).length === 0 ? (
                            <div style={{ color: "#777", fontSize: 12 }}>No FS products</div>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>IPS premium</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {products
                            .filter((p) => p.premiumCategory === PremiumCategory.IPS)
                            .map((p) => (
                              <label key={`ips-${p.id}`} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                                <input type="checkbox" name="productIds" value={p.id} /> {p.lobName} — {p.name}
                              </label>
                            ))}
                          {products.filter((p) => p.premiumCategory === PremiumCategory.IPS).length === 0 ? (
                            <div style={{ color: "#777", fontSize: 12 }}>No IPS products</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {lobs.map((lob) => (
                        <div key={lob.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                          <div style={{ fontWeight: 600 }}>{lob.name}</div>
                          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                            <input type="checkbox" name="lobIds" value={lob.id} /> Include entire LoB
                          </label>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="productTypes" value="PERSONAL" /> Personal
                      </label>
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="productTypes" value="BUSINESS" /> Business
                      </label>
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="premiumCategories" value={PremiumCategory.PC} /> PC (Auto/Fire)
                      </label>
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="premiumCategories" value={PremiumCategory.FS} /> FS (Health/Life)
                      </label>
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="premiumCategories" value={PremiumCategory.IPS} /> IPS
                      </label>
                    </div>
                  </div>
                </details>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Step 3 • Payout logic</div>
                <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                  <label>
                    Use tiers?
                    <br />
                    <select name="tierMode" style={{ padding: 10, width: "100%" }}>
                      <option value={CompTierMode.NONE}>No tiers</option>
                      <option value={CompTierMode.TIERS}>Tiered</option>
                    </select>
                  </label>
                  <label>
                    Tier basis
                    <br />
                    <select name="tierBasis" style={{ padding: 10, width: "100%" }}>
                      <option value="">(none)</option>
                      <option value={CompTierBasis.APP_COUNT}>App count</option>
                      <option value={CompTierBasis.PREMIUM_SUM}>Premium sum</option>
                      <option value={CompTierBasis.BUCKET_VALUE}>Bucket value</option>
                    </select>
                  </label>
                  <label>
                    Bucket (if needed)
                    <br />
                    <select name="bucketId" style={{ padding: 10, width: "100%" }}>
                      <option value="">Select bucket</option>
                      {buckets.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Minimum threshold (apps or premium)
                    <br />
                    <input name="minThreshold" type="number" step="0.01" placeholder="Optional" style={{ padding: 10, width: "100%" }} />
                  </label>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Enter tiers (optional)</div>
                  <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
                    Defaults are prefilled for common Auto/Life tiers. Adjust as needed; unused rows can stay blank.
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", alignItems: "center" }}>
                        <div style={{ fontWeight: 600 }}>Tier {i + 1}</div>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 12 }}>Min</span>
                          <input
                            name="tierMin"
                            type="number"
                            step="0.01"
                            placeholder="e.g., 0"
                            style={{ padding: 8 }}
                            defaultValue={i === 0 ? 0 : i === 1 ? 20 : i === 2 ? 31 : ""}
                          />
                        </label>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 12 }}>Max (blank = no cap)</span>
                          <input
                            name="tierMax"
                            type="number"
                            step="0.01"
                            placeholder="e.g., 19"
                            style={{ padding: 8 }}
                            defaultValue={i === 0 ? 19 : i === 1 ? 30 : ""}
                          />
                        </label>
                        <label style={{ display: "grid", gap: 4 }}>
                          <span style={{ fontSize: 12 }}>Payout</span>
                          <input
                            name="tierPayout"
                            type="number"
                            step="0.01"
                            placeholder="e.g., 10"
                            style={{ padding: 8 }}
                            defaultValue={i === 0 ? 10 : i === 1 ? 25 : i === 2 ? 40 : ""}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Status override (optional)</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID, PolicyStatus.STATUS_CHECK, PolicyStatus.CANCELLED].map((s) => (
                    <label key={s} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input type="checkbox" name="statusOverride" value={s} /> {s}
                    </label>
                  ))}
                </div>
              </div>

              <button type="submit" style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
                Save rule block
              </button>
              </form>
            </div>
          </div>
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
              <select name="behavior" style={{ padding: 10 }}>
                <option value={CompGateBehavior.HARD_GATE}>Hard gate</option>
                <option value={CompGateBehavior.RETROACTIVE}>Retroactive</option>
                <option value={CompGateBehavior.NON_RETROACTIVE}>Non-retro</option>
              </select>
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
          <div style={{ display: "grid", gap: 12 }}>
            {version?.bonusModules.map((bm) => (
              <div key={bm.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 700 }}>{bm.name}</div>
                <div style={{ color: "#555", fontSize: 13 }}>{bm.bonusType}</div>
                {bm.bonusType === CompBonusType.SCORECARD_TIER ? (
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {bm.scorecardTiers.map((tier) => (
                      <div key={tier.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                        <div style={{ fontWeight: 600 }}>{tier.name}</div>
                        <div style={{ color: "#555", fontSize: 13 }}>
                          Conditions: {tier.conditions.length} • Rewards: {tier.rewards.length}
                        </div>
                        <form action={addReward} style={{ marginTop: 6, display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                          <input type="hidden" name="tierId" value={tier.id} />
                          <select name="rewardType" style={{ padding: 8 }}>
                            <option value={CompRewardType.ADD_PERCENT_OF_BUCKET}>Add % of bucket</option>
                            <option value={CompRewardType.ADD_FLAT_DOLLARS}>Add $</option>
                            <option value={CompRewardType.MULTIPLIER}>Multiplier</option>
                          </select>
                          <input name="percentValue" type="number" step="0.01" placeholder="% (if % type)" style={{ padding: 8 }} />
                          <input name="dollarValue" type="number" step="0.01" placeholder="$ (if flat)" style={{ padding: 8 }} />
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
                          <button type="submit" style={{ padding: "8px 10px" }}>Add reward</button>
                        </form>
                      </div>
                    ))}
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
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Bonus breakdown</div>
                {(previewResult.breakdown.bonusDetails || []).map((b, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, marginBottom: 6 }}>
                    <div>{b.name}</div>
                    <div>${b.amount.toFixed(2)}</div>
                  </div>
                ))}
                {(previewResult.breakdown.bonusDetails || []).length === 0 ? <div style={{ color: "#555" }}>No bonus earned in this preview.</div> : null}
              </div>
            </div>
          ) : null}
        </section>
        ) : null}
      </div>
    </AppShell>
  );
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

  const payout =
    rb.payoutType === "FLAT_PER_APP"
      ? `$${rb.basePayoutValue}/app`
      : rb.payoutType === "PERCENT_OF_PREMIUM"
        ? `${rb.basePayoutValue}% of premium`
        : `$${rb.basePayoutValue} lump sum`;

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
          bonusModules: { include: { scorecardTiers: { include: { conditions: true, rewards: true } } } },
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

  const premiumBuckets = plan.agency?.premiumBuckets || [];
  for (const bucket of premiumBuckets) {
    const value = sold
      .filter((s) => defaultStatuses.includes(s.status))
      .filter((s) => {
        const meta = productsById.get(s.productId);
        if (!meta) return false;
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
  for (const bm of version.bonusModules) {
    if (bm.bonusType !== CompBonusType.SCORECARD_TIER) continue;
    const achieved: { tier: string; amount: number }[] = [];
    for (const tier of bm.scorecardTiers) {
      let conditionsMet = tier.requiresAllConditions;
      for (const cond of tier.conditions) {
        let value = 0;
        if (cond.metricSource === "BUCKET" && cond.bucketId) {
          value = bucketValues[cond.bucketId] || 0;
        } else if (cond.metricSource === "PREMIUM_CATEGORY") {
          value = 0; // placeholder until detailed premium category mapping is added
        } else if (cond.metricSource === "APPS_COUNT") {
          value = sold.filter((s) => (cond.statusFilter ? s.status === cond.statusFilter : defaultStatuses.includes(s.status))).length;
        }
        const ok =
          cond.operator === "GTE"
            ? value >= cond.value
            : cond.operator === "GT"
              ? value > cond.value
              : cond.operator === "LTE"
                ? value <= cond.value
                : cond.operator === "LT"
                  ? value < cond.value
                  : value === cond.value;
        if (tier.requiresAllConditions) conditionsMet = conditionsMet && ok;
        else conditionsMet = conditionsMet || ok;
      }
      if (conditionsMet) {
        let rewardAmount = 0;
        for (const r of tier.rewards) {
          if (r.rewardType === CompRewardType.ADD_FLAT_DOLLARS && r.dollarValue) rewardAmount += r.dollarValue;
          if (r.rewardType === CompRewardType.ADD_PERCENT_OF_BUCKET && r.percentValue) {
            const bucketVal = r.bucketId ? bucketValues[r.bucketId] || 0 : sold.reduce((sum, s) => sum + s.premium, 0);
            rewardAmount += (r.percentValue / 100) * bucketVal;
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
  return { baseEarnings: baseTotal, bonusEarnings: bonusTotal, totalEarnings, bucketValues, breakdown: { baseResults, bonusDetails } };
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
