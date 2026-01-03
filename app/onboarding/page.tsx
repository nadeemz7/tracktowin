import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { OnboardingPayload, PremiumCategory } from "./config";
import { ensureDefaultWinTheDayPlans } from "@/lib/wtdDefaults";
import OnboardingWizard from "./OnboardingWizard";

async function createFromPayload(payload: OnboardingPayload) {
  const createdAgencies: { name: string; id: string }[] = [];

  // First create all agencies (LoBs/products/buckets) so we have ids for cross-office references
  for (const office of payload.offices) {
    const agency = await prisma.agency.create({
      data: {
        name: office.name,
        profileName: payload.profileName || null,
        ownerName: payload.ownerName || null,
        address: payload.address || null,
        linesOfBusiness: {
          create: office.lobs
            .filter((l) => l.active)
            .map((l) => ({
              name: l.name,
              premiumCategory: l.premiumCategory as PremiumCategory,
              products: {
                create: l.products.map((p) => ({
                  name: p.name,
                  productType: p.productType,
                })),
              },
            })),
        },
        premiumBuckets: {
          create: office.premiumBuckets.map((b) => ({
            name: b.name,
            description: b.description || null,
            includesLobs: b.includesLobs,
            includesProducts: b.includesProducts,
          })),
        },
      },
    });
    createdAgencies.push({ name: office.name, id: agency.id });
  }

  // Now create teams/roles/people/fields with correct agency IDs
  for (const office of payload.offices) {
    const agency = createdAgencies.find((a) => a.name === office.name);
    if (!agency) continue;

    const teamCreates = office.teams.map((t) => ({
      name: t.name,
      roles: t.roles,
    }));

    const teams = await prisma.team.createManyAndReturn({
      data: teamCreates.map((t) => ({ agencyId: agency.id, name: t.name })),
    });

    const rolesByTeam = new Map<string, { id: string; name: string }[]>();
    for (const t of teamCreates) {
      const team = teams.find((x) => x.name === t.name)!;
      const roles = await prisma.role.createManyAndReturn({
        data: t.roles.map((r) => ({ teamId: team.id, name: r })),
      });
      rolesByTeam.set(team.id, roles);
    }

    for (const person of office.people) {
      const team = teams.find((t) => t.name === person.team);
      const roles = team ? rolesByTeam.get(team.id) || [] : [];
      const role = roles.find((r) => r.name === person.role);
      const teamType =
        person.team.toLowerCase().includes("service") || person.team.toLowerCase().includes("cs")
          ? "CS"
          : "SALES";

      const primaryAgencyId =
        createdAgencies.find((a) => a.name === (person.primaryOfficeName || office.name))?.id || agency.id;

      await prisma.person.create({
        data: {
          fullName: person.fullName,
          email: person.email || null,
          teamType,
          active: true,
          teamId: team?.id || null,
          roleId: role?.id || null,
          isAdmin: person.isAdmin,
          isManager: person.isManager,
          primaryAgencyId,
        },
      });
    }

    await prisma.householdFieldDefinition.createMany({
      data: office.householdFields
        .filter((f) => f.active)
        .map((f) => ({
          agencyId: agency.id,
          fieldName: f.fieldName,
          fieldType: "TEXT",
          required: f.required,
          active: true,
          options: f.options
            ? f.options
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean)
            : null,
          charLimit: f.charLimit ?? null,
        })),
    });
  }

  revalidatePath("/agencies");
  revalidatePath("/people");
}

export default function OnboardingPage() {
  async function handleSubmit(formData: FormData) {
    "use server";

    const json = String(formData.get("payload") || "");
    if (!json) return;
    const parsed = JSON.parse(json) as OnboardingPayload;

    const offices = parsed.offices.slice(0, 3).map((o, idx) => ({
      ...o,
      name: o.name || `Office ${idx + 1}`,
    }));

    const payload = {
      ...parsed,
      offices: parsed.sameForAll ? offices.map(() => offices[0]) : offices,
    };

    await createFromPayload(payload);
    // Seed default WTD + activities/teams
    for (const office of payload.offices) {
      const agency = await prisma.agency.findFirst({ where: { name: office.name } });
      if (agency) {
        await ensureDefaultWinTheDayPlans(agency.id);
      }
    }
  }

  return (
    <AppShell title="Set up your offices" subtitle="Quick wizard to add agencies, products, teams, and roster.">
      <OnboardingWizard onSubmit={handleSubmit} />
    </AppShell>
  );
}
