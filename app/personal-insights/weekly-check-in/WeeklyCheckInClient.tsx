"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

type QuestionType = "SCALE_1_10" | "TEXT_SHORT" | "TEXT_LONG" | "YES_NO" | "MULTIPLE_CHOICE";

type Question = {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  helpText?: string;
  options?: string[];
};

type Submission = {
  id: string;
  createdAt: Date | string;
  answersJson: unknown;
  goalsJson: unknown;
  periodKey: string;
  periodStart: Date | string;
  periodEnd: Date | string;
};

type Template = {
  id: string;
  name: string;
  frequencyType: string;
  currentVersion: { id: string; questionsJson: unknown };
};

type Period = {
  periodKey: string;
  periodStartISO: string;
  periodEndISO: string;
};

type HistoryForCharts = {
  id: string;
  periodKey: string;
  periodStart: Date | string;
  answersJson: unknown;
};

type FormState = { error: string | null; success: boolean };

type CreateAction = (prevState: FormState, formData: FormData) => Promise<FormState>;

type Props = {
  viewerPersonId: string;
  targetPersonId: string;
  elevated: boolean;
  existingSubmission: Submission | null;
  template: Template;
  period: Period;
  createAction: CreateAction;
  historyForCharts: HistoryForCharts[];
};

const EMPTY_VALUE = "\u2014";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return EMPTY_VALUE;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return EMPTY_VALUE;
  return date.toISOString().slice(0, 10);
}

function formatAnswer(value: unknown, question: Question) {
  if (value === null || value === undefined || value === "") {
    return EMPTY_VALUE;
  }

  if (question.type === "YES_NO") {
    if (value === true || value === "true") return "Yes";
    if (value === false || value === "false") return "No";
    return EMPTY_VALUE;
  }

  if (question.type === "SCALE_1_10") {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? String(num) : EMPTY_VALUE;
  }

  return typeof value === "string" ? value : String(value);
}

function toScaleValue(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num)) return null;
  if (num < 1 || num > 10) return null;
  return num;
}

function buildTrendPoints(questionId: string, history: HistoryForCharts[]) {
  const points: Array<{ x: number; y: number; value: number; periodKey: string }> = [];
  const count = history.length;
  history.forEach((entry, index) => {
    const rawValue = (entry.answersJson as Record<string, unknown> | null)?.[questionId];
    const value = toScaleValue(rawValue);
    if (value === null) {
      return;
    }
    const x = count > 1 ? (index / (count - 1)) * 100 : 50;
    const y = 100 - ((value - 1) / 9) * 100;
    points.push({ x, y, value, periodKey: entry.periodKey });
  });
  return points;
}

