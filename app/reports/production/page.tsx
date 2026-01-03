import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import ProductionOverviewDashboard from "./ProductionOverviewDashboard";

export default async function ProductionOverviewPage() {
  const agencies = await prisma.agency.findMany({ orderBy: { name: "asc" } });
  const products = await prisma.product.findMany({
    include: { lineOfBusiness: true },
    orderBy: [{ lineOfBusiness: { name: "asc" } }, { name: "asc" }],
  });

  const agencyOptions = agencies.map((a) => ({ value: a.id, label: a.name }));
  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.lineOfBusiness?.name || "Unknown"})`,
    lobName: p.lineOfBusiness?.name || "Unknown",
  }));

  return (
    <AppShell title="Production Overview" subtitle="Premium and apps this period with LoB breakdowns.">
      <div style={{ display: "grid", gap: 16 }}>
        <a className="btn" href="/reports" style={{ textDecoration: "none", width: "fit-content" }}>
          ← Back to Reports
        </a>
        <ProductionOverviewDashboard agencies={agencyOptions} products={productOptions} />
      </div>
    </AppShell>
  );
}
