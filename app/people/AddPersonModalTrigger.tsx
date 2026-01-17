"use client";

import { useEffect, useState } from "react";

type Agency = {
  id: string;
  name: string;
};

type TeamRole = {
  id: string;
  name: string;
};

type Team = {
  id: string;
  name: string;
  roles: TeamRole[];
};

type AddPersonModalTriggerProps = {
  agencies: Agency[];
  teams: Team[];
  createPerson: (formData: FormData) => Promise<void> | void;
};

export default function AddPersonModalTrigger({ agencies, teams, createPerson }: AddPersonModalTriggerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [primaryAgencyId, setPrimaryAgencyId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isManager, setIsManager] = useState(false);

  const selectedTeam = teams.find((team) => team.id === teamId) || null;
  const teamRoles = selectedTeam?.roles ?? [];
  const isStep1Valid = fullName.trim().length > 0;
  const isStep3Valid = isStep1Valid && teamId.trim().length > 0;

  const reset = () => {
    setIsOpen(false);
    setStep(1);
    setFullName("");
    setEmail("");
    setPrimaryAgencyId("");
    setTeamId("");
    setRoleId("");
    setIsAdmin(false);
    setIsManager(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        reset();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!roleId) return;
    const currentTeam = teams.find((team) => team.id === teamId);
    const currentRoles = currentTeam?.roles ?? [];
    if (currentRoles.some((role) => role.id === roleId)) return;
    setRoleId("");
  }, [roleId, teamId, teams]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setIsOpen(true);
        }}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #111827",
          background: "#111827",
          color: "#fff",
          fontWeight: 700,
          width: "fit-content",
        }}
      >
        Add Person
      </button>
      {isOpen ? (
        <div
          role="presentation"
          onClick={reset}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-person-title"
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(560px, 92vw)",
              background: "#fff",
              borderRadius: 12,
              padding: 20,
              border: "1px solid #e5e7eb",
              boxShadow: "0 30px 80px rgba(15, 23, 42, 0.2)",
              display: "grid",
              gap: 16,
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <div id="add-person-title" style={{ fontWeight: 800, fontSize: 18 }}>
                Add person
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Step {step} of 3</div>
            </div>

            {step === 1 ? (
              <>
                <div style={{ display: "grid", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#0f172a" }}>
                    <span style={{ fontWeight: 600 }}>Full name</span>
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                      autoFocus
                      placeholder="Jane Smith"
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#0f172a" }}>
                    <span style={{ fontWeight: 600 }}>Email (optional)</span>
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      placeholder="jane@agency.com"
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                  </label>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={reset}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={!isStep1Valid}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #111827",
                      background: "#111827",
                      color: "#fff",
                      fontWeight: 700,
                      opacity: isStep1Valid ? 1 : 0.6,
                      cursor: isStep1Valid ? "pointer" : "not-allowed",
                    }}
                  >
                    Next
                  </button>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <div style={{ display: "grid", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#0f172a" }}>
                    <span style={{ fontWeight: 600 }}>Primary office</span>
                    <select
                      value={primaryAgencyId}
                      onChange={(event) => setPrimaryAgencyId(event.target.value)}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">No primary office</option>
                      {agencies.map((agency) => (
                        <option key={agency.id} value={agency.id}>
                          {agency.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={reset}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        fontWeight: 600,
                      }}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      disabled={!isStep1Valid}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #111827",
                        background: "#111827",
                        color: "#fff",
                        fontWeight: 700,
                        opacity: isStep1Valid ? 1 : 0.6,
                        cursor: isStep1Valid ? "pointer" : "not-allowed",
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <form action={createPerson} style={{ display: "grid", gap: 16 }}>
                <div style={{ display: "grid", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#0f172a" }}>
                    <span style={{ fontWeight: 600 }}>Team</span>
                    <select
                      value={teamId}
                      onChange={(event) => setTeamId(event.target.value)}
                      required
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">Select team</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#0f172a" }}>
                    <span style={{ fontWeight: 600 }}>Role (optional)</span>
                    <select
                      value={roleId}
                      onChange={(event) => setRoleId(event.target.value)}
                      disabled={!teamId}
                      style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      <option value="">No role</option>
                      {teamRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      name="isAdmin"
                      checked={isAdmin}
                      onChange={(event) => setIsAdmin(event.target.checked)}
                    />
                    Admin
                  </label>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      name="isManager"
                      checked={isManager}
                      onChange={(event) => setIsManager(event.target.checked)}
                    />
                    Manager
                  </label>
                </div>

                <input type="hidden" name="fullName" value={fullName} readOnly />
                <input type="hidden" name="email" value={email} readOnly />
                <input type="hidden" name="teamId" value={teamId} readOnly />
                <input type="hidden" name="roleId" value={roleId} readOnly />
                <input type="hidden" name="primaryAgencyId" value={primaryAgencyId} readOnly />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={reset}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      fontWeight: 600,
                    }}
                  >
                    Cancel
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        fontWeight: 600,
                      }}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      onClick={() => setTimeout(reset, 0)}
                      disabled={!isStep3Valid}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #111827",
                        background: "#111827",
                        color: "#fff",
                        fontWeight: 700,
                        opacity: isStep3Valid ? 1 : 0.6,
                        cursor: isStep3Valid ? "pointer" : "not-allowed",
                      }}
                    >
                      Create person
                    </button>
                  </div>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
