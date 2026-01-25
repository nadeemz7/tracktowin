"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TeamType = "SALES" | "CS";

type AgencyWithProducts = {
  id: string;
  name: string;
  linesOfBusiness: {
    id: string;
    name: string;
    premiumCategory: string;
    products: { id: string; name: string; productType: string }[];
  }[];
};

type Person = {
  id: string;
  fullName: string;
  teamType: TeamType;
  active: boolean;
  primaryAgencyId?: string | null;
};

type HouseholdOption = {
  id: string;
  agencyId: string;
  firstName: string;
  lastName: string;
  ecrmLink: string | null;
  marketingSource: string | null;
  onboarded: boolean;
  agency: { id: string; name: string };
};

type Props = {
  agencies: AgencyWithProducts[];
  people: Person[];
  households: HouseholdOption[];
  preselectedHousehold: HouseholdOption | null;
  searchFirst: string;
  searchLast: string;
  selectedAgencyId?: string;
  openByDefault?: boolean;
  returnTo?: string;
  onSubmit: (formData: FormData) => Promise<void>;
};

const todayStr = new Date().toISOString().slice(0, 10);

export function NewSoldProductForm({
  agencies,
  people,
  households,
  preselectedHousehold,
  searchFirst,
  searchLast,
  selectedAgencyId,
  openByDefault = false,
  returnTo,
  onSubmit,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(openByDefault);
  const [step, setStep] = useState<"household" | "policy">(preselectedHousehold ? "policy" : "household");
  const [quantity, setQuantity] = useState(1);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState(preselectedHousehold?.id || "");
  const [searchFirstValue, setSearchFirstValue] = useState(searchFirst);
  const [searchLastValue, setSearchLastValue] = useState(searchLast);
  const [householdDraft, setHouseholdDraft] = useState({
    firstName: preselectedHousehold?.firstName || "",
    lastName: preselectedHousehold?.lastName || "",
    ecrmLink: preselectedHousehold?.ecrmLink || "",
    marketingSource: preselectedHousehold?.marketingSource || "",
    dateSold: todayStr,
    onboarded: preselectedHousehold?.onboarded || false,
  });

  const defaultAgencyId = preselectedHousehold?.agencyId || selectedAgencyId || agencies[0]?.id || "";
  const [agencyId, setAgencyId] = useState(defaultAgencyId);
  const [agencyTouched, setAgencyTouched] = useState(Boolean(preselectedHousehold));
  const initialLobId = agencies.find((a) => a.id === defaultAgencyId)?.linesOfBusiness[0]?.id || "";
  const [lineOfBusinessId, setLineOfBusinessId] = useState<string>(initialLobId);
  const [soldByPersonId, setSoldByPersonId] = useState("");

  const selectedAgency = agencies.find((a) => a.id === agencyId) || null;
  const linesOfBusiness = selectedAgency?.linesOfBusiness || [];
  const productsForLob = linesOfBusiness.find((lob) => lob.id === lineOfBusinessId)?.products || [];
  const returnToValue = returnTo?.trim();
  const hasSelectedHousehold = Boolean(selectedHouseholdId);

  const lobButtons = linesOfBusiness.map((lob) => ({
    id: lob.id,
    name: lob.name,
    color:
      lob.name.toLowerCase().includes("auto")
        ? "#f59e0b"
        : lob.name.toLowerCase().includes("fire")
          ? "#14b8a6"
          : lob.name.toLowerCase().includes("health")
            ? "#0f172a"
            : lob.name.toLowerCase().includes("life")
              ? "#f43f5e"
              : "#4338ca",
  }));

  function onSellerChange(nextPersonId: string) {
    setSoldByPersonId(nextPersonId);
    if (!nextPersonId || agencyTouched) return;
    const person = people.find((p) => p.id === nextPersonId);
    const nextAgency = person?.primaryAgencyId;
    if (!nextAgency || nextAgency === agencyId) return;
    setAgencyId(nextAgency);
    const nextAgencyData = agencies.find((a) => a.id === nextAgency);
    setLineOfBusinessId(nextAgencyData?.linesOfBusiness[0]?.id || "");
  }

  function onSearchHouseholds() {
    const params = new URLSearchParams(window.location.search);
    const first = searchFirstValue.trim();
    const last = searchLastValue.trim();
    params.set("open", "1");
    if (first) {
      params.set("first", first);
    } else {
      params.delete("first");
    }
    if (last) {
      params.set("last", last);
    } else {
      params.delete("last");
    }
    const query = params.toString();
    router.push(`${window.location.pathname}${query ? `?${query}` : ""}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          padding: "14px 18px",
          background: "#283618",
          color: "#f8f9fa",
          border: "none",
          borderRadius: 999,
          fontWeight: 700,
          boxShadow: "0 12px 30px rgba(40,54,24,0.28)",
          zIndex: 60,
        }}
      >
        + Add Household / Policy
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              maxWidth: 1080,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              border: "1px solid #dfe5d6",
              boxShadow: "0 24px 60px rgba(40,54,24,0.12)",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 22 }}>
                  {step === "household" ? "Add Policy Holder" : "Create Policies"}
                </div>
                <div style={{ color: "#6b7280", fontSize: 13 }}>
                  {step === "household"
                    ? "Enter household details to continue."
                    : "Pick LoB, product, premium, and save."}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #dfe5d6",
                  background: "#f8f9fa",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 16 }}>
              <form action={onSubmit} style={{ display: "grid", gap: 14 }}>
                <input type="hidden" name="open" value="1" />
                {returnToValue ? <input type="hidden" name="returnTo" value={returnToValue} /> : null}

                {step === "household" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
                      <div style={{ fontWeight: 700, marginBottom: 10 }}>Add Customer / Policy Holder</div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        <input
                          placeholder="First name"
                          value={searchFirstValue}
                          onChange={(e) => setSearchFirstValue(e.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            onSearchHouseholds();
                          }}
                          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db", width: 180 }}
                        />
                        <input
                          placeholder="Last name"
                          value={searchLastValue}
                          onChange={(e) => setSearchLastValue(e.target.value)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            onSearchHouseholds();
                          }}
                          style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db", width: 180 }}
                        />
                        <button
                          type="button"
                          onClick={onSearchHouseholds}
                          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", background: "#f8fafc" }}
                        >
                          Search households
                        </button>
                      </div>

                      {households.length > 0 ? (
                        <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                          {households.map((h) => (
                            <label
                              key={h.id}
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                padding: 8,
                                border: "1px solid #e3e6eb",
                                borderRadius: 8,
                                background: "#f8f9fb",
                              }}
                            >
                              <input
                                type="radio"
                                name="existingHouseholdChoice"
                                value={h.id}
                                checked={selectedHouseholdId === h.id}
                                onChange={() => {
                                  setSelectedHouseholdId(h.id);
                                  setHouseholdDraft((d) => ({
                                    ...d,
                                    firstName: h.firstName,
                                    lastName: h.lastName,
                                    ecrmLink: h.ecrmLink || "",
                                    marketingSource: h.marketingSource || "",
                                  }));
                                  setAgencyTouched(true);
                                  setAgencyId(h.agencyId);
                                  const nextAgency = agencies.find((a) => a.id === h.agencyId);
                                  setLineOfBusinessId(nextAgency?.linesOfBusiness[0]?.id || "");
                                }}
                              />
                              <div>
                                <div style={{ fontWeight: 600 }}>
                                  {h.firstName} {h.lastName}
                                </div>
                                <div style={{ color: "#555", fontSize: 13 }}>
                                  Agency: {h.agency.name}
                                  {h.ecrmLink ? ` • ECRM: ${h.ecrmLink}` : ""}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      ) : null}

                      <div style={{ display: "grid", gap: 10 }}>
                        <input
                          name="firstName"
                          placeholder="Customer first name *"
                          required={!selectedHouseholdId}
                          value={householdDraft.firstName}
                          onChange={(e) => setHouseholdDraft((d) => ({ ...d, firstName: e.target.value }))}
                          style={{ padding: 12, borderRadius: 10, border: "1px solid #d1d5db", fontSize: 15 }}
                        />
                        <input
                          name="lastName"
                          placeholder="Customer last name *"
                          required={!selectedHouseholdId}
                          value={householdDraft.lastName}
                          onChange={(e) => setHouseholdDraft((d) => ({ ...d, lastName: e.target.value }))}
                          style={{ padding: 12, borderRadius: 10, border: "1px solid #d1d5db", fontSize: 15 }}
                        />
                        <input
                          name="ecrmLink"
                          placeholder="ECRM Url"
                          value={householdDraft.ecrmLink}
                          onChange={(e) => setHouseholdDraft((d) => ({ ...d, ecrmLink: e.target.value }))}
                          style={{ padding: 12, borderRadius: 10, border: "1px solid #d1d5db", fontSize: 15 }}
                        />
                        <label style={{ fontSize: 14, color: "#6b7280" }}>
                          Marketing Source *
                          <select
                            name="marketingSource"
                            required={!selectedHouseholdId}
                            value={householdDraft.marketingSource}
                            onChange={(e) => setHouseholdDraft((d) => ({ ...d, marketingSource: e.target.value }))}
                            style={{ padding: 12, width: "100%", borderRadius: 10, border: "1px solid #d1d5db", marginTop: 4 }}
                          >
                            <option value="">Select source</option>
                            <option value="ILP">ILP</option>
                            <option value="Referral">Referral</option>
                            <option value="Outbound Call">Outbound Call</option>
                            <option value="Inbound Call">Inbound Call</option>
                            <option value="Winback">Winback</option>
                            <option value="Other">Other (specify in notes)</option>
                          </select>
                        </label>
                        <label style={{ fontSize: 14, color: "#6b7280" }}>
                          Written Date *
                          <input
                            name="dateSold"
                            type="date"
                            required
                            value={householdDraft.dateSold}
                            onChange={(e) => setHouseholdDraft((d) => ({ ...d, dateSold: e.target.value }))}
                            style={{ padding: 12, borderRadius: 10, border: "1px solid #d1d5db", marginTop: 4 }}
                          />
                        </label>
                        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                          <input
                            type="checkbox"
                            checked={householdDraft.onboarded}
                            onChange={(e) => setHouseholdDraft((d) => ({ ...d, onboarded: e.target.checked }))}
                          />
                          Onboarded
                        </label>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          border: "1px solid #dfe5d6",
                          background: "#f8f9fa",
                          color: "#283618",
                          fontWeight: 600,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            !selectedHouseholdId &&
                            (!householdDraft.firstName || !householdDraft.lastName || !householdDraft.marketingSource || !householdDraft.dateSold)
                          ) {
                            return;
                          }
                          setStep("policy");
                        }}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          border: "1px solid #e31836",
                          background: "#e31836",
                          color: "#f8f9fa",
                          fontWeight: 700,
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

                {step === "policy" && (
                  <div style={{ display: "grid", gap: 16 }}>
                    <input type="hidden" name="existingHouseholdId" value={selectedHouseholdId} />
                    {hasSelectedHousehold ? <input type="hidden" name="agencyId" value={agencyId} /> : null}
                    {!selectedHouseholdId && (
                      <>
                        <input type="hidden" name="firstName" value={householdDraft.firstName} />
                        <input type="hidden" name="lastName" value={householdDraft.lastName} />
                        <input type="hidden" name="ecrmLink" value={householdDraft.ecrmLink} />
                        <input type="hidden" name="onboarded" value={householdDraft.onboarded ? "on" : ""} />
                      </>
                    )}

                    <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
                      <label style={{ fontSize: 14, color: "#6b7280" }}>
                        Written Date *
                        <input
                          name="dateSold"
                          type="date"
                          defaultValue={householdDraft.dateSold || todayStr}
                          required
                          style={{ padding: 12, width: "100%", borderRadius: 10, border: "1px solid #d1d5db", marginTop: 4 }}
                        />
                      </label>
                      <label style={{ fontSize: 14, color: "#6b7280" }}>
                        Description (optional)
                        <textarea
                          name="notes"
                          placeholder="Description (optional)"
                          rows={3}
                          style={{ padding: 12, width: "100%", borderRadius: 10, border: "1px solid #d1d5db", marginTop: 4, resize: "vertical" }}
                        />
                      </label>
                      <label style={{ fontSize: 14, color: "#6b7280" }}>
                        Written by (team member) *
                        <select
                          name="soldByPersonId"
                          required
                          value={soldByPersonId}
                          onChange={(e) => onSellerChange(e.target.value)}
                          style={{ padding: 12, width: "100%", borderRadius: 10, border: "1px solid #d1d5db", marginTop: 4 }}
                        >
                          <option value="">Select team member</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.fullName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ fontSize: 14, color: "#6b7280" }}>
                        Source *
                        <select
                          name="marketingSource"
                          required={!hasSelectedHousehold}
                          disabled={hasSelectedHousehold}
                          defaultValue={householdDraft.marketingSource}
                          style={{ padding: 12, width: "100%", borderRadius: 10, border: "1px solid #d1d5db", marginTop: 4 }}
                        >
                          <option value="">{hasSelectedHousehold ? "(Household source)" : "Select source"}</option>
                          <option value="ILP">ILP</option>
                          <option value="Referral">Referral</option>
                          <option value="Outbound Call">Outbound Call</option>
                          <option value="Inbound Call">Inbound Call</option>
                          <option value="Winback">Winback</option>
                          <option value="Other">Other (specify in notes)</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 14, color: "#6b7280" }}>
                        Agency *
                        <select
                          name="agencyId"
                          required
                          value={agencyId}
                          disabled={hasSelectedHousehold}
                          onChange={(e) => {
                            const next = e.target.value;
                            setAgencyTouched(true);
                            setAgencyId(next);
                            const nextAgency = agencies.find((a) => a.id === next);
                            setLineOfBusinessId(nextAgency?.linesOfBusiness[0]?.id || "");
                          }}
                          style={{ padding: 12, width: "100%", borderRadius: 10, border: "1px solid #d1d5db", marginTop: 4 }}
                        >
                          <option value="">Select agency</option>
                          {agencies.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {lobButtons.map((lob) => (
                          <button
                            key={lob.id}
                            type="button"
                            onClick={() => setLineOfBusinessId(lob.id)}
                            style={{
                              padding: "12px 16px",
                              borderRadius: 12,
                              border: lineOfBusinessId === lob.id ? `3px solid ${lob.color}` : "1px solid #e5e7eb",
                              background: lineOfBusinessId === lob.id ? `${lob.color}22` : "#f8fafc",
                              color: "#111827",
                              fontWeight: 700,
                              minWidth: 96,
                            }}
                          >
                            {lob.name}
                          </button>
                        ))}
                      </div>

                      <label style={{ fontSize: 14, color: "#6b7280" }}>
                        Products *
                        <select
                          name="productId"
                          required
                          style={{ padding: 12, width: "100%", borderRadius: 10, border: "1px solid #d1d5db", marginTop: 4 }}
                        >
                          <option value="">Select product</option>
                          {productsForLob.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.productType})
                            </option>
                          ))}
                        </select>
                      </label>

                      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                        <label style={{ fontSize: 14, color: "#6b7280" }}>
                          Premium *
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              border: "1px solid #d1d5db",
                              borderRadius: 12,
                              marginTop: 4,
                            }}
                          >
                            <input
                              name="premium"
                              type="number"
                              min={0}
                              step="0.01"
                              required
                              style={{
                                padding: 12,
                                flex: 1,
                                border: "none",
                                borderRadius: 12,
                              }}
                            />
                            <span style={{ padding: "0 12px", color: "#6b7280" }}>$</span>
                          </div>
                        </label>

                        <label style={{ fontSize: 14, color: "#6b7280" }}>
                          Quantity
                          <div style={{ display: "inline-flex", alignItems: "center", marginTop: 4, border: "1px solid #d1d5db", borderRadius: 12 }}>
                            <button
                              type="button"
                              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                              style={{ padding: "10px 14px", border: "none", background: "#f8fafc", borderRadius: "12px 0 0 12px", fontWeight: 700 }}
                            >
                              –
                            </button>
                            <input
                              name="quantity"
                              type="number"
                              min={1}
                              value={quantity}
                              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                              style={{ width: 60, textAlign: "center", border: "none" }}
                            />
                            <button
                              type="button"
                              onClick={() => setQuantity((q) => q + 1)}
                              style={{ padding: "10px 14px", border: "none", background: "#3b82f6", color: "#fff", borderRadius: "0 12px 12px 0", fontWeight: 700 }}
                            >
                              +
                            </button>
                          </div>
                        </label>
                      </div>

                    </div>

                    <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
                      <button
                        type="button"
                        onClick={() => setStep("household")}
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          border: "1px solid #dfe5d6",
                          background: "#f8f9fa",
                          color: "#283618",
                          fontWeight: 600,
                        }}
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        name="nextAction"
                        value="finish"
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          border: "1px solid #3f5f46",
                          background: "#3f5f46",
                          color: "#f8f9fa",
                          fontWeight: 700,
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="submit"
                        name="nextAction"
                        value="addAnother"
                        style={{
                          padding: "10px 16px",
                          borderRadius: 10,
                          border: "1px solid #e31836",
                          background: "#e31836",
                          color: "#f8f9fa",
                          fontWeight: 700,
                        }}
                      >
                        Save and Add
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
