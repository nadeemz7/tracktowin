"use client";

type ProductRow = { id: string; name: string; usage: number; lobName?: string };

export default function ProductSidebarClient({ products, lobName }: { products: ProductRow[]; lobName?: string }) {
  const filtered = lobName ? products.filter((p) => p.lobName === lobName) : products;
  return (
    <div style={{ borderLeft: "1px solid #e5e7eb", paddingLeft: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>Product list (drag / usage)</div>
      <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 6 }}>Drag any item into a rule area to add it.</div>
      <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", maxHeight: 420, overflowY: "auto" }}>
        {filtered.map((p) => {
          const used = p.usage || 0;
          return (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
              style={{
                padding: "6px 8px",
                borderRadius: 8,
                background: used ? "#d1fae5" : "#f8fafc",
                border: "1px solid #e5e7eb",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "grab",
              }}
            >
              <span>{p.name}</span>
              <span style={{ fontSize: 12, color: "#0f172a" }}>{used} use(s)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
