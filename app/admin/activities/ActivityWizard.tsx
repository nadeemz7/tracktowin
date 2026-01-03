"use client";

import { useMemo, useState } from "react";

type Team = { id: string; name: string };

type WizardState = {
  name: string;
  description: string;
  active: boolean;
  selectedTeams: string[];
  defaultTeams: string[];
  inputMode: "COUNT" | "BOOLEAN" | "TEXT";
  unitLabel: string;
  requiresFullName: boolean;
  payable: boolean;
  payoutMode: "FLAT" | "TIER" | "";
  flatPayoutValue: number | null;
  payoutTiers: { minValue: number; maxValue: number | null; payoutValue: number }[];
  trackOnly: boolean;
  groupingHint: "BULK" | "PER_ENTRY" | "";
  defaultQuotaPerDay?: number | null;
  expectations: Record<string, { expectedPerDay: number | null; required: boolean; notes: string }>;
};

const EMPTY_STATE: WizardState = {
  name: "",
  description: "",
  active: true,
  selectedTeams: [],
  defaultTeams: [],
  inputMode: "COUNT",
  unitLabel: "",
  requiresFullName: false,
  payable: false,
  payoutMode: "",
  flatPayoutValue: null,
  payoutTiers: [],
  trackOnly: true,
  groupingHint: "",
  defaultQuotaPerDay: null,
  expectations: {},
};

