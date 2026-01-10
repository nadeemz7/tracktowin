"use client";

import { useState } from "react";

type PlanLite = { id: string; name: string; assignedCount: number; assignedPeople: PersonLite[]; effectiveStartMonth: string | null };
type PersonLite = { id: string; name: string };

export default function AssignDragBoard({ plans, people }: { plans: PlanLite[]; people: PersonLite[] }) {
  const [pool, setPool] = useState<PersonLite[]>(people);
  const [status, setStatus] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [planCounts, setPlanCounts] = useState<Record<string, number>>(() =>
    plans.reduce((acc, plan) => {
      acc[plan.id] = plan.assignedCount ?? 0;
      return acc;
    }, {} as Record<string, number>)
  );
  const [assignedByPlan, setAssignedByPlan] = useState<Record<string, PersonLite[]>>(() =>
    plans.reduce((acc, plan) => {
      acc[plan.id] = plan.assignedPeople ?? [];
      return acc;
    }, {} as Record<string, PersonLite[]>)
  );

  const assign = async (planId: string, personId: string) => {
    if (isAssigning) return;
    const assignedPerson = pool.find((p) => p.id === personId);
    setIsAssigning(true);
    setStatus("Assigning...");
    try {
      const res = await fetch("/api/compensation/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, personId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { planCounts?: Record<string, number>; assignedByPlan?: Record<string, PersonLite[]> };
      setPool((p) => p.filter((x) => x.id !== personId));
      if (data?.planCounts) {
        const nextCounts: Record<string, number> = {};
        plans.forEach((plan) => {
          nextCounts[plan.id] = data.planCounts?.[plan.id] ?? 0;
        });
        setPlanCounts(nextCounts);
      }
      if (data?.assignedByPlan) {
        const nextAssigned: Record<string, PersonLite[]> = {};
        plans.forEach((plan) => {
          nextAssigned[plan.id] = data.assignedByPlan?.[plan.id] ?? [];
        });
        setAssignedByPlan(nextAssigned);
      } else if (assignedPerson) {
        setAssignedByPlan((prev) => {
          const next: Record<string, PersonLite[]> = {};
          plans.forEach((plan) => {
            next[plan.id] = (prev[plan.id] ?? []).filter((p) => p.id !== personId);
          });
          next[planId] = [...(next[planId] ?? []), assignedPerson];
          return next;
        });
      }
      setStatus("Assigned.");
    } catch {
      setStatus("Assignment failed. Please try again.");
    } finally {
      setIsAssigning(false);
    }
  };

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const planCards = plans.map((plan) => {
    const isFuture = plan.effectiveStartMonth ? plan.effectiveStartMonth > currentMonthKey : false;
    return (
      <div
        key={plan.id}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (isAssigning) return;
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
        <div style={{ color: "#111", fontSize: 12 }}>Assigned: {planCounts[plan.id] ?? 0}</div>
        <div style={{ color: "#6b7280", fontSize: 12 }}>Effective: {plan.effectiveStartMonth || "Current"}</div>
        {isFuture ? <div style={{ color: "#b91c1c", fontSize: 12 }}>Starts in the future</div> : null}
        {assignedByPlan[plan.id]?.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {assignedByPlan[plan.id].map((person) => (
              <span
                key={person.id}
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "#eef2ff",
                  color: "#312e81",
                  fontWeight: 700,
                  border: "1px solid #c7d2fe",
                  fontSize: 11,
                }}
              >
                {person.name}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>No one assigned</div>
        )}
        <div style={{ color: "#6b7280", fontSize: 12 }}>Drop here to assign</div>
      </div>
    );
  });

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
          {planCards}
        </div>
      </div>
    </div>
  );
}
