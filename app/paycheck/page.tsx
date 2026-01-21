/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { AppShell } from "@/app/components/AppShell";
import { AutoSubmit } from "@/app/sold-products/AutoSubmit";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import {
  CompAssignmentScope,
  CompApplyScope,
  CompBonusType,
  CompMetricSource,
  CompPayoutType,
  CompRewardType,
  CompTierBasis,
  CompTierMode,
  PolicyStatus,
  PremiumCategory,
} from "@prisma/client";
import { startOfMonth, endOfMonth } from "date-fns";

type ResolvedPlan = {
  planId: string;
  versionId: string;
  planName?: string;
  bonusModules: Awaited<ReturnType<typeof prisma.compPlanBonusModule.findMany>>;
  ruleBlocks: Awaited<ReturnType<typeof prisma.compPlanRuleBlock.findMany>>;
  gates: Awaited<ReturnType<typeof prisma.compPlanGate.findMany>>;
};

type Metrics = {
  pcPremium: number;
  fsPremium: number;
  ipsPremium: number;
  totalApps: number;
  activityByName: Record<string, number>;
  activityByTypeId: Record<string, number>;
  bucketValues: { pc: number; fs: number; ips: number; total: number };
};

type BucketById = Record<string, { includesProducts: string[]; includesLobs: string[] }>;

