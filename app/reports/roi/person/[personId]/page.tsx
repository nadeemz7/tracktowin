import PersonROIClient from "./PersonROIClient";
import { redirect } from "next/navigation";
import { canAccessRoiReport } from "@/lib/permissions";

export default async function PersonROIPage({ params }: { params: { personId: string } }) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
  let ctx: {
    personId: string;
    orgId: string;
    isAdmin: boolean;
    isManager: boolean;
    isOwner: boolean;
    impersonating: boolean;
  } | null = null;
  try {
    const res = await fetch(`${baseUrl}/api/viewer/context`, { cache: "no-store" });
    if (res.ok) {
      ctx = await res.json();
    }
  } catch {
    ctx = null;
  }
  if (!ctx || !canAccessRoiReport(ctx)) {
    if (process.env.NODE_ENV !== "production" && !ctx) {
      console.warn("[ROI Report] No viewer context available while rendering person ROI page.");
    }
    redirect("/reports/roi");
  }
  return <PersonROIClient personId={params.personId} />;
}
