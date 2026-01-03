"use client";

import { useState } from "react";

type PlanLite = { id: string; name: string };
type PersonLite = { id: string; name: string };

export default function AssignDragBoard({ plans, people }: { plans: PlanLite[]; people: PersonLite[] }) {
  const [pool, setPool] = useState<PersonLite[]>(people);
  const [status, setStatus] = useState<string>("");

  const assign = async (planId: string, personId: string) => {
    setStatus("Assigning...");
    try {
      const res = await fetch("/api/compensation/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, personId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setPool((p) => p.filter((x) => x.id !== personId));
      setStatus("Assigned! Refresh to see updated counts.");
    } catch {
      setStatus("Assignment failed. Please try again.");
    }
  };

  return (
    <div className="surface" style={{ padding: 16, borderRadius: 12 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Drag team members into a plan</div>
      <div style={{ color: "#6b7280", marginBottom: 8, fontSize: 13 }}>Drag a chip onto a plan card to assign. This creates a Person assignment.</div>
      {status ? <div style={{ fontSize: 12, color: "#0f172a", marginBottom: 8 }}>{status}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ border: "1px dashed #e2e8f0", borderRadius: 10, padding: 10, minHeight: 140 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Unassigned</div>
          {pool.length === 0 ? (
            <div style={{ color: "#6b7280" }}>All assigned.</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {pool.map((p) => (
                <span
                  key={p.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", p.id);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "#eef2ff",
                    color: "#312e81",
                    fontWeight: 700,
                    border: "1px solid #c7d2fe",
                    cursor: "grab",
                  }}
                  title="Drag to a plan"
                >
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const personId = e.dataTransfer.getData("text/plain");
                if (personId) assign(plan.id, personId);
              }}
              style={{
                border: "1px dashed #cbd5e1",
                borderRadius: 10,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 800 }}>{plan.name}</div>
              <div style={{ color: "#6b7280", fontSize: 12 }}>Drop here to assign</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
