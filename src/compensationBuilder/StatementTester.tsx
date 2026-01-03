"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// src/compensationBuilder/StatementTester.tsx
import React, { useMemo, useState } from "react";
import { calculateStatement } from "../engine/commissionEngine";
import { CommissionPlan, PolicyTransaction, StatementResult } from "../engine/types";

function safeParseJson<T>(txt: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(txt) as T };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Invalid JSON" };
  }
}

function uniquePeriods(plan: CommissionPlan, txns: PolicyTransaction[]): string[] {
  const dateField = plan.period.dateField;
  const set = new Set<string>();
  for (const t of txns) {
    const d = (t as any)[dateField] || t.writtenDateISO || t.effectiveDateISO || t.paidDateISO;
    if (typeof d === "string" && d.length >= 7) set.add(d.slice(0, 7));
  }
  return Array.from(set).sort();
}

export function StatementTester({
  plan,
  txnsJson,
  onTxnsJsonChange,
}: {
  plan: CommissionPlan;
  txnsJson: string;
  onTxnsJsonChange: (txt: string) => void;
}) {
  const parsed = useMemo(() => safeParseJson<PolicyTransaction[]>(txnsJson), [txnsJson]);

  const periods = useMemo(() => {
    if (!parsed.ok) return [];
    return uniquePeriods(plan, parsed.value);
  }, [parsed, plan]);

  const [periodKey, setPeriodKey] = useState<string>("");

  const statement: StatementResult | null = useMemo(() => {
    if (!parsed.ok) return null;
    const pk = periodKey || periods[periods.length - 1] || undefined;
    return calculateStatement(plan, parsed.value, { periodKey: pk });
  }, [parsed, plan, periodKey, periods]);

  const [selectedRepId, setSelectedRepId] = useState<string>("");

  const selectedRep = useMemo(() => {
    if (!statement) return null;
    return statement.reps.find((r) => r.repId === selectedRepId) || null;
  }, [statement, selectedRepId]);

  return (
    <div className="card">
      <div className="row spaceBetween wrap">
        <div>
          <h2 className="h2">Statement Tester</h2>
          <div className="muted">
            Paste an array of <code>PolicyTransaction</code> JSON and simulate a period statement.
          </div>
        </div>

        <div className="row gap8 wrap">
          <label className="row gap8">
            Period
            <select
              className="select"
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              title="PeriodKey is YYYY-MM"
            >
              <option value="">(auto)</option>
              {periods.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <span className="pill">Grouping: {plan.period.dateField} → YYYY-MM</span>
        </div>
      </div>

      <div className="grid gap12" style={{ marginTop: 12 }}>
        <div className="subCard">
          <div className="row spaceBetween wrap">
            <strong>Transactions JSON</strong>
            <span className="muted">
              Tip: Producer credit splits use <code>creditPercent</code>. CSR/Manager can be included with creditPercent=0.
            </span>
          </div>

          <textarea
            className="textarea"
            rows={14}
            value={txnsJson}
            onChange={(e) => onTxnsJsonChange(e.target.value)}
            spellCheck={false}
          />

          {!parsed.ok && <div className="error">JSON error: {parsed.error}</div>}
        </div>

        {statement && (
          <div className="grid gap12">
            {statement.warnings.length > 0 && (
              <div className="warning">
                <strong>Warnings</strong>
                <ul>
                  {statement.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="subCard">
              <div className="row spaceBetween wrap">
                <div>
                  <strong>Payout Summary</strong>
                  <div className="muted">Period: {statement.periodKey}</div>
                </div>
              </div>

              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Rep</th>
                      <th>Roles</th>
                      <th>NB Credit Prem</th>
                      <th>RN Credit Prem</th>
                      <th>Total Credit Prem</th>
                      <th>Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.reps.map((r) => (
                      <tr
                        key={r.repId}
                        className={selectedRepId === r.repId ? "rowSelected" : ""}
                        onClick={() => setSelectedRepId(r.repId)}
                        style={{ cursor: "pointer" }}
                        title="Click to view traces"
                      >
                        <td>
                          <div className="mono">{r.repId}</div>
                          <div className="muted">{r.repName || ""}</div>
                        </td>
                        <td>{r.roles.join(", ")}</td>
                        <td className="num">${r.metrics.nbCommissionablePremiumCredit.toFixed(2)}</td>
                        <td className="num">${r.metrics.rnCommissionablePremiumCredit.toFixed(2)}</td>
                        <td className="num">${r.metrics.totalCommissionablePremiumCredit.toFixed(2)}</td>
                        <td className="num strong">${r.payout.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedRep && (
                <div className="grid gap12" style={{ marginTop: 12 }}>
                  <div className="subCard">
                    <div className="row spaceBetween wrap">
                      <div>
                        <strong>Selected Rep</strong>
                        <div className="muted">
                          {selectedRep.repId} {selectedRep.repName ? `— ${selectedRep.repName}` : ""} ({selectedRep.roles.join(", ")})
                        </div>
                      </div>
                      <div className="pill">Payout: ${selectedRep.payout.toFixed(2)}</div>
                    </div>

                    <div className="grid gap8" style={{ marginTop: 10 }}>
                      <strong>Rule totals</strong>
                      <div className="tableWrap">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Rule ID</th>
                              <th>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(selectedRep.ruleTotals).map(([ruleId, amt]) => (
                              <tr key={ruleId}>
                                <td className="mono">{ruleId}</td>
                                <td className="num">${amt.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="grid gap8" style={{ marginTop: 10 }}>
                      <strong>Traces</strong>
                      <div className="grid gap8">
                        {selectedRep.traces
                          .slice()
                          .reverse()
                          .map((t, idx) => (
                            <div key={idx} className="trace">
                              <div className="row spaceBetween wrap">
                                <div>
                                  <div className="row gap8 wrap">
                                    <span className="pill">{t.scope}</span>
                                    <span className="pill">{t.ruleType}</span>
                                    <strong>{t.ruleName}</strong>
                                  </div>
                                  <div className="muted">
                                    {t.txnId ? (
                                      <>
                                        Txn: <span className="mono">{t.txnId}</span> — Policy:{" "}
                                        <span className="mono">{t.policyId}</span>
                                      </>
                                    ) : (
                                      <>Period rule</>
                                    )}
                                  </div>
                                </div>
                                <div className="num strong">
                                  {t.delta >= 0 ? "+" : ""}
                                  ${t.delta.toFixed(2)}
                                </div>
                              </div>

                              <div className="muted">
                                {t.reason}
                                {typeof t.base === "number" ? ` • base=${t.base}` : ""}
                              </div>

                              {t.details && (
                                <pre className="code">{JSON.stringify(t.details, null, 2)}</pre>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="subCard">
              <div className="row spaceBetween wrap">
                <div>
                  <strong>Transactions</strong>
                  <div className="muted">Per-rep deltas by transaction</div>
                </div>
              </div>

              <div className="tableWrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Txn</th>
                      <th>Policy</th>
                      <th>Type</th>
                      <th>Line</th>
                      <th>Carrier</th>
                      <th>Date</th>
                      <th>Comm Prem Δ</th>
                      <th>Rep Deltas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.transactions.map((t) => (
                      <tr key={t.txnId}>
                        <td className="mono">{t.txnId}</td>
                        <td className="mono">{t.policyId}</td>
                        <td>{t.transactionType}</td>
                        <td>{t.line || ""}</td>
                        <td>{t.carrier || ""}</td>
                        <td className="mono">{t.dateISO || ""}</td>
                        <td className="num">${t.commissionablePremiumDelta.toFixed(2)}</td>
                        <td>
                          <div className="grid gap6">
                            {Object.entries(t.perRepDelta).length === 0 && <span className="muted">(no payouts)</span>}
                            {Object.entries(t.perRepDelta).map(([repId, delta]) => (
                              <div key={repId} className="row spaceBetween">
                                <span className="mono">{repId}</span>
                                <span className="num">
                                  {delta >= 0 ? "+" : ""}${delta.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="muted" style={{ marginTop: 10 }}>
                Note: CANCEL/negative premium deltas naturally create negative commission (chargeback behavior).
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
