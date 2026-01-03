"use client";

import { useMemo, useState } from "react";
import { CompBonusType, CompRewardType, PremiumCategory } from "@prisma/client";

type Product = { id: string; name: string; usage: number };
type Condition = { id: string; field: string; op: string; value: string };
type Reward = {
  id: string;
  type: CompRewardType;
  percent?: string;
  dollar?: string;
  bucketId?: string;
  premiumCategory?: PremiumCategory;
  isPenalty?: boolean;
};

export default function BonusComposer({
  products,
  buckets,
}: {
  products: Product[];
  buckets: { id: string; name: string }[];
}) {
  const [type, setType] = useState<CompBonusType>(CompBonusType.SCORECARD_TIER);
  const [name, setName] = useState<string>("Bonus");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([
    { id: crypto.randomUUID(), type: CompRewardType.ADD_FLAT_DOLLARS, dollar: "0", isPenalty: false },
  ]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const addCondition = () => setConditions((c) => [...c, { id: crypto.randomUUID(), field: "apps", op: ">=", value: "0" }]);
  const removeCondition = (id: string) => setConditions((c) => c.filter((x) => x.id !== id));

  const addReward = () =>
    setRewards((r) => [
      ...r,
      {
        id: crypto.randomUUID(),
        type: CompRewardType.ADD_FLAT_DOLLARS,
        dollar: "0",
        isPenalty: type === CompBonusType.CUSTOM, // custom often used for subtractors
      },
    ]);
  const removeReward = (id: string) => setRewards((r) => r.filter((x) => x.id !== id));

  const summary = useMemo(() => {
    const condText = conditions.length
      ? conditions.map((c) => `${labelForField(c.field)} ${c.op} ${c.value}`).join(" AND ")
      : "No conditions yet";
    const rewardText = rewards
      .map((r) => {
        const sign = r.isPenalty ? "−" : "+";
        if (r.type === CompRewardType.ADD_FLAT_DOLLARS) return `${sign}$${r.dollar || 0}`;
        if (r.type === CompRewardType.ADD_PERCENT_OF_BUCKET) return `${sign}${r.percent || 0}% of ${bucketLabel(r, buckets)}`;
        return `${sign}x${r.percent || 1} multiplier`;
      })
      .join(" + ");
    return `${condText} => ${rewardText}`;
  }, [conditions, rewards, buckets]);

  return (
    <div style={{ border: "1px dashed #cbd5e1", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 800 }}>New Bonus / Scorecard / Subtractor</div>
      </div>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginTop: 10 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Type</span>
          <div style={{ display: "grid", gap: 6 }}>
            <select value={type} onChange={(e) => setType(e.target.value as CompBonusType)} className="select">
              <option value={CompBonusType.SCORECARD_TIER}>Scorecard</option>
              <option value={CompBonusType.GOAL_BONUS}>Bonus</option>
              <option value={CompBonusType.CUSTOM}>Custom / Subtractor</option>
            </select>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Scorecard = tiers, Bonus = reward, Custom/Subtractor = penalty or special logic.
            </span>
          </div>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </label>
      </div>

      <div style={{ marginTop: 12, fontWeight: 700 }}>Conditions</div>
      <div style={{ display: "grid", gap: 8 }}>
        {conditions.map((c) => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 6, alignItems: "center" }}>
            <select
              className="select"
              value={c.field}
              onChange={(e) => setConditions((list) => list.map((row) => (row.id === c.id ? { ...row, field: e.target.value } : row)))}
            >
              <option value="apps">Total apps</option>
              <option value="premium">Total premium</option>
              <option value="activity">Activity total</option>
            </select>
            <select
              className="select"
              value={c.op}
              onChange={(e) => setConditions((list) => list.map((row) => (row.id === c.id ? { ...row, op: e.target.value } : row)))}
            >
              <option value=">=">&gt;=</option>
              <option value="<=">&lt;=</option>
              <option value="=">=</option>
            </select>
            <input
              className="input"
              value={c.value}
              onChange={(e) => setConditions((list) => list.map((row) => (row.id === c.id ? { ...row, value: e.target.value } : row)))}
              placeholder="Value"
            />
            <button className="btn" type="button" onClick={() => removeCondition(c.id)} style={{ padding: "6px 10px" }}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn" type="button" onClick={addCondition} style={{ width: "fit-content" }}>
          + Add condition
        </button>
      </div>

      <div style={{ marginTop: 16, fontWeight: 800 }}>Rewards</div>
      <div style={{ display: "grid", gap: 8 }}>
        {rewards.map((r) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 8,
              alignItems: "center",
              background: "#fff",
              padding: 8,
              borderRadius: 10,
              border: "1px solid #e2e8f0",
            }}
          >
            <select
              className="select"
              value={r.type}
              onChange={(e) =>
                setRewards((list) =>
                  list.map((row) =>
                    row.id === r.id
                      ? { ...row, type: e.target.value as CompRewardType, percent: "", dollar: "", bucketId: "", premiumCategory: undefined }
                      : row
                  )
                )
              }
            >
              <option value={CompRewardType.ADD_FLAT_DOLLARS}>Flat $</option>
              <option value={CompRewardType.ADD_PERCENT_OF_BUCKET}>% of bucket</option>
              <option value={CompRewardType.MULTIPLIER}>Multiplier</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
              <input
                type="checkbox"
                checked={r.isPenalty || false}
                onChange={(e) => setRewards((list) => list.map((row) => (row.id === r.id ? { ...row, isPenalty: e.target.checked } : row)))}
              />
              Subtractor (penalty)
            </label>

            {r.type === CompRewardType.ADD_FLAT_DOLLARS ? (
              <input
                className="input"
                type="number"
                step="0.01"
                value={r.dollar || ""}
                placeholder="Amount"
                onChange={(e) => setRewards((list) => list.map((row) => (row.id === r.id ? { ...row, dollar: e.target.value } : row)))}
              />
            ) : (
              <input
                className="input"
                type="number"
                step="0.01"
                value={r.percent || ""}
                placeholder="%"
                onChange={(e) => setRewards((list) => list.map((row) => (row.id === r.id ? { ...row, percent: e.target.value } : row)))}
              />
            )}

            {r.type === CompRewardType.ADD_PERCENT_OF_BUCKET ? (
              <select
                className="select"
                value={r.bucketId}
                onChange={(e) => setRewards((list) => list.map((row) => (row.id === r.id ? { ...row, bucketId: e.target.value } : row)))}
              >
                <option value="">Select bucket</option>
                {buckets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="select"
                value={r.premiumCategory || ""}
                onChange={(e) =>
                  setRewards((list) =>
                    list.map((row) => (row.id === r.id ? { ...row, premiumCategory: (e.target.value as PremiumCategory) || undefined } : row))
                  )
                }
              >
                <option value="">Any category</option>
                <option value={PremiumCategory.PC}>PC</option>
                <option value={PremiumCategory.FS}>FS</option>
                <option value={PremiumCategory.IPS}>IPS</option>
              </select>
            )}

            <button className="btn" type="button" onClick={() => removeReward(r.id)} style={{ padding: "6px 10px" }}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn" type="button" onClick={addReward} style={{ width: "fit-content" }}>
          + Add reward
        </button>
      </div>

      <div style={{ marginTop: 16, fontWeight: 800 }}>Products (drag/click to associate)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (id && !selectedProducts.includes(id)) setSelectedProducts((s) => [...s, id]);
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
          {selectedProducts.length === 0 ? <div style={{ color: "#94a3b8" }}>Drag or click products to add</div> : null}
          {selectedProducts.map((pid) => {
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
                <span style={{ fontSize: 12, color: "#0f172a" }}>{p.usage} use(s)</span>
                <button type="button" className="btn" onClick={() => setSelectedProducts((s) => s.filter((x) => x !== pid))} style={{ padding: "4px 8px" }}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Product list</div>
          <div style={{ display: "grid", gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                onClick={() => !selectedProducts.includes(p.id) && setSelectedProducts((s) => [...s, p.id])}
                style={{
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  cursor: "grab",
                }}
              >
                <span>{p.name}</span>
                <span style={{ fontSize: 12, color: "#475569" }}>{p.usage} use(s)</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 13, color: "#0f172a" }}>
        <strong>Statement:</strong> {summary}
      </div>
    </div>
  );
}

function labelForField(f: string) {
  if (f === "apps") return "Total apps";
  if (f === "premium") return "Total premium";
  if (f === "activity") return "Activity total";
  return f;
}

function bucketLabel(r: Reward, buckets: { id: string; name: string }[]) {
  if (!r.bucketId) return "bucket";
  return buckets.find((b) => b.id === r.bucketId)?.name || "bucket";
}
