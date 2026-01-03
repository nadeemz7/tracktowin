"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// src/compensationBuilder/CompensationBuilder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CommissionPlan } from "../engine/types";

// ✅ Adjust this import if your PlanBuilder lives somewhere else.
// Common location from earlier steps:
import { PlanBuilder, BuilderHints } from "../ui/PlanBuilder";

import { StatementTester } from "./StatementTester";
import { DEFAULT_PLAN, DEFAULT_TXNS_JSON } from "./sampleData";

import styles from "./compensationBuilder.module.css";

const LS_PLAN = "compensation_builder_plan_v1";
const LS_TXNS = "compensation_builder_txns_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function tryParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadPlan(): CommissionPlan {
  if (!isBrowser()) return DEFAULT_PLAN;
  const stored = tryParseJson<CommissionPlan>(window.localStorage.getItem(LS_PLAN));
  // Minimal guard
  if (!stored || !stored.rules || !stored.period) return DEFAULT_PLAN;
  return stored;
}

function loadTxnsJson(): string {
  if (!isBrowser()) return DEFAULT_TXNS_JSON;
  return window.localStorage.getItem(LS_TXNS) || DEFAULT_TXNS_JSON;
}

function safeCopy(text: string): boolean {
  try {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}

export function CompensationBuilder({ hints }: { hints?: BuilderHints }) {
  const [tab, setTab] = useState<"plan" | "test">("plan");
  const [plan, setPlan] = useState<CommissionPlan>(() => loadPlan());
  const [txnsJson, setTxnsJson] = useState<string>(() => loadTxnsJson());

  const [status, setStatus] = useState<string>("");
  const statusTimer = useRef<number | null>(null);

  const planExport = useMemo(() => JSON.stringify(plan, null, 2), [plan]);

  useEffect(() => {
    if (!isBrowser()) return;
    window.localStorage.setItem(LS_PLAN, JSON.stringify(plan, null, 2));
  }, [plan]);

  useEffect(() => {
    if (!isBrowser()) return;
    window.localStorage.setItem(LS_TXNS, txnsJson);
  }, [txnsJson]);

  const flash = (msg: string) => {
    setStatus(msg);
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(""), 1800) as any;
  };

  return (
    <div className={styles.icb}>
      <div className="header">
        <div>
          <div className="title">Insurance Compensation Builder</div>
          <div className="subtitle">
            Modular rules • Granular conditions • Explainable payouts • Local-only (no integrations)
          </div>
        </div>

        <div className="row gap8 wrap">
          <button
            className={`btn ${tab === "plan" ? "primary" : ""}`}
            onClick={() => setTab("plan")}
            type="button"
          >
            Plan Builder
          </button>
          <button
            className={`btn ${tab === "test" ? "primary" : ""}`}
            onClick={() => setTab("test")}
            type="button"
          >
            Statement Tester
          </button>

          <div className="divider" />

          <button
            className="btn"
            type="button"
            onClick={() => {
              const ok = safeCopy(planExport);
              flash(ok ? "Plan JSON copied" : "Copy failed (clipboard blocked)");
            }}
          >
            Copy Plan JSON
          </button>

          <button
            className="btn danger"
            type="button"
            onClick={() => {
              // Reset ONLY builder state (namespaced localStorage keys)
              setPlan(DEFAULT_PLAN);
              setTxnsJson(DEFAULT_TXNS_JSON);
              if (isBrowser()) {
                window.localStorage.removeItem(LS_PLAN);
                window.localStorage.removeItem(LS_TXNS);
              }
              flash("Reset to defaults");
            }}
          >
            Reset Defaults
          </button>
        </div>
      </div>

      {status && <div className="status">{status}</div>}

      <div className="main">
        {tab === "plan" && <PlanBuilder plan={plan} onChange={setPlan} hints={hints} />}
        {tab === "test" && (
          <StatementTester plan={plan} txnsJson={txnsJson} onTxnsJsonChange={setTxnsJson} />
        )}
      </div>
    </div>
  );
}
