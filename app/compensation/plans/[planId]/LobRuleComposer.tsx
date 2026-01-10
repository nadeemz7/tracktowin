"use client";

import { useMemo, useState } from "react";
import { CompApplyScope, CompPayoutType, CompTierBasis, CompTierMode } from "@prisma/client";

type Product = { id: string; name: string; usage: number };
type TierRow = { min: string; max: string; payout: string; payoutType: CompPayoutType };

export default function LobRuleComposer({
  lobName,
  products,
}: {
  lobName: string;
  products: Product[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [payoutType, setPayoutType] = useState<CompPayoutType>(CompPayoutType.FLAT_PER_APP);
  const [base, setBase] = useState<string>("0");
  const [minThreshold, setMinThreshold] = useState<string>("");
  const [basis, setBasis] = useState<CompTierBasis | "">(CompTierBasis.APP_COUNT);
  const [tiers, setTiers] = useState<TierRow[]>([]);

  const addTier = () =>
    setTiers((t) => [
      ...t,
      {
        min: "",
        max: "",
        payout: "",
        payoutType:
          payoutType === CompPayoutType.PERCENT_OF_PREMIUM ? CompPayoutType.PERCENT_OF_PREMIUM : CompPayoutType.FLAT_PER_APP,
      },
    ]);

  const removeTier = (idx: number) => setTiers((t) => t.filter((_, i) => i !== idx));
  const clearSelected = () => setSelected([]);
  const clearTiers = () => setTiers([]);

  const summary = useMemo(() => {
    const prodLabel = selected.length ? `${selected.length} product(s)` : "product(s)";
    const baseLabel = fmtPayout(base || 0, payoutType);
    const gatePhrase = minThreshold ? `Requires ${basisLabel(basis)} ≥ ${minThreshold} to unlock. ` : "";
    const names = selected
      .slice(0, 3)
      .map((id) => products.find((p) => p.id === id)?.name)
      .filter(Boolean);
    const nameDetail = names.length ? ` (${names.join(", ")}${selected.length > names.length ? ", …" : ""})` : "";
    return `${gatePhrase}If ${prodLabel}${nameDetail} then pay ${baseLabel}`;
  }, [selected, base, payoutType, minThreshold, basis, products]);

  const tierMode = tiers.length ? CompTierMode.TIERS : CompTierMode.NONE;
  const hasValidTier = tiers.some((t) => {
    const min = Number(t.min);
    const payout = Number(t.payout);
    return t.min !== "" && t.payout !== "" && !Number.isNaN(min) && !Number.isNaN(payout);
  });
  const tieredMissingValid = tierMode === CompTierMode.TIERS && !hasValidTier;

  const tierSentence =
    tiers.length
      ? tiers
          .filter((t) => t.min !== "" || t.max !== "" || t.payout !== "")
          .map((t) => {
            const range =
              t.min && t.max
                ? `${t.min}-${t.max}`
                : t.min && !t.max
                  ? `${t.min}+`
                  : !t.min && t.max
                    ? `≤${t.max}`
                    : "any";
            const rangeLabel = range === "any" ? `any ${basisLabel(basis)}` : `${range} ${basisLabel(basis)}`;

            const payoutLabel =
              t.payoutType === CompPayoutType.PERCENT_OF_PREMIUM
                ? `${fmtPercent(t.payout)} of premium`
                : t.payoutType === CompPayoutType.FLAT_PER_APP
                  ? `${fmtMoney(t.payout)}/app`
                  : fmtPayout(t.payout, t.payoutType);

            const verb = t.payoutType === CompPayoutType.PERCENT_OF_PREMIUM ? "pays" : "pay";
            return `${rangeLabel} ${verb} ${payoutLabel}`;
          })
          .join("; ")
      : "";

  const tierProblems = useMemo(() => {
    const issues: string[] = [];
    const parsed = tiers
      .map((t, idx) => ({
        idx: idx + 1,
        min: t.min === "" ? -Infinity : Number(t.min),
        max: t.max === "" ? Infinity : Number(t.max),
      }))
      .filter((t) => !Number.isNaN(t.min) && !Number.isNaN(t.max))
      .sort((a, b) => a.min - b.min);

    for (let i = 1; i < parsed.length; i++) {
      const prev = parsed[i - 1];
      const curr = parsed[i];
      if (prev.max >= curr.min) {
        issues.push(
          `Tier ${prev.idx} (${prev.min}–${prev.max === Infinity ? "∞" : prev.max}) overlaps Tier ${curr.idx} (${curr.min}–${curr.max === Infinity ? "∞" : curr.max}).`
        );
      }
    }
    return issues;
  }, [tiers]);
  const allProducts = products;

  return (
    <div
      style={{
        border: "1px dashed #cbd5e1",
        borderRadius: 12,
        padding: 14,
        background: "#f8fafc",
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 4 }}>Quick rule for {lobName}</div>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 6 }}>
        Guided steps: pick scope → payout/gate → tiers → review sentence.
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Step 1: Name</span>
          <input name="name" placeholder={`Rule for ${lobName}`} style={{ padding: 10 }} required />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span>Step 2: Payout type</span>
          <select
            name="payoutType"
            value={payoutType}
            onChange={(e) => setPayoutType(e.target.value as CompPayoutType)}
            style={{ padding: 10 }}
          >
            <option value={CompPayoutType.FLAT_PER_APP}>Flat $ per app</option>
            <option value={CompPayoutType.PERCENT_OF_PREMIUM}>% of premium</option>
            <option value={CompPayoutType.FLAT_LUMP_SUM}>Flat lump sum</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span>Base value</span>
          <input
            name="basePayoutValue"
            type="number"
            step="0.01"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            style={{ padding: 10 }}
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span>Gate (optional)</span>
          <input
            name="minThreshold"
            type="number"
            step="0.01"
            placeholder="Optional"
            value={minThreshold}
            onChange={(e) => setMinThreshold(e.target.value)}
            style={{ padding: 10 }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12, color: "#475569", marginTop: 4 }}>
            <button type="button" className="btn" onClick={() => setMinThreshold("")} style={{ padding: "4px 8px" }}>
              No gate
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setMinThreshold(basis === CompTierBasis.APP_COUNT ? "20" : "1000")}
              style={{ padding: "4px 8px" }}
            >
              Quick gate ({basis === CompTierBasis.APP_COUNT ? "20 apps" : "1000 premium"})
            </button>
          </div>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span>Tiered on</span>
          <select
            name="tierBasis"
            value={basis}
            onChange={(e) => setBasis(e.target.value as CompTierBasis | "")}
            style={{ padding: 10 }}
          >
            <option value="">(none)</option>
            <option value={CompTierBasis.APP_COUNT}>Apps</option>
            <option value={CompTierBasis.PREMIUM_SUM}>Premium</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div
            style={{
              fontWeight: 700,
              marginBottom: 6,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Step 3: Pick products</span>
            <button type="button" className="btn" onClick={clearSelected} style={{ padding: "4px 8px" }}>
              Clear
            </button>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id && !selected.includes(id)) setSelected((s) => [...s, id]);
            }}
            style={{
              minHeight: 120,
              border: "1px dashed #cbd5e1",
              borderRadius: 12,
              padding: 10,
              display: "grid",
              gap: 6,
              background: "#fff",
            }}
          >
            {selected.length === 0 ? <div style={{ color: "#94a3b8" }}>Drag or click products to add</div> : null}
            {selected.map((pid) => {
              const p = products.find((p) => p.id === pid);
              if (!p) return null;
              return (
                <div
                  key={pid}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "#d1fae5",
                    border: "1px solid #22c55e",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{p.name}</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSelected((s) => s.filter((x) => x !== pid))}
                    style={{ padding: "4px 8px" }}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Product list (drag or click)</div>
          <div
            style={{
              display: "grid",
              gap: 6,
              maxHeight: 200,
              overflowY: "auto",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))",
            }}
          >
            {allProducts.map((p) => {
              const isSelected = selected.includes(p.id);
              const isUsed = p.usage > 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  draggable={!isSelected}
                  onDragStart={(e) => {
                    if (isSelected) return;
                    e.dataTransfer.setData("text/plain", p.id);
                  }}
                  onClick={() => !isSelected && setSelected((s) => [...s, p.id])}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: isSelected ? "1px solid #facc15" : "1px solid #e5e7eb",
                    background: isSelected ? "#fef9c3" : isUsed ? "#d1fae5" : "#f8fafc",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: isSelected ? "default" : "grab",
                  }}
                >
                  <span>{p.name}</span>
                  <span style={{ fontSize: 12, color: isSelected ? "#a16207" : "#475569" }}>
                    {isSelected ? "Selected" : `${p.usage} use(s)`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Step 4: Tiers / caps (optional)</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", fontWeight: 600 }}>
              <span>Tier range</span>
              <select value={basis} onChange={(e) => setBasis(e.target.value as CompTierBasis | "")} style={{ padding: "4px 8px" }}>
                <option value="">(none)</option>
                <option value={CompTierBasis.APP_COUNT}>Apps</option>
                <option value={CompTierBasis.PREMIUM_SUM}>Premium</option>
              </select>
            </label>
            {tiers.length ? (
              <button type="button" className="btn" onClick={clearTiers} style={{ padding: "4px 8px" }}>
                Clear tiers
              </button>
            ) : null}
          </div>
        </div>

        {tiers.map((t, idx) => (
          <div
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(120px,1fr)) auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              name="tierMin"
              value={t.min}
              onChange={(e) => setTiers((rows) => rows.map((row, i) => (i === idx ? { ...row, min: e.target.value } : row)))}
              placeholder="Min"
              type="number"
              step="0.01"
              style={{ padding: 8 }}
            />
            <input
              name="tierMax"
              value={t.max}
              onChange={(e) => setTiers((rows) => rows.map((row, i) => (i === idx ? { ...row, max: e.target.value } : row)))}
              placeholder="Max"
              type="number"
              step="0.01"
              style={{ padding: 8 }}
            />
            <input
              name="tierPayout"
              value={t.payout}
              onChange={(e) => setTiers((rows) => rows.map((row, i) => (i === idx ? { ...row, payout: e.target.value } : row)))}
              placeholder="Payout"
              type="number"
              step="0.01"
              style={{ padding: 8 }}
            />
            <select
              name="tierPayoutType"
              value={t.payoutType}
              onChange={(e) =>
                setTiers((rows) => rows.map((row, i) => (i === idx ? { ...row, payoutType: e.target.value as CompPayoutType } : row)))
              }
              style={{ padding: 8 }}
            >
              <option value={CompPayoutType.FLAT_PER_APP}>$ per app</option>
              <option value={CompPayoutType.PERCENT_OF_PREMIUM}>% of premium</option>
            </select>
            <button type="button" className="btn" onClick={() => removeTier(idx)} style={{ padding: "6px 10px" }}>
              Remove
            </button>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={addTier}>
            + Add tier
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: "#fff", border: "1px solid #e2e8f0" }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Rule sentence</div>
        <div style={{ color: "#111827" }}>
          {summary}
          {tierSentence ? ` | ${tierSentence}` : ""}
        </div>
        <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>Matches the simple sentence style from your mock.</div>

        {tierProblems.length ? (
          <div
            style={{
              marginTop: 6,
              color: "#b45309",
              fontSize: 12,
              background: "#fef3c7",
              border: "1px solid #fcd34d",
              borderRadius: 8,
              padding: "6px 8px",
            }}
          >
            {tierProblems.map((p, i) => (
              <div key={i}>• {p} Set a max on earlier tiers so later tiers start after the previous max.</div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Hidden fields for server action */}
      <input type="hidden" name="applyScope" value={CompApplyScope.PRODUCT} />
      <input type="hidden" name="tierMode" value={tierMode} />
      <input type="hidden" name="bucketId" value="" />
      <input type="hidden" name="primaryProductId" value={selected[0] || ""} />
      <input type="hidden" name="tierBasis" value={basis} />

      {selected.map((pid) => (
        <input key={pid} type="hidden" name="productIds" value={pid} />
      ))}

      {tiers.map((t, idx) => (
        <div key={`hidden-${idx}`}>
          <input type="hidden" name="tierMin" value={t.min} />
          <input type="hidden" name="tierMax" value={t.max} />
          <input type="hidden" name="tierPayout" value={t.payout} />
          <input type="hidden" name="tierPayoutType" value={t.payoutType} />
        </div>
      ))}

      <div style={{ marginTop: 12, fontSize: 13, color: "#0f172a" }}>
        <strong>Statement:</strong> {summary}
        {tierSentence ? ` | ${tierSentence}` : ""}
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button type="submit" className="btn primary" disabled={tieredMissingValid}>
          Save rule
        </button>
        {tieredMissingValid ? (
          <div style={{ color: "#b45309", fontSize: 12, alignSelf: "center" }}>
            Add at least one tier to save a tiered rule.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function basisLabel(b: CompTierBasis | "") {
  if (b === CompTierBasis.APP_COUNT) return "apps";
  if (b === CompTierBasis.PREMIUM_SUM) return "premium";
  return "basis";
}

function fmtMoney(n: string | number): string {
  const num = Number(n);
  if (Number.isNaN(num)) return "$0";
  return `$${num.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtPercent(n: string | number): string {
  const num = Number(n);
  if (Number.isNaN(num)) return "0%";
  return `${num.toFixed(2)}%`;
}

function fmtPayout(value: string | number, payoutType: CompPayoutType): string {
  if (payoutType === CompPayoutType.FLAT_PER_APP) return `${fmtMoney(value)}/app`;
  if (payoutType === CompPayoutType.PERCENT_OF_PREMIUM) return `${fmtPercent(value)} of premium`;
  if (payoutType === CompPayoutType.FLAT_LUMP_SUM) return `${fmtMoney(value)} lump sum`;
  return String(value);
}
