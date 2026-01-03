import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { computeWinTheDayPoints, resolveWinTheDayPlanForPerson } from "@/lib/winTheDay";
import { endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { readCookie } from "@/lib/readCookie";
import { Suspense } from "react";
import ActivityEntryModal from "./ActivityEntryModal";
import { WinTheDayBar } from "./WinTheDayBar";
import { DateRangePicker } from "./DateRangePicker";
import { CountersPanel } from "./CountersPanel";
import { revalidatePath } from "next/cache";

export async function createActivityEntry(formData: FormData) {
  "use server";

  const personId = String(formData.get("personId") || "");
  const activityName = String(formData.get("activityName") || "");
  const activityDateStr = String(formData.get("activityDate") || "");
  const amount = Number(formData.get("amount") || 0);

  if (!activityName || !activityDateStr || Number.isNaN(amount)) return;

  const activityDate = new Date(`${activityDateStr}T00:00:00`);

  const person = personId ? await prisma.person.findUnique({ where: { id: personId } }) : null;
  const actorName = person?.fullName || "Unassigned";

  const existing = await prisma.activityRecord.findFirst({
    where: {
      activityName,
      activityDate,
      ...(personId ? { personId } : {}),
    },
  });

  const nextCount = Math.max(0, (existing?.count || 0) + amount);

  if (existing) {
    await prisma.activityRecord.update({ where: { id: existing.id }, data: { count: nextCount } });
  } else {
    await prisma.activityRecord.create({
      data: {
        personId: personId || null,
        personName: actorName,
        activityName,
        activityDate,
        count: nextCount,
      },
    });
  }

  revalidatePath("/activities");
}

export async function adjustActivityCount(formData: FormData) {
  "use server";

  const personId = String(formData.get("personId") || "");
  const personName = String(formData.get("personName") || "");
  const activityName = String(formData.get("activityName") || "");
  const activityDateStr = String(formData.get("activityDate") || "");
  const delta = Number(formData.get("delta") || 0);

  if (!activityName || !activityDateStr || Number.isNaN(delta)) return;

  const activityDate = new Date(`${activityDateStr}T00:00:00`);
  const person = personId ? await prisma.person.findUnique({ where: { id: personId } }) : null;
  const actorName = person?.fullName || personName || "Unassigned";

  const existing = await prisma.activityRecord.findFirst({
    where: {
      activityName,
      activityDate,
      ...(personId ? { personId } : {}),
    },
  });

  const nextCount = Math.max(0, (existing?.count || 0) + delta);

  if (existing) {
    await prisma.activityRecord.update({ where: { id: existing.id }, data: { count: nextCount } });
  } else {
    await prisma.activityRecord.create({
      data: {
        personId: personId || null,
        personName: actorName,
        activityName,
        activityDate,
        count: Math.max(0, delta),
      },
    });
  }

  revalidatePath("/activities");
}

export async function setActivityCount(formData: FormData) {
  "use server";

  const personId = String(formData.get("personId") || "");
  const personName = String(formData.get("personName") || "");
  const activityName = String(formData.get("activityName") || "");
  const activityDateStr = String(formData.get("activityDate") || "");
  const value = Number(formData.get("value") || 0);

  if (!activityName || !activityDateStr || Number.isNaN(value)) return;

  const activityDate = new Date(`${activityDateStr}T00:00:00`);
  const person = personId ? await prisma.person.findUnique({ where: { id: personId } }) : null;
  const actorName = person?.fullName || personName || "Unassigned";
  const nextCount = Math.max(0, value);

  const existing = await prisma.activityRecord.findFirst({
    where: {
      activityName,
      activityDate,
      ...(personId ? { personId } : { personName: actorName }),
    },
  });

  if (existing) {
    await prisma.activityRecord.update({ where: { id: existing.id }, data: { count: nextCount } });
  } else if (nextCount > 0) {
    await prisma.activityRecord.create({
      data: {
        personId: personId || null,
        personName: actorName,
        activityName,
        activityDate,
        count: nextCount,
      },
    });
  }

  revalidatePath("/activities");
}

export async function addEmptyCounter(formData: FormData) {
  "use server";
  const personId = String(formData.get("personId") || "");
  const personName = String(formData.get("personName") || "");
  const activityName = String(formData.get("activityName") || "");
  const activityDateStr = String(formData.get("activityDate") || "");
  if (!activityName || !activityDateStr) return;
  const activityDate = new Date(`${activityDateStr}T00:00:00`);
  const person = personId ? await prisma.person.findUnique({ where: { id: personId } }) : null;
  const actorName = person?.fullName || personName || "Unassigned";

  const existing = await prisma.activityRecord.findFirst({
    where: { activityName, activityDate, ...(personId ? { personId } : { personName: actorName }) },
  });
  if (!existing) {
    await prisma.activityRecord.create({
      data: { personId: personId || null, personName: actorName, activityName, activityDate, count: 0 },
    });
  }
  revalidatePath("/activities");
}

export async function removeCounter(formData: FormData) {
  "use server";
  const personId = String(formData.get("personId") || "");
  const personName = String(formData.get("personName") || "");
  const activityName = String(formData.get("activityName") || "");
  const activityDateStr = String(formData.get("activityDate") || "");
  if (!activityName || !activityDateStr) return;
  const activityDate = new Date(`${activityDateStr}T00:00:00`);
  await prisma.activityRecord.deleteMany({
    where: {
      activityName,
      activityDate,
      ...(personId ? { personId } : { personName }),
    },
  });
  revalidatePath("/activities");
}

type RangePreset = "today" | "week" | "month" | "custom";

function formatISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseISODateLocal(value: string | undefined) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function humanDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });
}

