"use client";

type Props = {
  id: string;
  action: (formData: FormData) => void | Promise<void>;
};

export function ConfirmDeleteForm({ id, action }: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this activity? This will remove related settings and unlink WTD rules.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        style={{
          padding: "6px 10px",
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
