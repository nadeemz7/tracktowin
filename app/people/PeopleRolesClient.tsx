"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrgLobs } from "./useOrgLobs";

type Agency = { id: string; name: string; linesOfBusiness?: { id: string; name: string }[] };
type Team = { id: string; name: string; agencyId: string; agency?: Agency | null; roles: { id: string; name: string }[] };
type Person = {
  id: string;
  fullName: string;
  email?: string | null;
  teamId?: string | null;
  roleId?: string | null;
  primaryAgencyId?: string | null;
  isAdmin?: boolean;
  isManager?: boolean;
  active?: boolean;
  team?: { id: string; name: string; agency?: Agency | null } | null;
  role?: { id: string; name: string } | null;
  primaryAgency?: Agency | null;
};

type RoleExpectation = {
  roleId: string;
  monthlyAppsTarget: number;
  monthlyPremiumTarget: number;
  premiumMode?: "LOB" | "BUCKET";
  premiumByBucket?: { PC?: number; FS?: number; IPS?: number } | null;
  premiumByLob?: { lobId: string; premium: number }[] | null;
  role?: { id: string; name: string; team?: { id: string; name: string; agencyId: string } | null } | null;
};

type PersonOverride = {
  personId: string;
  monthlyAppsOverride?: number | null;
  monthlyPremiumOverride?: number | null;
  premiumModeOverride?: "LOB" | "BUCKET" | null;
  premiumByBucketOverride?: { PC?: number; FS?: number; IPS?: number } | null;
  premiumByLobOverride?: { lobId: string; premium: number }[] | null;
};

type Props = {
  people: Person[];
  teams: Team[];
  agencies: Agency[];
  roleExpectations: RoleExpectation[];
  personOverrides: PersonOverride[];
  initialSelectedPersonId?: string | null;
};

type RoleWithTeam = { id: string; name: string; team?: Team | null };
type SaveState = { saving: boolean; error: string | null; success: boolean };

function fmtInt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function fmtMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function badgeForPerson(p: Person, overrides: Map<string, PersonOverride>, expectations: Map<string, RoleExpectation>) {
  const override = overrides.get(p.id);
  const hasOverride =
    override &&
    (override.monthlyAppsOverride != null ||
      override.monthlyPremiumOverride != null ||
      override.premiumModeOverride != null ||
      (override.premiumByBucketOverride && Object.keys(override.premiumByBucketOverride).length > 0) ||
      (override.premiumByLobOverride && override.premiumByLobOverride.length > 0));
  if (hasOverride) return "Overridden";
  if (p.roleId && expectations.has(p.roleId)) return "Using Role Default";
  return "No expectation";
}

function effectiveExpectation(
  p: Person,
  overrides: Map<string, PersonOverride>,
  expectations: Map<string, RoleExpectation>
) {
  const override = overrides.get(p.id);
  if (
    override &&
    (override.monthlyAppsOverride != null ||
      override.monthlyPremiumOverride != null ||
      override.premiumModeOverride != null ||
      (override.premiumByBucketOverride && Object.keys(override.premiumByBucketOverride).length > 0) ||
      (override.premiumByLobOverride && override.premiumByLobOverride.length > 0))
  ) {
    return {
      source: "Override",
      apps: override.monthlyAppsOverride ?? null,
      premium: override.monthlyPremiumOverride ?? null,
    };
  }
  if (p.roleId && expectations.has(p.roleId)) {
    const exp = expectations.get(p.roleId)!;
    return {
      source: "Role default",
      apps: exp.monthlyAppsTarget ?? null,
      premium: exp.monthlyPremiumTarget ?? null,
    };
  }
  return { source: "None", apps: null, premium: null };
}

