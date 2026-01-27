"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

type QuestionType = "SCALE_1_10" | "TEXT_SHORT" | "TEXT_LONG" | "YES_NO" | "MULTIPLE_CHOICE";

type Question = {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  helpText?: string;
  options?: string[];
};

type PublishState = { error: string | null; success: boolean };

type PublishAction = (prevState: PublishState, formData: FormData) => Promise<PublishState>;

type Props = {
  templateId: string;
  initialQuestions: Question[];
  publishAction: PublishAction;
};

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: "SCALE_1_10", label: "Scale 1-10" },
  { value: "TEXT_SHORT", label: "Text (short)" },
  { value: "TEXT_LONG", label: "Text (long)" },
  { value: "YES_NO", label: "Yes / No" },
  { value: "MULTIPLE_CHOICE", label: "Multiple choice" },
];

const DEFAULT_QUESTION: Omit<Question, "id"> = {
  type: "TEXT_SHORT",
  label: "",
  required: false,
  helpText: "",
  options: [],
};

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeQuestion(input: any): Question {
  const type = QUESTION_TYPES.some((t) => t.value === input?.type) ? input.type : DEFAULT_QUESTION.type;
  return {
    id: typeof input?.id === "string" && input.id.trim() ? input.id.trim() : makeId(),
    type,
    label: typeof input?.label === "string" ? input.label : "",
    required: Boolean(input?.required),
    helpText: typeof input?.helpText === "string" ? input.helpText : "",
    options: Array.isArray(input?.options) ? input.options.map((opt: any) => String(opt)) : [],
  };
}

function PublishButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        border: "1px solid #111827",
        background: "#111827",
        color: "#fff",
        fontWeight: 700,
      }}
    >
      {pending ? "Publishing..." : "Publish New Version"}
    </button>
  );
}

export default function QuestionEditorClient({ templateId, initialQuestions, publishAction }: Props) {
  const [questions, setQuestions] = useState<Question[]>(() =>
    (Array.isArray(initialQuestions) ? initialQuestions : []).map(normalizeQuestion)
  );
  const [state, formAction] = useFormState(publishAction, { error: null, success: false });
  const questionsJson = useMemo(() => JSON.stringify(questions), [questions]);

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, { ...DEFAULT_QUESTION, id: makeId() }]);
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const moveQuestion = (id: string, direction: -1 | 1) => {
    setQuestions((prev) => {
      const index = prev.findIndex((q) => q.id === id);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const updateOption = (id: string, optionIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const options = Array.isArray(q.options) ? [...q.options] : [];
        options[optionIndex] = value;
        return { ...q, options };
      })
    );
  };

  const addOption = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const options = Array.isArray(q.options) ? [...q.options, ""] : ["", ""];
        return { ...q, options };
      })
    );
  };

  const removeOption = (id: string, optionIndex: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const options = Array.isArray(q.options) ? q.options.filter((_, idx) => idx !== optionIndex) : [];
        return { ...q, options };
      })
    );
  };

  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="questionsJson" value={questionsJson} />

      {!questions.length ? (
        <div style={{ color: "#6b7280", fontSize: 13 }}>No questions yet. Add your first question below.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {questions.map((question, index) => {
            const isMultipleChoice = question.type === "MULTIPLE_CHOICE";
            return (
              <div
                key={question.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 600 }}>Question {index + 1}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => moveQuestion(question.id, -1)} style={{ padding: "4px 8px" }}>
                      Up
                    </button>
                    <button type="button" onClick={() => moveQuestion(question.id, 1)} style={{ padding: "4px 8px" }}>
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuestion(question.id)}
                      style={{ padding: "4px 8px", color: "#b91c1c" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Label</span>
                  <input
                    value={question.label}
                    onChange={(event) => updateQuestion(question.id, { label: event.target.value })}
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                </label>

                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Type</span>
                    <select
                      value={question.type}
                      onChange={(event) => {
                        const nextType = event.target.value as QuestionType;
                        const nextOptions =
                          nextType === "MULTIPLE_CHOICE" && (!question.options || question.options.length < 2)
                            ? ["", ""]
                            : question.options;
                        updateQuestion(question.id, { type: nextType, options: nextOptions });
                      }}
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    >
                      {QUESTION_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Required</span>
                    <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={question.required}
                        onChange={(event) => updateQuestion(question.id, { required: event.target.checked })}
                      />
                      <span style={{ fontSize: 12, color: "#6b7280" }}>Mark as required</span>
                    </label>
                  </div>
                </div>

                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Help text (optional)</span>
                  <input
                    value={question.helpText || ""}
                    onChange={(event) => updateQuestion(question.id, { helpText: event.target.value })}
                    style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                </label>

                {isMultipleChoice ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Options</div>
                    {(question.options || []).map((option, optionIndex) => (
                      <div key={`${question.id}-opt-${optionIndex}`} style={{ display: "flex", gap: 8 }}>
                        <input
                          value={option}
                          onChange={(event) => updateOption(question.id, optionIndex, event.target.value)}
                          style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                        />
                        <button
                          type="button"
                          onClick={() => removeOption(question.id, optionIndex)}
                          style={{ padding: "6px 10px", color: "#b91c1c" }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addOption(question.id)} style={{ padding: "6px 10px" }}>
                      + Add option
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <button type="button" onClick={addQuestion} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        + Add question
      </button>

      {state.error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{state.error}</div> : null}
      {state.success ? <div style={{ color: "#065f46", fontSize: 13 }}>Published</div> : null}

      <PublishButton />
    </form>
  );
}
