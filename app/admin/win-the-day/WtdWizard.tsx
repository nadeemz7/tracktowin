"use client";

import { useMemo, useState } from "react";
import { WinSourceType } from "@prisma/client";

type Team = { id: string; name: string };
type Person = { id: string; fullName: string };
type Activity = { id: string; name: string };

type RuleState = { sourceType: WinSourceType; activityTypeId?: string; unitsPerPoint?: number | null; pointsAwarded: number };

type WizardState = {
  name: string;
  active: boolean;
  teamId: string;
  pointsToWin: number;
  rules: RuleState[];
  personIds: string[];
};

const EMPTY: WizardState = {
  name: "",
  active: true,
  teamId: "",
  pointsToWin: 1,
  rules: [],
  personIds: [],
};

export function WtdWizard({
  teams,
  people,
  activities,
  initial,
}: {
  teams: Team[];
  people: Person[];
  activities: Activity[];
  initial?: Partial<WizardState>;
}) {
  const [state, setState] = useState<WizardState>({ ...EMPTY, ...initial, rules: initial?.rules || [] });
  const [step, setStep] = useState(0);

  const summary = useMemo(() => {
    return {
      name: state.name || "Untitled plan",
      team: teams.find((t) => t.id === state.teamId)?.name || "None",
      points: state.pointsToWin || 0,
      rules: state.rules.length,
      peopleCount: state.personIds.length,
    };
  }, [state, teams]);

  function updateRule(idx: number, patch: Partial<RuleState>) {
    setState((s) => {
      const next = [...s.rules];
      next[idx] = { ...next[idx], ...patch };
      return { ...s, rules: next };
    });
  }

  function addRule() {
    setState((s) => ({
      ...s,
      rules: [
        ...s.rules,
        {
          sourceType: WinSourceType.ACTIVITY,
          activityTypeId: activities[0]?.id || "",
          unitsPerPoint: 1,
          pointsAwarded: 1,
        },
      ],
    }));
  }

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "2fr 1fr" }}>
      <input type="hidden" name="payload" value={JSON.stringify(state)} />
      <div className="surface" style={{ padding: 18, display: "grid", gap: 14, border: "1px solid #e5e7eb" }}>
        <StepHeader steps={["Basics", "Scoring", "Assignments", "Review"]} current={step} onSelect={setStep} />

        {step === 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <h3>Basics</h3>
            <label>
              Plan name
              <input
                value={state.name}
                onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g., Sales – Win The Day"
                style={{ padding: 10, width: "100%" }}
                required
              />
            </label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={state.active} onChange={(e) => setState((s) => ({ ...s, active: e.target.checked }))} />
              Active
            </label>
            <label>
              Team (optional)
              <select value={state.teamId} onChange={(e) => setState((s) => ({ ...s, teamId: e.target.value }))} style={{ padding: 10, width: "100%" }}>
                <option value="">No team (person overrides only)</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Points required to win
              <input
                type="number"
                min={1}
                value={state.pointsToWin}
                onChange={(e) => setState((s) => ({ ...s, pointsToWin: Number(e.target.value) }))}
                style={{ padding: 10, width: "100%" }}
              />
            </label>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: "grid", gap: 10 }}>
            <h3>Scoring Rules</h3>
            <p style={{ color: "#555", margin: 0 }}>Add how activities or written apps earn points. Example: 40 Outbounds = 1 point.</p>
            <div style={{ display: "grid", gap: 8 }}>
              {state.rules.map((r, idx) => (
                <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "grid", gap: 6 }}>
                  <label>
                    Source type
                    <select
                      value={r.sourceType}
                      onChange={(e) =>
                        updateRule(idx, { sourceType: e.target.value as WinSourceType, activityTypeId: e.target.value === WinSourceType.ACTIVITY ? activities[0]?.id || "" : "" })
                      }
                      style={{ padding: 8, width: "100%" }}
                    >
                      <option value={WinSourceType.ACTIVITY}>Activity</option>
                      <option value={WinSourceType.WRITTEN_APPS}>Applications Written</option>
                    </select>
                  </label>
                  {r.sourceType === WinSourceType.ACTIVITY ? (
                    <label>
                      Activity
                      <select
                        value={r.activityTypeId || ""}
                        onChange={(e) => updateRule(idx, { activityTypeId: e.target.value })}
                        style={{ padding: 8, width: "100%" }}
                      >
                        {activities.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                    <label>
                      Units per point
                      <input
                        type="number"
                        min={1}
                        value={r.unitsPerPoint ?? 1}
                        onChange={(e) => updateRule(idx, { unitsPerPoint: Number(e.target.value) })}
                        style={{ padding: 8, width: "100%" }}
                      />
                    </label>
                    <label>
                      Points awarded
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={r.pointsAwarded}
                        onChange={(e) => updateRule(idx, { pointsAwarded: Number(e.target.value) })}
                        style={{ padding: 8, width: "100%" }}
                      />
                    </label>
                  </div>
                  <div style={{ fontSize: 13, color: "#111" }}>{ruleSummary(r, activities)}</div>
                  <button
                    type="button"
                    onClick={() => setState((s) => ({ ...s, rules: s.rules.filter((_, i) => i !== idx) }))}
                    style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #e31836", background: "#f8f9fa", color: "#e31836" }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addRule} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db" }}>
              + Add scoring rule
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "grid", gap: 10 }}>
            <h3>Assignments</h3>
            <p style={{ color: "#555", margin: 0 }}>People assignment overrides team assignment.</p>
            <label>
              Team assignment
              <select value={state.teamId} onChange={(e) => setState((s) => ({ ...s, teamId: e.target.value }))} style={{ padding: 10, width: "100%" }}>
                <option value="">No team</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              People overrides (multi-select)
              <select
                multiple
                value={state.personIds}
                onChange={(e) => {
                  const options = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setState((s) => ({ ...s, personIds: options }));
                }}
                style={{ padding: 10, width: "100%", minHeight: 120 }}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ fontSize: 12, color: "#555" }}>If someone has a person override, it beats their team plan.</div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "grid", gap: 10 }}>
            <h3>Review</h3>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 6 }}>
              <div><strong>Name:</strong> {summary.name}</div>
              <div><strong>Team:</strong> {summary.team}</div>
              <div><strong>Points to win:</strong> {summary.points}</div>
              <div><strong>Rules:</strong> {summary.rules}</div>
              <div><strong>Person overrides:</strong> {summary.peopleCount}</div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 4 }}>
          <div>
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", background: "#f8f9fa" }}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(3, s + 1))}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", marginLeft: 8 }}
            >
              Next
            </button>
          </div>
          <button
            type="submit"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e31836", background: "#e31836", color: "#f8f9fa", fontWeight: 700 }}
          >
            Save Plan
          </button>
        </div>
      </div>

      <div className="surface" style={{ padding: 14, border: "1px solid #e5e7eb" }}>
        <h3 style={{ marginTop: 0 }}>Live Summary</h3>
        <div style={{ display: "grid", gap: 6 }}>
          <SummaryRow label="Name" value={summary.name} />
          <SummaryRow label="Team" value={summary.team} />
          <SummaryRow label="Points to win" value={String(summary.points)} />
          <SummaryRow label="# Rules" value={String(summary.rules)} />
          <SummaryRow label="Person overrides" value={String(summary.peopleCount)} />
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function StepHeader({
  steps,
  current,
  onSelect,
}: {
  steps: string[];
  current: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {steps.map((s, idx) => (
        <button
          key={s}
          type="button"
          onClick={() => onSelect(idx)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: current === idx ? "2px solid #e31836" : "1px solid #dfe5d6",
            background: current === idx ? "#e31836" : "#f8f9fa",
            color: current === idx ? "#f8f9fa" : "#283618",
            fontWeight: 700,
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function ruleSummary(rule: RuleState, activities: Activity[]) {
  if (rule.sourceType === WinSourceType.WRITTEN_APPS) {
    return `${rule.unitsPerPoint ?? 1} written apps = ${rule.pointsAwarded} pt(s)`;
  }
  const name = activities.find((a) => a.id === (rule.activityTypeId || ""))?.name || "Activity";
  return `${rule.unitsPerPoint ?? 1} ${name} = ${rule.pointsAwarded} pt(s)`;
}
