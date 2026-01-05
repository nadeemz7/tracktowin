import { AppShell } from "@/app/components/AppShell";
import { readCookie } from "@/lib/readCookie";
import { prisma } from "@/lib/prisma";
import RoiRatesSetupClient from "@/app/reports/roi/setup/RoiRatesSetupClient";

export default async function RoiSetupAdminPage() {
  const impersonateId = await readCookie("impersonatePersonId");
  const viewer = impersonateId
    ? await prisma.person.findUnique({
        where: { id: impersonateId },
        select: { id: true, fullName: true, isAdmin: true, isManager: true, primaryAgencyId: true },
      })
    : null;

  let isOwner = false;
  if (viewer) {
    const owns = await prisma.agency.findFirst({
      where: { ownerName: { equals: viewer.fullName, mode: "insensitive" } },
    });
    isOwner = !!owns;
  }

  const impersonatedHasAccess = viewer ? viewer.isAdmin || viewer.isManager || isOwner : false;
  const isAllowed = impersonateId ? impersonatedHasAccess : true;

  if (!isAllowed) {
    return (
      <AppShell title="ROI Setup" subtitle="Commission rate management is restricted to admins.">
        <div style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecdd3", borderRadius: 12, color: "#991b1b" }}>
          You do not have access to this page.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="ROI Setup" subtitle="Manage commission rates for ROI reporting.">
      <RoiRatesSetupClient />
    </AppShell>
  );
}
