import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { CompensationBuilder } from "@/src/compensationBuilder";
import { BuilderHints } from "@/src/ui/PlanBuilder";

async function loadHints(): Promise<BuilderHints> {
  try {
    const [roles, lines, products, activities] = await Promise.all([
      prisma.role.findMany({ where: { active: true }, select: { name: true } }),
      prisma.lineOfBusiness.findMany({ select: { name: true } }),
      prisma.product.findMany({ where: { isActive: true }, select: { name: true, lineOfBusiness: { select: { name: true } } } }),
      prisma.activityType.findMany({ where: { active: true }, select: { name: true } }),
    ]);

    const unique = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b));

    return {
      roles: unique(roles.map((r) => r.name)),
      lines: unique(lines.map((l) => l.name)),
      products: unique(products.map((p) => (p.lineOfBusiness ? `${p.lineOfBusiness.name} – ${p.name}` : p.name))),
      activities: unique(activities.map((a) => a.name)),
    };
  } catch (e) {
    console.error("Failed to load compensation builder hints", e);
    return { roles: [], lines: [], products: [], activities: [] };
  }
}

export default async function CompensationBuilderPage() {
  const hints = await loadHints();
  return (
    <AppShell
      title="Comp Builder 2"
      subtitle="Self-contained, local-only insurance compensation builder (uses sample data in localStorage)."
    >
      <CompensationBuilder hints={hints} />
    </AppShell>
  );
}