async function resolvePlanForPerson(
  person: { id: string; roleId: string | null; teamId: string | null; teamType: any; primaryAgencyId: string | null; orgId: string | null },
  monthKey: string,
  viewerOrgId: string | null
): Promise<ResolvedPlan | null> {
  if (!viewerOrgId) return null;

  const personInOrg = person.orgId === viewerOrgId;
  const roleInOrg = person.roleId
    ? await prisma.role.findFirst({
        where: { id: person.roleId, team: { orgId: viewerOrgId } },
        select: { id: true },
      })
    : null;
  const teamInOrg = person.teamId
    ? await prisma.team.findFirst({
        where: { id: person.teamId, orgId: viewerOrgId },
        select: { id: true },
      })
    : null;
  const agencyInOrg = person.primaryAgencyId
    ? await prisma.agency.findFirst({
        where: { id: person.primaryAgencyId, orgId: viewerOrgId },
        select: { id: true },
      })
    : null;

  const scopes: { type: CompAssignmentScope; id?: string | null }[] = [
    { type: CompAssignmentScope.PERSON, id: person.id },
    { type: CompAssignmentScope.ROLE, id: person.roleId },
    { type: CompAssignmentScope.TEAM, id: person.teamId },
    { type: CompAssignmentScope.AGENCY, id: person.primaryAgencyId },
  ];

  for (const scope of scopes) {
    if (!scope.id && scope.type !== CompAssignmentScope.AGENCY) continue;
    const scopeAllowed =
      (scope.type === CompAssignmentScope.PERSON && personInOrg) ||
      (scope.type === CompAssignmentScope.ROLE && Boolean(roleInOrg)) ||
      (scope.type === CompAssignmentScope.TEAM && Boolean(teamInOrg)) ||
      (scope.type === CompAssignmentScope.AGENCY && Boolean(agencyInOrg));
    if (!scopeAllowed) continue;
    const assignment = await prisma.compPlanAssignment.findFirst({
      where: {
        active: true,
        scopeType: scope.type,
        scopeId: scope.id,
        OR: [{ effectiveStartMonth: null }, { effectiveStartMonth: { lte: monthKey } }],
        plan: { status: { equals: "ACTIVE" as any }, active: true },
      },
      orderBy: [{ effectiveStartMonth: "desc" }],
      include: {
        plan: {
          include: {
            versions: {
              where: { isCurrent: true },
              include: {
                bonusModules: {
                  where: { enabled: true },
                  include: {
                    scorecardTiers: {
                      include: { conditions: true, rewards: true },
                      orderBy: { orderIndex: "asc" },
                    },
                  },
                  orderBy: { name: "asc" },
                },
                gates: {
                  where: { enabled: true },
                  orderBy: { name: "asc" },
                },
                ruleBlocks: {
                  where: { enabled: true },
                  include: { tiers: { orderBy: { orderIndex: "asc" } } },
                  orderBy: { orderIndex: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (assignment && assignment.plan.versions.length > 0) {
      const version = assignment.plan.versions[0];
      return {
        planId: assignment.planId,
        versionId: version.id,
        planName: assignment.plan.name,
        bonusModules: version.bonusModules,
        ruleBlocks: version.ruleBlocks,
        gates: version.gates,
      };
    }
  }

  return null;
}

function opPass(val: number, op: any, target: number) {
  switch (op) {
    case "GTE":
      return val >= target;
    case "GT":
      return val > target;
    case "LTE":
      return val <= target;
    case "LT":
      return val < target;
    case "EQ":
      return val === target;
    default:
      return false;
  }
}

type BonusCard = {
  title: string;
  summary: string;
  amount: number; // earned
  potential: number; // total if unlocked
  detail: string;
  achieved: boolean;
  conditions?: { label: string; value: number; target: number; progress: number; met: boolean }[];
  remaining?: string;
};

function evaluateBonuses(
  plan: ResolvedPlan,
  metrics: Metrics,
  bucketTotalsById: Record<string, number>,
  activityByTypeIdMonth: Record<string, number>,
  activityByNameMonth: Record<string, number>,
  activityByTypeIdDay: Record<string, Record<string, number>>,
  activityByNameDay: Record<string, Record<string, number>>
) {
  const cards: BonusCard[] = [];
  let bonusTotal = 0;

  for (const bm of plan.bonusModules) {
    if (bm.bonusType === CompBonusType.ACTIVITY_BONUS) {
      const cfg = (bm.config || {}) as any;
      const requirements = Array.isArray(cfg.requirements) ? cfg.requirements : null;
      if (!requirements || requirements.length === 0) {
        const count = cfg.activityTypeId ? activityByTypeIdMonth[cfg.activityTypeId] || 0 : 0;
        const needed = cfg.threshold || 0;
        const payout = cfg.payoutValue || 0;
        const achieved = count >= needed;
        const amount = achieved ? (cfg.payoutType === "PER_UNIT" ? payout * count : payout) : 0;
        bonusTotal += amount;
        cards.push({
          title: bm.name || "Activity bonus",
          summary: `Activity: ${cfg.activityTypeName || cfg.activityTypeId || "Unspecified"} — ${count}/${needed}`,
          amount,
          potential: amount,
          detail: achieved ? "Achieved" : "Not yet achieved",
          achieved,
          conditions: [
            {
              label: cfg.activityTypeName || cfg.activityTypeId || "Activity",
              value: count,
              target: needed,
              progress: needed > 0 ? Math.min(100, Math.round((count / needed) * 100)) : 0,
              met: achieved,
            },
          ],
          remaining: achieved ? undefined : `${Math.max(0, needed - count)} more to unlock`,
        });
        continue;
      }

      const timeframe = cfg.timeframe === "DAY" ? "DAY" : "MONTH";
      const requiresAll = cfg.requiresAll !== undefined ? Boolean(cfg.requiresAll) : true;
      const payoutType = cfg.payoutType === "PER_UNIT" ? "PER_UNIT" : "FLAT";
      const payoutValue = cfg.payoutValue || 0;
      const normalizedReqs = requirements.map((req: any) => ({
        activityTypeId: req.activityTypeId,
        activityName: req.activityName,
        min: Number(req.min || 0),
      }));

      const requirementValue = (req: any, byType: Record<string, number>, byName: Record<string, number>) => {
        if (req.activityTypeId) return byType[req.activityTypeId] || 0;
        if (req.activityName) return byName[req.activityName] || 0;
        return 0;
      };

      const buildResult = (byType: Record<string, number>, byName: Record<string, number>) => {
        const conditions = normalizedReqs.map((req: any) => {
          const value = requirementValue(req, byType, byName);
          const target = req.min || 0;
          const progress = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
          const met = value >= target;
          return { label: req.activityName || req.activityTypeId || "Activity", value, target, progress, met };
        });
        const metCount = conditions.filter((c) => c.met).length;
        const sum = conditions.reduce((acc, c) => acc + c.value, 0);
        const remaining = conditions.map((c) => Math.max(0, c.target - c.value));
        const remainingMax = remaining.length ? Math.max(...remaining) : 0;
        const remainingMin = remaining.length ? Math.min(...remaining) : 0;
        const achieved = requiresAll ? conditions.every((c) => c.met) : conditions.some((c) => c.met);
        return { conditions, metCount, sum, remainingMax, remainingMin, achieved };
      };

      let winningResult: ReturnType<typeof buildResult> | null = null;
      let progressResult: ReturnType<typeof buildResult> | null = null;

      if (timeframe === "MONTH") {
        const result = buildResult(activityByTypeIdMonth, activityByNameMonth);
        winningResult = result;
        progressResult = result;
      } else {
        const dayKeys = new Set([...Object.keys(activityByTypeIdDay), ...Object.keys(activityByNameDay)]);
        progressResult = buildResult({}, {});
        for (const dayKey of Array.from(dayKeys).sort()) {
          const result = buildResult(activityByTypeIdDay[dayKey] || {}, activityByNameDay[dayKey] || {});
          if (result.achieved && (!winningResult || result.sum > winningResult.sum)) {
            winningResult = result;
          }
          if (
            !progressResult ||
            result.metCount > progressResult.metCount ||
            (result.metCount === progressResult.metCount &&
              ((requiresAll ? result.remainingMax < progressResult.remainingMax : result.remainingMin < progressResult.remainingMin) ||
                ((requiresAll ? result.remainingMax === progressResult.remainingMax : result.remainingMin === progressResult.remainingMin) && result.sum > progressResult.sum)))
          ) {
            progressResult = result;
          }
        }
      }

      const achieved = Boolean(winningResult && winningResult.achieved);
      const displayResult = achieved && winningResult ? winningResult : progressResult;
      const amount = achieved ? (payoutType === "PER_UNIT" ? payoutValue * (winningResult ? winningResult.sum : 0) : payoutValue) : 0;
      bonusTotal += amount;

      const remainingNeeded = displayResult ? (requiresAll ? displayResult.remainingMax : displayResult.remainingMin) : 0;
      const metCount = displayResult ? displayResult.metCount : 0;
      const conditions = displayResult ? displayResult.conditions : [];

      cards.push({
        title: bm.name || "Activity bonus",
        summary: `Grouped activity bonus — ${timeframe} — met ${metCount}/${normalizedReqs.length} requirements`,
        amount,
        potential: amount,
        detail: achieved ? "Achieved" : "Not yet achieved",
        achieved,
        conditions,
        remaining: achieved ? undefined : `${Math.max(0, remainingNeeded)} more to unlock`,
      });
      continue;
    }
    if (bm.bonusType !== CompBonusType.SCORECARD_TIER) continue;
    const tiers = bm.scorecardTiers.slice().sort((a, b) => a.orderIndex - b.orderIndex);

    let achievedTier = null as (typeof tiers)[number] | null;
    const achievedRewards: number[] = [];

    const conditionValue = (c: any) => {
      if (c.metricSource === CompMetricSource.PREMIUM_CATEGORY && c.premiumCategory) {
        return c.premiumCategory === PremiumCategory.PC ? metrics.pcPremium : c.premiumCategory === PremiumCategory.FS ? metrics.fsPremium : metrics.ipsPremium;
      }
      if (c.metricSource === CompMetricSource.BUCKET) {
        if (c.bucketId) return bucketTotalsById[c.bucketId] || 0;
        return c.premiumCategory === PremiumCategory.PC
          ? metrics.bucketValues.pc
          : c.premiumCategory === PremiumCategory.FS
          ? metrics.bucketValues.fs
          : c.premiumCategory === PremiumCategory.IPS
          ? metrics.bucketValues.ips
          : metrics.bucketValues.total;
      }
      if (c.metricSource === CompMetricSource.APPS_COUNT) return metrics.totalApps;
      if (c.metricSource === CompMetricSource.ACTIVITY) return c.activityTypeId ? metrics.activityByTypeId[c.activityTypeId] || 0 : 0;
      return 0;
    };

    const satisfied = (tier: (typeof tiers)[number]) => {
      const results = tier.conditions.map((c) => {
        const val = conditionValue(c);
        if (c.metricSource === CompMetricSource.PREMIUM_CATEGORY && c.premiumCategory) {
          return opPass(val, c.operator, c.value);
        }
        if (c.metricSource === CompMetricSource.BUCKET) {
          return opPass(val, c.operator, c.value);
        }
        if (c.metricSource === CompMetricSource.APPS_COUNT) {
          return opPass(val, c.operator, c.value);
        }
        if (c.metricSource === CompMetricSource.ACTIVITY) {
          return opPass(val, c.operator, c.value);
        }
        return false;
      });
      return tier.requiresAllConditions ? results.every(Boolean) : results.some(Boolean);
    };

    const rewardsValue = (tier: (typeof tiers)[number]) => {
      let sum = 0;
      for (const r of tier.rewards) {
        if (r.rewardType === CompRewardType.ADD_FLAT_DOLLARS && r.dollarValue) {
          sum += r.dollarValue;
        } else if (r.rewardType === CompRewardType.ADD_PERCENT_OF_BUCKET) {
          const base = r.bucketId
            ? (bucketTotalsById[r.bucketId] || 0)
            : r.premiumCategory === PremiumCategory.PC
              ? metrics.bucketValues.pc
              : r.premiumCategory === PremiumCategory.FS
              ? metrics.bucketValues.fs
              : metrics.bucketValues.total;
          sum += base * ((r.percentValue || 0) / 100);
        }
      }
      return sum;
    };

    const satisfiedTiers = tiers.filter(satisfied);
    if (satisfiedTiers.length > 0) {
      achievedTier = bm.highestTierWins ? satisfiedTiers[satisfiedTiers.length - 1] : satisfiedTiers[0];
      if (bm.stackTiers) {
        satisfiedTiers.forEach((t) => achievedRewards.push(rewardsValue(t)));
      } else {
        achievedRewards.push(rewardsValue(achievedTier));
      }
    }

    const amount = achievedRewards.reduce((a, b) => a + b, 0);
    bonusTotal += amount;

    // Build a card per tier to show progress and upside
    for (const tier of tiers) {
      const isAchieved = satisfied(tier);
      const potential = rewardsValue(tier);
      const conditions = tier.conditions.map((c) => {
        const val = conditionValue(c);
        const label =
          c.metricSource === CompMetricSource.PREMIUM_CATEGORY || c.metricSource === CompMetricSource.BUCKET
            ? c.premiumCategory === PremiumCategory.PC
              ? "P&C premium"
              : c.premiumCategory === PremiumCategory.FS
              ? "FS premium"
              : c.premiumCategory === PremiumCategory.IPS
              ? "IPS premium"
              : "Total premium across all lines"
            : c.metricSource === CompMetricSource.APPS_COUNT
            ? "Apps"
            : c.metricSource === CompMetricSource.ACTIVITY
            ? "Activity"
            : "Metric";
        const progress = c.value > 0 ? Math.min(100, Math.round((val / c.value) * 100)) : 0;
        return { label, value: val, target: c.value, progress, met: val >= c.value };
      });

      const unmet = conditions.filter((c) => !c.met);
      const remainingText = unmet
        .map((c) => `${c.label}: ${fmtMoney(Math.max(0, c.target - c.value))} left`)
        .join(" • ") || undefined;

      const detail = isAchieved ? `Achieved tier "${tier.name}".` : `Need to meet all conditions for "${tier.name}".`;
      const summary = conditions
        .map((c) => `${c.label}: ${fmtMoney(c.value)} / ${fmtMoney(c.target)} (${c.progress}%)`)
        .join(" • ") || "No conditions recorded";
      const cardAmount = isAchieved ? potential : 0;
      if (isAchieved && ((bm.highestTierWins && tier === achievedTier) || bm.stackTiers)) {
        // amount already added to bonusTotal via achievedRewards; card reflects the earned amount for clarity
      }

      // push card per tier to show progress; keep plan title for all
      cards.push({
        title: `${bm.name || "Scorecard"} — ${tier.name}`,
        summary,
        amount: cardAmount,
        potential,
        detail,
        achieved: isAchieved,
        conditions,
        remaining: remainingText,
      });
    }
  }

  return { bonusTotal, cards };
}

type GateStatus = { blocked: boolean; reasons: string[]; traces: string[] };

function evaluateGates(plan: ResolvedPlan | null, soldRows: typeof sampleSold, statusFilter: PolicyStatus[]): GateStatus {
  if (!plan || plan.gates.length === 0) return { blocked: false, reasons: [], traces: [] };
  const reasons: string[] = [];
  const traces: string[] = [];

  const appsCount = soldRows.filter((r) => statusFilter.includes(r.status as PolicyStatus)).length;
  const premiumSum = soldRows
    .filter((r) => statusFilter.includes(r.status as PolicyStatus))
    .reduce((s, r) => s + Number(r.premium || 0), 0);

  for (const gate of plan.gates) {
    if (gate.gateType === "MIN_APPS") {
      if (appsCount < gate.thresholdValue) {
        reasons.push(`Requires at least ${gate.thresholdValue} apps to unlock payouts.`);
      } else {
        traces.push(`Gate "${gate.name}" passed: ${appsCount} apps >= ${gate.thresholdValue}.`);
      }
    } else if (gate.gateType === "MIN_PREMIUM") {
      if (premiumSum < gate.thresholdValue) {
        reasons.push(`Requires at least ${fmtMoney(gate.thresholdValue)} premium to unlock payouts.`);
      } else {
        traces.push(`Gate "${gate.name}" passed: ${fmtMoney(premiumSum)} >= ${fmtMoney(gate.thresholdValue)}.`);
      }
    } else if (gate.gateType === "MIN_BUCKET") {
      // Bucket gating: use total premium as conservative fallback
      if (premiumSum < gate.thresholdValue) {
        reasons.push(`Requires bucket total of ${fmtMoney(gate.thresholdValue)} to unlock payouts.`);
      } else {
        traces.push(`Gate "${gate.name}" (bucket) passed using total premium ${fmtMoney(premiumSum)}.`);
      }
    }
  }

  return { blocked: reasons.length > 0, reasons, traces };
}

type TierStatus = {
  label: string;
  achieved: boolean;
  payoutLabel: string;
  leftText?: string;
  basisValue?: number;
  basisLabel?: string;
};

type RuleEvalResult = {
  name: string;
  amount: number;
  detail: string;
  perProduct: Map<string, number>;
  trace: string;
  productIds?: string[];
  tiersStatus?: TierStatus[];
};

function passesStatus(statusList: PolicyStatus[], override?: PolicyStatus[]) {
  if (!override || override.length === 0) return true;
  return statusList.some((s) => override.includes(s));
}

function rowMatchesBucket(bucket: { includesProducts: string[]; includesLobs: string[] }, row: typeof sampleSold[number]) {
  const productId = row.product.id;
  const productName = row.product.name;
  const lobId = row.product.lineOfBusiness.id;
  const lobName = row.product.lineOfBusiness.name;
  return (
    bucket.includesProducts.includes(productId) ||
    bucket.includesProducts.includes(productName) ||
    bucket.includesLobs.includes(lobId) ||
    bucket.includesLobs.includes(lobName)
  );
}

function matchesScope(rule: any, rows: typeof sampleSold, bucketById: BucketById): typeof sampleSold {
  const filters = (rule.applyFilters || {}) as any;
  switch (rule.applyScope) {
    case CompApplyScope.PRODUCT:
      return rows.filter((r) => (filters.productIds || []).includes(r.product.id));
    case CompApplyScope.LOB:
      return rows.filter((r) => (filters.lobIds || []).includes(r.product.lineOfBusiness.id));
    case CompApplyScope.PRODUCT_TYPE:
      return rows.filter((r) => (filters.productTypes || []).includes(r.product.productType));
    case CompApplyScope.PREMIUM_CATEGORY:
      return rows.filter((r) => (filters.premiumCategories || []).includes(r.product.lineOfBusiness.premiumCategory));
    case CompApplyScope.BUCKET: {
      const bucket = rule.bucketId ? bucketById[rule.bucketId] : null;
      if (!bucket) return [];
      return rows.filter((r) => rowMatchesBucket(bucket, r));
    }
    default:
      return rows;
  }
}

function evaluateRuleBlocks(
  plan: ResolvedPlan | null,
  soldRows: typeof sampleSold,
  statusFilter: PolicyStatus[],
  bucketValues: Metrics["bucketValues"],
  bucketTotalsById: Record<string, number>,
  bucketById: BucketById
): RuleEvalResult[] {
  if (!plan) return [];
  const results: RuleEvalResult[] = [];

  for (const rule of plan.ruleBlocks) {
    const scopedRows = matchesScope(rule, soldRows, bucketById).filter((r) => passesStatus([r.status as PolicyStatus], rule.statusEligibilityOverride));
    if (scopedRows.length === 0) continue;

    const appsCount = scopedRows.length;
    const premiumSum = scopedRows.reduce((s, r) => s + Number(r.premium || 0), 0);

    if (rule.minThreshold != null) {
      const basis = rule.tierBasis === CompTierBasis.PREMIUM_SUM ? premiumSum : appsCount;
      if (basis < rule.minThreshold) continue;
    }

    const tiered = rule.tierMode === CompTierMode.TIERS && rule.tiers.length > 0;
    const tierBasisVal =
      rule.tierBasis === CompTierBasis.PREMIUM_SUM
        ? premiumSum
        : rule.tierBasis === CompTierBasis.BUCKET_VALUE
        ? (rule.bucketId ? (bucketTotalsById[rule.bucketId] || 0) : 0)
        : appsCount;
    const selectedTier = tiered ? rule.tiers.find((t) => tierBasisVal >= t.minValue && (t.maxValue == null || tierBasisVal <= t.maxValue)) || rule.tiers[rule.tiers.length - 1] : null;
    const payoutValue = selectedTier ? selectedTier.payoutValue : rule.basePayoutValue || 0;

    let amount = 0;
    const perProduct = new Map<string, number>();
    const traceParts: string[] = [];

    if (rule.payoutType === CompPayoutType.FLAT_PER_APP) {
      amount = payoutValue * appsCount;
      scopedRows.forEach((r) => {
        perProduct.set(r.product.id, (perProduct.get(r.product.id) || 0) + payoutValue);
      });
      traceParts.push(`Flat per app ${payoutValue} * ${appsCount} apps`);
    } else if (rule.payoutType === CompPayoutType.PERCENT_OF_PREMIUM) {
      amount = (payoutValue / 100) * premiumSum;
      const totalPremium = premiumSum || 1;
      scopedRows.forEach((r) => {
        const share = (Number(r.premium || 0) / totalPremium) * amount;
        perProduct.set(r.product.id, (perProduct.get(r.product.id) || 0) + share);
      });
      traceParts.push(`Percent of premium ${payoutValue.toFixed(2)}% on ${fmtMoney(premiumSum)}`);
    } else if (rule.payoutType === CompPayoutType.FLAT_LUMP_SUM) {
      amount = payoutValue;
      const each = scopedRows.length ? amount / scopedRows.length : 0;
      scopedRows.forEach((r) => {
        perProduct.set(r.product.id, (perProduct.get(r.product.id) || 0) + each);
      });
      traceParts.push(`Lump sum ${fmtMoney(payoutValue)} split across ${scopedRows.length} records`);
    }

    let tiersStatus: TierStatus[] | undefined;
    if (tiered) {
      const basisLabel =
        rule.tierBasis === CompTierBasis.PREMIUM_SUM
          ? "premium"
          : rule.tierBasis === CompTierBasis.BUCKET_VALUE
          ? "bucket"
          : "apps";
      tiersStatus = rule.tiers.map((t) => {
        const achieved = tierBasisVal >= t.minValue && (t.maxValue == null || tierBasisVal <= t.maxValue);
        const payoutLabel =
          rule.payoutType === CompPayoutType.FLAT_PER_APP
            ? `${fmtMoney(t.payoutValue)} per app`
            : rule.payoutType === CompPayoutType.PERCENT_OF_PREMIUM
            ? `${t.payoutValue.toFixed(2)}%`
            : fmtMoney(t.payoutValue);
        let leftText: string | undefined;
        if (!achieved) {
          const needed = Math.max(0, t.minValue - tierBasisVal);
          leftText = `${fmtMoney(needed)} ${basisLabel} left`;
        }
        const rangeLabel = t.maxValue == null ? `${t.minValue}+` : `${t.minValue} - ${t.maxValue}`;
        return { label: rangeLabel, achieved, payoutLabel, leftText, basisValue: tierBasisVal, basisLabel };
      });
    }

    results.push({
      name: rule.name,
      amount,
      detail: tiered ? `Tiered on ${rule.tierBasis === CompTierBasis.PREMIUM_SUM ? "premium" : rule.tierBasis === CompTierBasis.BUCKET_VALUE ? "bucket" : "apps"} at ${payoutValue}` : `Base rate ${payoutValue}`,
      perProduct,
      trace: traceParts.join(" | "),
      productIds: scopedRows.map((r) => r.product.id),
      tiersStatus,
    });
  }

  return results;
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtMonthYear(date: Date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export default async function PaycheckPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) || {};
  const today = new Date();
  const monthIdx = typeof sp.month === "string" ? parseInt(sp.month, 10) : today.getMonth();
  const year = typeof sp.year === "string" ? parseInt(sp.year, 10) : today.getFullYear();
  const applyWritten = sp.written === "1";
  const requestedPersonId = typeof sp.person === "string" ? sp.person : "";

  const startDate = startOfMonth(new Date(year, monthIdx, 1));
  const endDate = endOfMonth(startDate);

  const viewer: any = await getOrgViewer();
  const viewerPersonId = viewer?.personId || "";
  const viewerOrgId = viewer?.orgId || null;
  const permissions = viewer?.permissions ?? [];
  const canViewOtherPaychecks = Boolean(
    viewer?.isTtwAdmin ||
      viewer?.isOwner ||
      viewer?.isAdmin ||
      permissions.includes("EDIT_PAYCHECKS") ||
      permissions.includes("VIEW_ORG")
  );

  const orgPeople = viewerOrgId
    ? await prisma.person.findMany({ where: { orgId: viewerOrgId }, orderBy: { fullName: "asc" } })
    : [];
  const orgPersonIds = new Set(orgPeople.map((p) => p.id));

  let people = orgPeople;
  let selectedPersonId = "";
  if (canViewOtherPaychecks) {
    const requestedInOrg = requestedPersonId && orgPersonIds.has(requestedPersonId);
    selectedPersonId =
      (requestedInOrg ? requestedPersonId : "") || viewerPersonId || orgPeople[0]?.id || "";
  } else {
    selectedPersonId = viewerPersonId || orgPeople[0]?.id || "";
    people = viewerPersonId ? orgPeople.filter((p) => p.id === viewerPersonId) : [];
  }

  const selectedPerson = orgPeople.find((p) => p.id === selectedPersonId) || null;
  const statusFilter = applyWritten ? [PolicyStatus.WRITTEN, PolicyStatus.ISSUED, PolicyStatus.PAID] : [PolicyStatus.ISSUED, PolicyStatus.PAID];

  const bucketById: BucketById = {};

  const sold = selectedPerson && viewerOrgId
    ? await prisma.soldProduct.findMany({
        where: {
          soldByPersonId: selectedPersonId,
          agency: { orgId: viewerOrgId },
          dateSold: { gte: startDate, lte: endDate },
          status: { in: statusFilter },
        },
        include: { product: { include: { lineOfBusiness: true } } },
      })
    : [];

  const activities = selectedPersonId
    ? await prisma.activityRecord.findMany({
        where: {
          activityDate: { gte: startDate, lte: endDate },
          personId: selectedPersonId,
        },
      })
    : [];

  const activityByTypeIdMonth = activities.reduce<Record<string, number>>((acc, a) => {
    if (a.activityTypeId) acc[a.activityTypeId] = (acc[a.activityTypeId] || 0) + a.count;
    return acc;
  }, {});
  const activityByNameMonth = activities.reduce<Record<string, number>>((acc, a) => {
    acc[a.activityName] = (acc[a.activityName] || 0) + a.count;
    return acc;
  }, {});
  const activityByTypeIdDay = activities.reduce<Record<string, Record<string, number>>>((acc, a) => {
    if (!a.activityTypeId) return acc;
    const dayKey = a.activityDate.toISOString().slice(0, 10);
    if (!acc[dayKey]) acc[dayKey] = {};
    acc[dayKey][a.activityTypeId] = (acc[dayKey][a.activityTypeId] || 0) + a.count;
    return acc;
  }, {});
  const activityByNameDay = activities.reduce<Record<string, Record<string, number>>>((acc, a) => {
    const dayKey = a.activityDate.toISOString().slice(0, 10);
    if (!acc[dayKey]) acc[dayKey] = {};
    acc[dayKey][a.activityName] = (acc[dayKey][a.activityName] || 0) + a.count;
    return acc;
  }, {});

  const bucketTotalsById: Record<string, number> = {};

  const groupedProducts = new Map<
    string,
    { premium: number; apps: number; category: PremiumCategory | null; productId: string; earnings: number }
  >();
  for (const r of sold) {
    const key = r.product.name;
    if (!groupedProducts.has(key)) groupedProducts.set(key, { premium: 0, apps: 0, category: r.product.lineOfBusiness.premiumCategory, productId: r.product.id, earnings: 0 });
    const entry = groupedProducts.get(key)!;
    entry.premium += Number(r.premium || 0);
    entry.apps += 1;
  }

  const pcPremium = sold
    .filter((r) => r.product.lineOfBusiness.premiumCategory === PremiumCategory.PC)
    .reduce((s, r) => s + Number(r.premium || 0), 0);
  const fsPremium = sold
    .filter((r) => r.product.lineOfBusiness.premiumCategory === PremiumCategory.FS)
    .reduce((s, r) => s + Number(r.premium || 0), 0);

  const metrics = {
    pcPremium,
    fsPremium,
    ipsPremium: sold
      .filter((r) => r.product.lineOfBusiness.premiumCategory === PremiumCategory.IPS)
      .reduce((s, r) => s + Number(r.premium || 0), 0),
    totalApps: sold.length,
    activityByName: activityByNameMonth,
    activityByTypeId: activityByTypeIdMonth,
    bucketValues: {
      pc: pcPremium,
      fs: fsPremium,
      ips: sold
        .filter((r) => r.product.lineOfBusiness.premiumCategory === PremiumCategory.IPS)
        .reduce((s, r) => s + Number(r.premium || 0), 0),
      total: pcPremium + fsPremium + sold
        .filter((r) => r.product.lineOfBusiness.premiumCategory === PremiumCategory.IPS)
        .reduce((s, r) => s + Number(r.premium || 0), 0),
    },
  };

  const monthKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`;

  const resolvedPlan = selectedPerson
    ? await resolvePlanForPerson(selectedPerson, monthKey, viewerOrgId)
    : null;

  const bonusResult = resolvedPlan
    ? evaluateBonuses(
        resolvedPlan,
        metrics,
        bucketTotalsById,
        activityByTypeIdMonth,
        activityByNameMonth,
        activityByTypeIdDay,
        activityByNameDay
      )
    : { bonusTotal: 0, cards: [] };

  const gateStatus = evaluateGates(resolvedPlan, sold, statusFilter);
  const ruleResults = gateStatus.blocked ? [] : evaluateRuleBlocks(resolvedPlan, sold, statusFilter, metrics.bucketValues, bucketTotalsById, bucketById);
  const commissionSum = ruleResults.reduce((s, r) => s + r.amount, 0);
  const activitySum = 0;
  const bonusSum = gateStatus.blocked ? 0 : bonusResult.bonusTotal;
  const totalPayout = commissionSum + activitySum + bonusSum;

  // allocate rule earnings back into groupedProducts
  for (const r of ruleResults) {
    for (const [pid, amt] of r.perProduct.entries()) {
      for (const [name, data] of groupedProducts.entries()) {
        if (data.productId === pid) {
          groupedProducts.set(name, { ...data, earnings: data.earnings + amt });
        }
      }
    }
  }

  return (
    <AppShell
      title="Paycheck"
      subtitle={canViewOtherPaychecks ? "Preview commissions and bonuses by month and team member." : "Preview commissions and bonuses by month."}
    >
      <form
        id="paycheck-filter-form"
        method="get"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          background: "#f8fafc",
          padding: 12,
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          marginBottom: 14,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#475569" }}>
          Select Month
          <select name="month" defaultValue={String(startDate.getMonth())} style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}>
            {Array.from({ length: 12 }).map((_, idx) => (
              <option key={idx} value={idx}>
                {new Date(2000, idx, 1).toLocaleString("en-US", { month: "long" })}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#475569" }}>
          Year
          <input
            name="year"
            type="number"
            defaultValue={startDate.getFullYear()}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
          />
        </label>
        {canViewOtherPaychecks ? (
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#475569" }}>
            Team Member
            <select name="person" defaultValue={selectedPersonId} style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#475569" }}>
          <button
            type="submit"
            name="written"
            value=""
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: !applyWritten ? "#1f2937" : "#fff",
              color: !applyWritten ? "#fff" : "#475569",
              fontWeight: !applyWritten ? 700 : 600,
              cursor: "pointer",
            }}
          >
            Apply Issued
          </button>
          <button
            type="submit"
            name="written"
            value="1"
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              background: applyWritten ? "#1f2937" : "#fff",
              color: applyWritten ? "#fff" : "#475569",
              fontWeight: applyWritten ? 700 : 600,
              cursor: "pointer",
            }}
          >
            Apply Written
          </button>
          <span style={{ marginLeft: 6, fontSize: 12, color: "#6b7280" }}>
            Mode: {applyWritten ? "Written" : "Issued"}
          </span>
        </div>
        <AutoSubmit formId="paycheck-filter-form" debounceMs={150} />
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "start", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Period</div>
          <div style={{ fontWeight: 800 }}>{fmtMonthYear(startDate)}</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#475569" }}>
            Plan: {resolvedPlan?.planName || "No plan assigned"}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "#475569" }}>
            Viewing: {selectedPerson?.fullName || "—"}
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: "#475569" }}>
            Commission, bonus, and activity payouts are calculated using your current plan. Chargebacks/adjustments not yet implemented.
          </div>
          {gateStatus.blocked && (
            <div style={{ marginTop: 8, padding: 8, borderRadius: 10, border: "1px solid #f59e0b", background: "#fffbeb", color: "#92400e", fontSize: 13 }}>
              Payouts blocked until gates are met:
              <ul style={{ margin: "4px 0 0 16px" }}>
                {gateStatus.reasons.map((r, idx) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {!gateStatus.blocked && gateStatus.traces.length > 0 && (
            <details style={{ marginTop: 8, fontSize: 12, color: "#475569" }}>
              <summary style={{ cursor: "pointer" }}>Gate checks</summary>
              <ul style={{ margin: "4px 0 0 16px" }}>
                {gateStatus.traces.map((t, idx) => (
                  <li key={idx}>{t}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 6, fontSize: 13 }}>
            <span>Commission</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{fmtMoney(commissionSum)}</span>
            <span>Bonus</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{fmtMoney(bonusSum)}</span>
            <span>Activity</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{fmtMoney(activitySum)}</span>
            <span>Chargebacks</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{fmtMoney(0)}</span>
            <span>Adjustments</span>
            <span style={{ textAlign: "right", fontWeight: 800 }}>{fmtMoney(0)}</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 28, fontWeight: 900, color: "#1b4221", textAlign: "right" }}>{fmtMoney(totalPayout)}</div>
          <div style={{ fontSize: 12, color: "#64748b", textAlign: "right" }}>Total</div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 8 }}>Bonus</h3>
        {bonusResult.cards.length === 0 ? (
          <div style={{ color: "#6b7280", fontSize: 13, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
            No scorecard/bonus modules found on the active compensation plan for this person. Create a scorecard in Compensation Builder to populate this section.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {bonusResult.cards.map((card) => (
              <div
                key={card.title}
                style={{
                  border: card.achieved ? "2px solid #2563eb" : "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 14,
                  background: "#fff",
                  minWidth: 220,
                  boxShadow: "0 6px 14px rgba(0,0,0,0.05)",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>{card.title}</div>
                  <div style={{ fontSize: 12, color: card.achieved ? "#1b4221" : "#94a3b8" }}>{card.achieved ? "Unlocked" : "Locked"}</div>
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: card.achieved ? "#166534" : "#94a3b8" }}>
                  {fmtMoney(card.achieved ? card.amount : card.potential)}
                </div>
                {!card.achieved && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>Potential payout if unlocked: {fmtMoney(card.potential)}</div>
                )}
                {card.conditions && (
                  <div style={{ display: "grid", gap: 6 }}>
                    {card.conditions.map((c, idx) => {
                      const barColor = c.met ? "#16a34a" : "#eab308";
                      const remaining = c.met ? "" : `${fmtMoney(Math.max(0, c.target - c.value))} left`;
                      return (
                        <div key={`${card.title}-c-${idx}`} style={{ fontSize: 12, color: "#475569" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>{c.label}</span>
                            <span>
                              {fmtMoney(c.value)} / {fmtMoney(c.target)}
                            </span>
                          </div>
                          {!c.met && remaining && (
                            <div style={{ color: "#b45309", margin: "2px 0 0 0" }}>{remaining}</div>
                          )}
                          <div style={{ height: 6, background: "#e5e7eb", borderRadius: 999, overflow: "hidden", marginTop: 4 }}>
                            <div style={{ width: `${c.progress}%`, height: "100%", background: barColor }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {card.remaining && !card.achieved && <div style={{ fontSize: 12, color: "#b45309" }}>{card.remaining}</div>}
                <div style={{ fontSize: 12, color: "#64748b" }}>{card.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 8 }}>Commissions</h3>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#475569" }}>
                  <th style={{ padding: "6px 6px" }}>Product</th>
                  <th style={{ padding: "6px 6px" }}>Premium</th>
                  <th style={{ padding: "6px 6px" }}>Apps</th>
                  <th style={{ padding: "6px 6px", textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {[...groupedProducts.entries()].map(([product, data]) => (
                  <React.Fragment key={product}>
                    <tr style={{ borderTop: "1px solid #eef2f7" }}>
                      <td style={{ padding: "6px 6px", fontWeight: 700 }}>{product}</td>
                      <td style={{ padding: "6px 6px" }}>{fmtMoney(data.premium)}</td>
                      <td style={{ padding: "6px 6px" }}>{data.apps}</td>
                      <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: 800 }}>{fmtMoney(data.earnings)}</td>
                    </tr>
                    {/* Tiers display per product */}
                    {ruleResults
                      .filter((r) => r.tiersStatus && r.productIds?.includes(data.productId))
                      .map((r, idx) => (
                        <tr key={`${product}-tiers-${idx}`} style={{ background: "#f9fafb" }}>
                          <td colSpan={4} style={{ padding: "4px 8px" }}>
                            <div style={{ fontSize: 12, color: "#475569", marginBottom: 4 }}>{r.name} tiers</div>
                            <div style={{ display: "grid", gap: 4 }}>
                              {r.tiersStatus!.map((t, i) => (
                                <div
                                  key={`${product}-t-${i}`}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    fontSize: 12,
                                    gap: 6,
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ color: t.achieved ? "#16a34a" : "#9ca3af" }}>{t.achieved ? "✔" : "○"}</span>
                                    <div style={{ display: "grid", gap: 2 }}>
                                      <span style={{ fontWeight: t.achieved ? 700 : 600, color: t.achieved ? "#166534" : "#0f172a" }}>
                                        {t.label}
                                      </span>
                                      {t.basisValue !== undefined && (
                                        <span style={{ color: "#475569" }}>
                                          {t.basisLabel === "apps" ? `${t.basisValue} apps` : fmtMoney(t.basisValue)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                    <span style={{ color: "#0ea5e9", fontWeight: 700 }}>{t.payoutLabel}</span>
                                    {!t.achieved && t.leftText && <span style={{ color: "#b45309" }}>{t.leftText}</span>}
                                    {t.achieved && <span style={{ color: "#16a34a" }}>Unlocked</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                ))}
                {groupedProducts.size === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: "#6b7280" }}>
                      No commissions for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 8 }}>Plan rule payouts</h3>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          {ruleResults.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>No rule-based commission payouts for this period.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {ruleResults.map((r) => (
                <details key={r.name} open style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 10 }}>
                  <summary style={{ listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{r.name}</div>
                      <div style={{ color: "#475569", fontSize: 12 }}>{r.detail}</div>
                    </div>
                    <div style={{ fontWeight: 900, color: "#1b4221" }}>{fmtMoney(r.amount)}</div>
                  </summary>
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {/* Tier ladder preview */}
                    {r.tiersStatus && r.tiersStatus.length > 0 && (
                      <div style={{ background: "#f9fafb", border: "1px dashed #e5e7eb", borderRadius: 8, padding: 8, fontSize: 12, color: "#0f172a" }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Tiers</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {r.tiersStatus.map((t, i) => (
                            <div
                              key={`${r.name}-ladder-${i}`}
                              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ color: t.achieved ? "#16a34a" : "#9ca3af" }}>{t.achieved ? "✔" : "○"}</span>
                                <div style={{ display: "grid", gap: 2 }}>
                                  <span style={{ fontWeight: 700 }}>{t.label}</span>
                                  {t.basisValue !== undefined && (
                                    <span style={{ color: "#475569" }}>
                                      Basis: {t.basisLabel === "apps" ? `${t.basisValue} apps` : fmtMoney(t.basisValue)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <span style={{ color: "#0ea5e9", fontWeight: 700 }}>{t.payoutLabel}</span>
                                {!t.achieved && t.leftText && <span style={{ color: "#b45309" }}>{t.leftText}</span>}
                                {t.achieved && <span style={{ color: "#16a34a" }}>Unlocked</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {r.trace && (
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        <div style={{ fontWeight: 700, color: "#1f2937", marginBottom: 4 }}>Why</div>
                        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 2 }}>
                          {r.trace
                            .split("|")
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .map((line, i) => (
                              <li key={`${r.name}-reason-${i}`}>{line}</li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 8 }}>Activities</h3>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#475569" }}>
                  <th style={{ padding: "8px 6px" }}>Name</th>
                  <th style={{ padding: "8px 6px" }}>Count</th>
                  <th style={{ padding: "8px 6px" }}>Rate</th>
                  <th style={{ padding: "8px 6px", textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a, idx) => (
                  <tr key={`${a.activityName}-${idx}`} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ padding: "8px 6px", fontWeight: 700 }}>{a.activityName}</td>
                    <td style={{ padding: "8px 6px" }}>{a.count}</td>
                    <td style={{ padding: "8px 6px" }}>--</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 800 }}>{fmtMoney(0)}</td>
                  </tr>
                ))}
                {activities.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 12, color: "#6b7280" }}>
                      No activity entries for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