export default function PeopleRolesClient({
  people,
  teams,
  agencies,
  roleExpectations,
  personOverrides,
  initialSelectedPersonId = null,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localPeople, setLocalPeople] = useState<Person[]>(() => [...people].sort((a, b) => a.fullName.localeCompare(b.fullName)));
  const [overridesMap, setOverridesMap] = useState<Map<string, PersonOverride>>(
    () => new Map(personOverrides.map((o) => [o.personId, o]))
  );
  const expectationsMap = useMemo(() => new Map(roleExpectations.map((r) => [r.roleId, r])), [roleExpectations]);

  const selected = selectedId ? localPeople.find((p) => p.id === selectedId) || null : null;

  const [assignState, setAssignState] = useState<SaveState>({ saving: false, error: null, success: false });
  const [overrideState, setOverrideState] = useState<SaveState>({ saving: false, error: null, success: false });

  const [roleIdInput, setRoleIdInput] = useState<string>("");
  const [teamIdInput, setTeamIdInput] = useState<string>("");
  const [primaryAgencyInput, setPrimaryAgencyInput] = useState<string>("");
  const [isAdminInput, setIsAdminInput] = useState<boolean>(false);
  const [isManagerInput, setIsManagerInput] = useState<boolean>(false);
  const [activeInput, setActiveInput] = useState<boolean>(true);

  const [appsOverride, setAppsOverride] = useState<string>("");
  const [premiumOverride, setPremiumOverride] = useState<string>("");
  const [premiumModeOverride, setPremiumModeOverride] = useState<"" | "LOB" | "BUCKET">("");
  const [bucketPc, setBucketPc] = useState<string>("");
  const [bucketFs, setBucketFs] = useState<string>("");
  const [bucketIps, setBucketIps] = useState<string>("");
  const { lobs: orgLobs, loading: orgLobsLoading, error: orgLobsError } = useOrgLobs();
  const [lobOverrideInputs, setLobOverrideInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!orgLobs.length) return;
    setLobOverrideInputs((prev) => {
      const next = { ...prev };
      orgLobs.forEach((lob) => {
        if (next[lob.id] === undefined) next[lob.id] = "";
      });
      return next;
    });
  }, [orgLobs]);

  useEffect(() => {
    if (!initialSelectedPersonId) return;
    const person = localPeople.find((p) => p.id === initialSelectedPersonId) || null;
    if (!person) return;
    setSelectedId(person.id);
    resetForms(person);
  }, [initialSelectedPersonId, localPeople]);

  useEffect(() => {
    if (!selectedId) return;
    hydrateLobOverrideInputs(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, orgLobs.length, overridesMap]);

  function resetForms(person: Person | null) {
    if (!person) return;
    setRoleIdInput(person.roleId || "");
    setTeamIdInput(person.teamId || "");
    setPrimaryAgencyInput(person.primaryAgencyId || person.team?.agency?.id || "");
    setIsAdminInput(Boolean(person.isAdmin));
    setIsManagerInput(Boolean(person.isManager));
    setActiveInput(person.active !== false);

    const override = overridesMap.get(person.id);
    setAppsOverride(override?.monthlyAppsOverride != null ? String(override.monthlyAppsOverride) : "");
    setPremiumOverride(override?.monthlyPremiumOverride != null ? String(override.monthlyPremiumOverride) : "");
    setPremiumModeOverride((override?.premiumModeOverride as any) || "");
    setBucketPc(
      override?.premiumByBucketOverride && override.premiumByBucketOverride.PC != null ? String(override.premiumByBucketOverride.PC) : ""
    );
    setBucketFs(
      override?.premiumByBucketOverride && override.premiumByBucketOverride.FS != null ? String(override.premiumByBucketOverride.FS) : ""
    );
    setBucketIps(
      override?.premiumByBucketOverride && override.premiumByBucketOverride.IPS != null ? String(override.premiumByBucketOverride.IPS) : ""
    );
    if (person?.id) hydrateLobOverrideInputs(person.id);
  }

  function hydrateLobOverrideInputs(personId: string) {
    if (!orgLobs.length) return;
    const override = overridesMap.get(personId);
    if (override?.premiumModeOverride === "LOB" && Array.isArray(override.premiumByLobOverride)) {
      const next: Record<string, string> = {};
      orgLobs.forEach((lob) => {
        const match = override.premiumByLobOverride?.find((row) => row?.lobId === lob.id);
        next[lob.id] = match?.premium != null ? String(match.premium) : "";
      });
      setLobOverrideInputs((prev) => ({ ...prev, ...next }));
    } else {
      const cleared: Record<string, string> = {};
      orgLobs.forEach((lob) => {
        cleared[lob.id] = "";
      });
      setLobOverrideInputs((prev) => ({ ...prev, ...cleared }));
    }
  }

  function onSelect(personId: string) {
    setSelectedId(personId);
    const person = localPeople.find((p) => p.id === personId) || null;
    resetForms(person);
    setAssignState({ saving: false, error: null, success: false });
    setOverrideState({ saving: false, error: null, success: false });
  }

  async function saveAssignment() {
    if (!selected) return;
    setAssignState({ saving: true, error: null, success: false });
    try {
      const res = await fetch("/api/people/assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: selected.id,
          roleId: roleIdInput || null,
          teamId: teamIdInput || null,
          primaryAgencyId: primaryAgencyInput || null,
          isAdmin: isAdminInput,
          isManager: isManagerInput,
          active: activeInput,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Save failed");
      }
      const updated = await res.json();
      setLocalPeople((prev) => prev.map((p) => (p.id === selected.id ? { ...p, ...updated.person } : p)));
      setAssignState({ saving: false, error: null, success: true });
    } catch (err: any) {
      setAssignState({ saving: false, error: err?.message || "Save failed", success: false });
    }
  }

  async function saveOverrides(clear: boolean = false) {
    if (!selected) return;
    setOverrideState({ saving: true, error: null, success: false });
    try {
      const body: any = { personId: selected.id };
      if (clear) {
        body.monthlyAppsOverride = null;
        body.monthlyPremiumOverride = null;
        body.premiumModeOverride = null;
        body.premiumByBucketOverride = null;
        body.premiumByLobOverride = null;
      } else {
        body.monthlyAppsOverride = appsOverride ? Number(appsOverride) : null;
        body.monthlyPremiumOverride = premiumOverride ? Number(premiumOverride) : null;
        body.premiumModeOverride = premiumModeOverride || null;
        const toNumOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
        if (premiumModeOverride === "BUCKET") {
          const pc = toNumOrNull(bucketPc);
          const fs = toNumOrNull(bucketFs);
          const ips = toNumOrNull(bucketIps);
          const hasAnyBucket = pc != null || fs != null || ips != null;
          if (hasAnyBucket) {
            body.premiumByBucketOverride = {
              ...(pc != null ? { PC: pc } : {}),
              ...(fs != null ? { FS: fs } : {}),
              ...(ips != null ? { IPS: ips } : {}),
            };
            body.premiumByLobOverride = null;
            body.premiumModeOverride = "BUCKET";
          } else {
            body.premiumByBucketOverride = null;
            body.premiumByLobOverride = null;
            body.premiumModeOverride = null;
          }
        } else if (premiumModeOverride === "LOB") {
          const entries: { lobId: string; premium: number }[] = [];
          orgLobs.forEach((lob) => {
            const val = lobOverrideInputs[lob.id] ?? "";
            if (val.trim() === "") return;
            const num = Number(val);
            if (!Number.isFinite(num) || num < 0) return;
            entries.push({ lobId: lob.id, premium: num });
          });
          if (entries.length === 0) throw new Error("Enter at least one LoB premium for LoB mode");
          body.premiumByLobOverride = entries;
          body.premiumByBucketOverride = null;
          body.premiumModeOverride = "LOB";
        } else {
          body.premiumByBucketOverride = null;
          body.premiumByLobOverride = null;
        }

        if (
          body.monthlyAppsOverride == null &&
          body.monthlyPremiumOverride == null &&
          body.premiumModeOverride == null
        ) {
          body.premiumByBucketOverride = null;
          body.premiumByLobOverride = null;
        }
      }

      const res = await fetch("/api/benchmarks/person-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Save failed");
      }
      const json = await res.json();
      const saved: PersonOverride = json.override;
      setOverridesMap((prev) => {
        const map = new Map(prev);
        map.set(saved.personId, saved);
        return map;
      });
      setOverrideState({ saving: false, error: null, success: true });
    } catch (err: any) {
      setOverrideState({ saving: false, error: err?.message || "Save failed", success: false });
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 16, alignItems: "start" }}>
      <div className="surface" style={{ padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>People</div>
        <div style={{ display: "grid", gap: 8 }}>
          {localPeople.map((p) => {
            const badge = badgeForPerson(p, overridesMap, expectationsMap);
            const active = selectedId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.id)}
                style={{
                  textAlign: "left",
                  border: active ? "1px solid #111827" : "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 10,
                  background: active ? "#f3f4f6" : "#fff",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700 }}>{p.fullName}</div>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 999,
                      background:
                        badge === "Overridden" ? "#ecfeff" : badge === "Using Role Default" ? "#eef2ff" : "#f3f4f6",
                      color: badge === "Overridden" ? "#0ea5e9" : badge === "Using Role Default" ? "#4338ca" : "#4b5563",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {badge}
                  </span>
                </div>
                <div style={{ color: "#4b5563", fontSize: 13, marginTop: 4 }}>
                  {p.role?.name || "No role"} • {p.primaryAgency?.name || p.team?.agency?.name || "No office"}
                </div>
                <div style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                  Status: {p.active === false ? "Inactive" : "Active"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="surface" style={{ padding: 16 }}>
        {!selected ? (
          <div style={{ color: "#6b7280" }}>Select a person to edit.</div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 20 }}>{selected.fullName}</div>
                <div style={{ color: "#6b7280", fontSize: 13 }}>
                  {selected.role?.name || "No role"} • {selected.primaryAgency?.name || selected.team?.agency?.name || "No office"}
                </div>
              </div>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: selected.active === false ? "#fef2f2" : "#ecfdf3",
                  color: selected.active === false ? "#b91c1c" : "#065f46",
                  fontWeight: 700,
                }}
              >
                {selected.active === false ? "Inactive" : "Active"}
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Assignment</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Team</span>
                  <select value={teamIdInput} onChange={(e) => setTeamIdInput(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <option value="">No team</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.agency?.name ? `${t.agency.name} — ${t.name}` : t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Role</span>
                  <select value={roleIdInput} onChange={(e) => setRoleIdInput(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <option value="">No role</option>
                    {teams.flatMap((t) =>
                      t.roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {t.agency?.name ? `${t.agency.name} — ${t.name} / ${r.name}` : `${t.name} / ${r.name}`}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Primary office</span>
                  <select value={primaryAgencyInput} onChange={(e) => setPrimaryAgencyInput(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <option value="">Match team office</option>
                    {agencies.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={isAdminInput} onChange={(e) => setIsAdminInput(e.target.checked)} />
                  Admin
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={isManagerInput} onChange={(e) => setIsManagerInput(e.target.checked)} />
                  Manager
                </label>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={activeInput} onChange={(e) => setActiveInput(e.target.checked)} />
                  Active
                </label>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={saveAssignment}
                  disabled={assignState.saving}
                  style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700 }}
                >
                  {assignState.saving ? "Saving…" : "Save Assignment"}
                </button>
                {assignState.error ? <span style={{ color: "#b91c1c", fontSize: 13 }}>{assignState.error}</span> : null}
                {assignState.success ? <span style={{ color: "#065f46", fontSize: 13 }}>Saved</span> : null}
              </div>
            </div>

            <div style={{ marginTop: 18, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Benchmarks Overrides</div>
                  {(() => {
                    const eff = effectiveExpectation(selected, overridesMap, expectationsMap);
                    return (
                      <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
                        Effective: {eff.source}
                        {eff.apps != null ? ` • Apps: ${eff.apps}` : ""}
                        {eff.premium != null ? ` • Premium: ${eff.premium}` : ""}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginTop: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Monthly apps override</span>
                  <input
                    type="number"
                    value={appsOverride}
                    onChange={(e) => setAppsOverride(e.target.value)}
                    placeholder="Leave blank to inherit"
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Monthly premium override</span>
                  <input
                    type="number"
                    value={premiumOverride}
                    onChange={(e) => setPremiumOverride(e.target.value)}
                    placeholder="Leave blank to inherit"
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                </label>
              </div>

              <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
                <span style={{ fontWeight: 600 }}>Premium mode override</span>
                <select
                  value={premiumModeOverride}
                  onChange={(e) => setPremiumModeOverride(e.target.value as any)}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", maxWidth: 260 }}
                >
                  <option value="">Inherit</option>
                  <option value="BUCKET">Bucket totals</option>
                  <option value="LOB">By LoB</option>
                </select>
              </label>

              {premiumModeOverride === "BUCKET" ? (
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 8 }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>PC premium</span>
                    <input
                      type="number"
                      value={bucketPc}
                      onChange={(e) => setBucketPc(e.target.value)}
                      placeholder="0"
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>FS premium</span>
                    <input
                      type="number"
                      value={bucketFs}
                      onChange={(e) => setBucketFs(e.target.value)}
                      placeholder="0"
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>IPS premium (optional)</span>
                    <input
                      type="number"
                      value={bucketIps}
                      onChange={(e) => setBucketIps(e.target.value)}
                      placeholder="0"
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                  </label>
                </div>
              ) : null}

              {premiumModeOverride === "LOB" ? (
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {orgLobsError ? (
                    <div style={{ color: "#b91c1c", fontSize: 13 }}>{orgLobsError}</div>
                  ) : null}
                  {orgLobsLoading ? (
                    <div style={{ color: "#6b7280", fontSize: 13 }}>Loading lines of business…</div>
                  ) : (
                    orgLobs.map((lob) => (
                      <label key={lob.id} style={{ display: "grid", gap: 4, gridTemplateColumns: "1fr 180px", alignItems: "center" }}>
                        <span style={{ fontWeight: 600 }}>
                          {lob.name} {lob.premiumCategory ? <span style={{ color: "#6b7280", fontSize: 12 }}>({lob.premiumCategory})</span> : null}
                        </span>
                        <input
                          type="number"
                          value={lobOverrideInputs[lob.id] ?? ""}
                          onChange={(e) =>
                            setLobOverrideInputs((prev) => ({
                              ...prev,
                              [lob.id]: e.target.value,
                            }))
                          }
                          placeholder="Premium"
                          style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                        />
                      </label>
                    ))
                  )}
                  <div style={{ color: "#6b7280", fontSize: 12 }}>Enter at least one LoB premium to save.</div>
                </div>
              ) : null}

              <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => saveOverrides(false)}
                  disabled={overrideState.saving}
                  style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700 }}
                >
                  {overrideState.saving ? "Saving…" : "Save Overrides"}
                </button>
                <button
                  type="button"
                  onClick={() => saveOverrides(true)}
                  disabled={overrideState.saving}
                  style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", color: "#111827", fontWeight: 700 }}
                >
                  Clear Overrides
                </button>
                {overrideState.error ? <span style={{ color: "#b91c1c", fontSize: 13 }}>{overrideState.error}</span> : null}
                {overrideState.success ? <span style={{ color: "#065f46", fontSize: 13 }}>Saved</span> : null}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type RolesTabProps = {
  roles: RoleWithTeam[];
  roleExpectations: RoleExpectation[];
};

export function RolesTab({ roles, roleExpectations }: RolesTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expectationsMap, setExpectationsMap] = useState<Map<string, RoleExpectation>>(
    () => new Map(roleExpectations.map((r) => [r.roleId, r]))
  );
  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.name.localeCompare(b.name)), [roles]);

  const [appsInput, setAppsInput] = useState<string>("");
  const [premiumInput, setPremiumInput] = useState<string>("");
  const [premiumMode, setPremiumMode] = useState<"" | "LOB" | "BUCKET">("");
  const [bucketPc, setBucketPc] = useState<string>("");
  const [bucketFs, setBucketFs] = useState<string>("");
  const [bucketIps, setBucketIps] = useState<string>("");
  const { lobs, loading: lobsLoading, error: lobsError } = useOrgLobs();
  const [lobInputs, setLobInputs] = useState<Record<string, string>>({});
  const [state, setState] = useState<SaveState>({ saving: false, error: null, success: false });

  useEffect(() => {
    if (!lobs.length) return;
    setLobInputs((prev) => {
      const next = { ...prev };
      lobs.forEach((lob) => {
        if (next[lob.id] === undefined) next[lob.id] = "";
      });
      return next;
    });
  }, [lobs]);

  function openRole(roleId: string) {
    const exp = expectationsMap.get(roleId);
    setExpanded((prev) => (prev === roleId ? null : roleId));
    setAppsInput(exp ? String(exp.monthlyAppsTarget ?? "") : "");
    setPremiumInput(exp ? String(exp.monthlyPremiumTarget ?? "") : "");
    setPremiumMode((exp as any)?.premiumMode ?? "");
    const bucket = (exp as any)?.premiumByBucket || {};
    setBucketPc(bucket.PC != null ? String(bucket.PC) : "");
    setBucketFs(bucket.FS != null ? String(bucket.FS) : "");
    setBucketIps(bucket.IPS != null ? String(bucket.IPS) : "");
    if ((exp as any)?.premiumMode === "LOB" && Array.isArray((exp as any)?.premiumByLob)) {
      const next: Record<string, string> = {};
      lobs.forEach((lob) => {
        const match = ((exp as any).premiumByLob as any[]).find((row) => row?.lobId === lob.id);
        next[lob.id] = match?.premium != null ? String(match.premium) : "";
      });
      setLobInputs((prev) => ({ ...prev, ...next }));
    } else {
      const cleared: Record<string, string> = {};
      lobs.forEach((lob) => {
        cleared[lob.id] = "";
      });
      setLobInputs((prev) => ({ ...prev, ...cleared }));
    }
    setState({ saving: false, error: null, success: false });
  }

  async function save(roleId: string) {
    setState({ saving: true, error: null, success: false });
    try {
      const apps = Number(appsInput);
      if (!Number.isInteger(apps) || apps < 0) throw new Error("Monthly apps must be a non-negative integer");
      const premium = Number(premiumInput);
      if (!Number.isFinite(premium) || premium < 0) throw new Error("Monthly premium must be a non-negative number");
      if (!premiumMode) throw new Error("Select a premium mode");

      const body: any = {
        roleId,
        monthlyAppsTarget: apps,
        monthlyPremiumTarget: premium,
        premiumMode,
      };

      const toNumOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
      if (premiumMode === "BUCKET") {
        const pc = toNumOrNull(bucketPc);
        const fs = toNumOrNull(bucketFs);
        const ips = toNumOrNull(bucketIps);
        const hasAnyBucket = pc != null || fs != null || ips != null;
        if (!hasAnyBucket) throw new Error("Enter at least PC or FS premium for bucket mode");
        body.premiumByBucket = {
          ...(pc != null ? { PC: pc } : {}),
          ...(fs != null ? { FS: fs } : {}),
          ...(ips != null ? { IPS: ips } : {}),
        };
        body.premiumByLob = null;
      } else if (premiumMode === "LOB") {
        const entries: { lobId: string; premium: number }[] = [];
        lobs.forEach((lob) => {
          const val = lobInputs[lob.id] ?? "";
          if (val.trim() === "") return;
          const num = Number(val);
          if (!Number.isFinite(num) || num < 0) return;
          entries.push({ lobId: lob.id, premium: num });
        });
        if (entries.length === 0) throw new Error("Enter at least one LoB premium for LoB mode");
        body.premiumByLob = entries;
        body.premiumByBucket = null;
      }

      const res = await fetch("/api/benchmarks/role-expectations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Save failed");
      }
      const json = await res.json();
      const saved: RoleExpectation = json.expectation;
      setExpectationsMap((prev) => {
        const map = new Map(prev);
        map.set(roleId, saved);
        return map;
      });
      setState({ saving: false, error: null, success: true });
    } catch (err: any) {
      setState({ saving: false, error: err?.message || "Save failed", success: false });
    }
  }

  async function clear(roleId: string) {
    setState({ saving: true, error: null, success: false });
    try {
      const res = await fetch("/api/benchmarks/role-expectations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Clear failed");
      }
      setExpectationsMap((prev) => {
        const map = new Map(prev);
        map.delete(roleId);
        return map;
      });
      setAppsInput("");
      setPremiumInput("");
      setPremiumMode("");
      setBucketPc("");
      setBucketFs("");
      setBucketIps("");
      setState({ saving: false, error: null, success: true });
    } catch (err: any) {
      setState({ saving: false, error: err?.message || "Clear failed", success: false });
    }
  }

  return (
    <div className="surface" style={{ padding: 12, display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Roles</div>
      <div style={{ display: "grid", gap: 8 }}>
        {sortedRoles.map((r) => {
          const exp = expectationsMap.get(r.id);
          const configured = Boolean(exp);
          const open = expanded === r.id;
          return (
            <div
              key={r.id}
              style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}
            >
              <button
                onClick={() => openRole(r.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    {r.team?.name || "No team"} • {r.team?.agency?.name || "No agency"}
                  </div>
                </div>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: configured ? "#ecfeff" : "#f3f4f6",
                    color: configured ? "#0ea5e9" : "#4b5563",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {configured ? "Configured" : "Not set"}
                </span>
              </button>

              {open ? (
                <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>Monthly apps target</span>
                      <input
                        type="number"
                        value={appsInput}
                        onChange={(e) => setAppsInput(e.target.value)}
                        style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>Monthly premium target</span>
                      <input
                        type="number"
                        value={premiumInput}
                        onChange={(e) => setPremiumInput(e.target.value)}
                        style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                    </label>
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontWeight: 600 }}>Premium mode</span>
                    <select
                      value={premiumMode}
                      onChange={(e) => setPremiumMode(e.target.value as any)}
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", maxWidth: 260 }}
                    >
                      <option value="">Select</option>
                      <option value="BUCKET">Bucket totals</option>
                      <option value="LOB">By LoB</option>
                    </select>
                  </label>

                  {premiumMode === "BUCKET" ? (
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>PC premium</span>
                        <input
                          type="number"
                          value={bucketPc}
                          onChange={(e) => setBucketPc(e.target.value)}
                          style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>FS premium</span>
                        <input
                          type="number"
                          value={bucketFs}
                          onChange={(e) => setBucketFs(e.target.value)}
                          style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                        />
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontWeight: 600 }}>IPS premium (optional)</span>
                        <input
                          type="number"
                          value={bucketIps}
                          onChange={(e) => setBucketIps(e.target.value)}
                          style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                        />
                      </label>
                    </div>
                  ) : null}

                  {premiumMode === "LOB" ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      {lobsError ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{lobsError}</div> : null}
                      {lobsLoading ? (
                        <div style={{ color: "#6b7280", fontSize: 13 }}>Loading lines of business…</div>
                      ) : (
                        lobs.map((lob) => (
                          <label key={lob.id} style={{ display: "grid", gap: 4, gridTemplateColumns: "1fr 180px", alignItems: "center" }}>
                            <span style={{ fontWeight: 600 }}>
                              {lob.name} {lob.premiumCategory ? <span style={{ color: "#6b7280", fontSize: 12 }}>({lob.premiumCategory})</span> : null}
                            </span>
                            <input
                              type="number"
                              value={lobInputs[lob.id] ?? ""}
                              onChange={(e) =>
                                setLobInputs((prev) => ({
                                  ...prev,
                                  [lob.id]: e.target.value,
                                }))
                              }
                              placeholder="Premium"
                              style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                            />
                          </label>
                        ))
                      )}
                      <div style={{ color: "#6b7280", fontSize: 12 }}>Enter at least one LoB premium to save.</div>
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => save(r.id)}
                      disabled={state.saving}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid #111827",
                        background: "#111827",
                        color: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {state.saving ? "Saving…" : "Save Role Defaults"}
                    </button>
                    <button
                      type="button"
                      onClick={() => clear(r.id)}
                      disabled={state.saving}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        color: "#111827",
                        fontWeight: 700,
                      }}
                    >
                      Clear Role Defaults
                    </button>
                    {state.error ? <span style={{ color: "#b91c1c", fontSize: 13 }}>{state.error}</span> : null}
                    {state.success ? <span style={{ color: "#065f46", fontSize: 13 }}>Saved</span> : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OfficePlanTab() {
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1];
  const [year, setYear] = useState<number>(thisYear);
  const [autoApps, setAutoApps] = useState<string>("");
  const [fireApps, setFireApps] = useState<string>("");
  const [lifeApps, setLifeApps] = useState<string>("");
  const [healthApps, setHealthApps] = useState<string>("");
  const [ipsApps, setIpsApps] = useState<string>("");
  const [bucketPc, setBucketPc] = useState<string>("");
  const [bucketFs, setBucketFs] = useState<string>("");
  const [bucketIps, setBucketIps] = useState<string>("");
  const [lifePremium, setLifePremium] = useState<string>("");
  const [healthPremium, setHealthPremium] = useState<string>("");
  const [includeIps, setIncludeIps] = useState<boolean>(false);
  const { lobs, loading: lobsLoading, error: lobsError } = useOrgLobs();
  const [state, setState] = useState<SaveState>({ saving: false, error: null, success: false });
  const hasIpsLob = lobs.some((lob) => lob.premiumCategory === "IPS");
  const includeIpsGoals = includeIps || hasIpsLob;
  const toNumOrNull = (value: string) => {
    if (value.trim() === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  const autoAppsNum = toNumOrNull(autoApps);
  const fireAppsNum = toNumOrNull(fireApps);
  const lifeAppsNum = toNumOrNull(lifeApps);
  const healthAppsNum = toNumOrNull(healthApps);
  const ipsAppsNum = includeIpsGoals ? toNumOrNull(ipsApps) : null;
  const appsTotal =
    (autoAppsNum ?? 0) +
    (fireAppsNum ?? 0) +
    (lifeAppsNum ?? 0) +
    (healthAppsNum ?? 0) +
    (ipsAppsNum ?? 0);

  const bucketPcNum = toNumOrNull(bucketPc);
  const bucketFsNum = toNumOrNull(bucketFs);
  const bucketIpsNum = includeIpsGoals ? toNumOrNull(bucketIps) : null;
  const bucketPremiumTotal = (bucketPcNum ?? 0) + (bucketFsNum ?? 0) + (bucketIpsNum ?? 0);

  const lifePremiumNum = toNumOrNull(lifePremium);
  const healthPremiumNum = toNumOrNull(healthPremium);
  const fsBreakdownTotal = (lifePremiumNum ?? 0) + (healthPremiumNum ?? 0);
  const fsPremiumTotal = bucketFsNum ?? 0;
  const totalPremium = bucketPremiumTotal;
  const showFsBreakdown = fsPremiumTotal > 0;
  const fsBreakdownOver = showFsBreakdown && fsBreakdownTotal > fsPremiumTotal;
  const fsBreakdownEmpty = showFsBreakdown && fsBreakdownTotal === 0;

  const hasNegative =
    [autoAppsNum, fireAppsNum, lifeAppsNum, healthAppsNum, ipsAppsNum, bucketPcNum, bucketFsNum, bucketIpsNum, lifePremiumNum, healthPremiumNum]
      .filter((val) => val != null)
      .some((val) => (val as number) < 0);
  const hasNonIntegerApps =
    [autoAppsNum, fireAppsNum, lifeAppsNum, healthAppsNum, ipsAppsNum]
      .filter((val) => val != null)
      .some((val) => !Number.isInteger(val as number));
  const totalsZero = appsTotal === 0 && totalPremium === 0;
  const officePlanErrorLabel =
    state.error && (state.error.includes("Unauthorized") || state.error.includes("Forbidden"))
      ? "You don't have permission to update the Office Plan."
      : state.error;
  const getImpersonateId = () => {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(/(?:^|; )impersonatePersonId=([^;]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  };

  useEffect(() => {
    if (hasIpsLob) setIncludeIps(true);
  }, [hasIpsLob]);

  async function load(selectedYear: number) {
    setState((s) => ({ ...s, error: null, success: false }));
    try {
      const impersonateId = getImpersonateId();
      const headers = impersonateId ? { "x-impersonate-person-id": impersonateId } : undefined;
      const res = await fetch(`/api/benchmarks/office-plan?year=${selectedYear}`, {
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text || "Load failed"}`);
      }
      const json = await res.json();
      const plan = json.plan;
      if (plan) {
        const goals = plan.appGoalsByLob || {};
        setAutoApps(goals.AUTO != null ? String(goals.AUTO) : "");
        setFireApps(goals.FIRE != null ? String(goals.FIRE) : "");
        setLifeApps(goals.LIFE != null ? String(goals.LIFE) : "");
        setHealthApps(goals.HEALTH != null ? String(goals.HEALTH) : "");
        setIpsApps(goals.IPS != null ? String(goals.IPS) : "");

        const bucket = plan.premiumByBucket || {};
        setBucketPc(bucket.PC != null ? String(bucket.PC) : "");
        setBucketFs(bucket.FS != null ? String(bucket.FS) : "");
        setBucketIps(bucket.IPS != null ? String(bucket.IPS) : "");

        const breakdown = plan.premiumFsBreakdown || plan.premiumExtras || {};
        setLifePremium(breakdown.LIFE != null ? String(breakdown.LIFE) : "");
        setHealthPremium(breakdown.HEALTH != null ? String(breakdown.HEALTH) : "");

        const hasIpsValue = goals.IPS != null || bucket.IPS != null;
        setIncludeIps(hasIpsLob || hasIpsValue);
      } else {
        setAutoApps("");
        setFireApps("");
        setLifeApps("");
        setHealthApps("");
        setIpsApps("");
        setBucketPc("");
        setBucketFs("");
        setBucketIps("");
        setLifePremium("");
        setHealthPremium("");
        setIncludeIps(hasIpsLob);
      }
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[office-plan] load error", err);
      }
      setState({ saving: false, error: err?.message || "Load failed", success: false });
    }
  }

  useEffect(() => {
    load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, lobs.length]);

  async function save() {
    setState({ saving: true, error: null, success: false });
    try {
      const toInt = (value: string, label: string) => {
        const num = Number(value);
        if (!Number.isInteger(num) || num < 0) throw new Error(`${label} must be a non-negative integer`);
        return num;
      };
      const toOptionalInt = (value: string, label: string) => {
        if (value.trim() === "") return null;
        return toInt(value, label);
      };
      const toNumber = (value: string, label: string) => {
        const num = Number(value);
        if (!Number.isFinite(num) || num < 0) throw new Error(`${label} must be a non-negative number`);
        return num;
      };
      const toOptionalNumber = (value: string, label: string) => {
        if (value.trim() === "") return null;
        return toNumber(value, label);
      };

      const appGoalsByLob: any = {
        AUTO: toInt(autoApps, "Auto apps"),
        FIRE: toInt(fireApps, "Fire apps"),
        LIFE: toInt(lifeApps, "Life apps"),
        HEALTH: toInt(healthApps, "Health apps"),
      };
      const ipsAppsNum = includeIpsGoals ? toOptionalInt(ipsApps, "IPS apps") : null;
      if (ipsAppsNum != null) appGoalsByLob.IPS = ipsAppsNum;

      if (!bucketPc.trim() || !bucketFs.trim()) {
        throw new Error("PC and FS premiums are required");
      }
      const premiumByBucket: any = {
        PC: toNumber(bucketPc, "PC premium"),
        FS: toNumber(bucketFs, "FS premium"),
      };
      const ipsPremiumNum = includeIpsGoals ? toOptionalNumber(bucketIps, "IPS premium") : null;
      if (ipsPremiumNum != null) premiumByBucket.IPS = ipsPremiumNum;

      const premiumFsBreakdown: any = {};
      const lifePremiumNum = toOptionalNumber(lifePremium, "Life premium");
      if (lifePremiumNum != null) premiumFsBreakdown.LIFE = lifePremiumNum;
      const healthPremiumNum = toOptionalNumber(healthPremium, "Health premium");
      if (healthPremiumNum != null) premiumFsBreakdown.HEALTH = healthPremiumNum;
      const premiumFsBreakdownPayload = Object.keys(premiumFsBreakdown).length ? premiumFsBreakdown : null;

      const body: any = {
        year,
        appGoalsByLob,
        premiumByBucket,
        ...(premiumFsBreakdownPayload ? { premiumFsBreakdown: premiumFsBreakdownPayload } : {}),
      };

      const impersonateId = getImpersonateId();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(impersonateId ? { "x-impersonate-person-id": impersonateId } : {}),
      };
      const res = await fetch("/api/benchmarks/office-plan", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text || "Save failed"}`);
      }
      setState({ saving: false, error: null, success: true });
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[office-plan] save error", err);
      }
      setState({ saving: false, error: err?.message || "Save failed", success: false });
    }
  }

  async function clear() {
    setState({ saving: true, error: null, success: false });
    try {
      const impersonateId = getImpersonateId();
      const headers = impersonateId ? { "x-impersonate-person-id": impersonateId } : undefined;
      const res = await fetch(`/api/benchmarks/office-plan?year=${year}`, {
        method: "DELETE",
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text || "Clear failed"}`);
      }
      setAutoApps("");
      setFireApps("");
      setLifeApps("");
      setHealthApps("");
      setIpsApps("");
      setBucketPc("");
      setBucketFs("");
      setBucketIps("");
      setLifePremium("");
      setHealthPremium("");
      setIncludeIps(hasIpsLob);
      setState({ saving: false, error: null, success: true });
    } catch (err: any) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[office-plan] clear error", err);
      }
      setState({ saving: false, error: err?.message || "Clear failed", success: false });
    }
  }

  return (
    <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>Office Plan</div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb", width: 160 }}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Annual App Goals (by LoB)</div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Auto apps</span>
            <input
              type="number"
              value={autoApps}
              onChange={(e) => setAutoApps(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Fire apps</span>
            <input
              type="number"
              value={fireApps}
              onChange={(e) => setFireApps(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Life apps</span>
            <input
              type="number"
              value={lifeApps}
              onChange={(e) => setLifeApps(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Health apps</span>
            <input
              type="number"
              value={healthApps}
              onChange={(e) => setHealthApps(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </label>
          {includeIpsGoals ? (
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>IPS apps (optional)</span>
              <input
                type="number"
                value={ipsApps}
                onChange={(e) => setIpsApps(e.target.value)}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
            </label>
          ) : null}
        </div>
        {!hasIpsLob ? (
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={includeIps} onChange={(e) => setIncludeIps(e.target.checked)} />
            Include IPS goals
          </label>
        ) : null}
        {lobsError ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{lobsError}</div> : null}
        {lobsLoading ? <div style={{ color: "#6b7280", fontSize: 12 }}>Loading lines of business…</div> : null}
        <div style={{ fontWeight: 700, fontSize: 13 }}>Total Apps (Annual): {fmtInt(appsTotal)}</div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Annual Premium Goals (by Bucket)</div>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600 }}>PC premium</span>
            <input
              type="number"
              value={bucketPc}
              onChange={(e) => setBucketPc(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600 }}>FS premium</span>
            <input
              type="number"
              value={bucketFs}
              onChange={(e) => setBucketFs(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </label>
          {includeIpsGoals ? (
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>IPS premium (optional)</span>
              <input
                type="number"
                value={bucketIps}
                onChange={(e) => setBucketIps(e.target.value)}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
            </label>
          ) : null}
        </div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Bucket Premium Total: {fmtMoney(bucketPremiumTotal)}</div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Total Premium (Annual): {fmtMoney(totalPremium)}</div>
      </div>

      {showFsBreakdown ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>FS Premium Breakdown (Life &amp; Health)</div>
          <div style={{ color: "#6b7280", fontSize: 12 }}>
            These values are a breakdown of FS premium, not additional premium.
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Life premium (FS)</span>
              <input
                type="number"
                value={lifePremium}
                onChange={(e) => setLifePremium(e.target.value)}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>Health premium (FS)</span>
              <input
                type="number"
                value={healthPremium}
                onChange={(e) => setHealthPremium(e.target.value)}
                style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
              />
            </label>
          </div>
        </div>
      ) : null}

      {hasNegative ? <div style={{ color: "#b91c1c", fontSize: 12 }}>Values must be ≥ 0</div> : null}
      {hasNonIntegerApps ? <div style={{ color: "#b91c1c", fontSize: 12 }}>App goals must be whole numbers</div> : null}
      {totalsZero ? <div style={{ color: "#b91c1c", fontSize: 12 }}>Office Plan totals are 0; Benchmarks will show no targets.</div> : null}
      {fsBreakdownOver ? <div style={{ color: "#b91c1c", fontSize: 12 }}>FS breakdown exceeds FS premium goal.</div> : null}
      {fsBreakdownEmpty ? <div style={{ color: "#b91c1c", fontSize: 12 }}>FS premium has no breakdown.</div> : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={save}
          disabled={state.saving}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #111827", background: "#111827", color: "#fff", fontWeight: 700 }}
        >
          {state.saving ? "Saving…" : "Save Office Plan"}
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={state.saving}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", color: "#111827", fontWeight: 700 }}
        >
          Clear Office Plan
        </button>
        {officePlanErrorLabel ? <span style={{ color: "#b91c1c", fontSize: 13 }}>{officePlanErrorLabel}</span> : null}
        {state.success ? <span style={{ color: "#065f46", fontSize: 13 }}>Saved</span> : null}
      </div>
    </div>
  );
}
