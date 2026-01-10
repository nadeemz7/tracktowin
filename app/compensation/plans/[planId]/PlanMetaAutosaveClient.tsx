"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type PlanMetaAutosaveClientProps = {
  planId: string;
  initialDescription: string;
  onSave: (formData: FormData) => Promise<void>;
};

export default function PlanMetaAutosaveClient({ planId, initialDescription, onSave }: PlanMetaAutosaveClientProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"Saved" | "Saving...">("Saved");
  const [, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleChange = () => {
    setStatus("Saving...");
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 800);
  };

  const handleSubmit = () => {
    startTransition(() => {
      setStatus("Saved");
    });
  };

  return (
    <form action={onSave} ref={formRef} onSubmit={handleSubmit} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="planId" value={planId} />
      <textarea
        name="description"
        defaultValue={initialDescription}
        placeholder="No description"
        rows={3}
        onChange={handleChange}
        style={{
          width: "100%",
          minHeight: 72,
          resize: "vertical",
          padding: 8,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          color: "#111",
        }}
      />
      <div style={{ fontSize: 12, color: "#6b7280" }}>{status}</div>
    </form>
  );
}
