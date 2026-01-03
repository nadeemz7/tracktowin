"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { OfficePayload, OnboardingPayload, makeOffice } from "./config";

type WizardOffice = OfficePayload;

export default function OnboardingWizard({ onSubmit }: { onSubmit: (formData: FormData) => void }) {
  const [ownerName, setOwnerName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [address, setAddress] = useState("");
  const [officeCount, setOfficeCount] = useState(1);
  const [sameForAll, setSameForAll] = useState(true);
  const [activeOfficeIndex, setActiveOfficeIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [isOpen, setIsOpen] = useState(true);
  const [showBanner, setShowBanner] = useState(false);
  const steps = ["Profile", "Offices & LOBs", "Teams & Roles", "Roster", "Household Fields & Buckets"];
  const [offices, setOffices] = useState<WizardOffice[]>([
    makeOffice("Legacy"),
    makeOffice("MOA"),
    makeOffice("TROA"),
  ]);

  const officeTabs = useMemo(() => offices.slice(0, officeCount), [offices, officeCount]);

  const suffixes = ["Legacy", "MOA", "TROA"];

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
    if (!fieldName.trim()) return;
    updateOffice(idx, (o) => ({
      ...o,
      householdFields: [...o.householdFields, { fieldName: fieldName.trim(), required: false, active: true }],
    }));
  }

  function handleSubmit() {
    const payload: OnboardingPayload = {
      ownerName,
      profileName,
      address,
      sameForAll,
      offices: officeTabs.map((o) => ({
        ...o,
        lobs: o.lobs.map((l) => ({
          ...l,
          products: l.products
            .map((p) => ({ name: p.name.trim(), productType: p.productType }))
            .filter((p) => p.name),
        })),
        premiumBuckets: o.premiumBuckets,
      })),
    };
    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    onSubmit(formData);
    setIsOpen(false);
    setShowBanner(true);
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
            }}
          >
            Exit
          </Link>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          {steps.map((s, idx) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(idx)}
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
                Owner / Agent full name
                <br />
                <input
                  value={ownerName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setOwnerName(val);
                    applyDefaultOfficeNames(val, officeCount);
                  }}
                  placeholder="e.g., Nadeem Moustafa"
                  style={{ padding: 10, width: "100%" }}
                />
              </label>
              <label>
                Agency profile name
                <br />
                <input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g., Nadeem Moustafa Agency"
                  style={{ padding: 10, width: "100%" }}
                />
              </label>
              <label>
                Office address (optional)
                <br />
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g., 123 Main St, Springfield"
                  style={{ padding: 10, width: "100%" }}
                />
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
                      setActiveOfficeIndex(0);
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
            <div style={{ display: "grid", gap: 6, color: "#555" }}>
              {officeTabs.map((o, idx) => (
                <div key={idx} style={{ padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 10 }}>
                  <div style={{ fontWeight: 700 }}>Office {idx + 1}</div>
                  <div>{o.name || `${ownerName || "Office"} ${suffixes[idx] || idx + 1}`}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <input type="checkbox" checked={sameForAll} onChange={(e) => setSameForAll(e.target.checked)} />
              <span>Apply same products/teams/fields to all offices</span>
            </div>
          </div>
        ) : null}

        {step >= 1 ? (
          <>
            <h2 style={{ marginTop: 0 }}>Offices</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setOfficeCount(n);
                    setActiveOfficeIndex(0);
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

          </>
        ) : null}

        {step >= 1 ? (
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {officeTabs.map((o, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveOfficeIndex(idx)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: activeOfficeIndex === idx ? "2px solid #1f6feb" : "1px solid #d0d5dd",
                  background: activeOfficeIndex === idx ? "#eef3ff" : "#f8f9fb",
                }}
              >
                {o.name || `Office ${idx + 1}`}
              </button>
            ))}
          </div>
        ) : null}

        {step >= 1 && officeTabs[activeOfficeIndex] ? (
          <OfficeEditor
            office={officeTabs[activeOfficeIndex]}
            officeIndex={activeOfficeIndex}
            updateOffice={updateOffice}
            addProduct={addProduct}
            removeProduct={removeProduct}
            addRole={addRole}
            removeRole={removeRole}
            addPerson={addPerson}
            updateField={updateField}
            addField={addField}
            step={step - 1} // shift because profile is step 0
            officeOptions={officeTabs.map((o) => o.name)}
          />
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
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #3f5f46", background: "#3f5f46", color: "#f8f9fa" }}
          >
            Next
          </button>
        </div>
        <button type="button" onClick={handleSubmit} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #e31836", background: "#e31836", color: "#f8f9fa", fontWeight: 700 }}>
          Save &amp; Create
        </button>
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
  return (
    <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
      {step === 0 ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
            <label>
              Office name
              <br />
              <input
                value={office.name}
                onChange={(e) =>
                  updateOffice(officeIndex, (o) => ({
                    ...o,
                    name: e.target.value,
                  }))
                }
                style={{ padding: 8, width: "100%" }}
              />
            </label>
          </div>

          <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 700 }}>Lines of Business & Products</div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 8 }}>
              Activate LoBs and adjust products. Defaults applied for each office.
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
                              style={{ padding: 6 }}
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
                          style={{ padding: 8, width: 220, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}
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
                    style={{ padding: 8, width: "100%" }}
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
                    style={{ padding: 8, width: 220 }}
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

      {step === 3 ? (
        <>
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
            <div style={{ fontWeight: 700 }}>Household Fields</div>
            <div style={{ color: "#555", fontSize: 13, marginBottom: 8 }}>
              Choose what to collect per household. Required fields must be filled by users.
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {office.householdFields.map((f) => (
                <details
                  key={f.fieldName}
                  style={{
                    border: "1px solid #e9e9e9",
                    borderRadius: 8,
                    padding: 10,
                    background: "#fff",
                  }}
                >
                  <summary style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                    <div style={{ flex: 1, fontWeight: 600 }}>{f.fieldName}</div>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={f.active}
                        onChange={(e) => updateField(officeIndex, f.fieldName, { active: e.target.checked })}
                      />
                      Active
                    </label>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) => updateField(officeIndex, f.fieldName, { required: e.target.checked })}
                      />
                      Required
                    </label>
                  </summary>
                  <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>Options (comma-separated)</span>
                      <input
                        type="text"
                        value={f.options || ""}
                        onChange={(e) => updateField(officeIndex, f.fieldName, { options: e.target.value })}
                        placeholder="e.g., ILP, Referral, Outbound"
                        style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 8 }}
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
                        style={{ padding: 8, border: "1px solid #e5e7eb", borderRadius: 8 }}
                      />
                      <span style={{ fontSize: 12, color: "#6b7280" }}>Limit length for names/links if needed.</span>
                    </label>
                  </div>
                </details>
              ))}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <input
                placeholder="Add custom field"
                style={{ padding: 8, width: 260 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addField(officeIndex, (e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
              />
            </div>
          </div>

          <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 12 }}>
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

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <label>
          Full name
          <br />
          <input
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            style={{ padding: 8, width: "100%" }}
          />
        </label>
        <label>
          Email
          <br />
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            style={{ padding: 8, width: "100%" }}
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
            }}
            style={{ padding: 8, width: "100%" }}
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
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            style={{ padding: 8, width: "100%" }}
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
          Primary office
          <br />
          <select
            value={form.primaryOfficeName}
            onChange={(e) => setForm((f) => ({ ...f, primaryOfficeName: e.target.value }))}
            style={{ padding: 8, width: "100%" }}
          >
            {officeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
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
            if (!form.fullName.trim()) return;
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
            <button type="button" style={{ padding: "6px 10px" }}>
              Send invite
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
