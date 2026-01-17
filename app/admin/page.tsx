import { AppShell } from "@/app/components/AppShell";
import { readCookie } from "@/lib/readCookie";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminIndexPage({ searchParams }: { searchParams?: { q?: string } }) {
  const q = searchParams?.q?.toString().trim() || "";

  const impersonateId = await readCookie("impersonatePersonId");
  const impersonated = impersonateId
    ? await prisma.person.findUnique({
        where: { id: impersonateId },
        select: { id: true, fullName: true, isAdmin: true, isManager: true, primaryAgencyId: true },
      })
    : null;

  let isOwner = false;
  if (impersonated) {
    const owns = await prisma.agency.findFirst({
      where: { ownerName: { equals: impersonated.fullName, mode: "insensitive" } },
    });
    isOwner = !!owns;
  }

  const impersonatedHasAccess = impersonated?.isAdmin || impersonated?.isManager || isOwner;

  if (impersonated && !impersonatedHasAccess) {
    return (
      <AppShell title="TrackToWin Admin" subtitle="Admin tools are hidden while impersonating a non-admin user." actions={null}>
        <div
          style={{
            border: "1px solid #fca5a5",
            background: "#fef2f2",
            color: "#991b1b",
            padding: 14,
            borderRadius: 12,
          }}
        >
          You are viewing as <strong>{impersonated.fullName}</strong>. Admin tools are disabled. Clear impersonation using the banner
          above to regain access.
        </div>
      </AppShell>
    );
  }

  let impersonatedAgencyFilter: Record<string, unknown> | undefined = undefined;
  if (impersonated && !impersonated.isAdmin && !impersonated.isManager) {
    const orConditions: ({ ownerName: { contains: string; mode: "insensitive" } } | { id: string })[] = [
      { ownerName: { contains: impersonated.fullName, mode: "insensitive" } },
    ];
    if (impersonated.primaryAgencyId) {
      orConditions.push({ id: impersonated.primaryAgencyId });
    }
    impersonatedAgencyFilter = { OR: orConditions };
  }

  const agencies = await prisma.agency.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { ownerName: { contains: q, mode: "insensitive" } },
            { profileName: { contains: q, mode: "insensitive" } },
          ],
          ...(impersonatedAgencyFilter ?? {}),
        }
      : impersonatedAgencyFilter,
    orderBy: { name: "asc" },
    include: { linesOfBusiness: true, peoplePrimary: true },
  });

  return (
    <AppShell title="TrackToWin Admin" subtitle="Search and jump into any agency on the platform." actions={null}>
      <div style={{ display: "grid", gap: 16 }}>
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search agencies, owners, profiles…"
            style={{ padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", flex: 1, minWidth: 260 }}
          />
          <button type="submit" className="btn" style={{ padding: "10px 14px" }}>
            Search
          </button>
        </form>

        <div style={{ display: "grid", gap: 10 }}>
          {agencies.length === 0 ? <div style={{ color: "#6b7280" }}>No agencies found.</div> : null}
          {agencies.map((a) => (
            <div
              key={a.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
                display: "grid",
                gap: 6,
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{a.name}</div>
                <div style={{ color: "#475569", fontSize: 13 }}>
                  Owner: {a.ownerName || "—"} • Profile: {a.profileName || "—"} • LoBs: {a.linesOfBusiness.length} • People:{" "}
                  {a.peoplePrimary.length}
                </div>
              </div>
              <Link href={`/agencies/${a.id}`} className="btn primary" style={{ textDecoration: "none", padding: "8px 12px" }}>
                Open agency
              </Link>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
