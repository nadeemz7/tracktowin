"use client";

import { useMemo, useState, useTransition } from "react";

type ComponentItem = {
  id: string;
  name: string;
  componentType: string;
  config: unknown;
};

type Props = {
  planId: string;
  components: ComponentItem[];
  reorderAction: (input: { planId: string; orderedIds: string[] }) => Promise<void>;
  moveAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

function describeComponent(component: ComponentItem) {
  const cfg = (component.config || {}) as Record<string, unknown>;
  const bucket = typeof cfg.bucket === "string" ? `Bucket: ${cfg.bucket}` : "";

  if (component.componentType === "FLAT_PER_APP") {
    const rate = typeof cfg.ratePerApp === "number" ? cfg.ratePerApp : null;
    return [bucket, rate !== null ? `Rate: $${rate} per app` : ""].filter(Boolean).join(" • ");
  }
  if (component.componentType === "TIERED_PER_APP" && Array.isArray(cfg.tiers)) {
    const tiers = cfg.tiers
      .map((raw) => {
        const t = raw as Record<string, unknown>;
        const min = typeof t.min === "number" ? t.min : 0;
        const maxValue = typeof t.max === "number" ? t.max : undefined;
        const rate = typeof t.ratePerApp === "number" ? t.ratePerApp : null;
        const maxLabel = maxValue === undefined ? "+" : maxValue;
        return `${min}-${maxLabel}: $${rate ?? "?"}`;
      })
      .join(", ");
    return [bucket, `Tiers: ${tiers}`].filter(Boolean).join(" • ");
  }
  if (component.componentType === "PERCENT_FLAT") {
    const percent = typeof cfg.percent === "number" ? cfg.percent : null;
    return [bucket, percent !== null ? `Rate: ${(percent * 100).toFixed(2)}%` : ""].filter(Boolean).join(" • ");
  }
  if (component.componentType === "PERCENT_TIER" && Array.isArray(cfg.tiers)) {
    const tiers = cfg.tiers
      .map((raw) => {
        const t = raw as Record<string, unknown>;
        const min = typeof t.min === "number" ? t.min : 0;
        const maxValue = typeof t.max === "number" ? t.max : undefined;
        const percent = typeof t.percent === "number" ? t.percent : null;
        const maxLabel = maxValue === undefined ? "+" : maxValue;
        return `${min}-${maxLabel}: ${percent !== null ? (percent * 100).toFixed(2) : "?"}%`;
      })
      .join(", ");

    const overrides =
      Array.isArray(cfg.flagOverrides) && cfg.flagOverrides.length
        ? `Overrides: ${cfg.flagOverrides
            .map((raw) => {
              const o = raw as Record<string, unknown>;
              const field = typeof o.flagField === "string" ? o.flagField : "?";
              const percent = typeof o.percent === "number" ? o.percent : null;
              return `${field}: ${percent !== null ? (percent * 100).toFixed(0) : "?"}%`;
            })
            .join(", ")}`
        : "";

    return [bucket, `Tiers: ${tiers}`, overrides].filter(Boolean).join(" • ");
  }
  if (component.componentType === "ACTIVITY_PAY" && Array.isArray(cfg.activities)) {
    const acts = cfg.activities
      .map((raw) => {
        const a = raw as Record<string, unknown>;
        const name = typeof a.activityName === "string" ? a.activityName : "Activity";
        const amount = typeof a.amount === "number" ? a.amount : null;
        return `${name}: $${amount ?? "?"}`;
      })
      .join(", ");
    return acts;
  }
  return bucket || component.componentType;
}

export function ComponentsListClient({ planId, components, reorderAction, moveAction, deleteAction }: Props) {
  const [items, setItems] = useState<ComponentItem[]>(components);
  const [dragId, setDragId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dragStyles = useMemo(
    () => ({
      opacity: dragId ? 0.9 : 1,
      cursor: "grab",
    }),
    [dragId]
  );

  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, targetId: string) {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;

    const currentIdx = items.findIndex((i) => i.id === dragId);
    const targetIdx = items.findIndex((i) => i.id === targetId);
    if (currentIdx === -1 || targetIdx === -1) return;

    const newItems = [...items];
    const [moved] = newItems.splice(currentIdx, 1);
    newItems.splice(targetIdx, 0, moved);
    setItems(newItems);
  }

  function handleDrop() {
    if (!dragId) return;
    setDragId(null);
    const orderedIds = items.map((i) => i.id);
    startTransition(() => reorderAction({ planId, orderedIds }));
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {items.map((c, idx) => (
        <div
          key={c.id}
          draggable
          onDragStart={() => handleDragStart(c.id)}
          onDragOver={(e) => handleDragOver(e, c.id)}
          onDrop={handleDrop}
          style={{
            border: "1px solid #e9e9e9",
            borderRadius: 8,
            padding: 8,
            background: dragId === c.id ? "#eef3ff" : "#fff",
            ...dragStyles,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>{c.name}</div>
            <span style={{ fontSize: 12, color: "#555", padding: "2px 6px", border: "1px solid #dcdfe6", borderRadius: 12 }}>
              {c.componentType}
            </span>
            <span style={{ fontSize: 12, color: "#777" }}>#{idx + 1}</span>
            <span style={{ fontSize: 12, color: isPending ? "#777" : "#888" }}>
              {dragId ? "Drop to reorder" : ""}
            </span>
          </div>
          <div style={{ color: "#444", marginTop: 4 }}>{describeComponent(c) || "Configurable rule"}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <form action={moveAction}>
              <input type="hidden" name="componentId" value={c.id} />
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="direction" value="up" />
              <button disabled={idx === 0} style={{ padding: "6px 10px" }}>
                ↑
              </button>
            </form>
            <form action={moveAction}>
              <input type="hidden" name="componentId" value={c.id} />
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="direction" value="down" />
              <button disabled={idx === items.length - 1} style={{ padding: "6px 10px" }}>
                ↓
              </button>
            </form>
            <form action={deleteAction} style={{ marginLeft: "auto" }}>
              <input type="hidden" name="componentId" value={c.id} />
              <button style={{ padding: "6px 10px", background: "#fce8e8", border: "1px solid #f5c2c2" }}>
                Delete
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
