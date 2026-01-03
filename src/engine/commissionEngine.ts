/* eslint-disable @typescript-eslint/no-explicit-any */
// src/engine/commissionEngine.ts
import {
  BaseName,
  CalculateOptions,
  CommissionPlan,
  MetricName,
  PolicyTransaction,
  RepMetrics,
  RepResult,
  Rule,
  StatementResult,
  Tier,
  Trace,
  TransactionSummary,
} from "./types";
import { evalCondition } from "./conditions";

type ParticipantCtx = {
  repId: string;
  repName?: string;
  role: string;
  creditPercent: number;

  premiumCredit: number;
  commissionablePremiumCredit: number;

  participantRaw: any;
};

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

function safeNum(n: any): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
}

function getDateISOForPeriod(plan: CommissionPlan, txn: PolicyTransaction): string | undefined {
  return txn[plan.period.dateField] || txn.writtenDateISO || txn.effectiveDateISO || txn.paidDateISO;
}

function periodKeyFromISO(dateISO?: string): string | undefined {
  if (!dateISO) return undefined;
  // Expect "YYYY-MM-DD", but tolerate "YYYY-MM"
  if (dateISO.length >= 7) return dateISO.slice(0, 7);
  return undefined;
}

function normalizeTxn(txn: PolicyTransaction): PolicyTransaction {
  const commissionablePremiumDelta =
    txn.commissionablePremiumDelta == null ? txn.premiumDelta : txn.commissionablePremiumDelta;

  return {
    ...txn,
    commissionablePremiumDelta,
    participants: txn.participants || [],
  };
}

function buildParticipantContexts(txn: PolicyTransaction): ParticipantCtx[] {
  const premiumDelta = safeNum(txn.premiumDelta);
  const commDelta = safeNum(txn.commissionablePremiumDelta);

  return (txn.participants || []).map((p) => {
    const creditPercent = safeNum(p.creditPercent);
    const premiumCredit = (premiumDelta * creditPercent) / 100;
    const commissionablePremiumCredit = (commDelta * creditPercent) / 100;

    return {
      repId: p.repId,
      repName: p.name,
      role: p.role,
      creditPercent,
      premiumCredit,
      commissionablePremiumCredit,
      participantRaw: p,
    };
  });
}

function baseValue(base: BaseName, txn: PolicyTransaction, pctx?: ParticipantCtx): number {
  const premiumDelta = safeNum(txn.premiumDelta);
  const commDelta = safeNum(txn.commissionablePremiumDelta);

  switch (base) {
    case "premiumTotal":
      return premiumDelta;
    case "premiumCredit":
      return pctx ? pctx.premiumCredit : 0;
    case "commissionablePremiumTotal":
      return commDelta;
    case "commissionablePremiumCredit":
      return pctx ? pctx.commissionablePremiumCredit : 0;
    case "policyCountTotal":
      return 1;
    case "policyCountCredit":
      return pctx && pctx.creditPercent > 0 ? 1 : 0;
    default: {
      const _exhaustive: never = base;
      return _exhaustive;
    }
  }
}

function applyRate(rateType: "percent" | "fixed", base: number, value: number): number {
  // percent and fixed are both base*value in this MVP
  // - percent: base is dollars, value is like 0.10
  // - fixed: base is "units", value is "$ per unit"
  return base * value;
}

function calcTiered(metricValue: number, tiers: Tier[], mode: "progressive" | "cliff"): number {
  if (!tiers.length) return 0;

  if (mode === "cliff") {
    // pick first tier whose upTo is null or >= metricValue
    let chosen = tiers[tiers.length - 1];
    for (const t of tiers) {
      if (t.upTo == null || metricValue <= t.upTo) {
        chosen = t;
        break;
      }
    }
    return applyRate(chosen.rateType, metricValue, chosen.value);
  }

  // progressive
  let total = 0;
  let prevCap = 0;
  let remaining = metricValue;

  for (const t of tiers) {
    const cap = t.upTo == null ? Infinity : t.upTo;
    const slice = Math.max(0, Math.min(remaining, cap - prevCap));
    if (slice <= 0) break;

    total += applyRate(t.rateType, slice, t.value);
    remaining -= slice;
    prevCap = cap;

    if (remaining <= 0) break;
  }

  return total;
}

function emptyMetrics(repId: string, repName?: string, roles: string[] = []): RepMetrics {
  return {
    repId,
    repName,
    roles,
    nbCommissionablePremiumCredit: 0,
    rnCommissionablePremiumCredit: 0,
    totalCommissionablePremiumCredit: 0,
    nbPolicyCount: 0,
    rnPolicyCount: 0,
    totalPolicyCount: 0,
  };
}

