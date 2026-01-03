"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// src/ui/PlanBuilder.tsx
import React, { useMemo, useState } from "react";
import {
  BonusThresholdPeriodRule,
  CapPeriodRule,
  CommissionPlan,
  Condition,
  OverrideRateRule,
  ParticipantRateRule,
  PeriodPayee,
  Rule,
  TieredRatePeriodRule,
  Tier,
} from "../engine/types";
import { ConditionEditor, FieldOption } from "./ConditionEditor";

export type BuilderHints = {
  roles: string[];
  lines: string[];
  products: string[];
  activities: string[];
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function normalizePriorities(rules: Rule[]): Rule[] {
  const sorted = rules.slice().sort((a, b) => a.priority - b.priority);
  return sorted.map((r, idx) => ({ ...r, priority: (idx + 1) * 10 }));
}

function prettyPayee(p: PeriodPayee): string {
  if (p.kind === "allReps") return "All reps";
  if (p.kind === "role") return `Role: ${p.role}`;
  return `RepId: ${p.repId}`;
}

const TXN_FIELDS: FieldOption[] = [
  { label: "Txn: transactionType", value: "txn.transactionType", kind: "string" },
  { label: "Txn: line", value: "txn.line", kind: "string" },
  { label: "Txn: productName (custom)", value: "txn.fields.productName", kind: "string" },
  { label: "Txn: productType (custom)", value: "txn.fields.productType", kind: "string" },
  { label: "Txn: activityType (custom)", value: "txn.fields.activityType", kind: "string" },
  { label: "Txn: carrier", value: "txn.carrier", kind: "string" },
  { label: "Txn: state", value: "txn.state", kind: "string" },
  { label: "Txn: premiumDelta", value: "txn.premiumDelta", kind: "number" },
  { label: "Txn: commissionablePremiumDelta", value: "txn.commissionablePremiumDelta", kind: "number" },
  { label: "Txn: daysInForce", value: "txn.daysInForce", kind: "number" },
  { label: "Txn: writtenDateISO", value: "txn.writtenDateISO", kind: "date" },
  { label: "Txn: effectiveDateISO", value: "txn.effectiveDateISO", kind: "date" },
  { label: "Txn: paidDateISO", value: "txn.paidDateISO", kind: "date" },
  { label: "Txn: fields.leadSource", value: "txn.fields.leadSource", kind: "string" },
  { label: "Txn: fields.office", value: "txn.fields.office", kind: "string" },
];

const PARTICIPANT_FIELDS: FieldOption[] = [
  { label: "Participant: role", value: "participant.role", kind: "string" },
  { label: "Participant: repId", value: "participant.repId", kind: "string" },
  { label: "Participant: name", value: "participant.name", kind: "string" },
  { label: "Participant: creditPercent", value: "participant.creditPercent", kind: "number" },
  { label: "Participant: fields.team", value: "participant.fields.team", kind: "string" },
];

const METRIC_FIELDS: FieldOption[] = [
  { label: "Metrics: nbCommissionablePremiumCredit", value: "metrics.nbCommissionablePremiumCredit", kind: "number" },
  { label: "Metrics: rnCommissionablePremiumCredit", value: "metrics.rnCommissionablePremiumCredit", kind: "number" },
  { label: "Metrics: totalCommissionablePremiumCredit", value: "metrics.totalCommissionablePremiumCredit", kind: "number" },
  { label: "Metrics: nbPolicyCount", value: "metrics.nbPolicyCount", kind: "number" },
  { label: "Metrics: rnPolicyCount", value: "metrics.rnPolicyCount", kind: "number" },
  { label: "Metrics: totalPolicyCount", value: "metrics.totalPolicyCount", kind: "number" },
];

const FIELDS_ALL: FieldOption[] = [...TXN_FIELDS, ...PARTICIPANT_FIELDS, ...METRIC_FIELDS];

function ToggleCondition({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value?: Condition;
  onChange: (next?: Condition) => void;
  suggestions?: Record<string, string[]>;
}) {
  const [open, setOpen] = useState(Boolean(value));

  return (
    <div className="subCard">
      <div className="row spaceBetween">
        <div className="row gap8">
          <strong>{label}</strong>
          <span className="muted">{value ? "Enabled" : "None"}</span>
        </div>
        <button className="btn" type="button" onClick={() => setOpen((x) => !x)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <div className="row gap8" style={{ marginBottom: 10 }}>
            <button
              className="btn"
              type="button"
              onClick={() => onChange({ op: "and", conditions: [{ op: "eq", field: "txn.line", value: "Auto" }] })}
            >
              Add default condition
            </button>
            <button className="btn danger" type="button" onClick={() => onChange(undefined)}>
              Clear
            </button>
          </div>

          {value ? (
            <ConditionEditor value={value} onChange={(c) => onChange(c)} fields={FIELDS_ALL} suggestions={suggestions} />
          ) : (
            <div className="muted">No condition set.</div>
          )}
        </div>
      )}
    </div>
  );
}

