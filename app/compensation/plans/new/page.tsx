import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { PolicyStatus } from "@prisma/client";
import { redirect } from "next/navigation";

const PRESET_OPTIONS = [
  { value: "sales", label: "Sales Plan (preset)" },
  { value: "scorecard", label: "Scorecard Bronze/Silver/Gold" },
  { value: "scratch", label: "Start from scratch" },
];

export default async function NewCompPlanPage() {
  const agencies = await prisma.agency.findMany({ orderBy: { name: "asc" } });
  const statuses = [
    PolicyStatus.WRITTEN,
    PolicyStatus.ISSUED,
    PolicyStatus.PAID,
    PolicyStatus.STATUS_CHECK,
    PolicyStatus.CANCELLED,
  ];

  async function createPlan(formData: FormData) {
    "use server";
    const agencyId = String(formData.get("agencyId") || "");
    const name = String(formData.get("name") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const effectiveStartMonth = String(formData.get("effectiveStartMonth") || "").trim();
    const preset = String(formData.get("preset") || "scratch");
    const statusValues = formData.getAll("statusEligibility").map(String) as PolicyStatus[];

    if (!name) return;

    const plan = await prisma.compPlan.create({
      data: {
        agencyId: agencyId || null,
        name,
        description,
        defaultStatusEligibility: statusValues.length ? statusValues : [PolicyStatus.ISSUED, PolicyStatus.PAID],
        effectiveStartMonth: effectiveStartMonth || null,
        versions: {
          create: {
            effectiveStartMonth: effectiveStartMonth || null,
          },
        },
      },
    });

    // Optionally seed presets (only two allowed)
    if (preset === "sales" || preset === "scorecard") {
      const version = await prisma.compPlanVersion.findFirst({ where: { planId: plan.id, isCurrent: true } });
      if (version) {
        if (preset === "sales") {
          await seedSalesPreset(version.id);
        } else {
          await seedScorecardPreset(version.id);
        }
      }
    }

    redirect(`/compensation/plans/${plan.id}`);
  }

  return (
    <AppShell title="Create Plan" subtitle="Guided wizard to scaffold a modular compensation plan.">
      <div className="surface" style={{ maxWidth: 820, padding: 18 }}>
        <form action={createPlan} style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Plan name *</span>
              <input className="input" name="name" required placeholder="e.g., Sales 2025" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Agency</span>
              <select className="select" name="agencyId">
                <option value="">All / Global</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: "#6b7280" }}>Pick an office or keep it global.</span>
            </label>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Description (optional)</span>
              <textarea className="textarea" name="description" rows={2} placeholder="Brief summary of this plan." />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Applies to (optional)</span>
              <input className="input" name="appliesTo" placeholder="Sales / CS / Team Leads / Custom" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Effective start month (YYYY-MM)</span>
              <input className="input" name="effectiveStartMonth" placeholder="2025-01" />
            </label>
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#f8fafc" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Default eligible statuses</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {statuses.map((s) => (
                <label key={s} style={{ display: "inline-flex", gap: 6, alignItems: "center", padding: "6px 10px", borderRadius: 10, background: "#fff", border: "1px solid #e5e7eb" }}>
                  <input
                    type="checkbox"
                    name="statusEligibility"
                    value={s}
                    defaultChecked={s === PolicyStatus.ISSUED || s === PolicyStatus.PAID}
                  />
                  {s}
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
              These apply to all rule blocks unless you override statuses inside a rule.
            </div>
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Choose starting approach</div>
            <div style={{ display: "grid", gap: 8 }}>
              {PRESET_OPTIONS.map((opt) => (
                <label key={opt.value} style={{ display: "inline-flex", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f8fafc" }}>
                  <input type="radio" name="preset" value={opt.value} defaultChecked={opt.value === "scratch"} />
                  <span style={{ fontWeight: 600 }}>{opt.label}</span>
                </label>
              ))}
            </div>
            <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>
              Only the two provided presets are available. Everything else is built manually via modules.
            </div>
          </div>

          <button
            type="submit"
            className="btn primary"
            style={{ padding: "12px 16px", borderRadius: 10, width: "100%", fontWeight: 800, fontSize: 16 }}
          >
            Confirm & Create
          </button>
        </form>
      </div>
    </AppShell>
  );
}

async function seedSalesPreset(planVersionId: string) {
  await prisma.compPlanRuleBlock.createMany({
    data: [
      {
        planVersionId,
        name: "Auto Personal Raw New (tiered)",
        enabled: true,
        orderIndex: 0,
        ruleType: "BASE",
        statusEligibilityOverride: [],
        applyScope: "PRODUCT",
        applyFilters: { productType: "PERSONAL", productNames: ["Auto Raw New"] },
        payoutType: "FLAT_PER_APP",
        basePayoutValue: 10,
        tierMode: "TIERS",
        tierBasis: "APP_COUNT",
      },
      {
        planVersionId,
        name: "Auto Added",
        enabled: true,
        orderIndex: 1,
        ruleType: "BASE",
        statusEligibilityOverride: [],
        applyScope: "PRODUCT",
        applyFilters: { productType: "PERSONAL", productNames: ["Auto Added"] },
        payoutType: "FLAT_PER_APP",
        basePayoutValue: 5,
        tierMode: "NONE",
      },
    ],
  });
}

async function seedScorecardPreset(planVersionId: string) {
  const bonus = await prisma.compPlanBonusModule.create({
    data: {
      planVersionId,
      name: "Scorecard (Bronze/Silver/Gold)",
      bonusType: "SCORECARD_TIER",
      highestTierWins: true,
    },
  });
  await prisma.compPlanScorecardTier.createMany({
    data: [
      { bonusModuleId: bonus.id, name: "Bronze", orderIndex: 0 },
      { bonusModuleId: bonus.id, name: "Silver", orderIndex: 1 },
      { bonusModuleId: bonus.id, name: "Gold", orderIndex: 2 },
    ],
  });
}
