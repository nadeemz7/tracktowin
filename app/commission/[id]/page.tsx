import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ComponentsListClient } from "../ComponentsListClient";
import { SimpleComponentBuilder } from "../SimpleComponentBuilder";

const BUCKET_OPTIONS: { value: string; label: string }[] = [
  { value: "auto_personal_raw_new_apps", label: "Auto Raw New (apps)" },
  { value: "auto_personal_adds_apps", label: "Auto Adds (apps)" },
  { value: "business_auto_premium", label: "Business Auto Premium" },
  { value: "business_auto_adds_premium", label: "Business Auto Adds Premium" },
  { value: "fire_personal_premium", label: "Fire Personal Premium" },
  { value: "business_fire_premium", label: "Business Fire Premium" },
  { value: "health_premium", label: "Health Premium" },
  { value: "life_premium", label: "Life Premium" },
  { value: "pc_premium", label: "P&C Premium" },
  { value: "fs_premium", label: "Financial Services Premium" },
  { value: "pc_apps_total", label: "P&C Apps (total)" },
  { value: "fs_apps_total", label: "FS Apps (total)" },
  { value: "ips_premium", label: "IPS Premium" },
  { value: "business_premium", label: "Business Premium (all)" },
];

export default async function CommissionPlanDetail({ params }: { params: { id: string } }) {
  const plan = await prisma.commissionPlan.findUnique({
    where: { id: params.id },
    include: { components: { orderBy: { displayOrder: "asc" } } },
  });

  if (!plan) return notFound();

  async function deleteComponent(formData: FormData) {
    "use server";
    const id = String(formData.get("componentId") || "");
    if (!id) return;
    await prisma.commissionComponent.delete({ where: { id } });
    revalidatePath(`/commission/${params.id}`);
    revalidatePath("/commission");
  }

  async function moveComponent(formData: FormData) {
    "use server";
    const id = String(formData.get("componentId") || "");
    const direction = String(formData.get("direction") || "");
    const planId = params.id;
    if (!id || !direction || !planId) return;
    const components = await prisma.commissionComponent.findMany({
      where: { planId },
      orderBy: { displayOrder: "asc" },
    });
    const idx = components.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= components.length) return;
    const current = components[idx];
    const target = components[targetIdx];
    await prisma.$transaction([
      prisma.commissionComponent.update({
        where: { id: current.id },
        data: { displayOrder: target.displayOrder },
      }),
      prisma.commissionComponent.update({
        where: { id: target.id },
        data: { displayOrder: current.displayOrder },
      }),
    ]);
    revalidatePath(`/commission/${params.id}`);
    revalidatePath("/commission");
  }

  const reorderComponents = async (input: { planId: string; orderedIds: string[] }) => {
    "use server";
    if (!input.planId || !input.orderedIds?.length) return;
    const updates = input.orderedIds.map((id, idx) =>
      prisma.commissionComponent.update({ where: { id }, data: { displayOrder: idx } })
    );
    await prisma.$transaction(updates);
    revalidatePath(`/commission/${params.id}`);
    revalidatePath("/commission");
  };

  async function addComponentSimple(formData: FormData) {
    "use server";
    const planId = params.id;
    const name = String(formData.get("simpleName") || "").trim();
    const simpleType = String(formData.get("simpleType") || "");
    const bucketOption = String(formData.get("bucketOption") || "");
    const bucketCustom = String(formData.get("bucketCustom") || "").trim();
    const bucket = bucketOption === "CUSTOM" ? bucketCustom : bucketOption;
    const rateStr = String(formData.get("simpleRate") || "");
    const tierRowsRaw = String(formData.get("tierRows") || "[]");
    const flagOverridesRaw = String(formData.get("flagOverrides") || "[]");
    const activityName = String(formData.get("activityName") || "").trim();
    const activityAmountStr = String(formData.get("activityAmount") || "");
    if (!planId || !name) return;

    let flagOverrides: { flagField: string; percent: number }[] = [];
    try {
      const parsed = JSON.parse(flagOverridesRaw) as string[];
      flagOverrides = parsed
        .filter((f) => f === "isValueHealth" || f === "isValueLife")
        .map((flagField) => ({ flagField, percent: 0.2 }));
    } catch {
      flagOverrides = [];
    }

    let config: Record<string, unknown> | null = null;
    let componentType: string | null = null;

    if (simpleType === "PER_APP_FLAT") {
      const rate = Number(rateStr);
      if (Number.isNaN(rate) || !bucket) return;
      componentType = "FLAT_PER_APP";
      config = { bucket, ratePerApp: rate };
    } else if (simpleType === "PER_APP_TIER") {
      let tiers: { min: number; max?: number; ratePerApp: number }[] = [];
      try {
        const rows = JSON.parse(tierRowsRaw) as { min?: string; max?: string; value?: string }[];
        tiers = rows
          .map((r) => ({
            min: Number(r.min ?? 0),
            max: r.max ? Number(r.max) : undefined,
            ratePerApp: Number(r.value ?? 0),
          }))
          .filter((t) => !Number.isNaN(t.min) && !Number.isNaN(t.ratePerApp));
      } catch {
        tiers = [];
      }
      if (!bucket || tiers.length === 0) return;
      componentType = "TIERED_PER_APP";
      config = { bucket, tiers };
    } else if (simpleType === "PERCENT_FLAT") {
      const percent = Number(rateStr);
      if (Number.isNaN(percent) || !bucket) return;
      componentType = "PERCENT_FLAT";
      config = { bucket, percent: percent / 100, ...(flagOverrides.length ? { flagOverrides } : {}) };
    } else if (simpleType === "PERCENT_TIER") {
      let tiers: { min: number; max?: number; percent: number }[] = [];
      try {
        const rows = JSON.parse(tierRowsRaw) as { min?: string; max?: string; value?: string }[];
        tiers = rows
          .map((r) => ({
            min: Number(r.min ?? 0),
            max: r.max ? Number(r.max) : undefined,
            percent: Number(r.value ?? 0) / 100,
          }))
          .filter((t) => !Number.isNaN(t.min) && !Number.isNaN(t.percent));
      } catch {
        tiers = [];
      }
      if (!bucket || tiers.length === 0) return;
      componentType = "PERCENT_TIER";
      config = { bucket, tiers, ...(flagOverrides.length ? { flagOverrides } : {}) };
    } else if (simpleType === "ACTIVITY") {
      const amount = Number(activityAmountStr);
      if (!activityName || Number.isNaN(amount)) return;
      componentType = "ACTIVITY_PAY";
      config = { activities: [{ activityName, amount }] };
    }

    if (!componentType || !config) return;

    const maxOrder = await prisma.commissionComponent.aggregate({
      where: { planId },
      _max: { displayOrder: true },
    });
    const nextOrder = (maxOrder._max.displayOrder || 0) + 1;

    await prisma.commissionComponent.create({
      data: { planId, name, componentType, config, displayOrder: nextOrder },
    });
    revalidatePath(`/commission/${params.id}`);
    revalidatePath("/commission");
  }

  return (
    <AppShell title={`Plan: ${plan.name}`} subtitle="Drag to reorder, add new rules, or remove ones you don't want.">
      <div className="surface" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/commission" style={{ fontSize: 14 }}>
            ← Back to all plans
          </Link>
          <div style={{ fontSize: 12, color: "#555" }}>{plan.components.length} rule{plan.components.length === 1 ? "" : "s"}</div>
        </div>

        <ComponentsListClient
          planId={plan.id}
          components={plan.components}
          reorderAction={reorderComponents}
          moveAction={moveComponent}
          deleteAction={deleteComponent}
        />

        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Add a new earning rule</div>
          <div style={{ color: "#555", fontSize: 13, marginBottom: 6 }}>
            Pick the metric, choose flat or tiered, and set the amounts. No code needed.
          </div>
          <SimpleComponentBuilder planId={plan.id} bucketOptions={BUCKET_OPTIONS} addAction={addComponentSimple} />
        </div>
      </div>
    </AppShell>
  );
}