function getMetricValue(metrics: RepMetrics, metric: MetricName): number {
  return safeNum((metrics as any)[metric]);
}

function ensureRep(
  repMap: Map<string, RepResult>,
  repId: string,
  repName?: string,
  role?: string
): RepResult {
  const existing = repMap.get(repId);
  if (existing) {
    if (repName && !existing.repName) existing.repName = repName;
    if (role && !existing.roles.includes(role)) existing.roles.push(role);
    return existing;
  }

  const created: RepResult = {
    repId,
    repName,
    roles: role ? [role] : [],
    payout: 0,
    ruleTotals: {},
    traces: [],
    metrics: emptyMetrics(repId, repName, role ? [role] : []),
  };

  repMap.set(repId, created);
  return created;
}

function addDelta(rep: RepResult, rule: Rule, delta: number, trace: Trace) {
  const d = roundCents(delta);
  rep.payout = roundCents(rep.payout + d);

  rep.ruleTotals[rule.id] = roundCents((rep.ruleTotals[rule.id] || 0) + d);
  rep.traces.push(trace);
}

function payeesForPeriodRule(
  repMap: Map<string, RepResult>,
  payee: { kind: "repId"; repId: string } | { kind: "role"; role: string } | { kind: "allReps" }
): RepResult[] {
  if (payee.kind === "repId") {
    return [ensureRep(repMap, payee.repId)];
  }
  if (payee.kind === "role") {
    return Array.from(repMap.values()).filter((r) => r.roles.includes(payee.role));
  }
  return Array.from(repMap.values());
}

