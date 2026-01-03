import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import ROIClient from "./ROIClient";
import { readCookie } from "@/lib/readCookie";

export default async function ROIReportPage() {
  const impersonateId = readCookie("impersonatePersonId");
  const viewer = impersonateId
    ? await prisma.person.findUnique({ where: { id: impersonateId }, select: { isAdmin: true, isManager: true } })
    : null;

  const isAllowed = viewer ? viewer.isAdmin || viewer.isManager : true;
  const agencies = await prisma.agency.findMany({ orderBy: { name: "asc" } });
  const lobs = await prisma.lineOfBusiness.findMany({ orderBy: { name: "asc" } });

  const agencyOptions = agencies.map((a) => ({ value: a.id, label: a.name }));
  const lobOptions = lobs.map((l) => ({ id: l.id, name: l.name, premiumCategory: l.premiumCategory }));

  return (
    <AppShell title="ROI Report" subtitle="Understand profit by person and line of business.">
      {!isAllowed ? (
        <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecdd3", borderRadius: 12, color: "#991b1b" }}>
          This report is restricted to managers and admins. Switch to an admin or manager profile to view ROI.
        </div>
      ) : (
        <ROIClient agencies={agencyOptions} lobs={lobOptions} />
      )}
    </AppShell>
  );
}
