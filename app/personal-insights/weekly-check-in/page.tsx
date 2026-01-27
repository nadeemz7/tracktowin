import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import PersonPicker from "../components/PersonPicker";
import WeeklyCheckInClient from "./WeeklyCheckInClient";
import { createSubmission } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const EMPTY_VALUE = "\u2014";

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Biweekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  CUSTOM_DAYS: "Custom days",
};

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date;
}

function formatDate(value: Date | string | null | undefined) {
  const date = toDate(value);
  if (!date) return EMPTY_VALUE;
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getWeekStartUtc(date: Date, weekStartDay: number) {
  const day = date.getUTCDay();
  const diff = (day - weekStartDay + 7) % 7;
  return addDaysUtc(date, -diff);
}

function getIsoWeekInfo(date: Date) {
  const d = startOfUtcDay(date);
  const day = d.getUTCDay();
  const isoDay = day === 0 ? 7 : day;
  d.setUTCDate(d.getUTCDate() + 4 - isoDay);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: isoYear, week };
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function computePeriod(template: any, now: Date) {
  const today = startOfUtcDay(now);

  if (template.frequencyType === "MONTHLY") {
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const periodStart = new Date(Date.UTC(year, month, 1));
    const periodEnd = new Date(Date.UTC(year, month + 1, 1));
    const periodKey = `${year}-${pad2(month + 1)}`;
    return { periodKey, periodStart, periodEnd };
  }

  if (template.frequencyType === "QUARTERLY") {
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const quarter = Math.floor(month / 3) + 1;
    const startMonth = (quarter - 1) * 3;
    const periodStart = new Date(Date.UTC(year, startMonth, 1));
    const periodEnd = new Date(Date.UTC(year, startMonth + 3, 1));
    const periodKey = `${year}-Q${quarter}`;
    return { periodKey, periodStart, periodEnd };
  }

  if (template.frequencyType === "CUSTOM_DAYS") {
    const intervalDays =
      typeof template.intervalDays === "number" && template.intervalDays > 0 ? template.intervalDays : 30;
    const anchorRaw = toDate(template.createdAt) || today;
    const anchor = startOfUtcDay(anchorRaw);
    const diffDays = Math.floor((today.getTime() - anchor.getTime()) / 86400000);
    const bucket = Math.floor(diffDays / intervalDays);
    const periodStart = addDaysUtc(anchor, bucket * intervalDays);
    const periodEnd = addDaysUtc(periodStart, intervalDays);
    const periodKey = `${periodStart.getUTCFullYear()}-CD-${bucket}`;
    return { periodKey, periodStart, periodEnd };
  }

  const weekStartDay =
    typeof template.weekStartDay === "number" && template.weekStartDay >= 0 && template.weekStartDay <= 6
      ? template.weekStartDay
      : 1;
  const weekStart = getWeekStartUtc(today, weekStartDay);
  const { year, week } = getIsoWeekInfo(today);

  if (template.frequencyType === "BIWEEKLY") {
    const anchorDate = getWeekStartUtc(startOfUtcDay(toDate(template.createdAt) || today), weekStartDay);
    const weeksSince = Math.floor((weekStart.getTime() - anchorDate.getTime()) / (7 * 86400000));
    const bucket = Math.floor(weeksSince / 2);
    const periodStart = addDaysUtc(anchorDate, bucket * 14);
    const periodEnd = addDaysUtc(periodStart, 14);
    const periodKey = `${periodStart.getUTCFullYear()}-BW${pad2(bucket + 1)}`;
    return { periodKey, periodStart, periodEnd };
  }

  const periodEnd = addDaysUtc(weekStart, 7);
  const periodKey = `${year}-W${pad2(week)}`;
  return { periodKey, periodStart: weekStart, periodEnd };
}

export default async function WeeklyCheckInPage({ searchParams }: { searchParams?: SearchParams }) {
  const viewer: any = await getOrgViewer();
  if (!viewer?.orgId || !viewer?.personId) {
    return <div className="surface" style={{ padding: 16 }}>Unauthorized.</div>;
  }

  const elevated = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
  const sp = (await searchParams) || {};
  const personIdParam = Array.isArray(sp.personId) ? sp.personId[0] : sp.personId;
  const requestedPersonId = typeof personIdParam === "string" && personIdParam.trim() ? personIdParam.trim() : null;
  const targetPersonId = elevated && requestedPersonId ? requestedPersonId : viewer.personId;

  let person = await prisma.person.findFirst({
    where: { id: targetPersonId, orgId: viewer.orgId },
    include: { team: true },
  });

  if (!person && elevated && requestedPersonId && requestedPersonId !== viewer.personId) {
    person = await prisma.person.findFirst({
      where: { id: viewer.personId, orgId: viewer.orgId },
      include: { team: true },
    });
  }

  if (!person) {
    return <div className="surface" style={{ padding: 16 }}>Unauthorized.</div>;
  }

  const people = elevated
    ? await prisma.person.findMany({
        where: { orgId: viewer.orgId },
        select: { id: true, fullName: true },
        orderBy: { fullName: "asc" },
      })
    : [];

  if (!person.teamId) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {elevated ? (
          <div className="surface" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 600 }}>Person</div>
            <PersonPicker people={people} selectedPersonId={person.id} />
          </div>
        ) : null}
        <div className="surface" style={{ padding: 16 }}>
          No team assigned. Check-in template not configured.
        </div>
      </div>
    );
  }

  const assignment = await prisma.teamCheckInTemplateAssignment.findFirst({
    where: { orgId: viewer.orgId, teamId: person.teamId, isActive: true },
    include: {
      template: {
        include: { versions: { where: { isCurrent: true }, take: 1, orderBy: { version: "desc" } } },
      },
    },
  });

  if (!assignment?.template) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {elevated ? (
          <div className="surface" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontWeight: 600 }}>Person</div>
            <PersonPicker people={people} selectedPersonId={person.id} />
          </div>
        ) : null}
        <div className="surface" style={{ padding: 16 }}>
          No active check-in template assigned to this team.
        </div>
      </div>
    );
  }

  const template = assignment.template;
  const frequencyLabel = FREQUENCY_LABELS[template.frequencyType] || template.frequencyType;
  const { periodKey, periodStart, periodEnd } = computePeriod(template, new Date());
  const currentVersion = template.versions[0] || null;

  const topBar = (
    <div
      className="surface"
      style={{
        padding: 12,
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "grid", gap: 4, minWidth: 180 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Template</div>
        <div style={{ fontWeight: 600 }}>{template.name}</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Frequency: {frequencyLabel}</div>
      </div>
      <div style={{ display: "grid", gap: 4, minWidth: 180 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>Current period</div>
        <div>{periodKey}</div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>
          {formatDate(periodStart)} {"->"} {formatDate(periodEnd)}
        </div>
      </div>
      {elevated ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontWeight: 600 }}>Person</div>
          <PersonPicker people={people} selectedPersonId={person.id} />
        </div>
      ) : null}
    </div>
  );

  if (!currentVersion) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {topBar}
        <div className="surface" style={{ padding: 16 }}>
          Template has no current version.
        </div>
      </div>
    );
  }

  const existing = await prisma.checkInSubmission.findFirst({
    where: { orgId: viewer.orgId, personId: person.id, templateId: template.id, periodKey },
    select: {
      id: true,
      createdAt: true,
      answersJson: true,
      goalsJson: true,
      periodKey: true,
      periodStart: true,
      periodEnd: true,
    },
  });

  const history = await prisma.checkInSubmission.findMany({
    where: { orgId: viewer.orgId, personId: person.id, templateId: template.id },
    orderBy: { periodStart: "desc" },
    take: 12,
    select: {
      id: true,
      periodKey: true,
      periodStart: true,
      periodEnd: true,
      createdAt: true,
      answersJson: true,
    },
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {topBar}

      <WeeklyCheckInClient
        viewerPersonId={viewer.personId}
        targetPersonId={person.id}
        elevated={elevated}
        existingSubmission={existing}
        template={{
          id: template.id,
          name: template.name,
          frequencyType: template.frequencyType,
          currentVersion: { id: currentVersion.id, questionsJson: currentVersion.questionsJson },
        }}
        period={{
          periodKey,
          periodStartISO: periodStart.toISOString(),
          periodEndISO: periodEnd.toISOString(),
        }}
        createAction={createSubmission}
        historyForCharts={history.map((item) => ({
          id: item.id,
          periodKey: item.periodKey,
          periodStart: item.periodStart,
          answersJson: item.answersJson,
        }))}
      />

      <div className="surface" style={{ padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>History</div>
        {!history.length ? (
          <div style={{ color: "#6b7280", fontSize: 13 }}>No submissions yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {history.map((item) => (
              <a
                key={item.id}
                href={`/personal-insights/weekly-check-in/submission/${item.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    display: "grid",
                    gap: 4,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{item.periodKey}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {formatDate(item.periodStart)} {"->"} {formatDate(item.periodEnd)}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Submitted {formatDate(item.createdAt)}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
