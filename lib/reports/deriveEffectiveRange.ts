import { endOfMonth, parseISO, startOfMonth } from "date-fns";

export type Granularity = "day" | "week" | "month";

export interface DeriveEffectiveRangeArgs {
  /**
   * Custom explicit range (highest priority). ISO strings.
   */
  start?: string;
  end?: string;

  /**
   * Month focus in YYYY-MM format (2nd priority).
   */
  monthFilter?: string;

  /**
   * Chart labels. We do NOT assume these are parseable yet.
   * Only parse if they look like ISO date strings.
   */
  labels?: string[];

  /**
   * Granularity of the series (used only to decide whether to attempt parsing).
   */
  granularity?: Granularity;
}

function isProbablyISODate(input: string): boolean {
  // Very defensive: accept "YYYY-MM-DD" or full ISO "YYYY-MM-DDTHH:mm:ss..."
  return /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(input);
}

export function deriveEffectiveRange({
  start,
  end,
  monthFilter,
  labels,
  granularity,
}: DeriveEffectiveRangeArgs): { start?: string; end?: string } {
  // 1) Explicit custom range wins
  if (start && end) return { start, end };

  // 2) Month filter (YYYY-MM)
  if (monthFilter) {
    try {
      const monthStart = startOfMonth(parseISO(`${monthFilter}-01`));
      const monthEnd = endOfMonth(monthStart);
      return {
        start: monthStart.toISOString(),
        end: monthEnd.toISOString(),
      };
    } catch {
      return {};
    }
  }

  // 3) Derive from labels (only if they appear parseable)
  if (labels && labels.length > 0 && granularity) {
    const first = labels[0];
    const last = labels[labels.length - 1];

    if (first && last && isProbablyISODate(first) && isProbablyISODate(last)) {
      try {
        const derivedStart = parseISO(first);
        const derivedEnd = parseISO(last);
        return {
          start: derivedStart.toISOString(),
          end: derivedEnd.toISOString(),
        };
      } catch {
        return {};
      }
    }
  }

  return {};
}

