import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";

const EMPTY_VALUE = "\u2014";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return EMPTY_VALUE;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return EMPTY_VALUE;
  return date.toISOString().slice(0, 10);
}

function formatAnswer(value: unknown, question: any) {
  if (value === null || value === undefined || value === "") {
    return EMPTY_VALUE;
  }

  if (question?.type === "YES_NO") {
    if (value === true || value === "true") return "Yes";
    if (value === false || value === "false") return "No";
    return EMPTY_VALUE;
  }

  if (question?.type === "SCALE_1_10") {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? String(num) : EMPTY_VALUE;
  }

  return typeof value === "string" ? value : String(value);
}

type Params = {
  params: Promise<{ id?: string }>;
};

export default async function WeeklyCheckInSubmissionPage({ params }: Params) {
  const viewer: any = await getOrgViewer();
  if (!viewer?.orgId || !viewer?.personId) {
    return <div className="surface" style={{ padding: 16 }}>Unauthorized.</div>;
  }

  const elevated = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
  const resolvedParams = await params;
  const submissionId = resolvedParams?.id?.trim() || "";
  if (!submissionId) {
    return <div className="surface" style={{ padding: 16 }}>Not found.</div>;
  }

  const submission = await prisma.checkInSubmission.findFirst({
    where: { id: submissionId, orgId: viewer.orgId },
    include: {
      template: true,
      templateVersion: true,
      person: { select: { id: true, fullName: true } },
    },
  });

  if (!submission) {
    return <div className="surface" style={{ padding: 16 }}>Not found.</div>;
  }

  if (submission.personId !== viewer.personId && !elevated) {
    return <div className="surface" style={{ padding: 16 }}>Unauthorized.</div>;
  }

  const questions = Array.isArray(submission.templateVersion?.questionsJson)
    ? submission.templateVersion?.questionsJson
    : [];
  const answers = (submission.answersJson as Record<string, unknown> | null) ?? {};
  const goals = Array.isArray(submission.goalsJson) ? submission.goalsJson : [];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="surface" style={{ padding: 16, display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 700 }}>{submission.person?.fullName || "Submission"}</div>
        <div style={{ color: "#6b7280", fontSize: 13 }}>{submission.template?.name || EMPTY_VALUE}</div>
        <div style={{ fontSize: 13 }}>
          {submission.periodKey} · {formatDate(submission.periodStart)} {"->"} {formatDate(submission.periodEnd)}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          Submitted {formatDate(submission.createdAt)}
        </div>
      </div>

      <div className="surface" style={{ padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Answers</div>
        {!questions.length ? (
          <div style={{ color: "#6b7280", fontSize: 13 }}>No questions recorded.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {questions.map((question: any) => (
              <div key={question?.id || question?.label} style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 12 }}>
                <div style={{ color: "#6b7280", fontSize: 13 }}>{question?.label || "Question"}</div>
                <div>{formatAnswer(answers[question?.id], question)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface" style={{ padding: 16, display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Goals</div>
        {!goals.length ? (
          <div style={{ color: "#6b7280", fontSize: 13 }}>No goals provided.</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {goals.map((goal: any, index: number) => (
              <div key={`${goal?.title || "goal"}-${index}`} style={{ display: "grid", gap: 2 }}>
                <div>{goal?.title || EMPTY_VALUE}</div>
                {goal?.note ? <div style={{ color: "#6b7280", fontSize: 13 }}>{goal.note}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
