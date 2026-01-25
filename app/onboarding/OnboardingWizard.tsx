"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_TEAMS, OfficePayload, OnboardingPayload, makeOffice } from "./config";

type WizardOffice = OfficePayload & { address?: string };

function splitOwnerName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  const firstName = parts.shift() || "";
  const lastName = parts.join(" ");
  return { firstName, lastName };
}

const fieldBaseStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#ffffff",
  boxSizing: "border-box",
};

const inputStyle: CSSProperties = {
  ...fieldBaseStyle,
  padding: 8,
  width: "100%",
};

const selectStyle: CSSProperties = {
  ...fieldBaseStyle,
  padding: 8,
  width: "100%",
};

export default function OnboardingWizard({ onSubmit }: { onSubmit: (formData: FormData) => void }) {
  const router = useRouter();
  const defaultTeams = DEFAULT_TEAMS.map((t) => ({ name: t.name, roles: [...t.roles] }));
  const [ownerFirstName, setOwnerFirstName] = useState("");
  const [ownerLastName, setOwnerLastName] = useState("");
  const [ownerNameTouched, setOwnerNameTouched] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [officeCount, setOfficeCount] = useState(1);
  const sameForAll = true;
  const [step, setStep] = useState(0);
  const [isOpen, setIsOpen] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [showOwnerNameError, setShowOwnerNameError] = useState(false);
  const [showProfileNameError, setShowProfileNameError] = useState(false);
  const steps = ["Profile", "LoBs & Products", "Teams & Roles", "Roster", "Household Fields & Buckets"];
  const [offices, setOffices] = useState<WizardOffice[]>([
    { ...makeOffice("Legacy"), teams: defaultTeams.map((t) => ({ name: t.name, roles: [...t.roles] })), address: "" },
    { ...makeOffice("MOA"), teams: defaultTeams.map((t) => ({ name: t.name, roles: [...t.roles] })), address: "" },
    { ...makeOffice("TROA"), teams: defaultTeams.map((t) => ({ name: t.name, roles: [...t.roles] })), address: "" },
  ]);

  const officeTabs = useMemo(() => offices.slice(0, officeCount), [offices, officeCount]);
  const officeOptions = officeTabs.map((o, idx) => o.name || `Office ${idx + 1}`);
  const hasMultipleOffices = officeTabs.length > 1;
  const rosterPrimaryOfficeMissing =
    hasMultipleOffices &&
    officeTabs.some((office) =>
      office.people.some((person) => !person.primaryOfficeName || !person.primaryOfficeName.trim())
    );
  const ownerName = [ownerFirstName, ownerLastName].filter(Boolean).join(" ").trim();
  const ownerFirstNameMissing = !ownerFirstName.trim();
  const ownerLastNameMissing = !ownerLastName.trim();
  const ownerNameMissing = ownerFirstNameMissing || ownerLastNameMissing;
  const profileNameMissing = !profileName.trim();
  const rosterStepIndex = steps.indexOf("Roster");
  const isRosterStep = step === rosterStepIndex;
  const isProfileStep = step === 0;
  const isLastStep = step === steps.length - 1;
  const isAdvanceBlocked =
    (isProfileStep && (ownerNameMissing || profileNameMissing)) ||
    (isRosterStep && rosterPrimaryOfficeMissing);

  const suffixes = ["Legacy", "MOA", "TROA"];

  useEffect(() => {
    if (ownerNameTouched || ownerFirstName.trim() || ownerLastName.trim()) return;
    let canceled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/login", { cache: "no-store" });
        const json = await res.json().catch(() => ({} as any));
        const fullName = typeof json?.fullName === "string" ? json.fullName.trim() : "";
        if (!fullName || canceled) return;
        const { firstName, lastName } = splitOwnerName(fullName);
        if (canceled || (!firstName && !lastName)) return;
        setOwnerFirstName(firstName);
        setOwnerLastName(lastName);
        const nextOwnerName = [firstName, lastName].filter(Boolean).join(" ").trim();
        if (nextOwnerName) applyDefaultOfficeNames(nextOwnerName, officeCount);
      } catch {
        return;
      }
    })();
    return () => {
      canceled = true;
    };
  }, [ownerNameTouched, ownerFirstName, ownerLastName, officeCount]);

  function applyDefaultOfficeNames(nextOwner: string, nextCount: number) {
    setOffices((prev) =>
      prev.map((o, idx) => {
        if (idx >= nextCount) return o;
        const suffix = suffixes[idx] || `Office ${idx + 1}`;
        const suggested = nextOwner ? `${nextOwner} ${suffix}` : o.name || suffix;
        return { ...o, name: suggested };
      })
    );
  }

  function updateOffice(idx: number, update: (o: WizardOffice) => WizardOffice) {
    setOffices((prev) => {
      const next = [...prev];
      next[idx] = update(prev[idx]);
      return next;
    });
  }

  function addProduct(
    idx: number,
    lobName: string,
    product: { name: string; productType: "PERSONAL" | "BUSINESS" }
  ) {
    if (!product.name.trim()) return;
    updateOffice(idx, (o) => ({
      ...o,
      lobs: o.lobs.map((l) =>
        l.name === lobName && !l.products.some((p) => p.name === product.name.trim())
          ? { ...l, products: [...l.products, { name: product.name.trim(), productType: product.productType }] }
          : l
      ),
    }));
  }

  function removeProduct(idx: number, lobName: string, product: string) {
    updateOffice(idx, (o) => ({
      ...o,
      lobs: o.lobs.map((l) =>
        l.name === lobName ? { ...l, products: l.products.filter((p) => p.name !== product) } : l
      ),
    }));
  }

  function addRole(idx: number, teamName: string, role: string) {
    if (!role.trim()) return;
    updateOffice(idx, (o) => ({
      ...o,
      teams: o.teams.map((t) =>
        t.name === teamName && !t.roles.includes(role.trim())
          ? { ...t, roles: [...t.roles, role.trim()] }
          : t
      ),
    }));
  }

  function removeRole(idx: number, teamName: string, role: string) {
    updateOffice(idx, (o) => ({
      ...o,
      teams: o.teams.map((t) =>
        t.name === teamName ? { ...t, roles: t.roles.filter((r) => r !== role) } : t
      ),
    }));
  }

  function addPerson(idx: number, person: WizardOffice["people"][number]) {
    updateOffice(idx, (o) => ({ ...o, people: [...o.people, person] }));
  }

  function updateField(idx: number, fieldName: string, updates: Partial<WizardOffice["householdFields"][number]>) {
    updateOffice(idx, (o) => ({
      ...o,
      householdFields: o.householdFields.map((f) =>
        f.fieldName === fieldName ? { ...f, ...updates } : f
      ),
    }));
  }

  function addField(idx: number, fieldName: string) {
    const trimmed = fieldName.trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase();
    setOffices((prev) =>
      prev.map((office, officeIdx) => {
        const shouldApply = sameForAll ? officeIdx < officeCount : officeIdx === idx;
        if (!shouldApply) return office;
        const exists = office.householdFields.some(
          (f) => f.fieldName.trim().toLowerCase() === normalized
        );
        if (exists) return office;
        return {
          ...office,
          householdFields: [...office.householdFields, { fieldName: trimmed, required: false, active: true }],
        };
      })
    );
  }

  async function handleSubmit() {
    setSubmitError(null);
    if (submitBusy) return;
    setSubmitBusy(true);
    if (ownerNameMissing || profileNameMissing) {
      setShowOwnerNameError(ownerNameMissing);
      setShowProfileNameError(profileNameMissing);
      setStep(0);
      setSubmitBusy(false);
      return;
    }
    const hasSingleOffice = officeTabs.length === 1;
    const singleOfficeName = officeOptions[0] || "Office 1";
    const baseOffice = officeTabs[0];
    if (!baseOffice) {
      setSubmitBusy(false);
      return;
    }
    const normalizedBaseOffice = {
      ...baseOffice,
      address: baseOffice.address ?? "",
      people: baseOffice.people.map((p) => ({
        ...p,
        primaryOfficeName: hasSingleOffice ? singleOfficeName : p.primaryOfficeName,
      })),
      lobs: baseOffice.lobs.map((l) => ({
        ...l,
        products: l.products
          .map((p) => ({ name: p.name.trim(), productType: p.productType }))
          .filter((p) => p.name),
      })),
      premiumBuckets: baseOffice.premiumBuckets,
    };
    const payloadOffices = officeTabs.map((office, idx) => ({
      ...normalizedBaseOffice,
      name: office.name || `Office ${idx + 1}`,
      address: office.address ?? "",
    }));
    const payload = {
      ownerName,
      profileName,
      address: "",
      sameForAll,
      offices: payloadOffices,
    } as OnboardingPayload;
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    try {
      await onSubmit(formData);
      setIsOpen(false);
      setShowBanner(true);
      router.push("/agencies");
    } catch (err) {
      console.error("[onboarding] submit failed", err);
      setSubmitError("Onboarding failed. Please refresh and try again.");
      setShowBanner(false);
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <>
      {showBanner ? (
        <div
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            background: "#22c55e",
            color: "#0f172a",
            padding: "10px 16px",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(16,185,129,0.25)",
            fontWeight: 800,
          }}
        >
          Agency Created
        </div>
      ) : null}
      {isOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 40,
            padding: 24,
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <div
            className="surface"
            style={{
              position: "relative",
              maxWidth: 1100,
              margin: "0 auto",
              background: "#f8f9fa",
            }}
          >
            <div style={{ position: "absolute", right: 16, top: 16 }}>
              <Link
                href="/agencies"
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #dfe5d6",
                  background: "#ffffff",
                  color: "#283618",
                  textDecoration: "none",
                  fontWeight: 700,
                  pointerEvents: submitBusy ? "none" : "auto",
                  opacity: submitBusy ? 0.6 : 1,
                }}
                aria-disabled={submitBusy}
                tabIndex={submitBusy ? -1 : 0}
              >
                Exit
              </Link>
            </div>
            {submitError ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #fecaca",
                  background: "#fee2e2",
                  color: "#991b1b",
                  fontWeight: 600,
                }}
              >
                {submitError}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              {steps.map((s, idx) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (idx > 0 && (ownerNameMissing || profileNameMissing)) {
                      setShowOwnerNameError(ownerNameMissing);
                      setShowProfileNameError(profileNameMissing);
                      setStep(0);
                      return;
                    }
                    setStep(idx);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: step === idx ? "2px solid #e31836" : "1px solid #dfe5d6",
                    background: step === idx ? "#e31836" : "#f8f9fa",
                    color: step === idx ? "#f8f9fa" : "#283618",
                    fontWeight: 700,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {step === 0 ? (
              <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>Office Profile</h2>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                  <label>
                    Owner / Agent first name
                    <br />
                    <input
                      value={ownerFirstName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOwnerNameTouched(true);
                        setOwnerFirstName(val);
                        const nextOwnerName = [val, ownerLastName].filter(Boolean).join(" ").trim();
                        applyDefaultOfficeNames(nextOwnerName, officeCount);
                        if (val.trim() && ownerLastName.trim()) {
                          setShowOwnerNameError(false);
                        }
                      }}
                      placeholder="e.g., Nadeem"
                      required
                      aria-invalid={showOwnerNameError && ownerNameMissing}
                      style={{ ...inputStyle, padding: 10 }}
                    />
                  </label>
                  <label>
                    Owner / Agent last name
                    <br />
                    <input
                      value={ownerLastName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOwnerNameTouched(true);
                        setOwnerLastName(val);
                        const nextOwnerName = [ownerFirstName, val].filter(Boolean).join(" ").trim();
                        applyDefaultOfficeNames(nextOwnerName, officeCount);
                        if (val.trim() && ownerFirstName.trim()) {
                          setShowOwnerNameError(false);
                        }
                      }}
                      placeholder="e.g., Moustafa"
                      required
                      aria-invalid={showOwnerNameError && ownerNameMissing}
                      style={{ ...inputStyle, padding: 10 }}
                    />
                    {showOwnerNameError && ownerNameMissing ? (
                      <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>
                        First and last name are required.
                      </div>
                    ) : null}
                  </label>
                  <label>
                    Agency profile name
                    <br />
                    <input
                      value={profileName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProfileName(val);
                        if (val.trim()) {
                          setShowProfileNameError(false);
                        }
                      }}
                      placeholder="e.g., Nadeem Moustafa Agency"
                      required
                      aria-invalid={showProfileNameError && profileNameMissing}
                      style={{ ...inputStyle, padding: 10 }}
                    />
                    {showProfileNameError && profileNameMissing ? (
                      <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 4 }}>
                        Profile name is required.
                      </div>
                    ) : null}
                  </label>
                </div>
                <div>
                  <div style={{ marginBottom: 6, fontWeight: 700 }}>How many offices?</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setOfficeCount(n);
                          applyDefaultOfficeNames(ownerName, n);
                        }}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: officeCount === n ? "2px solid #1f6feb" : "1px solid #d0d5dd",
                          background: officeCount === n ? "#eef3ff" : "#f8f9fb",
                        }}
                      >
                        {n} Office{n > 1 ? "s" : ""}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {officeTabs.map((o, idx) => (
                    <div
                      key={idx}
                      style={{ padding: "12px", border: "1px solid #e5e7eb", borderRadius: 10, background: "#ffffff" }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>Office {idx + 1}</div>
                      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                        <label>
                          Office name
                          <br />
                          <input
                            value={o.name}
                            onChange={(e) =>
                              updateOffice(idx, (office) => ({
                                ...office,
                                name: e.target.value,
                              }))
                            }
                            placeholder={suffixes[idx] || `Office ${idx + 1}`}
                            style={inputStyle}
                          />
                        </label>
                        <label>
                          Office address
                          <br />
                          <input
                            value={o.address ?? ""}
                            onChange={(e) =>
                              updateOffice(idx, (office) => ({
                                ...office,
                                address: e.target.value,
                              }))
                            }
                            placeholder="e.g., 123 Main St, Springfield"
                            style={inputStyle}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {step >= 1 && officeTabs[0] ? (
              <OfficeEditor
                office={officeTabs[0]}
                officeIndex={0}
                updateOffice={updateOffice}
                addProduct={addProduct}
                removeProduct={removeProduct}
                addRole={addRole}
                removeRole={removeRole}
                addPerson={addPerson}
                updateField={updateField}
                addField={addField}
                step={step - 1} // shift because profile is step 0
                officeOptions={officeOptions}
              />
            ) : null}

            {isRosterStep && rosterPrimaryOfficeMissing ? (
              <div style={{ marginTop: 12, color: "#b45309", fontSize: 13 }}>
                Primary Office is required for each team member when multiple offices are set.
              </div>
            ) : null}

            {isLastStep ? (
              <div style={{ marginTop: 12, color: "#475569", fontSize: 13 }}>
                Office on a Sold Product can differ from a person's Primary Office. Primary Office is only a default.
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #dfe5d6", background: "#f8f9fa" }}
                >
                  Previous
                </button>
                {!isLastStep ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (isProfileStep && (ownerNameMissing || profileNameMissing)) {
                        setShowOwnerNameError(ownerNameMissing);
                        setShowProfileNameError(profileNameMissing);
                        return;
                      }
                      if (isRosterStep && rosterPrimaryOfficeMissing) return;
                      setStep((s) => Math.min(steps.length - 1, s + 1));
                    }}
                    disabled={isAdvanceBlocked}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #3f5f46",
                      background: "#3f5f46",
                      color: "#f8f9fa",
                      opacity: isAdvanceBlocked ? 0.5 : 1,
                      cursor: isAdvanceBlocked ? "not-allowed" : "pointer",
                    }}
                  >
                    Next
                  </button>
                ) : null}
              </div>
              {isLastStep ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitBusy}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e31836",
                    background: "#e31836",
                    color: "#f8f9fa",
                    fontWeight: 700,
                    opacity: submitBusy ? 0.7 : 1,
                    cursor: submitBusy ? "not-allowed" : "pointer",
                  }}
                >
                  {submitBusy ? "Saving..." : "Save & Finish"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function OfficeEditor({
  office,
  officeIndex,
  updateOffice,
  addProduct,
  removeProduct,
  addRole,
  removeRole,
  addPerson,
  updateField,
  addField,
  step,
  officeOptions,
}: {
  office: WizardOffice;
  officeIndex: number;
  updateOffice: (idx: number, update: (o: WizardOffice) => WizardOffice) => void;
  addProduct: (
    idx: number,
    lobName: string,
    product: { name: string; productType: "PERSONAL" | "BUSINESS" }
  ) => void;
  removeProduct: (idx: number, lobName: string, product: string) => void;
  addRole: (idx: number, teamName: string, role: string) => void;
  removeRole: (idx: number, teamName: string, role: string) => void;
  addPerson: (idx: number, person: WizardOffice["people"][number]) => void;
  updateField: (
    idx: number,
    fieldName: string,
    updates: Partial<WizardOffice["householdFields"][number]>
  ) => void;
  addField: (idx: number, fieldName: string) => void;
  step: number;
  officeOptions: string[];
}) {
  const officeSteps = {
    lobs: 0,
    teams: 1,
    roster: 2,
    household: 3,
  };
  const isHouseholdStep = step === officeSteps.household;
  const [customFieldName, setCustomFieldName] = useState("");

  const handleAddCustomField = () => {
    const trimmed = customFieldName.trim();
    if (!trimmed) return;
    const normalized = trimmed.toLowerCase();
    const exists = office.householdFields.some(
      (f) => f.fieldName.trim().toLowerCase() === normalized
    );
    if (exists) return;
    addField(officeIndex, trimmed);
    setCustomFieldName("");
  };

  return (
    <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
      {step === 0 ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 700 }}>Lines of Business & Products</div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 8 }}>
              Activate LoBs and adjust products once for your organization.
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {office.lobs.map((lob, i) => (
                <div key={lob.name} style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: 10 }}>
                  <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={lob.active}
                      onChange={(e) =>
                        updateOffice(officeIndex, (o) => ({
                          ...o,
                          lobs: o.lobs.map((l, idx) => (idx === i ? { ...l, active: e.target.checked } : l)),
                        }))
                      }
                    />
                    {lob.name} ({lob.premiumCategory})
                  </label>
                  {lob.active ? (
                    <>
                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        {lob.products.map((p) => (
                          <div
                            key={p.name}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 160px auto",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <span>{p.name}</span>
                            <select
                              value={p.productType}
                              onChange={(e) =>
                                updateOffice(officeIndex, (o) => ({
                                  ...o,
                                  lobs: o.lobs.map((l2) =>
                                    l2.name === lob.name
                                      ? {
                                          ...l2,
                                          products: l2.products.map((prod) =>
                                            prod.name === p.name
                                              ? { ...prod, productType: e.target.value as "PERSONAL" | "BUSINESS" }
                                              : prod
                                          ),
                                        }
                                      : l2
                                  ),
                                }))
                              }
                              style={{ ...selectStyle, padding: 6 }}
                            >
                              <option value="PERSONAL">Personal</option>
                              <option value="BUSINESS">Business</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => removeProduct(officeIndex, lob.name, p.name)}
                              style={{ border: "none", background: "transparent", cursor: "pointer" }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                          padding: "10px 12px",
                          border: "1px dashed #cbd5e1",
                          borderRadius: 10,
                          background: "#f8fafc",
                        }}
                      >
                        <input
                          placeholder="Add product"
                          style={{ ...inputStyle, width: 220 }}
                          data-lob-input={`${officeIndex}-${lob.name}`}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addProduct(officeIndex, lob.name, {
                                name: (e.target as HTMLInputElement).value,
                                productType: "PERSONAL",
                              });
                              (e.target as HTMLInputElement).value = "";
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const input = document.querySelector(
                              `input[data-lob-input='${officeIndex}-${lob.name}']`
                            ) as HTMLInputElement | null;
                            if (input?.value) {
                              addProduct(officeIndex, lob.name, { name: input.value, productType: "PERSONAL" });
                              input.value = "";
                            }
                          }}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid #d1d5db",
                            background: "#283618",
                            color: "#f8f9fa",
                            cursor: "pointer",
                            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
                          }}
                        >
                          Add
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700 }}>Teams & Roles</div>
          <div style={{ color: "#555", fontSize: 13, marginBottom: 8 }}>
            Rename teams or edit roles. These drive assignments for people.
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {office.teams.map((team, idx) => (
              <div key={team.name + idx} style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: 10 }}>
                <label>
                  Team name
                  <br />
                  <input
                    value={team.name}
                    onChange={(e) =>
                      updateOffice(officeIndex, (o) => ({
                        ...o,
                        teams: o.teams.map((t, i2) => (i2 === idx ? { ...t, name: e.target.value } : t)),
                      }))
                    }
                    style={inputStyle}
                  />
                </label>
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {team.roles.map((r) => (
                    <span
                      key={r}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid #d0d5dd",
                        background: "#f8f9fb",
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      {r}
                      <button
                        type="button"
                        onClick={() => removeRole(officeIndex, team.name, r)}
                        style={{ border: "none", background: "transparent", cursor: "pointer" }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                  <input
                    placeholder="Add role"
                    style={{ ...inputStyle, width: 220 }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRole(officeIndex, team.name, (e.target as HTMLInputElement).value);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700 }}>Team Members</div>
          <PersonEditor
            office={office}
            officeIndex={officeIndex}
            addPerson={addPerson}
            officeOptions={officeOptions}
          />
        </div>
      ) : null}

      {isHouseholdStep ? (
        <>
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 14,
              background: "#f8fafc",
              boxShadow: "0 6px 16px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div style={{ fontWeight: 700 }}>Household Fields</div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 8 }}>
              These fields are collected when creating or editing a Sold Product / Policy. Required fields must be completed before a sale can be saved.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {office.householdFields.map((f) => (
                <details
                  key={f.fieldName}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 12,
                    background: "#ffffff",
                  }}
                >
                  <summary style={{ display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                        <span>{f.fieldName}</span>
                        {f.required ? (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: "#e2e8f0",
                              color: "#475569",
                              fontWeight: 700,
                            }}
                          >
                            Required
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        Appears on Sold Product form
                      </div>
                    </div>
                    <div style={{ display: "inline-flex", gap: 12, alignItems: "center", marginLeft: "auto" }}>
                      <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="checkbox"
                          checked={f.active}
                          onChange={(e) =>
                            updateField(officeIndex, f.fieldName, {
                              active: e.target.checked,
                              required: e.target.checked ? f.required : false,
                            })
                          }
                        />
                        Active
                      </label>
                      <label
                        style={{
                          display: "inline-flex",
                          gap: 6,
                          alignItems: "center",
                          opacity: f.active ? 1 : 0.5,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={f.required}
                          disabled={!f.active}
                          onChange={(e) => updateField(officeIndex, f.fieldName, { required: e.target.checked })}
                        />
                        Required
                      </label>
                    </div>
                  </summary>
                  <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>Options (comma-separated)</span>
                      <input
                        type="text"
                        value={f.options || ""}
                        onChange={(e) => updateField(officeIndex, f.fieldName, { options: e.target.value })}
                        placeholder="e.g., ILP, Referral, Outbound"
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        Leave blank for free-text. If provided, field becomes a dropdown.
                      </span>
                    </label>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>Character limit (optional)</span>
                      <input
                        type="number"
                        value={f.charLimit || ""}
                        onChange={(e) => updateField(officeIndex, f.fieldName, { charLimit: e.target.value === "" ? undefined : Number(e.target.value) })}
                        placeholder="e.g., 50"
                        style={inputStyle}
                      />
                      <span style={{ fontSize: 12, color: "#6b7280" }}>Limit length for names/links if needed.</span>
                    </label>
                  </div>
                </details>
              ))}
            </div>
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  placeholder="Add custom field"
                  value={customFieldName}
                  onChange={(e) => setCustomFieldName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomField();
                    }
                  }}
                  style={{ ...inputStyle, width: 260 }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomField}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    background: "#283618",
                    color: "#f8f9fa",
                    cursor: "pointer",
                  }}
                >
                  Add
                </button>
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Press Enter or click Add.</div>
            </div>
          </div>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 14,
              background: "#f8fafc",
              boxShadow: "0 6px 16px rgba(15, 23, 42, 0.06)",
            }}
          >
            <div style={{ fontWeight: 700 }}>Premium Buckets</div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 8 }}>
              Buckets group products/LoBs for reporting/commission. Defaults provided.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {office.premiumBuckets.map((b, idx) => (
                <div key={b.name + idx} style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 600 }}>{b.name}</div>
                  {b.description ? <div style={{ color: "#555", fontSize: 13 }}>{b.description}</div> : null}
                  <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>
                    LoBs: {b.includesLobs.length ? b.includesLobs.join(", ") : "—"}
                  </div>
                  <div style={{ color: "#555", fontSize: 13 }}>
                    Products: {b.includesProducts.length ? b.includesProducts.join(", ") : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function PersonEditor({
  office,
  officeIndex,
  addPerson,
  officeOptions,
}: {
  office: WizardOffice;
  officeIndex: number;
  addPerson: (idx: number, person: WizardOffice["people"][number]) => void;
  officeOptions: string[];
}) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    team: office.teams[0]?.name || "",
    role: office.teams[0]?.roles[0] || "",
    primaryOfficeName: officeOptions[0] || "",
    isAdmin: false,
    isManager: false,
  });
  const [personError, setPersonError] = useState("");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <label>
          Full name
          <br />
          <input
            value={form.fullName}
            onChange={(e) => {
              setForm((f) => ({ ...f, fullName: e.target.value }));
              setPersonError("");
            }}
            style={inputStyle}
          />
        </label>
        <label>
          Email
          <br />
          <input
            value={form.email}
            onChange={(e) => {
              setForm((f) => ({ ...f, email: e.target.value }));
              setPersonError("");
            }}
            style={inputStyle}
          />
        </label>
        <label>
          Team
          <br />
          <select
            value={form.team}
            onChange={(e) => {
              const nextTeam = e.target.value;
              const nextRole =
                office.teams.find((t) => t.name === nextTeam)?.roles[0] || "";
              setForm((f) => ({ ...f, team: nextTeam, role: nextRole }));
              setPersonError("");
            }}
            style={selectStyle}
          >
            {office.teams.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Role
          <br />
          <select
            value={form.role}
            onChange={(e) => {
              setForm((f) => ({ ...f, role: e.target.value }));
              setPersonError("");
            }}
            style={selectStyle}
          >
            {office.teams
              .find((t) => t.name === form.team)
              ?.roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
          </select>
        </label>
        <label>
          Primary Office
          <br />
          <select
            value={form.primaryOfficeName}
            onChange={(e) => {
              setForm((f) => ({ ...f, primaryOfficeName: e.target.value }));
              setPersonError("");
            }}
            style={selectStyle}
          >
            {officeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            Used as the default office for new sales and reporting. You can change the office per policy later.
          </div>
        </label>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.isAdmin}
            onChange={(e) => setForm((f) => ({ ...f, isAdmin: e.target.checked }))}
          />
          Admin
        </label>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={form.isManager}
            onChange={(e) => setForm((f) => ({ ...f, isManager: e.target.checked }))}
          />
          Manager
        </label>
        <button
          type="button"
          onClick={() => {
            const trimmedName = form.fullName.trim();
            const trimmedRole = form.role.trim();
            const teamRoles = office.teams.find((t) => t.name === form.team)?.roles || [];
            const roleValid = Boolean(trimmedRole && teamRoles.includes(trimmedRole));
            const primaryOfficeValid = Boolean(form.primaryOfficeName.trim());
            if (!trimmedName || !primaryOfficeValid || !roleValid) {
              setPersonError(
                !trimmedName
                  ? "Full name is required."
                  : !roleValid
                    ? "Select a valid role for the team."
                    : "Primary office is required."
              );
              return;
            }
            setPersonError("");
            addPerson(officeIndex, form);
            setForm({
              fullName: "",
              email: "",
              team: office.teams[0]?.name || "",
              role: office.teams[0]?.roles[0] || "",
              primaryOfficeName: officeOptions[0] || "",
              isAdmin: false,
              isManager: false,
            });
          }}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}
        >
          Add team member
        </button>
      </div>
      {personError ? <div style={{ color: "#b91c1c", fontSize: 12 }}>{personError}</div> : null}

      <div style={{ display: "grid", gap: 6 }}>
        {office.people.map((p, idx) => (
          <div
            key={p.fullName + idx}
            style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: 8, display: "flex", justifyContent: "space-between" }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{p.fullName}</div>
              <div style={{ color: "#555", fontSize: 13 }}>
                {p.email || "No email"} • {p.team} / {p.role} {p.isAdmin ? "• Admin" : ""} {p.isManager ? "• Manager" : ""}
              </div>
            </div>
            <button
              type="button"
              disabled
              style={{ padding: "6px 10px", opacity: 0.5, cursor: "not-allowed" }}
            >
              Send invite
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
