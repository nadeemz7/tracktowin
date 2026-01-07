const DAY_MS = 24 * 60 * 60 * 1000;

function toLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function daysInclusive(start: Date, end: Date): number {
  const s = toLocalDay(start);
  const e = toLocalDay(end);
  const diff = e.getTime() - s.getTime();
  const days = Math.floor(diff / DAY_MS) + 1;
  return Math.max(1, days);
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function prorateAnnualTarget(annualTarget: number | null, start: Date, end: Date): number | null {
  if (annualTarget == null || !Number.isFinite(annualTarget)) return null;
  const totalDays = daysInclusive(start, end);
  const yearDays = daysInYear(start.getFullYear());
  if (yearDays <= 0) return null;
  const prorated = annualTarget * (totalDays / yearDays);
  return Number.isFinite(prorated) ? prorated : null;
}

export function expectedToDate(
  proratedTarget: number | null,
  start: Date,
  end: Date,
  asOf?: Date
): number | null {
  if (proratedTarget == null || !Number.isFinite(proratedTarget)) return null;
  const effectiveAsOf = asOf && asOf.getTime() < end.getTime() ? asOf : end;
  const elapsedDays = daysInclusive(start, effectiveAsOf);
  const totalDays = daysInclusive(start, end);
  if (totalDays <= 0) return null;
  const expected = proratedTarget * (elapsedDays / totalDays);
  return Number.isFinite(expected) ? expected : null;
}

export function pace(actual: number, expected: number | null): number | null {
  if (expected == null || !Number.isFinite(expected) || expected <= 0) return null;
  if (!Number.isFinite(actual)) return null;
  const value = actual / expected;
  return Number.isFinite(value) ? value : null;
}
