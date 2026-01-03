"use client";

import { useMemo, useState } from "react";

type MetricOption = { value: string; label: string };

type Props = {
  planId: string;
  bucketOptions: MetricOption[];
  addAction: (formData: FormData) => Promise<void>;
};

type TierRow = { min: string; max: string; value: string };

export function SimpleComponentBuilder({ planId, bucketOptions, addAction }: Props) {
  const [compType, setCompType] = useState<"PER_APP_FLAT" | "PER_APP_TIER" | "PERCENT_FLAT" | "PERCENT_TIER" | "ACTIVITY">(
    "PER_APP_TIER"
  );
  const [bucketChoice, setBucketChoice] = useState(bucketOptions[0]?.value || "");
  const [tierRows, setTierRows] = useState<TierRow[]>([
    { min: "0", max: "19", value: "10" },
    { min: "20", max: "30", value: "25" },
    { min: "31", max: "", value: "40" },
  ]);
  const [flagOverrides, setFlagOverrides] = useState<string[]>([]);

  const showRate = compType === "PER_APP_FLAT" || compType === "PERCENT_FLAT";
  const showTiers = compType === "PER_APP_TIER" || compType === "PERCENT_TIER";
  const showActivity = compType === "ACTIVITY";

  const tierLabel = useMemo(() => {
    if (compType === "PER_APP_TIER") return "Amount ($) per app";
    if (compType === "PERCENT_TIER") return "Percent (%)";
    return "Value";
  }, [compType]);

  return (
    <form action={addAction} style={{ display: "grid", gap: 8, marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid #e3e6eb", background: "#fafbff" }}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="tierRows" value={JSON.stringify(tierRows)} />
      <input type="hidden" name="flagOverrides" value={JSON.stringify(flagOverrides)} />

      <label>
        Rule name
        <br />
        <input name="simpleName" style={{ padding: 8, width: "100%" }} placeholder="e.g. Auto Raw New Tiered" />
      </label>

      <label>
        What are you paying on?
        <br />
        <select
          name="bucketOption"
          value={bucketChoice}
          onChange={(e) => setBucketChoice(e.target.value)}
          style={{ padding: 8, width: "100%" }}
        >
          {bucketOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          <option value="CUSTOM">Custom...</option>
        </select>
      </label>

      {bucketChoice === "CUSTOM" ? (
        <label>
          Custom metric name
          <br />
          <input name="bucketCustom" style={{ padding: 8, width: "100%" }} placeholder="e.g. special_bonus_bucket" />
        </label>
      ) : (
        <input type="hidden" name="bucketCustom" value="" />
      )}

      <label>
        How to pay?
        <br />
        <select
          name="simpleType"
          value={compType}
          onChange={(e) => setCompType(e.target.value as typeof compType)}
          style={{ padding: 8, width: "100%" }}
        >
          <option value="PER_APP_TIER">Per app (tiers)</option>
          <option value="PER_APP_FLAT">Per app (flat)</option>
          <option value="PERCENT_TIER">Percent of premium (tiers)</option>
          <option value="PERCENT_FLAT">Percent of premium (flat)</option>
          <option value="ACTIVITY">Flat amount for an activity</option>
        </select>
      </label>

      {showRate ? (
        <label>
          {compType === "PER_APP_FLAT" ? "Amount per app ($)" : "Percent (%)"}
          <br />
          <input name="simpleRate" type="number" step="0.01" style={{ padding: 8, width: "100%" }} placeholder={compType === "PER_APP_FLAT" ? "e.g. 10" : "e.g. 3"} />
        </label>
      ) : null}

      {showTiers ? (
        <div style={{ border: "1px solid #e3e6eb", borderRadius: 8, padding: 8, background: "#fff" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Tiers</div>
          <div style={{ display: "grid", gap: 6 }}>
            {tierRows.map((row, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 6, alignItems: "center" }}>
                <input
                  value={row.min}
                  onChange={(e) => {
                    const next = [...tierRows];
                    next[idx] = { ...row, min: e.target.value };
                    setTierRows(next);
                  }}
                  placeholder="Min"
                  style={{ padding: 8 }}
                />
                <input
                  value={row.max}
                  onChange={(e) => {
                    const next = [...tierRows];
                    next[idx] = { ...row, max: e.target.value };
                    setTierRows(next);
                  }}
                  placeholder="Max (blank for +)"
                  style={{ padding: 8 }}
                />
                <input
                  value={row.value}
                  onChange={(e) => {
                    const next = [...tierRows];
                    next[idx] = { ...row, value: e.target.value };
                    setTierRows(next);
                  }}
                  placeholder={tierLabel}
                  style={{ padding: 8 }}
                />
                <button
                  type="button"
                  onClick={() => setTierRows(tierRows.filter((_, i) => i !== idx))}
                  disabled={tierRows.length === 1}
                  style={{ padding: "6px 8px" }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setTierRows([...tierRows, { min: "", max: "", value: "" }])}
              style={{ padding: "6px 10px", width: 150 }}
            >
              + Add tier
            </button>
          </div>
        </div>
      ) : null}

      {showActivity ? (
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            Activity name
            <br />
            <input name="activityName" style={{ padding: 8, width: "100%" }} placeholder="e.g. FS Appointment Scheduled & Held" />
          </label>
          <label>
            Amount ($)
            <br />
            <input name="activityAmount" type="number" step="0.01" style={{ padding: 8, width: "100%" }} placeholder="e.g. 10" />
          </label>
        </div>
      ) : null}

      {compType === "PERCENT_TIER" || compType === "PERCENT_FLAT" ? (
        <label style={{ display: "grid", gap: 6 }}>
          Value policy overrides (optional)
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={flagOverrides.includes("isValueHealth")}
                onChange={(e) => {
                  const next = new Set(flagOverrides);
                  if (e.target.checked) next.add("isValueHealth");
                  else next.delete("isValueHealth");
                  setFlagOverrides(Array.from(next));
                }}
              />
              Value Health (20%)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={flagOverrides.includes("isValueLife")}
                onChange={(e) => {
                  const next = new Set(flagOverrides);
                  if (e.target.checked) next.add("isValueLife");
                  else next.delete("isValueLife");
                  setFlagOverrides(Array.from(next));
                }}
              />
              Value Life (20%)
            </label>
          </div>
        </label>
      ) : null}

      <button type="submit" style={{ padding: "10px 14px", width: 180 }}>
        Add rule
      </button>
    </form>
  );
}