function humanShort(d: Date) {
  return d.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", year: "numeric" });
}

async function getRange(base: Date, preset: RangePreset, customStart?: string, customEnd?: string) {
  if (preset === "today") return { from: startOfDay(base), to: endOfDay(base) };
  if (preset === "week") return { from: startOfWeek(base, { weekStartsOn: 1 }), to: endOfWeek(base, { weekStartsOn: 1 }) };
  if (preset === "month") return { from: startOfMonth(base), to: endOfMonth(base) };
  // custom range
  const start = customStart ? new Date(`${customStart}T00:00:00`) : startOfDay(base);
  const end = customEnd ? new Date(`${customEnd}T23:59:59`) : endOfDay(base);
  return { from: start, to: end };
}

export default async function ActivityManager({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const preset = (sp.range as RangePreset) || "week";
  const customStartDate = preset === "custom" ? parseISODateLocal(sp.start) : null;
  const baseDate = customStartDate || parseISODateLocal(sp.date) || new Date();
  const { from, to } = await getRange(baseDate, preset, sp.start, sp.end);
  const rangeLabel = `${humanShort(from)} → ${humanShort(to)}`;
  const baseDateStr = formatISO(baseDate);

  const showTeamSelector = sp.viewAll === "1";
  const cookiePersonId = readCookie("impersonatePersonId") || "";
  let people = await prisma.person.findMany({
    orderBy: { fullName: "asc" },
    include: { team: true },
  });

  if (cookiePersonId && !people.some((p) => p.id === cookiePersonId)) {
    const cookiePerson = await prisma.person.findUnique({ where: { id: cookiePersonId }, include: { team: true } });
    if (cookiePerson) {
      people = [...people, cookiePerson].sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
  }

  const selectedPersonId = sp.personId || cookiePersonId || people[0]?.id || "";
  const selectedPerson = selectedPersonId ? people.find((p) => p.id === selectedPersonId) : undefined;
  const personName = selectedPerson?.fullName || "Unassigned";
  const teamId = selectedPerson?.teamId || null;
  const agencyId = selectedPerson?.primaryAgencyId || selectedPerson?.team?.agencyId || null;

  const rawActivityTypes = await prisma.activityType.findMany({
    where: {
      active: true,
      OR: [
        { visibilities: { some: { teamId: teamId || undefined, canUse: true } } },
        { visibilities: { none: {} } },
      ],
    },
    orderBy: { name: "asc" },
  });
  const activityTypes = Array.from(
    new Map(rawActivityTypes.map((a) => [a.name, a])).values()
  );

  const personFilter = selectedPersonId
    ? { OR: [{ personId: selectedPersonId }, { personId: null, personName }] }
    : {};

  const records = await prisma.activityRecord.findMany({
    where: {
      activityDate: { gte: from, lte: to },
      ...personFilter,
    },
    orderBy: { activityDate: "desc" },
  });

  // Summaries
  const totals = new Map<string, number>();
  for (const r of records) {
    totals.set(r.activityName, (totals.get(r.activityName) || 0) + r.count);
  }

  const activityNames = Array.from(
    new Set([...activityTypes.map((a) => a.name), ...records.map((r) => r.activityName)])
  ).sort((a, b) => a.localeCompare(b));

  // Pivot by person for the matrix view
  type MatrixRow = { label: string; counts: Map<string, number>; total: number };
  const matrix = new Map<string, MatrixRow>();
  for (const r of records) {
    const key = r.personId || r.personName || "Unassigned";
    const label = r.personName || "Unassigned";
    if (!matrix.has(key)) {
      matrix.set(key, { label, counts: new Map(), total: 0 });
    }
    const row = matrix.get(key)!;
    row.counts.set(r.activityName, (row.counts.get(r.activityName) || 0) + r.count);
    row.total += r.count;
  }

  // Counts for the selected day only
  const baseDayKey = formatISO(startOfDay(baseDate));
  const dayCounts = new Map<string, number>();
  for (const r of records) {
    if (formatISO(r.activityDate) === baseDayKey) {
      dayCounts.set(r.activityName, (dayCounts.get(r.activityName) || 0) + r.count);
    }
  }

  const days = new Map<string, { date: Date; rows: { name: string; count: number }[] }>();
  for (const r of records) {
    const key = formatISO(r.activityDate);
    if (!days.has(key)) days.set(key, { date: r.activityDate, rows: [] });
    days.get(key)!.rows.push({ name: r.activityName, count: r.count });
  }

  // Win The Day status for the base day (today by default)
  const plan = await resolveWinTheDayPlanForPerson(agencyId, selectedPerson?.id, teamId || undefined);
  const wtdResult =
    plan && selectedPerson
      ? await computeWinTheDayPoints(plan.id, selectedPerson.id, startOfDay(baseDate))
      : null;

  return (
    <AppShell title="Activity Manager" subtitle="Log activities, see progress, and track Win The Day.">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <RangeButton label="Today" value="today" preset={preset} date={baseDateStr} query={sp} />
          <RangeButton label="Week" value="week" preset={preset} date={baseDateStr} query={sp} />
          <RangeButton label="Month" value="month" preset={preset} date={baseDateStr} query={sp} />
          <RangeButton label="Custom" value="custom" preset={preset} date={baseDateStr} query={sp} />
          <span style={{ color: "#555", fontSize: 13 }}>{rangeLabel}</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <DateRangePicker preset={preset} baseDate={baseDateStr} start={sp.start} end={sp.end} query={sp} />
          {showTeamSelector ? (
            <select
              name="personId"
              defaultValue={selectedPersonId}
              style={{ padding: "8px 10px", minWidth: 200 }}
              onChange={(e) => {
                const params = new URLSearchParams({ ...sp, personId: e.target.value });
                router.replace(`/activities?${params.toString()}`);
              }}
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} {p.team ? `(${p.team.name})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              <span style={{ fontWeight: 700 }}>{personName}</span>
              <a
                href={`/activities?date=${baseDateStr}&range=${preset}&viewAll=1`}
                style={{ color: "#1d4ed8", textDecoration: "underline", fontSize: 13 }}
              >
                Switch person (manager)
              </a>
            </div>
          )}
        </div>
      </div>

      <Suspense fallback={<div style={{ marginTop: 16 }}>Loading Win The Day...</div>}>
        <WinTheDayBar
          plan={plan}
          result={wtdResult}
          personName={personName}
          dateLabel={preset === "custom" ? rangeLabel : humanDate(baseDate)}
        />
      </Suspense>

      <div style={{ marginTop: 8, color: "#555" }}>
        <strong>Range:</strong> {rangeLabel}
      </div>

      <CountersPanel
        counters={activityTypes.map((a) => ({ name: a.name, count: dayCounts.get(a.name) || 0 }))}
        available={activityTypes.map((a) => a.name)}
        personId={selectedPersonId}
        personName={personName}
        date={formatISO(baseDate)}
        actions={{
          setActivityCount,
          adjustActivityCount,
          addEmptyCounter,
          removeCounter,
        }}
      />

      <div className="surface" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontWeight: 700 }}>Summary ({humanDate(from)} → {humanDate(to)})</div>
          <ActivityEntryModal
            people={people.map((p) => ({ id: p.id, name: p.fullName }))}
            defaultPersonId={selectedPersonId}
            saveAction={createActivityEntry}
            activities={activityTypes.map((a) => ({
              name: a.name,
              description: a.description || "",
              unitLabel: a.unitLabel || "",
              requiresFullName: a.requiresFullName,
            }))}
          />
        </div>
        {totals.size === 0 ? (
          <div style={{ color: "#666" }}>No activity entries in this window.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {[...totals.entries()].map(([name, count]) => (
              <div key={name} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#f8f9fa" }}>
                <div style={{ fontWeight: 700 }}>{name}</div>
                <div style={{ fontSize: 22, marginTop: 6 }}>{count}</div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <ActivityEntryModal
                    variant="ghost"
                    people={people.map((p) => ({ id: p.id, name: p.fullName }))}
                    defaultPersonId={selectedPersonId}
                    presetActivity={name}
                    defaultDate={formatISO(baseDate)}
                    saveAction={createActivityEntry}
                    activities={activityTypes.map((a) => ({
                      name: a.name,
                      description: a.description || "",
                      unitLabel: a.unitLabel || "",
                      requiresFullName: a.requiresFullName,
                    }))}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="surface" style={{ marginTop: 16, overflowX: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Activity matrix (by team member)</div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Click a name to log more for that person.</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", background: "#f8fafc" }}>
              <th style={{ textAlign: "left", padding: "10px 8px", fontSize: 12, color: "#475569" }}>Team Member</th>
              {activityNames.map((n) => (
                <th key={`h-${n}`} style={{ padding: "10px 8px", fontSize: 12, color: "#475569" }}>
                  {n}
                </th>
              ))}
              <th style={{ padding: "10px 8px", fontSize: 12, color: "#475569" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(matrix.values())
              .sort((a, b) => b.total - a.total)
              .map((row) => (
                <tr key={row.label} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 8px", fontWeight: 700, color: "#1d4ed8" }}>
                    <ActivityEntryModal
                      variant="link"
                      label={row.label}
                      people={people.map((p) => ({ id: p.id, name: p.fullName }))}
                      defaultPersonId={people.find((p) => p.fullName === row.label)?.id || selectedPersonId}
                      defaultDate={formatISO(baseDate)}
                      saveAction={createActivityEntry}
                      activities={activityTypes.map((a) => ({
                        name: a.name,
                        description: a.description || "",
                        unitLabel: a.unitLabel || "",
                        requiresFullName: a.requiresFullName,
                      }))}
                    />
                  </td>
                  {activityNames.map((n) => (
                    <td key={`${row.label}-${n}`} style={{ padding: "10px 8px", textAlign: "center", color: "#111" }}>
                      {row.counts.get(n) || 0}
                    </td>
                  ))}
                  <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 800 }}>{row.total}</td>
                </tr>
              ))}
            <tr style={{ borderTop: "2px solid #e5e7eb", background: "#f8fafc", fontWeight: 800 }}>
              <td style={{ padding: "10px 8px" }}>Total</td>
              {activityNames.map((n) => (
                <td key={`tot-${n}`} style={{ padding: "10px 8px", textAlign: "center" }}>
                  {Array.from(matrix.values()).reduce((acc, r) => acc + (r.counts.get(n) || 0), 0)}
                </td>
              ))}
              <td style={{ padding: "10px 8px", textAlign: "center" }}>
                {Array.from(matrix.values()).reduce((acc, r) => acc + r.total, 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="surface" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>List by day</div>
        {[...days.entries()]
          .sort(([a], [b]) => (a > b ? -1 : 1))
          .map(([key, data]) => (
            <div key={key} style={{ borderBottom: "1px solid #e5e7eb", padding: "10px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700 }}>{humanDate(data.date)}</div>
                <ActivityEntryModal
                  variant="link"
                  label="+ Add entry"
                  people={people.map((p) => ({ id: p.id, name: p.fullName }))}
                  defaultPersonId={selectedPersonId}
                  defaultDate={key}
                  saveAction={createActivityEntry}
                  activities={activityTypes.map((a) => ({
                    name: a.name,
                    description: a.description || "",
                    unitLabel: a.unitLabel || "",
                    requiresFullName: a.requiresFullName,
                  }))}
                />
              </div>
              <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                {data.rows.map((r, idx) => (
                  <div key={`${r.name}-${idx}`} style={{ display: "flex", justifyContent: "space-between", color: "#111" }}>
                    <span>{r.name}</span>
                    <span style={{ fontWeight: 700 }}>{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        {days.size === 0 && <div style={{ color: "#666" }}>No activity entries yet.</div>}
      </div>
    </AppShell>
  );
}

function RangeButton({ label, value, preset, date }: { label: string; value: RangePreset; preset: string; date: string }) {
  const active = value === preset;
  return (
    <a
      href={`/activities?range=${value}&date=${date}`}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        background: active ? "#283618" : "#fff",
        color: active ? "#f8f9fa" : "#111",
        textDecoration: "none",
        fontWeight: 600,
      }}
    >
      {label}
    </a>
  );
}
