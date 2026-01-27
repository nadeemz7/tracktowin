import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import PersonPicker from "../components/PersonPicker";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const EMPTY_VALUE = "\u2014";

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

function utcDayValue(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function diffDays(start: Date, end: Date) {
  const diff = utcDayValue(end) - utcDayValue(start);
  return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

export default async function PersonalInsightsOverviewPage({ searchParams }: { searchParams?: SearchParams }) {
  const viewer: any = await getOrgViewer();
  if (!viewer?.orgId || !viewer?.personId) {
    return <div className="surface" style={{ padding: 16 }}>Unauthorized.</div>;
  }

  const elevated = Boolean(viewer?.isOwner || viewer?.isAdmin || viewer?.isManager);
  const sp = (await searchParams) || {};
  const personIdParam = Array.isArray(sp.personId) ? sp.personId[0] : sp.personId;
  const requestedPersonId = typeof personIdParam === "string" && personIdParam.trim() ? personIdParam.trim() : null;
  const targetPersonId = elevated && requestedPersonId ? requestedPersonId : viewer.personId;

  const include = { team: true, role: true, primaryAgency: true };
  let person = await prisma.person.findFirst({
    where: { id: targetPersonId, orgId: viewer.orgId },
    include,
  });

  if (!person && elevated && requestedPersonId && requestedPersonId !== viewer.personId) {
    person = await prisma.person.findFirst({
      where: { id: viewer.personId, orgId: viewer.orgId },
      include,
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

  const startDate = toDate(person.startDate);
  const endDate = toDate(person.endDate);
  const startDateLabel = formatDate(startDate);
  const endDateLabel = formatDate(endDate);
  const statusLabel = person.active === false ? "Inactive" : "Active";
  const statusText = endDate ? `${statusLabel} (end date ${endDateLabel})` : statusLabel;

  let tenureLabel = EMPTY_VALUE;
  if (startDate) {
    const endForTenure = endDate ?? new Date();
    const days = diffDays(startDate, endForTenure);
    const months = (days / 30.4).toFixed(1);
    tenureLabel = `${days} days (~${months} months)`;
  }

  const rows = [
    { label: "Status", value: statusText },
    { label: "Start date", value: startDateLabel },
    { label: "End date", value: endDateLabel },
    { label: "Current role", value: person.role?.name || EMPTY_VALUE },
    { label: "Current team", value: person.team?.name || EMPTY_VALUE },
    { label: "Primary office", value: person.primaryAgency?.name || EMPTY_VALUE },
    { label: "Tenure", value: tenureLabel },
  ];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {elevated ? (
        <div className="surface" style={{ padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 600 }}>Person</div>
          <PersonPicker people={people} selectedPersonId={person.id} />
        </div>
      ) : null}
      <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{person.fullName}</div>
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row) => (
            <div key={row.label} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12 }}>
              <div style={{ color: "#6b7280", fontSize: 13 }}>{row.label}</div>
              <div>{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
