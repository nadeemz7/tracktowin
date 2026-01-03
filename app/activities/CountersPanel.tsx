"use client";

import { useEffect, useMemo, useState } from "react";

type Counter = { name: string; count: number };

type ServerActions = {
  setActivityCount: (formData: FormData) => Promise<void> | void;
  adjustActivityCount: (formData: FormData) => Promise<void> | void;
  addEmptyCounter: (formData: FormData) => Promise<void> | void;
  removeCounter: (formData: FormData) => Promise<void> | void;
};

export function CountersPanel({
  counters,
  available,
  personId,
  personName,
  date,
  actions,
}: {
  counters: Counter[];
  available: string[];
  personId: string;
  personName: string;
  date: string;
  actions: ServerActions;
}) {
  const storageKey = useMemo(() => `activity-order-${personId || personName}`, [personId, personName]);
  const hiddenKey = useMemo(() => `activity-hidden-${personId || personName}`, [personId, personName]);
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const ids = saved.split("|");
      if (ids.length) setTimeout(() => setOrder(ids), 0);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window !== "undefined" && order.length) {
      window.localStorage.setItem(storageKey, order.join("|"));
    }
  }, [order, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(hiddenKey);
    if (saved) {
      const ids = saved.split("|").filter(Boolean);
      if (ids.length) setTimeout(() => setHidden(ids), 0);
    }
  }, [hiddenKey]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(hiddenKey, hidden.join("|"));
    }
  }, [hidden, hiddenKey]);

  const orderedCounters = useMemo(() => {
    const visibleCounters = counters.filter((c) => !hidden.includes(c.name));
    const names = visibleCounters.map((c) => c.name);
    const merged = [...order.filter((n) => names.includes(n)), ...names.filter((n) => !order.includes(n))];
    return merged.map((name) => visibleCounters.find((c) => c.name === name)!).filter(Boolean);
  }, [counters, order, hidden]);

  function onDragStart(name: string) {
    setDragging(name);
  }
  function onDrop(name: string) {
    if (!dragging || dragging === name) return;
    const newOrder = orderedCounters.map((c) => c.name);
    const from = newOrder.indexOf(dragging);
    const to = newOrder.indexOf(name);
    newOrder.splice(from, 1);
    newOrder.splice(to, 0, dragging);
    setOrder(newOrder);
    setDragging(null);
  }

  const addable = available.filter((a) => hidden.includes(a) || !counters.some((c) => c.name === a));
  const [newName, setNewName] = useState(addable[0] || "");

  useEffect(() => {
    if (addable.length && !newName) {
      setTimeout(() => setNewName(addable[0]), 0);
    } else if (!addable.length) {
      setTimeout(() => setNewName(""), 0);
    }
  }, [addable, newName]);

  function removeFromCounter(name: string) {
    setHidden((prev) => Array.from(new Set([...prev, name])));
    setOrder((prev) => prev.filter((n) => n !== name));
  }

  function restoreToCounter(name: string) {
    setHidden((prev) => prev.filter((n) => n !== name));
  }

  return (
    <div className="surface" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800 }}>Counters for {date}</div>
          <div style={{ color: "#555" }}>Drag to reorder, click Set to update, or remove if not needed.</div>
        </div>
        {addable.length > 0 && (
          <form
            action={actions.addEmptyCounter}
            style={{ display: "flex", gap: 8, alignItems: "center" }}
            onSubmit={() => restoreToCounter(newName)}
          >
            <input type="hidden" name="personId" value={personId} />
            <input type="hidden" name="personName" value={personName} />
            <input type="hidden" name="activityDate" value={date} />
            <select name="activityName" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ padding: "8px 10px" }}>
              {addable.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button type="submit" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #283618", background: "#283618", color: "#f8f9fa" }}>
              Add counter
            </button>
          </form>
        )}
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {orderedCounters.map((a) => (
          <div
            key={a.name}
            draggable
            onDragStart={() => onDragStart(a.name)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(a.name)}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
              background: dragging === a.name ? "#f8f9fa" : "#fff",
              display: "grid",
              gap: 8,
              boxShadow: dragging === a.name ? "0 0 0 1px #283618" : undefined,
              cursor: "grab",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700 }}>{a.name}</div>
                <div style={{ color: "#555", fontSize: 12 }}>Count</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{a.count}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <form action={actions.setActivityCount} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input type="hidden" name="personId" value={personId} />
                <input type="hidden" name="personName" value={personName} />
                <input type="hidden" name="activityName" value={a.name} />
                <input type="hidden" name="activityDate" value={date} />
                <input
                  type="number"
                  name="value"
                  min={0}
                  defaultValue={a.count}
                  style={{ width: 80, padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: 8 }}
                />
                <button type="submit" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db" }}>
                  Set
                </button>
              </form>
              <form action={actions.adjustActivityCount} style={{ flex: 1 }}>
                <input type="hidden" name="personId" value={personId} />
                <input type="hidden" name="personName" value={personName} />
                <input type="hidden" name="activityName" value={a.name} />
                <input type="hidden" name="activityDate" value={date} />
                <input type="hidden" name="delta" value={-1} />
                <button type="submit" style={counterBtnStyle}>–</button>
              </form>
              <form action={actions.adjustActivityCount} style={{ flex: 1 }}>
                <input type="hidden" name="personId" value={personId} />
                <input type="hidden" name="personName" value={personName} />
                <input type="hidden" name="activityName" value={a.name} />
                <input type="hidden" name="activityDate" value={date} />
                <input type="hidden" name="delta" value={1} />
                <button type="submit" style={{ ...counterBtnStyle, background: "#283618", color: "#f8f9fa", borderColor: "#283618" }}>+</button>
              </form>
              <form action={actions.removeCounter} title="Remove this activity from counter">
                <input type="hidden" name="personId" value={personId} />
                <input type="hidden" name="personName" value={personName} />
                <input type="hidden" name="activityName" value={a.name} />
                <input type="hidden" name="activityDate" value={date} />
                <button
                  type="submit"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    color: "#b91c1c",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                  aria-label="Remove this activity from counter"
                  title="Remove this activity from counter"
                  onClick={() => removeFromCounter(a.name)}
                >
                  –
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      {addable.length > 0 && (
        <div style={{ position: "fixed", right: 22, bottom: 22, zIndex: 10 }}>
          <form
            action={actions.addEmptyCounter}
            style={{ display: "flex", gap: 8, alignItems: "center", background: "#fff", padding: "10px 12px", borderRadius: 12, border: "1px solid #d1d5db", boxShadow: "0 10px 30px rgba(0,0,0,0.12)" }}
            onSubmit={() => restoreToCounter(newName)}
          >
            <input type="hidden" name="personId" value={personId} />
            <input type="hidden" name="personName" value={personName} />
            <input type="hidden" name="activityDate" value={date} />
            <select name="activityName" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ padding: "8px 10px" }}>
              {addable.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button type="submit" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
              Add to counter
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const counterBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 0",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#f8f9fa",
  fontWeight: 700,
  fontSize: 18,
};
