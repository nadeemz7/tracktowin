"use client";

import { usePlanBuilderSelectionStore } from "./AdvancedRuleBlockModalClient";

type ProductRow = { id: string; name: string; usage: number; lobName?: string };

export default function ProductSidebarClient({
  products,
  lobName,
  selectedIds,
}: {
  products: ProductRow[];
  lobName?: string;
  selectedIds?: string[];
}) {
  const filtered = lobName ? products.filter((p) => p.lobName === lobName) : products;
  const selectionStore = usePlanBuilderSelectionStore();
  const selectedSet = new Set(selectedIds || selectionStore?.selectedIds || []);
  return (
    <div style={{ borderLeft: "1px solid #e5e7eb", paddingLeft: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>Product list (drag / usage)</div>
      <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 6 }}>Drag any item into a rule area to add it.</div>
      <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", maxHeight: 420, overflowY: "auto" }}>
        {filtered.map((p) => {
          const used = p.usage || 0;
          const isSelected = selectedSet.has(p.id);
          return (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                background: isSelected ? "#e0f2fe" : used ? "#d1fae5" : "#f8fafc",
                border: isSelected ? "1px solid #38bdf8" : "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "grab",
              }}
            >
              <span>{p.name}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#0f172a" }}>{used} use(s)</span>
                {isSelected ? (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#0c4a6e",
                      background: "#bae6fd",
                      borderRadius: 999,
                      padding: "2px 6px",
                    }}
                  >
                    Selected
                  </span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
