"use client";

import { useEffect, useState } from "react";

type Person = { id: string; fullName: string };

export function ImpersonationBanner() {
  const [person, setPerson] = useState<Person | null>(null);

  useEffect(() => {
    fetch("/api/admin/impersonate")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPerson(data?.person ?? null))
      .catch(() => setPerson(null));
  }, []);

  if (!person) return null;

  return (
    <div
      style={{
        background: "#fef3c7",
        border: "1px solid #f59e0b",
        color: "#92400e",
        padding: "8px 12px",
        borderRadius: 10,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      <div style={{ fontWeight: 600 }}>
        Viewing as <span style={{ color: "#b45309" }}>{person.fullName}</span>
      </div>
      <button
        type="button"
        onClick={async () => {
          await fetch("/api/admin/impersonate", { method: "DELETE" });
          window.location.reload();
        }}
        style={{
          border: "none",
          background: "transparent",
          color: "#b45309",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Exit view
      </button>
    </div>
  );
}
