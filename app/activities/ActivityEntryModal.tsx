"use client";
import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

type ActivityOption = {
  name: string;
  description?: string;
  requiresFullName?: boolean;
  unitLabel?: string;
};

type PersonOption = { id: string; name: string };

type Props = {
  people: PersonOption[];
  defaultPersonId?: string;
  defaultDate?: string;
  presetActivity?: string;
  activities: ActivityOption[];
  variant?: "default" | "floating" | "ghost" | "link";
  label?: string;
  saveAction: (formData: FormData) => Promise<void> | void;
};

export default function ActivityEntryModal({
  people,
  defaultPersonId,
  defaultDate,
  presetActivity,
  activities,
  variant = "default",
  label,
  saveAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState(defaultPersonId || (people[0]?.id ?? ""));
  const [activityDate, setActivityDate] = useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [activityName, setActivityName] = useState(presetActivity || "");
  const [amount, setAmount] = useState(1);
  const [subjectFirst, setSubjectFirst] = useState("");
  const [subjectLast, setSubjectLast] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const requiresFullName = useMemo(
    () => activities.find((a) => a.name === activityName)?.requiresFullName,
    [activities, activityName]
  );

  const triggerStyles =
    variant === "floating"
      ? {
          borderRadius: 999,
          width: 56,
          height: 56,
          background: "#1d9f6e",
          color: "#fff",
          fontSize: 26,
          border: "none",
        }
      : variant === "ghost"
      ? {
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "#fff",
        }
      : variant === "link"
      ? { padding: 0, border: "none", background: "transparent", color: "#1d4ed8", textDecoration: "underline" }
      : {
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #283618",
          background: "#283618",
          color: "#f8f9fa",
          fontWeight: 700,
        };

  const triggerLabel = label || (variant === "floating" ? "+" : variant === "link" ? label || "+ Add entry" : variant === "ghost" ? "Add" : "Create Activity");

  const closeModal = () => setOpen(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.append("personId", personId);
    formData.append("activityDate", activityDate);
    formData.append("activityName", activityName);
    formData.append("amount", String(amount));
    if (requiresFullName) {
      formData.append("subjectFirst", subjectFirst);
      formData.append("subjectLast", subjectLast);
    }
    startTransition(async () => {
      await saveAction(formData);
      setAmount(1);
      setSubjectFirst("");
      setSubjectLast("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={triggerStyles}>
        {triggerLabel}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 50,
            padding: 12,
          }}
          onClick={closeModal}
        >
          <div
            style={{
              maxWidth: 520,
              width: "100%",
              background: "#fff",
              borderRadius: 14,
              padding: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Create Activity</div>
              <button onClick={closeModal} style={{ border: "none", background: "transparent", fontSize: 20 }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: "grid", gap: 10 }}>
              <label style={labelStyle}>
                Activity Date
                <input type="date" required value={activityDate} onChange={(e) => setActivityDate(e.target.value)} style={inputStyle} />
              </label>

              <label style={labelStyle}>
                Team member
                <select value={personId} onChange={(e) => setPersonId(e.target.value)} style={inputStyle}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                Activity
                <select required value={activityName} onChange={(e) => setActivityName(e.target.value)} style={inputStyle}>
                  <option value="">Select activity</option>
                  {activities.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {activityName && (
                <div style={{ color: "#555", fontSize: 13, marginTop: -4 }}>
                  {activities.find((a) => a.name === activityName)?.description || "Track this activity for today."}
                </div>
              )}

              {requiresFullName && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <label style={labelStyle}>
                    First name *
                    <input required value={subjectFirst} onChange={(e) => setSubjectFirst(e.target.value)} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    Last name *
                    <input required value={subjectLast} onChange={(e) => setSubjectLast(e.target.value)} style={inputStyle} />
                  </label>
                </div>
              )}

              <label style={labelStyle}>
                Amount
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button type="button" onClick={() => setAmount((a) => Math.max(1, a - 1))} style={circleBtn}>
                    –
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button type="button" onClick={() => setAmount((a) => a + 1)} style={{ ...circleBtn, background: "#2563eb", color: "#fff" }}>
                    +
                  </button>
                </div>
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
                <button type="button" onClick={closeModal} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff" }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !activityName}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #283618",
                    background: "#283618",
                    color: "#f8f9fa",
                    fontWeight: 700,
                    opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const labelStyle: CSSProperties = { display: "grid", gap: 4, fontWeight: 600, fontSize: 14 };
const inputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const circleBtn: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#f1f5f9",
  fontSize: 18,
};
