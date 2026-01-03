"use client";

import { useEffect, useMemo, useState } from "react";

type Person = {
  id: string;
  fullName: string;
  teamType: string | null;
  primaryAgencyId?: string | null;
  agencyLabel?: string | null;
  agencyOwner?: string | null;
};

async function fetchJSON<T>(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Request failed");
  return (await res.json()) as T;
}

export function ImpersonationBar() {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [current, setCurrent] = useState<Person | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // hydrate current impersonation + initial list
    fetchJSON<{ person: Person | null }>("/api/admin/impersonate")
      .then((data) => setCurrent(data.person ?? null))
      .catch(() => setCurrent(null));

    loadPeople("");
  }, []);

  async function loadPeople(q: string) {
    setLoading(true);
    try {
      const data = await fetchJSON<{ people: Person[] }>(`/api/admin/people${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setPeople(Array.isArray(data?.people) ? data.people : []);
    } catch {
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }

  async function setImpersonation(target: Person | null) {
    try {
      if (target?.id) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("ttw_impersonating", "1");
        }
        const res = await fetch("/api/admin/impersonate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId: target.id }),
        });
        if (!res.ok) throw new Error("Failed to set impersonation");
        setCurrent(target);
      } else {
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("ttw_impersonating");
        }
        const res = await fetch("/api/admin/impersonate", { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to clear impersonation");
        setCurrent(null);
      }
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Unable to switch view right now. Please try again.");
    }
  }

  const filtered = useMemo(() => {
    const pool = Array.isArray(people) ? people : [];
    if (!query.trim()) return pool.slice(0, 8);
    const q = query.toLowerCase();
    return pool
      .filter((p) => {
        const owner = p.agencyOwner?.toLowerCase() || "";
        const agency = p.agencyLabel?.toLowerCase() || "";
        return p.fullName.toLowerCase().includes(q) || agency.includes(q) || owner.includes(q);
      })
      .slice(0, 8);
  }, [people, query]);

  const summary = current
    ? `Admin (admin) viewing as ${current.fullName}`
    : "Admin (admin) not impersonating";

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: "8px 10px",
        background: "#f8fafc",
        minWidth: 280,
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, cursor: "pointer" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <div style={{ fontWeight: 700, fontSize: 13 }}>View as (admin)</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>{collapsed ? "Expand" : "Collapse"}</div>
      </div>

      {collapsed ? (
        <div style={{ fontSize: 12, color: "#374151" }}>{summary}</div>
      ) : (
        <>
          {current ? (
            <div style={{ marginBottom: 6, fontSize: 13, color: "#065f46" }}>
              Currently viewing as <strong>{current.fullName}</strong>
            </div>
          ) : (
            <div style={{ marginBottom: 6, fontSize: 12, color: "#6b7280" }}>Not impersonating</div>
          )}

          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                loadPeople(e.target.value);
              }}
              placeholder="Search people, agency, owner..."
              style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid #d1d5db" }}
            />
            {current ? (
              <button
                type="button"
                onClick={() => setImpersonation(null)}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  background: "#fff",
                  padding: "6px 10px",
                  color: "#dc2626",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Clear
              </button>
            ) : null}
          </div>

          <div style={{ maxHeight: 180, overflowY: "auto", display: "grid", gap: 6 }}>
            {loading ? <div style={{ fontSize: 12, color: "#6b7280" }}>Loading...</div> : null}
            {!loading && filtered.length === 0 ? (
              <div style={{ fontSize: 12, color: "#6b7280" }}>No people found</div>
            ) : null}
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setImpersonation(p)}
                style={{
                  textAlign: "left",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: current?.id === p.id ? "#ecfdf3" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 600 }}>{p.fullName}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {p.teamType || "Unassigned"}
                  {p.agencyLabel ? ` • ${p.agencyLabel}` : p.primaryAgencyId ? ` • Agency ${p.primaryAgencyId.slice(0, 6)}` : ""}
                </div>
                {p.agencyOwner ? (
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>Owner: {p.agencyOwner}</div>
                ) : null}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
