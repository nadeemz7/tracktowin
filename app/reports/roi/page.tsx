import { prisma } from "@/lib/prisma";
import ROIPageClient from "./ROIPageClient";

export default async function Page() {
  const lobs = await prisma.lineOfBusiness.findMany({ orderBy: { name: "asc" } });
  const lobOptions = lobs.map((l) => ({ id: l.id, name: l.name, premiumCategory: l.premiumCategory }));
  return <ROIPageClient lobs={lobOptions} />;
}