function TrendsSection({ questions, history }: { questions: Question[]; history: HistoryForCharts[] }) {
  const scaleQuestions = questions.filter((question) => question.type === "SCALE_1_10");
  if (!scaleQuestions.length) return null;

  const sortedHistory = [...history].sort(
    (a, b) => new Date(a.periodStart).getTime() - new Date(b.periodStart).getTime()
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ fontWeight: 700 }}>Trends</div>
      {scaleQuestions.map((question) => {
        const points = buildTrendPoints(question.id, sortedHistory);
        const latestValue = points.length ? points[points.length - 1].value : null;
        const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
        const firstLabel = points[0]?.periodKey ?? EMPTY_VALUE;
        const lastLabel = points[points.length - 1]?.periodKey ?? EMPTY_VALUE;
        const pointCount = points.length;
        return (
          <div
            key={question.id}
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              display: "grid",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>{question.label || "Scale question"}</div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                Latest: {latestValue !== null ? latestValue : EMPTY_VALUE}
              </div>
            </div>
            {points.length < 2 ? (
              <div style={{ color: "#6b7280", fontSize: 13 }}>Not enough data yet.</div>
            ) : (
              <>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: 120 }}>
                  <polyline
                    fill="none"
                    stroke="#4b5563"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={polyline}
                  />
                  {points.map((point, index) => (
                    <circle key={`${question.id}-pt-${index}`} cx={point.x} cy={point.y} r="2.5" fill="#111827" />
                  ))}
                </svg>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {firstLabel} {"→"} {lastLabel} • {pointCount} points
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SubmitButton() {
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
      {pending ? "Submitting..." : "Submit Check-In"}
    </button>
  );
}

export default function WeeklyCheckInClient({
  viewerPersonId,
  targetPersonId,
  existingSubmission,
  template,
  period,
  createAction,
  historyForCharts,
}: Props) {
  const router = useRouter();
  const isSelf = viewerPersonId === targetPersonId;
  const questions = useMemo<Question[]>(() => {
    const raw = template.currentVersion?.questionsJson;
    return Array.isArray(raw) ? (raw as Question[]) : [];
  }, [template.currentVersion]);

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    questions.forEach((question) => {
      initial[question.id] = "";
    });
    return initial;
  });

  const [goals, setGoals] = useState<Array<{ title: string; note: string }>>([
    { title: "", note: "" },
    { title: "", note: "" },
    { title: "", note: "" },
  ]);

  const [state, formAction] = useFormState(createAction, { error: null, success: false });

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [state.success, router]);

  const answersJson = useMemo(() => JSON.stringify(answers), [answers]);
  const goalsJson = useMemo(() => {
    const payload = goals
      .map((goal) => ({ title: goal.title.trim(), note: goal.note.trim() }))
      .filter((goal) => goal.title || goal.note);
    return JSON.stringify(payload);
  }, [goals]);

  if (!isSelf) {
    return (
      <div className="surface" style={{ padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Status</div>
        {existingSubmission ? (
          <>
            <div>Submitted on {formatDate(existingSubmission.createdAt)}</div>
            {questions.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                {questions.map((question) => (
                  <div key={question.id} style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
                    <div style={{ color: "#6b7280", fontSize: 13 }}>{question.label}</div>
                    <div>
                      {formatAnswer(
                        (existingSubmission.answersJson as Record<string, unknown> | null)?.[question.id],
                        question
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {Array.isArray(existingSubmission.goalsJson) && existingSubmission.goalsJson.length ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 600 }}>Goals</div>
                {(existingSubmission.goalsJson as Array<any>).map((goal, index) => (
                  <div key={`${index}-${goal?.title || "goal"}`} style={{ display: "grid", gap: 2 }}>
                    <div>{goal?.title || EMPTY_VALUE}</div>
                    {goal?.note ? (
                      <div style={{ color: "#6b7280", fontSize: 13 }}>{goal.note}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div>Not submitted yet</div>
        )}
        <TrendsSection questions={questions} history={historyForCharts} />
      </div>
    );
  }

  if (existingSubmission) {
    return (
      <div className="surface" style={{ padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Status</div>
        <div>Submitted on {formatDate(existingSubmission.createdAt)}</div>
        <TrendsSection questions={questions} history={historyForCharts} />
        {questions.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {questions.map((question) => (
              <div key={question.id} style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
                <div style={{ color: "#6b7280", fontSize: 13 }}>{question.label}</div>
                <div>
                  {formatAnswer(
                    (existingSubmission.answersJson as Record<string, unknown> | null)?.[question.id],
                    question
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {Array.isArray(existingSubmission.goalsJson) && existingSubmission.goalsJson.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Goals</div>
            {(existingSubmission.goalsJson as Array<any>).map((goal, index) => (
              <div key={`${index}-${goal?.title || "goal"}`} style={{ display: "grid", gap: 2 }}>
                <div>{goal?.title || EMPTY_VALUE}</div>
                {goal?.note ? <div style={{ color: "#6b7280", fontSize: 13 }}>{goal.note}</div> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 700 }}>Status</div>
        <div>Not submitted yet</div>
      </div>

      <input type="hidden" name="personId" value={targetPersonId} />
      <input type="hidden" name="templateId" value={template.id} />
      <input type="hidden" name="templateVersionId" value={template.currentVersion.id} />
      <input type="hidden" name="periodKey" value={period.periodKey} />
      <input type="hidden" name="periodStart" value={period.periodStartISO} />
      <input type="hidden" name="periodEnd" value={period.periodEndISO} />
      <input type="hidden" name="answersJson" value={answersJson} />
      <input type="hidden" name="goalsJson" value={goalsJson} />

      <TrendsSection questions={questions} history={historyForCharts} />

      <div style={{ display: "grid", gap: 10 }}>
        {questions.map((question) => {
          const value = answers[question.id] ?? "";
          return (
            <div key={question.id} style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ fontWeight: 600 }}>{question.label}</div>
                {question.required ? <span style={{ color: "#b91c1c" }}>*</span> : null}
              </div>
              {question.helpText ? <div style={{ fontSize: 12, color: "#6b7280" }}>{question.helpText}</div> : null}
              {question.type === "SCALE_1_10" ? (
                <select
                  value={value}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                >
                  <option value="">Select</option>
                  {Array.from({ length: 10 }, (_, idx) => (
                    <option key={idx + 1} value={String(idx + 1)}>
                      {idx + 1}
                    </option>
                  ))}
                </select>
              ) : null}
              {question.type === "TEXT_SHORT" ? (
                <input
                  value={value}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
              ) : null}
              {question.type === "TEXT_LONG" ? (
                <textarea
                  value={value}
                  rows={4}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
              ) : null}
              {question.type === "YES_NO" ? (
                <select
                  value={value}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                >
                  <option value="">Select</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : null}
              {question.type === "MULTIPLE_CHOICE" ? (
                <select
                  value={value}
                  onChange={(event) => setAnswers((prev) => ({ ...prev, [question.id]: event.target.value }))}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                >
                  <option value="">Select</option>
                  {(question.options || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>Goals</div>
        {goals.map((goal, index) => (
          <div key={`goal-${index}`} style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 2fr" }}>
            <input
              placeholder={`Goal ${index + 1} title`}
              value={goal.title}
              onChange={(event) => {
                const next = [...goals];
                next[index] = { ...next[index], title: event.target.value };
                setGoals(next);
              }}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            <input
              placeholder="Optional note"
              value={goal.note}
              onChange={(event) => {
                const next = [...goals];
                next[index] = { ...next[index], note: event.target.value };
                setGoals(next);
              }}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
          </div>
        ))}
      </div>

      {state.error ? <div style={{ color: "#b91c1c", fontSize: 13 }}>{state.error}</div> : null}

      <SubmitButton />
    </form>
  );
}
