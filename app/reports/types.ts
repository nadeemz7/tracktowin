import { TeamType } from "@prisma/client";

export type ReportsData = {
  timeframe: { start: string; end: string; today: string };
  agencies: { id: string; name: string; monthly: { month: string; apps: number; premium: number }[] }[];
  lobBreakdown: { name: string; apps: number; premium: number }[];
  productTypeBreakdown: { name: string; apps: number; premium: number }[];
  productBreakdown: { name: string; apps: number; premium: number; category: string; type: string }[];
  personTrend: { name: string; teamType?: TeamType | null; monthly: { month: string; apps: number; premium: number }[] }[];
  activitySummary: { name: string; total: number; monthly: { month: string; value: number }[] }[];
  winTheDay: { person: string; month: string; points: number; target: number; win: boolean }[];
};
