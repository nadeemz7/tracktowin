"use client";

import { useState } from "react";

export default function InviteAcceptClient({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!password || !confirmPassword) {
      setError("Password and confirmation are required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || json?.ok !== true) {
        setError(json?.error || "Invite acceptance failed.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Invite acceptance failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Set password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db" }}
        />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontWeight: 600 }}>Confirm password</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db" }}
        />
      </label>
      {error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div> : null}
      <button
        type="submit"
        disabled={submitting}
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #0f172a",
          background: "#0f172a",
          color: "#f8fafc",
          fontWeight: 700,
          opacity: submitting ? 0.7 : 1,
          cursor: submitting ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Submitting..." : "Accept invite"}
      </button>
    </form>
  );
}