export function ActivityWizard({
  teams,
  initial,
  onSubmitLabel = "Save Activity",
}: {
  teams: Team[];
  initial?: Partial<WizardState>;
  onSubmitLabel?: string;
}) {
  const [state, setState] = useState<WizardState>(() => ({
    ...EMPTY_STATE,
    ...initial,
    expectations: { ...EMPTY_STATE.expectations, ...(initial?.expectations || {}) },
  }));
  const [step, setStep] = useState(0);

  const summary = useMemo(() => {
    return {
      name: state.name || "Untitled",
      teams: teams.filter((t) => state.selectedTeams.includes(t.id)).map((t) => t.name),
      defaults: teams.filter((t) => state.defaultTeams.includes(t.id)).map((t) => t.name),
      inputMode: state.inputMode,
      unitLabel: state.unitLabel,
      fullName: state.requiresFullName ? "Yes" : "No",
      payable: state.payable ? "Yes" : "No",
      trackOnly: state.trackOnly ? "Track only" : "Has expectations",
      payoutSummary:
        state.payable && state.payoutMode === "FLAT"
          ? `Flat $${state.flatPayoutValue ?? 0} per unit`
          : state.payable && state.payoutMode === "TIER"
            ? `${state.payoutTiers.length} tier(s)`
            : "Not payable",
    };
  }, [state, teams]);

  function updateExpectation(teamId: string, field: "expectedPerDay" | "required" | "notes", value: number | boolean | string) {
    setState((s) => ({
      ...s,
      expectations: {
        ...s.expectations,
        [teamId]: {
          expectedPerDay: s.expectations[teamId]?.expectedPerDay ?? null,
          required: s.expectations[teamId]?.required ?? false,
          notes: s.expectations[teamId]?.notes ?? "",
          [field]: value,
        },
      },
    }));
  }

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "2fr 1fr" }}>
      <input type="hidden" name="payload" value={JSON.stringify(state)} />
      <div className="surface" style={{ padding: 18, display: "grid", gap: 14, border: "1px solid #e5e7eb" }}>
        <StepHeader
          current={step}
          steps={["Basics", "Who uses it", "How logged", "Quotas", "Payable", "Review"]}
          onSelect={setStep}
        />

        {step === 0 && (
          <div style={{ display: "grid", gap: 8 }}>
            <h3>Basic info</h3>
            <p style={{ color: "#555", margin: 0 }}>Give this activity a clear name and optional description.</p>
            <label>
              Name *
              <input
                required
                value={state.name}
                onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g., Dials, Quotes Sent, Appointments"
                style={{ width: "100%", padding: 10, marginTop: 4 }}
              />
            </label>
            <label>
              Description
              <textarea
                value={state.description}
                onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
                rows={2}
                placeholder="Example: Daily outbound calls to prospects."
                style={{ width: "100%", padding: 10, marginTop: 4 }}
              />
            </label>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={state.active}
                onChange={(e) => setState((s) => ({ ...s, active: e.target.checked }))}
              />
              Active (if off, it will not appear for users)
            </label>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: "grid", gap: 10 }}>
            <h3>Who uses this?</h3>
            <p style={{ color: "#555", margin: 0 }}>Select teams that can see/use this activity. Mark defaults to show in logging.</p>
            <div style={{ display: "grid", gap: 8 }}>
              {teams.map((team) => {
                const selected = state.selectedTeams.includes(team.id);
                return (
                  <div key={team.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                    <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...state.selectedTeams, team.id]
                            : state.selectedTeams.filter((id) => id !== team.id);
                          setState((s) => ({
                            ...s,
                            selectedTeams: next,
                            defaultTeams: s.defaultTeams.filter((id) => next.includes(id)),
                          }));
                        }}
                      />
                      {team.name}
                    </label>
                    {selected ? (
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center", marginLeft: 16 }}>
                        <input
                          type="checkbox"
                          checked={state.defaultTeams.includes(team.id)}
                          onChange={(e) => {
                            setState((s) => ({
                              ...s,
                              defaultTeams: e.target.checked
                                ? [...s.defaultTeams, team.id]
                                : s.defaultTeams.filter((id) => id !== team.id),
                            }));
                          }}
                        />
                        Show by default
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "grid", gap: 10 }}>
            <h3>How is it logged?</h3>
            <p style={{ color: "#555", margin: 0 }}>Pick the input type. Counts are most common.</p>
            <label>
              Input mode
              <select
                value={state.inputMode}
                onChange={(e) => setState((s) => ({ ...s, inputMode: e.target.value as WizardState["inputMode"] }))}
                style={{ padding: 10, width: "100%" }}
              >
                <option value="COUNT">Count (number)</option>
                <option value="BOOLEAN">Yes / No</option>
                <option value="TEXT">Free text</option>
              </select>
            </label>
            {state.inputMode === "COUNT" ? (
              <label>
                Unit label (optional)
                <input
                  value={state.unitLabel}
                  onChange={(e) => setState((s) => ({ ...s, unitLabel: e.target.value }))}
                  placeholder="e.g., calls, appointments"
                  style={{ padding: 10, width: "100%" }}
                />
              </label>
            ) : null}
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={state.requiresFullName}
                onChange={(e) => setState((s) => ({ ...s, requiresFullName: e.target.checked }))}
              />
              Requires full name when logging
            </label>
            {state.inputMode === "COUNT" ? (
              <label>
                Grouping hint (optional)
                <select
                  value={state.groupingHint}
                  onChange={(e) => setState((s) => ({ ...s, groupingHint: e.target.value as WizardState["groupingHint"] }))}
                  style={{ padding: 10, width: "100%" }}
                >
                  <option value="">None</option>
                  <option value="BULK">Usually tracked in bulk (daily total)</option>
                  <option value="PER_ENTRY">Tracked per person entry (e.g., referrals)</option>
                </select>
              </label>
            ) : null}
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "grid", gap: 10 }}>
            <h3>Quotas / expectations</h3>
            <p style={{ color: "#555", margin: 0 }}>Choose track-only or set daily expectations per team.</p>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={state.trackOnly}
                onChange={(e) => setState((s) => ({ ...s, trackOnly: e.target.checked }))}
              />
              Track-only (no quotas)
            </label>
            {!state.trackOnly ? (
              <div style={{ display: "grid", gap: 10 }}>
                {state.selectedTeams.map((teamId) => {
                  const team = teams.find((t) => t.id === teamId);
                  const exp = state.expectations[teamId] || { expectedPerDay: null, required: false, notes: "" };
                  return (
                    <div key={teamId} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
                      <div style={{ fontWeight: 700 }}>{team?.name}</div>
                      <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr" }}>
                        <label>
                          Expected per day
                          <input
                            type="number"
                            min={0}
                            value={exp.expectedPerDay ?? ""}
                            onChange={(e) =>
                              updateExpectation(teamId, "expectedPerDay", e.target.value === "" ? null : Number(e.target.value))
                            }
                            style={{ padding: 8, width: "100%" }}
                          />
                        </label>
                        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", marginTop: 22 }}>
                          <input
                            type="checkbox"
                            checked={exp.required}
                            onChange={(e) => updateExpectation(teamId, "required", e.target.checked)}
                          />
                          Required
                        </label>
                      </div>
                      <label>
                        Notes
                        <input
                          value={exp.notes}
                          onChange={(e) => updateExpectation(teamId, "notes", e.target.value)}
                          style={{ padding: 8, width: "100%" }}
                          placeholder="Optional guidance"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}

        {step === 4 && (
          <div style={{ display: "grid", gap: 10 }}>
            <h3>Payable</h3>
            <p style={{ color: "#555", margin: 0 }}>
              Payable activities can be used in compensation plans. This does not automatically pay money.
            </p>
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={state.payable}
                onChange={(e) => setState((s) => ({ ...s, payable: e.target.checked, payoutMode: e.target.checked ? "FLAT" : "", payoutTiers: e.target.checked ? s.payoutTiers : [], flatPayoutValue: e.target.checked ? s.flatPayoutValue : null }))}
              />
              Eligible for payouts
            </label>
            {state.payable ? (
              <div style={{ display: "grid", gap: 10, padding: 10, border: "1px solid #e5e7eb", borderRadius: 10, background: "#f8fafc" }}>
                <label>
                  Payout mode
                  <select
                    value={state.payoutMode}
                    onChange={(e) => setState((s) => ({ ...s, payoutMode: e.target.value as WizardState["payoutMode"] }))}
                    style={{ padding: 10, width: "100%" }}
                  >
                    <option value="FLAT">Flat amount per logged unit</option>
                    <option value="TIER">Tiered by count within a month</option>
                  </select>
                </label>
                <div style={{ fontSize: 12, color: "#555" }}>
                  Examples: “1 FS Appointment = $10” (Flat) or “10 Reviews in a month = $200” (Tier).
                </div>
                {state.payoutMode === "FLAT" ? (
                  <label>
                    Flat amount per unit
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={state.flatPayoutValue ?? ""}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          flatPayoutValue: e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                      placeholder="e.g., 10 for $10 per activity"
                      style={{ padding: 10, width: "100%" }}
                    />
                  </label>
                ) : null}
                {state.payoutMode === "TIER" ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    {state.payoutTiers.map((tier, idx) => (
                      <div key={idx} style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", alignItems: "center" }}>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={tier.minValue}
                          onChange={(e) => {
                            const next = [...state.payoutTiers];
                            next[idx] = { ...tier, minValue: Number(e.target.value) };
                            setState((s) => ({ ...s, payoutTiers: next }));
                          }}
                          placeholder="Min"
                          style={{ padding: 8 }}
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={tier.maxValue ?? ""}
                          onChange={(e) => {
                            const next = [...state.payoutTiers];
                            next[idx] = { ...tier, maxValue: e.target.value === "" ? null : Number(e.target.value) };
                            setState((s) => ({ ...s, payoutTiers: next }));
                          }}
                          placeholder="Max (optional)"
                          style={{ padding: 8 }}
                        />
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={tier.payoutValue}
                          onChange={(e) => {
                            const next = [...state.payoutTiers];
                            next[idx] = { ...tier, payoutValue: Number(e.target.value) };
                            setState((s) => ({ ...s, payoutTiers: next }));
                          }}
                          placeholder="$ Payout"
                          style={{ padding: 8 }}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setState((s) => ({ ...s, payoutTiers: s.payoutTiers.filter((_, i) => i !== idx) }))
                          }
                          style={{ padding: "6px 8px" }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setState((s) => ({
                          ...s,
                          payoutTiers: [...s.payoutTiers, { minValue: 0, maxValue: null, payoutValue: 0 }],
                        }))
                      }
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}
                    >
                      + Add Tier
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {step === 5 && (
          <div style={{ display: "grid", gap: 10 }}>
            <h3>Review</h3>
            <p style={{ color: "#555", margin: 0 }}>Confirm details, then save.</p>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 6 }}>
              <div><strong>Name:</strong> {summary.name}</div>
              <div><strong>Teams:</strong> {summary.teams.join(", ") || "None selected"}</div>
              <div><strong>Default for:</strong> {summary.defaults.join(", ") || "None"}</div>
              <div><strong>Input:</strong> {summary.inputMode} {summary.unitLabel ? `(${summary.unitLabel})` : ""}</div>
              <div><strong>Requires full name:</strong> {summary.fullName}</div>
              <div><strong>Mode:</strong> {summary.trackOnly}</div>
              <div><strong>Payable:</strong> {summary.payable}</div>
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
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", marginLeft: 8 }}
            >
              Next
            </button>
          </div>
          <button
            type="submit"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #e31836", background: "#e31836", color: "#f8f9fa", fontWeight: 700 }}
          >
            {onSubmitLabel}
          </button>
        </div>
      </div>

      <div className="surface" style={{ padding: 14, border: "1px solid #e5e7eb" }}>
        <h3 style={{ marginTop: 0 }}>Live Summary</h3>
        <div style={{ display: "grid", gap: 8 }}>
          <SummaryRow label="Name" value={summary.name} />
          <SummaryRow label="Teams" value={summary.teams.join(", ") || "None"} />
          <SummaryRow label="Default" value={summary.defaults.join(", ") || "None"} />
          <SummaryRow label="Input" value={`${summary.inputMode}${summary.unitLabel ? ` (${summary.unitLabel})` : ""}`} />
          <SummaryRow label="Full name required" value={summary.fullName} />
          <SummaryRow label="Mode" value={summary.trackOnly} />
          <SummaryRow label="Payable" value={summary.payable} />
          <SummaryRow label="Payout" value={summary.payoutSummary} />
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