function PayeeEditor({
  value,
  onChange,
  label = "Payee",
  roleOptions,
}: {
  value: PeriodPayee;
  onChange: (next: PeriodPayee) => void;
  label?: string;
  roleOptions?: string[];
}) {
  const listId = roleOptions && roleOptions.length ? "payee-role-options" : undefined;
  return (
    <div className="row gap8 wrap">
      <strong>{label}</strong>
      <select
        className="select"
        value={value.kind}
        onChange={(e) => {
          const kind = e.target.value as PeriodPayee["kind"];
          if (kind === "allReps") onChange({ kind: "allReps" });
          if (kind === "role") onChange({ kind: "role", role: "Producer" });
          if (kind === "repId") onChange({ kind: "repId", repId: "rep_owner" });
        }}
      >
        <option value="allReps">All reps</option>
        <option value="role">Role</option>
        <option value="repId">Rep ID</option>
      </select>

      {value.kind === "role" && (
        <input
          className="input"
          list={listId}
          value={value.role}
          onChange={(e) => onChange({ kind: "role", role: e.target.value })}
          placeholder="Role name (e.g., Producer)"
        />
      )}
      {listId && (
        <datalist id={listId}>
          {roleOptions!.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      )}
      {value.kind === "repId" && (
        <input
          className="input"
          value={value.repId}
          onChange={(e) => onChange({ kind: "repId", repId: e.target.value })}
          placeholder="RepId"
        />
      )}
      <span className="pill">{prettyPayee(value)}</span>
    </div>
  );
}

function TierEditor({ tiers, onChange }: { tiers: Tier[]; onChange: (next: Tier[]) => void }) {
  const updateTier = (idx: number, patch: Partial<Tier>) => {
    const next = tiers.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="subCard">
      <div className="row spaceBetween">
        <strong>Tiers</strong>
        <button
          className="btn"
          type="button"
          onClick={() => onChange([...tiers, { upTo: null, rateType: "percent", value: 0.01 }])}
        >
          + Add tier
        </button>
      </div>

      <div className="grid gap8" style={{ marginTop: 10 }}>
        {tiers.map((t, idx) => (
          <div className="row gap8 wrap" key={idx}>
            <span className="pill">Tier {idx + 1}</span>
            <label className="row gap8">
              Up to
              <input
                className="input"
                type="number"
                value={t.upTo ?? ""}
                placeholder="(blank = infinity)"
                onChange={(e) =>
                  updateTier(idx, { upTo: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </label>
            <label className="row gap8">
              Type
              <select
                className="select"
                value={t.rateType}
                onChange={(e) => updateTier(idx, { rateType: e.target.value as any })}
              >
                <option value="percent">percent</option>
                <option value="fixed">fixed</option>
              </select>
            </label>
            <label className="row gap8">
              Value
              <input
                className="input"
                type="number"
                step="0.001"
                value={t.value}
                onChange={(e) => updateTier(idx, { value: Number(e.target.value) })}
              />
            </label>
            <button className="btn danger" type="button" onClick={() => onChange(tiers.filter((_, i) => i !== idx))}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlanBuilder({
  plan,
  onChange,
  hints,
}: {
  plan: CommissionPlan;
  onChange: (next: CommissionPlan) => void;
  hints?: BuilderHints;
}) {
  const sortedRules = useMemo(() => plan.rules.slice().sort((a, b) => a.priority - b.priority), [plan.rules]);

  const suggestions: Record<string, string[]> = useMemo(
    () => ({
      "participant.role": hints?.roles ?? [],
      "txn.line": hints?.lines ?? [],
      "txn.fields.productName": hints?.products ?? [],
      "txn.fields.productType": hints?.products ?? [],
      "txn.fields.activityType": hints?.activities ?? [],
    }),
    [hints]
  );

  const updatePlan = (patch: Partial<CommissionPlan>) => onChange({ ...plan, ...patch });

  const updateRule = (ruleId: string, patch: Partial<Rule>) => {
    const next = {
      ...plan,
      rules: plan.rules.map((r) => (r.id === ruleId ? ({ ...r, ...patch } as Rule) : r)),
    };
    onChange(next);
  };

  const deleteRule = (ruleId: string) => {
    onChange({ ...plan, rules: plan.rules.filter((r) => r.id !== ruleId) });
  };

  const moveRule = (ruleId: string, dir: "up" | "down") => {
    const arr = sortedRules.slice();
    const idx = arr.findIndex((r) => r.id === ruleId);
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || j < 0 || j >= arr.length) return;
    const tmp = arr[idx];
    arr[idx] = arr[j];
    arr[j] = tmp;
    const normalized = normalizePriorities(arr);
    onChange({ ...plan, rules: normalized });
  };

  const addRule = (type: Rule["type"]) => {
    let r: Rule;

    if (type === "participant_rate") {
      r = {
        id: uid("rule"),
        type,
        name: "Producer base commission (NEW Auto/Home)",
        enabled: true,
        priority: (sortedRules.length + 1) * 10,
        base: "commissionablePremiumCredit",
        rateType: "percent",
        value: 0.1,
        when: {
          op: "and",
          conditions: [
            { op: "eq", field: "participant.role", value: "Producer" },
            { op: "in", field: "txn.transactionType", value: ["NEW"] },
            { op: "in", field: "txn.line", value: ["Auto", "Home"] },
          ],
        },
      } satisfies ParticipantRateRule;
    } else if (type === "override_rate") {
      r = {
        id: uid("rule"),
        type,
        name: "Manager override (1% of Producer credit on NEW)",
        enabled: true,
        priority: (sortedRules.length + 1) * 10,
        base: "commissionablePremiumCredit",
        rateType: "percent",
        value: 0.01,
        when: { op: "eq", field: "txn.transactionType", value: "NEW" },
        sourceWhen: { op: "eq", field: "participant.role", value: "Producer" },
        payee: { kind: "role", role: "Manager", allocation: "equal" },
      } satisfies OverrideRateRule;
    } else if (type === "tiered_rate_period") {
      r = {
        id: uid("rule"),
        type,
        name: "Producer accelerator (tiered on NB credited premium)",
        enabled: true,
        priority: (sortedRules.length + 1) * 10,
        metric: "nbCommissionablePremiumCredit",
        mode: "progressive",
        tiers: [
          { upTo: 10000, rateType: "percent", value: 0.0 },
          { upTo: 25000, rateType: "percent", value: 0.01 },
          { upTo: null, rateType: "percent", value: 0.02 },
        ],
        payee: { kind: "role", role: "Producer" },
      } satisfies TieredRatePeriodRule;
    } else if (type === "bonus_threshold_period") {
      r = {
        id: uid("rule"),
        type,
        name: "Monthly bonus ($200 if NB credited premium >= 20k)",
        enabled: true,
        priority: (sortedRules.length + 1) * 10,
        metric: "nbCommissionablePremiumCredit",
        threshold: 20000,
        bonusAmount: 200,
        payee: { kind: "role", role: "Producer" },
      } satisfies BonusThresholdPeriodRule;
    } else {
      r = {
        id: uid("rule"),
        type: "cap_period",
        name: "Cap total payout per rep ($5,000)",
        enabled: true,
        priority: (sortedRules.length + 1) * 10,
        capAmount: 5000,
        appliesTo: { kind: "allReps" },
      } satisfies CapPeriodRule;
    }

    onChange({ ...plan, rules: normalizePriorities([...plan.rules, r]) });
  };

  return (
    <div className="card">
      <div className="row spaceBetween wrap">
        <div>
          <h2 className="h2">Plan Builder</h2>
          <div className="muted">Insurance-style modular commission plan rules. Saved locally.</div>
        </div>
        <div className="row gap8 wrap">
          <button className="btn" type="button" onClick={() => addRule("participant_rate")}>
            + Participant Rate
          </button>
          <button className="btn" type="button" onClick={() => addRule("override_rate")}>
            + Override Rate
          </button>
          <button className="btn" type="button" onClick={() => addRule("tiered_rate_period")}>
            + Tiered Period
          </button>
          <button className="btn" type="button" onClick={() => addRule("bonus_threshold_period")}>
            + Bonus Period
          </button>
          <button className="btn" type="button" onClick={() => addRule("cap_period")}>
            + Cap
          </button>
        </div>
      </div>

      <div className="grid gap12" style={{ marginTop: 12 }}>
        <div className="subCard">
          <div className="grid gap8">
            <label className="grid gap6">
              <strong>Plan name</strong>
              <input className="input" value={plan.name} onChange={(e) => updatePlan({ name: e.target.value })} />
            </label>

            <div className="row gap8 wrap">
              <label className="row gap8">
                <strong>Period date field</strong>
                <select
                  className="select"
                  value={plan.period.dateField}
                  onChange={(e) => updatePlan({ period: { ...plan.period, dateField: e.target.value as any } })}
                >
                  <option value="writtenDateISO">writtenDateISO</option>
                  <option value="effectiveDateISO">effectiveDateISO</option>
                  <option value="paidDateISO">paidDateISO</option>
                </select>
              </label>
              <span className="pill">Granularity: month</span>
              <span className="pill">Currency: {plan.currency}</span>
            </div>
          </div>
        </div>

        <div className="grid gap12">
          {sortedRules.map((r) => (
            <RuleCard
              key={r.id}
              rule={r}
              onUpdate={(patch) => updateRule(r.id, patch)}
              onDelete={() => deleteRule(r.id)}
              onMoveUp={() => moveRule(r.id, "up")}
              onMoveDown={() => moveRule(r.id, "down")}
            />
          ))}
        </div>
      </div>
    </div>
  );

  function RuleCard({
    rule,
    onUpdate,
    onDelete,
    onMoveUp,
    onMoveDown,
  }: {
    rule: Rule;
    onUpdate: (patch: Partial<Rule>) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
  }) {
    const [open, setOpen] = useState(true);

    return (
      <div className="ruleCard">
        <div className="row spaceBetween wrap">
          <div className="row gap10 wrap">
            <button className="btn" type="button" onClick={() => setOpen((x) => !x)}>
              {open ? "Hide" : "Show"}
            </button>
            <span className="pill">{rule.type}</span>
            <input
              className="input"
              style={{ minWidth: 340 }}
              value={rule.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
            />
          </div>

          <div className="row gap8 wrap">
            <label className="row gap8">
              <span className="muted">Priority</span>
              <input
                className="input"
                type="number"
                value={rule.priority}
                onChange={(e) => onUpdate({ priority: Number(e.target.value) })}
                style={{ width: 100 }}
              />
            </label>

            <label className="row gap8">
              <span className="muted">Enabled</span>
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) => onUpdate({ enabled: e.target.checked })}
              />
            </label>

            <button className="btn" type="button" onClick={onMoveUp}>
              ↑
            </button>
            <button className="btn" type="button" onClick={onMoveDown}>
              ↓
            </button>
            <button className="btn danger" type="button" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>

        {open && (
          <div className="grid gap12" style={{ marginTop: 12 }}>
            {"when" in rule && (
              <ToggleCondition
                label="Rule condition (optional)"
                value={(rule as any).when}
                onChange={(c) => onUpdate({ when: c } as any)}
                suggestions={suggestions}
              />
            )}

            {rule.type === "participant_rate" && (
              <ParticipantRateEditor rule={rule} onUpdate={onUpdate} suggestions={suggestions} />
            )}

            {rule.type === "override_rate" && (
              <OverrideRateEditor rule={rule} onUpdate={onUpdate} hints={hints} suggestions={suggestions} />
            )}

            {rule.type === "tiered_rate_period" && (
              <TieredPeriodEditor rule={rule} onUpdate={onUpdate} hints={hints} />
            )}

            {rule.type === "bonus_threshold_period" && (
              <BonusPeriodEditor rule={rule} onUpdate={onUpdate} hints={hints} />
            )}

            {rule.type === "cap_period" && (
              <CapEditor rule={rule} onUpdate={onUpdate} hints={hints} />
            )}
          </div>
        )}
      </div>
    );
  }

  function ParticipantRateEditor({
    rule,
    onUpdate,
    suggestions,
  }: {
    rule: ParticipantRateRule;
    onUpdate: (patch: Partial<Rule>) => void;
    suggestions?: Record<string, string[]>;
  }) {
    return (
      <div className="subCard">
        <div className="row gap8 wrap">
          <strong>Participant Rate</strong>
          <label className="row gap8">
            Base
            <select className="select" value={rule.base} onChange={(e) => onUpdate({ base: e.target.value as any })}>
              <option value="commissionablePremiumCredit">commissionablePremiumCredit</option>
              <option value="commissionablePremiumTotal">commissionablePremiumTotal</option>
              <option value="premiumCredit">premiumCredit</option>
              <option value="premiumTotal">premiumTotal</option>
              <option value="policyCountCredit">policyCountCredit</option>
              <option value="policyCountTotal">policyCountTotal</option>
            </select>
          </label>

          <label className="row gap8">
            Rate type
            <select
              className="select"
              value={rule.rateType}
              onChange={(e) => onUpdate({ rateType: e.target.value as any })}
            >
              <option value="percent">percent</option>
              <option value="fixed">fixed</option>
            </select>
          </label>

          <label className="row gap8">
            Value
            <input
              className="input"
              type="number"
              step="0.001"
              value={rule.value}
              onChange={(e) => onUpdate({ value: Number(e.target.value) })}
            />
          </label>

          <span className="muted">
            Tip: Use <code>participant.role</code> + <code>txn.transactionType</code> in the rule condition.
          </span>
          {suggestions?.["participant.role"]?.length ? (
            <span className="muted">Roles: {suggestions["participant.role"].join(", ")}</span>
          ) : null}
        </div>
      </div>
    );
  }

  function OverrideRateEditor({
    rule,
    onUpdate,
    hints,
    suggestions,
  }: {
    rule: OverrideRateRule;
    onUpdate: (patch: Partial<Rule>) => void;
    hints?: BuilderHints;
    suggestions?: Record<string, string[]>;
  }) {
    const roleOptions = hints?.roles ?? [];
    const payeeRoleListId = roleOptions.length ? "override-payee-roles" : undefined;
    return (
      <div className="subCard">
        <div className="grid gap10">
          <div className="row gap8 wrap">
            <strong>Override Rate</strong>
            <label className="row gap8">
              Base
              <select className="select" value={rule.base} onChange={(e) => onUpdate({ base: e.target.value as any })}>
                <option value="commissionablePremiumCredit">commissionablePremiumCredit</option>
                <option value="commissionablePremiumTotal">commissionablePremiumTotal</option>
                <option value="premiumCredit">premiumCredit</option>
                <option value="premiumTotal">premiumTotal</option>
                <option value="policyCountCredit">policyCountCredit</option>
                <option value="policyCountTotal">policyCountTotal</option>
              </select>
            </label>

            <label className="row gap8">
              Rate type
              <select
                className="select"
                value={rule.rateType}
                onChange={(e) => onUpdate({ rateType: e.target.value as any })}
              >
                <option value="percent">percent</option>
                <option value="fixed">fixed</option>
              </select>
            </label>

            <label className="row gap8">
              Value
              <input
                className="input"
                type="number"
                step="0.001"
                value={rule.value}
                onChange={(e) => onUpdate({ value: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="subCard">
            <div className="row spaceBetween">
              <strong>Source participants filter (required)</strong>
            </div>
            <ConditionEditor
              value={rule.sourceWhen}
              onChange={(c) => onUpdate({ sourceWhen: c } as any)}
              fields={FIELDS_ALL}
              suggestions={suggestions}
            />
            <div className="muted" style={{ marginTop: 8 }}>
              Example: participant.role = Producer
            </div>
          </div>

          <div className="subCard">
            <div className="row gap8 wrap">
              <strong>Payee</strong>
              <select
                className="select"
                value={rule.payee.kind}
                onChange={(e) => {
                  const kind = e.target.value as any;
                  if (kind === "repId") onUpdate({ payee: { kind: "repId", repId: "rep_owner" } } as any);
                  if (kind === "agency") onUpdate({ payee: { kind: "agency", agencyRepId: "AGENCY" } } as any);
                  if (kind === "role") onUpdate({ payee: { kind: "role", role: "Manager", allocation: "equal" } } as any);
                }}
              >
                <option value="role">Role</option>
                <option value="repId">Rep ID</option>
                <option value="agency">Agency</option>
              </select>

              {rule.payee.kind === "role" && (
                <>
                  <input
                    className="input"
                    list={payeeRoleListId}
                    value={rule.payee.role}
                    onChange={(e) => onUpdate({ payee: { ...rule.payee, role: e.target.value } } as any)}
                    placeholder="Role name (e.g. Manager)"
                  />
                  {payeeRoleListId && (
                    <datalist id={payeeRoleListId}>
                      {roleOptions.map((r) => (
                        <option key={r} value={r} />
                      ))}
                    </datalist>
                  )}
                  <select
                    className="select"
                    value={rule.payee.allocation}
                    onChange={(e) => onUpdate({ payee: { ...rule.payee, allocation: e.target.value as any } } as any)}
                    title="How to split among multiple payees with this role"
                  >
                    <option value="equal">equal</option>
                    <option value="byCreditPercent">by credit%</option>
                  </select>
                </>
              )}

              {rule.payee.kind === "repId" && (
                <input
                  className="input"
                  value={rule.payee.repId}
                  onChange={(e) => onUpdate({ payee: { ...rule.payee, repId: e.target.value } } as any)}
                  placeholder="repId"
                />
              )}

              {rule.payee.kind === "agency" && (
                <input
                  className="input"
                  value={rule.payee.agencyRepId}
                  onChange={(e) => onUpdate({ payee: { ...rule.payee, agencyRepId: e.target.value } } as any)}
                  placeholder="AGENCY repId"
                />
              )}
            </div>

            <ToggleCondition
              label="Payee filter (optional, only used for role payees)"
              value={rule.payeeWhen}
              onChange={(c) => onUpdate({ payeeWhen: c } as any)}
              suggestions={suggestions}
            />
          </div>
        </div>
      </div>
    );
  }

  function TieredPeriodEditor({
    rule,
    onUpdate,
    hints,
  }: {
    rule: TieredRatePeriodRule;
    onUpdate: (patch: Partial<Rule>) => void;
    hints?: BuilderHints;
  }) {
    return (
      <div className="subCard">
        <div className="row gap8 wrap">
          <strong>Tiered Period Rule</strong>

          <label className="row gap8">
            Metric
            <select className="select" value={rule.metric} onChange={(e) => onUpdate({ metric: e.target.value as any })}>
              <option value="nbCommissionablePremiumCredit">nbCommissionablePremiumCredit</option>
              <option value="rnCommissionablePremiumCredit">rnCommissionablePremiumCredit</option>
              <option value="totalCommissionablePremiumCredit">totalCommissionablePremiumCredit</option>
              <option value="nbPolicyCount">nbPolicyCount</option>
              <option value="rnPolicyCount">rnPolicyCount</option>
              <option value="totalPolicyCount">totalPolicyCount</option>
            </select>
          </label>

          <label className="row gap8">
            Mode
            <select className="select" value={rule.mode} onChange={(e) => onUpdate({ mode: e.target.value as any })}>
              <option value="progressive">progressive</option>
              <option value="cliff">cliff</option>
            </select>
          </label>

          <PayeeEditor value={rule.payee} onChange={(p) => onUpdate({ payee: p } as any)} roleOptions={hints?.roles} />
        </div>

        <TierEditor tiers={rule.tiers} onChange={(tiers) => onUpdate({ tiers } as any)} />
      </div>
    );
  }

  function BonusPeriodEditor({
    rule,
    onUpdate,
    hints,
  }: {
    rule: BonusThresholdPeriodRule;
    onUpdate: (patch: Partial<Rule>) => void;
    hints?: BuilderHints;
  }) {
    return (
      <div className="subCard">
        <div className="row gap8 wrap">
          <strong>Bonus Threshold (Period)</strong>

          <label className="row gap8">
            Metric
            <select className="select" value={rule.metric} onChange={(e) => onUpdate({ metric: e.target.value as any })}>
              <option value="nbCommissionablePremiumCredit">nbCommissionablePremiumCredit</option>
              <option value="rnCommissionablePremiumCredit">rnCommissionablePremiumCredit</option>
              <option value="totalCommissionablePremiumCredit">totalCommissionablePremiumCredit</option>
              <option value="nbPolicyCount">nbPolicyCount</option>
              <option value="rnPolicyCount">rnPolicyCount</option>
              <option value="totalPolicyCount">totalPolicyCount</option>
            </select>
          </label>

          <label className="row gap8">
            Threshold
            <input
              className="input"
              type="number"
              value={rule.threshold}
              onChange={(e) => onUpdate({ threshold: Number(e.target.value) } as any)}
            />
          </label>

          <label className="row gap8">
            Bonus $
            <input
              className="input"
              type="number"
              value={rule.bonusAmount}
              onChange={(e) => onUpdate({ bonusAmount: Number(e.target.value) } as any)}
            />
          </label>

          <PayeeEditor value={rule.payee} onChange={(p) => onUpdate({ payee: p } as any)} roleOptions={hints?.roles} />
        </div>
      </div>
    );
  }

  function CapEditor({
    rule,
    onUpdate,
    hints,
  }: {
    rule: CapPeriodRule;
    onUpdate: (patch: Partial<Rule>) => void;
    hints?: BuilderHints;
  }) {
    return (
      <div className="subCard">
        <div className="row gap8 wrap">
          <strong>Cap Period</strong>
          <label className="row gap8">
            Cap $
            <input
              className="input"
              type="number"
              value={rule.capAmount}
              onChange={(e) => onUpdate({ capAmount: Number(e.target.value) } as any)}
            />
          </label>
          <PayeeEditor
            value={rule.appliesTo}
            onChange={(p) => onUpdate({ appliesTo: p } as any)}
            label="Applies to"
            roleOptions={hints?.roles}
          />
          <span className="muted">Caps are applied after all other rules.</span>
        </div>
      </div>
    );
  }
}
