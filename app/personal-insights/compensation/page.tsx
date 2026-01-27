import { redirect } from "next/navigation";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PersonalInsightsCompensationPage({ searchParams }: { searchParams?: SearchParams }) {
  const viewer: any = await getOrgViewer();
  if (!viewer?.orgId || !viewer?.personId) {
    return <div className="surface" style={{ padding: 16 }}>Unauthorized.</div>;
  }

  if (viewer?.isManager && !(viewer?.isOwner || viewer?.isAdmin)) {
    return <div className="surface" style={{ padding: 16 }}>Unauthorized.</div>;
  }

  const elevated = Boolean(viewer?.isOwner || viewer?.isAdmin);
  const sp = (await searchParams) || {};
  const personIdParam = Array.isArray(sp.personId) ? sp.personId[0] : sp.personId;
  const requestedPersonId = typeof personIdParam === "string" && personIdParam.trim() ? personIdParam.trim() : null;
  let targetPersonId = elevated && requestedPersonId ? requestedPersonId : viewer.personId;

  let person = await prisma.person.findFirst({
    where: { id: targetPersonId, orgId: viewer.orgId },
    select: { id: true },
  });

  if (!person && targetPersonId !== viewer.personId) {
    targetPersonId = viewer.personId;
    person = await prisma.person.findFirst({
      where: { id: targetPersonId, orgId: viewer.orgId },
      select: { id: true },
    });
  }

  if (!person) {
    return <div className="surface" style={{ padding: 16 }}>Unauthorized.</div>;
  }

  const params = new URLSearchParams();
  const month = Array.isArray(sp.month) ? sp.month[0] : sp.month;
  const year = Array.isArray(sp.year) ? sp.year[0] : sp.year;
  const written = Array.isArray(sp.written) ? sp.written[0] : sp.written;

  if (typeof month === "string" && month.trim()) params.set("month", month);
  if (typeof year === "string" && year.trim()) params.set("year", year);
  if (typeof written === "string" && written.trim()) params.set("written", written);
  params.set("person", targetPersonId);

  const query = params.toString();
  redirect(query ? `/paycheck?${query}` : "/paycheck");
}
