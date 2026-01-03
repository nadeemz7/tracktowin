"use client";

type Props = {
  id: string;
  action: (formData: FormData) => void | Promise<void>;
  compact?: boolean;
};

export function ConfirmDeletePlanForm({ id, action, compact }: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this Win The Day plan? This will remove its rules and assignments.")) {
          e.preventDefault();
        }
      }}
      style={{ margin: 0 }}
    >
      <input type="hidden" name="planId" value={id} />
      <button
        type="submit"
        style={{
          padding: compact ? "6px 10px" : "8px 12px",
          borderRadius: 8,
          border: "1px solid #e31836",
          background: "#f8f9fa",
          color: "#e31836",
        }}
      >
        Delete
      </button>
    </form>
  );
}