export function calculateStatement(
  plan: CommissionPlan,
  rawTxns: PolicyTransaction[],
  options: CalculateOptions = {}
): StatementResult {
  const warnings: string[] = [];
  const rulesAll = (plan.rules || []).filter((r) => r.enabled);

  const txnRules = rulesAll
    .filter((r) => r.type === "participant_rate" || r.type === "override_rate")
    .sort((a, b) => a.priority - b.priority);

  const periodRules = rulesAll
    .filter((r) => r.type === "tiered_rate_period" || r.type === "bonus_threshold_period")
    .sort((a, b) => a.priority - b.priority);

  const capRules = rulesAll
    .filter((r) => r.type === "cap_period")
    .sort((a, b) => a.priority - b.priority);

  const normalizedTxns = (rawTxns || []).map(normalizeTxn);

  // Determine periodKey
  let inferredPeriodKey: string | undefined = options.periodKey;
  if (!inferredPeriodKey) {
    for (const t of normalizedTxns) {
      const dateISO = getDateISOForPeriod(plan, t);
      const pk = periodKeyFromISO(dateISO);
      if (pk) {
        inferredPeriodKey = pk;
        break;
      }
    }
  }
  const periodKey = inferredPeriodKey || "ALL";

  // Filter txns to this period (month)
  const txns = normalizedTxns.filter((t) => {
    if (periodKey === "ALL") return true;
    const dateISO = getDateISOForPeriod(plan, t);
    const pk = periodKeyFromISO(dateISO);
    return pk === periodKey;
  });

  const repMap = new Map<string, RepResult>();

  // Pre-register reps based on participants found in period
  for (const txn of txns) {
    const pctxs = buildParticipantContexts(txn);
    for (const p of pctxs) {
      ensureRep(repMap, p.repId, p.repName, p.role);
    }
  }

  // ---------- Transaction processing ----------
  const transactions: TransactionSummary[] = [];

  for (const txn of txns) {
    const dateISO = getDateISOForPeriod(plan, txn);
    const pctxs = buildParticipantContexts(txn);

    const perRepDelta: Record<string, number> = {};

    for (const rule of txnRules) {
      if (rule.type === "participant_rate") {
        for (const p of pctxs) {
          const ctx = { txn, participant: p.participantRaw };
          const ok = rule.when ? evalCondition(rule.when, ctx) : true;

          if (!ok) {
            continue;
          }

          const b = baseValue(rule.base, txn, p);
          const delta = applyRate(rule.rateType, b, rule.value);

          const rep = ensureRep(repMap, p.repId, p.repName, p.role);
          const trace: Trace = {
            scope: "transaction",
            ruleId: rule.id,
            ruleName: rule.name,
            ruleType: rule.type,
            repId: p.repId,
            txnId: txn.id,
            policyId: txn.policyId,
            applied: true,
            reason: "Applied",
            base: roundCents(b),
            delta: roundCents(delta),
            details: {
              baseName: rule.base,
              rateType: rule.rateType,
              value: rule.value,
            },
          };

          addDelta(rep, rule, delta, trace);
          perRepDelta[p.repId] = roundCents((perRepDelta[p.repId] || 0) + roundCents(delta));
        }
      }

      if (rule.type === "override_rate") {
        // Gate by rule.when at txn-level
        const okTxn = rule.when ? evalCondition(rule.when, { txn }) : true;
        if (!okTxn) continue;

        // Sum source base across participants matching sourceWhen
        let sourceBase = 0;
        const sourceReps: string[] = [];

        for (const p of pctxs) {
          const okSource = rule.sourceWhen ? evalCondition(rule.sourceWhen, { txn, participant: p.participantRaw }) : true;
          if (!okSource) continue;

          const b = baseValue(rule.base, txn, p);
          sourceBase += b;
          sourceReps.push(p.repId);
        }

        if (sourceBase === 0) continue;

        const pool = applyRate(rule.rateType, sourceBase, rule.value);

        // Determine payees
        type PayeeCtx = { repId: string; repName?: string; role?: string; creditPercent?: number };
        const payees: PayeeCtx[] = [];

        if (rule.payee.kind === "repId") {
          payees.push({ repId: rule.payee.repId });
        } else if (rule.payee.kind === "agency") {
          payees.push({ repId: rule.payee.agencyRepId, role: "Agency" });
        } else if (rule.payee.kind === "role") {
          for (const p of pctxs) {
            if (p.role !== rule.payee.role) continue;
            if (rule.payeeWhen) {
              const okPayee = evalCondition(rule.payeeWhen, { txn, participant: p.participantRaw });
              if (!okPayee) continue;
            }
            payees.push({ repId: p.repId, repName: p.repName, role: p.role, creditPercent: p.creditPercent });
          }
        }

        if (!payees.length) {
          warnings.push(
            `Override rule "${rule.name}" on txn ${txn.id} had no payees (payee.kind=${rule.payee.kind}).`
          );
          continue;
        }

        // Allocate pool across payees
        const allocations: Record<string, number> = {};
        if (rule.payee.kind === "role" && rule.payee.allocation === "byCreditPercent") {
          const sum = payees.reduce((acc, p) => acc + safeNum(p.creditPercent), 0);
          if (sum > 0) {
            for (const p of payees) {
              allocations[p.repId] = (pool * safeNum(p.creditPercent)) / sum;
            }
          } else {
            const each = pool / payees.length;
            for (const p of payees) allocations[p.repId] = each;
          }
        } else {
          const each = pool / payees.length;
          for (const p of payees) allocations[p.repId] = each;
        }

        // Apply to payees
        for (const p of payees) {
          const delta = allocations[p.repId] || 0;
          const rep = ensureRep(repMap, p.repId, p.repName, p.role);

          const trace: Trace = {
            scope: "transaction",
            ruleId: rule.id,
            ruleName: rule.name,
            ruleType: rule.type,
            repId: p.repId,
            txnId: txn.id,
            policyId: txn.policyId,
            applied: true,
            reason: "Applied override",
            base: roundCents(sourceBase),
            delta: roundCents(delta),
            details: {
              baseName: rule.base,
              rateType: rule.rateType,
              value: rule.value,
              sourceReps,
              payeeKind: rule.payee.kind,
            },
          };

          addDelta(rep, rule, delta, trace);
          perRepDelta[p.repId] = roundCents((perRepDelta[p.repId] || 0) + roundCents(delta));
        }
      }
    }

    transactions.push({
      txnId: txn.id,
      policyId: txn.policyId,
      transactionType: txn.transactionType,
      commissionablePremiumDelta: safeNum(txn.commissionablePremiumDelta),
      premiumDelta: safeNum(txn.premiumDelta),
      line: txn.line,
      carrier: txn.carrier,
      dateISO,
      perRepDelta,
    });
  }

  // ---------- Metrics aggregation ----------
  const metricsByRep = new Map<string, RepMetrics>();

  function ensureMetrics(repId: string, repName?: string, role?: string): RepMetrics {
    const existing = metricsByRep.get(repId);
    if (existing) {
      if (repName && !existing.repName) existing.repName = repName;
      if (role && !existing.roles.includes(role)) existing.roles.push(role);
      return existing;
    }
    const created = emptyMetrics(repId, repName, role ? [role] : []);
    metricsByRep.set(repId, created);
    return created;
  }

  for (const txn of txns) {
    const pctxs = buildParticipantContexts(txn);
    for (const p of pctxs) {
      const m = ensureMetrics(p.repId, p.repName, p.role);

      // We aggregate CREDIT metrics from commissionablePremiumCredit.
      const credit = safeNum(p.commissionablePremiumCredit);
      const countCredit = p.creditPercent > 0 ? 1 : 0;

      if (txn.transactionType === "NEW") {
        m.nbCommissionablePremiumCredit += credit;
        m.nbPolicyCount += countCredit;
      }
      if (txn.transactionType === "RENEWAL") {
        m.rnCommissionablePremiumCredit += credit;
        m.rnPolicyCount += countCredit;
      }

      m.totalCommissionablePremiumCredit += credit;
      m.totalPolicyCount += countCredit;
    }
  }

  // Attach metrics back to reps
  for (const rep of repMap.values()) {
    const m = metricsByRep.get(rep.repId) || emptyMetrics(rep.repId, rep.repName, rep.roles);
    // normalize rounding
    m.nbCommissionablePremiumCredit = roundCents(m.nbCommissionablePremiumCredit);
    m.rnCommissionablePremiumCredit = roundCents(m.rnCommissionablePremiumCredit);
    m.totalCommissionablePremiumCredit = roundCents(m.totalCommissionablePremiumCredit);
    rep.metrics = m;
  }

  // ---------- Period rules ----------
  for (const rule of periodRules) {
    if (rule.type === "tiered_rate_period") {
      const payees = payeesForPeriodRule(repMap, rule.payee);

      for (const rep of payees) {
        const ctx = { metrics: rep.metrics };
        const ok = rule.when ? evalCondition(rule.when, ctx) : true;
        if (!ok) continue;

        const metricValue = getMetricValue(rep.metrics, rule.metric);
        if (metricValue <= 0) continue;

        const delta = calcTiered(metricValue, rule.tiers, rule.mode);

        const trace: Trace = {
          scope: "period",
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.type,
          repId: rep.repId,
          applied: true,
          reason: "Applied tiered period rule",
          base: roundCents(metricValue),
          delta: roundCents(delta),
          details: { metric: rule.metric, mode: rule.mode },
        };

        addDelta(rep, rule, delta, trace);
      }
    }

    if (rule.type === "bonus_threshold_period") {
      const payees = payeesForPeriodRule(repMap, rule.payee);

      for (const rep of payees) {
        const ctx = { metrics: rep.metrics };
        const ok = rule.when ? evalCondition(rule.when, ctx) : true;
        if (!ok) continue;

        const metricValue = getMetricValue(rep.metrics, rule.metric);
        if (metricValue < rule.threshold) continue;

        const delta = rule.bonusAmount;

        const trace: Trace = {
          scope: "period",
          ruleId: rule.id,
          ruleName: rule.name,
          ruleType: rule.type,
          repId: rep.repId,
          applied: true,
          reason: `Bonus threshold met (${metricValue} >= ${rule.threshold})`,
          base: roundCents(metricValue),
          delta: roundCents(delta),
          details: { metric: rule.metric, threshold: rule.threshold },
        };

        addDelta(rep, rule, delta, trace);
      }
    }
  }

  // ---------- Caps (apply last) ----------
  for (const rule of capRules) {
    const capTargets = payeesForPeriodRule(repMap, rule.appliesTo);

    for (const rep of capTargets) {
      const before = rep.payout;
      if (before <= rule.capAmount) continue;

      const repDelta = roundCents(rule.capAmount - before); // negative
      rep.payout = roundCents(rule.capAmount);

      rep.ruleTotals[rule.id] = roundCents((rep.ruleTotals[rule.id] || 0) + repDelta);

      rep.traces.push({
        scope: "period",
        ruleId: rule.id,
        ruleName: rule.name,
        ruleType: rule.type,
        repId: rep.repId,
        applied: true,
        reason: `Capped payout to ${rule.capAmount}`,
        base: roundCents(before),
        delta: repDelta,
        details: { capAmount: rule.capAmount },
      });
    }
  }

  // Final sort
  const reps = Array.from(repMap.values())
    .map((r) => {
      r.payout = roundCents(r.payout);
      r.metrics.nbCommissionablePremiumCredit = roundCents(r.metrics.nbCommissionablePremiumCredit);
      r.metrics.rnCommissionablePremiumCredit = roundCents(r.metrics.rnCommissionablePremiumCredit);
      r.metrics.totalCommissionablePremiumCredit = roundCents(r.metrics.totalCommissionablePremiumCredit);
      return r;
    })
    .sort((a, b) => b.payout - a.payout);

  return {
    periodKey,
    currency: plan.currency,
    reps,
    transactions,
    warnings,
  };
}
