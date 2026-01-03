/* eslint-disable @typescript-eslint/no-explicit-any */
// src/engine/types.ts

export type Currency = "USD";

export type TransactionType =
  | "NEW"
  | "RENEWAL"
  | "ENDORSEMENT"
  | "CANCEL"
  | "REINSTATE";

export type Participant = {
  repId: string;
  name?: string;
  role: string; // "Producer" | "CSR" | "Manager" | "Owner" | etc
  /**
   * Insurance-style "credit split" across PRODUCERS (or anyone sharing premium credit).
   * Non-credit roles (CSR/Manager) typically use creditPercent = 0.
   * Range: 0..100
   */
  creditPercent?: number;
  /**
   * Any custom tags/fields for conditions (optional).
   * Example: { team: "A", license: "P&C" }
   */
  fields?: Record<string, any>;
};

export type PolicyTransaction = {
  id: string;
  policyId: string;

  transactionType: TransactionType; // NEW/RENEWAL/ENDORSEMENT/CANCEL/REINSTATE

  line?: string; // Auto/Home/Life/Commercial
  carrier?: string;
  state?: string;

  writtenDateISO?: string; // "YYYY-MM-DD"
  effectiveDateISO?: string;
  paidDateISO?: string;

  daysInForce?: number; // helpful for chargeback logic if you add it later

  premiumDelta: number;
  commissionablePremiumDelta?: number; // defaults to premiumDelta

  participants: Participant[];

  /**
   * Custom transaction fields for conditions.
   * Example: { leadSource: "Referral", office: "Tampa", csrRepId: "rep_2" }
   */
  fields?: Record<string, any>;
};

// ---------- Conditions ----------
export type Condition =
  | { op: "and"; conditions: Condition[] }
  | { op: "or"; conditions: Condition[] }
  | {
      op:
        | "eq"
        | "neq"
        | "gt"
        | "gte"
        | "lt"
        | "lte"
        | "in"
        | "contains"
        | "startsWith"
        | "endsWith";
      field: string; // e.g. "txn.line" or "participant.role" or "txn.fields.leadSource"
      value: any;
    }
  | { op: "betweenDates"; field: string; startISO: string; endISO: string }
  | { op: "exists"; field: string; value: boolean };

// ---------- Plan / rules ----------
export type PeriodSettings = {
  dateField: "writtenDateISO" | "effectiveDateISO" | "paidDateISO";
  granularity: "month"; // MVP: month only
};

export type RateType = "percent" | "fixed";

/**
 * Insurance-friendly base options:
 * - *Total* bases use the full txn amount (not split)
 * - *Credit* bases multiply by participant.creditPercent/100
 */
export type BaseName =
  | "premiumTotal"
  | "premiumCredit"
  | "commissionablePremiumTotal"
  | "commissionablePremiumCredit"
  | "policyCountTotal"
  | "policyCountCredit";

export type MetricName =
  | "nbCommissionablePremiumCredit"
  | "rnCommissionablePremiumCredit"
  | "totalCommissionablePremiumCredit"
  | "nbPolicyCount"
  | "rnPolicyCount"
  | "totalPolicyCount";

export type RuleBase = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number; // lower runs first, within its stage
  when?: Condition;
};

export type ParticipantRateRule = RuleBase & {
  type: "participant_rate";
  base: BaseName;
  rateType: RateType;
  value: number; // percent (0.1 = 10%) or fixed dollars per unit of base
};

/**
 * Override: compute base from SOURCE participants then pay to PAYEES
 * Example: 1% of Producer credited premium paid to Manager role
 */
export type OverridePayee =
  | { kind: "repId"; repId: string }
  | { kind: "agency"; agencyRepId: string }
  | { kind: "role"; role: string; allocation: "equal" | "byCreditPercent" };

export type OverrideRateRule = RuleBase & {
  type: "override_rate";
  base: BaseName;
  rateType: RateType;
  value: number;

  // Which participants contribute to the base (usually Producer role)
  sourceWhen: Condition;

  // Who receives payout
  payee: OverridePayee;

  // Optional extra filter among participants when payee.kind === "role"
  payeeWhen?: Condition;
};

export type Tier = {
  upTo: number | null; // null = infinity
  rateType: RateType;
  value: number;
};

export type PeriodPayee =
  | { kind: "repId"; repId: string }
  | { kind: "role"; role: string }
  | { kind: "allReps" };

export type TieredRatePeriodRule = RuleBase & {
  type: "tiered_rate_period";
  metric: MetricName;
  mode: "progressive" | "cliff";
  tiers: Tier[];
  payee: PeriodPayee;
};

export type BonusThresholdPeriodRule = RuleBase & {
  type: "bonus_threshold_period";
  metric: MetricName;
  threshold: number;
  bonusAmount: number;
  payee: PeriodPayee;
};

export type CapPeriodRule = RuleBase & {
  type: "cap_period";
  capAmount: number;
  appliesTo: PeriodPayee; // who gets capped
};

export type Rule =
  | ParticipantRateRule
  | OverrideRateRule
  | TieredRatePeriodRule
  | BonusThresholdPeriodRule
  | CapPeriodRule;

export type CommissionPlan = {
  id: string;
  name: string;
  currency: Currency;
  period: PeriodSettings;
  rules: Rule[];
};

// ---------- Results ----------
export type RepMetrics = {
  repId: string;
  repName?: string;
  roles: string[];

  nbCommissionablePremiumCredit: number;
  rnCommissionablePremiumCredit: number;
  totalCommissionablePremiumCredit: number;

  nbPolicyCount: number;
  rnPolicyCount: number;
  totalPolicyCount: number;
};

export type Trace = {
  scope: "transaction" | "period";
  ruleId: string;
  ruleName: string;
  ruleType: Rule["type"];

  repId: string;

  txnId?: string;
  policyId?: string;

  applied: boolean;
  reason: string;

  base?: number;
  delta: number;

  details?: Record<string, any>;
};

export type TransactionSummary = {
  txnId: string;
  policyId: string;
  transactionType: TransactionType;
  commissionablePremiumDelta: number;
  premiumDelta: number;
  line?: string;
  carrier?: string;
  dateISO?: string; // date used for period grouping

  perRepDelta: Record<string, number>; // repId -> delta
};

export type RepResult = {
  repId: string;
  repName?: string;
  roles: string[];
  payout: number;
  ruleTotals: Record<string, number>; // ruleId -> total delta
  traces: Trace[];
  metrics: RepMetrics;
};

export type StatementResult = {
  periodKey: string;
  currency: Currency;
  reps: RepResult[];
  transactions: TransactionSummary[];
  warnings: string[];
};

export type CalculateOptions = {
  periodKey?: string; // e.g. "2025-12"
};
