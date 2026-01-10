import { AppShell } from "@/app/components/AppShell";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { OnboardingPayload, PremiumCategory } from "./config";
import { ensureDefaultWinTheDayPlans } from "@/lib/wtdDefaults";
import OnboardingWizard from "./OnboardingWizard";

async function createFromPayload(payload: OnboardingPayload) {
  const createdAgencies: { name: string; id: string }[] = [];
  const ownerName = payload.ownerName?.trim() || "";
  if (!ownerName) {
    throw new Error("Owner name is required.");
  }
  const ownerNameNormalized = ownerName.toLowerCase();

  // First create all agencies (LoBs/products/buckets) so we have ids for cross-office references
  for (const office of payload.offices) {
    const agency = await prisma.agency.create({
      data: {
        name: office.name,
        profileName: payload.profileName || null,
        ownerName,
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

  const ownerPrimaryAgencyId = createdAgencies[0]?.id ?? null;
  let ownerCreated = false;

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

      const defaultPrimaryAgencyId =
        createdAgencies.find((a) => a.name === (person.primaryOfficeName || office.name))?.id || agency.id;
      const isOwnerMatch = person.fullName.trim().toLowerCase() === ownerNameNormalized;
      if (isOwnerMatch) {
        ownerCreated = true;
      }
      const primaryAgencyId = isOwnerMatch ? ownerPrimaryAgencyId : defaultPrimaryAgencyId;

      await prisma.person.create({
        data: {
          fullName: person.fullName,
          email: person.email || null,
          teamType,
          active: true,
          teamId: team?.id || null,
          roleId: role?.id || null,
          isAdmin: isOwnerMatch ? true : person.isAdmin,
          isManager: isOwnerMatch ? true : person.isManager,
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

  if (!ownerCreated) {
    await prisma.person.create({
      data: {
        fullName: ownerName,
        email: null,
        teamType: "SALES",
        active: true,
        teamId: null,
        roleId: null,
        isAdmin: true,
        isManager: true,
        primaryAgencyId: ownerPrimaryAgencyId,
      },
    });
  }

  revalidatePath("/agencies");
  revalidatePath("/people");
}

export default function OnboardingPage({ searchParams }: { searchParams?: { success?: string } }) {
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

  const showSuccess = searchParams?.success === "1" || searchParams?.success === "true";

  return (
    <AppShell title="Set up your offices" subtitle="Quick wizard to add agencies, products, teams, and roster.">
      {showSuccess ? (
        <div
          style={{
            padding: 24,
            borderRadius: 16,
            border: "1px solid #bbf7d0",
            background: "#ecfdf5",
            display: "grid",
            gap: 12,
            maxWidth: 720,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, color: "#065f46" }}>Onboarding complete</div>
          <div style={{ color: "#065f46" }}>
            Your agency setup is ready. Choose where you want to go next.
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link
              href="/agencies"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: "#16a34a",
                color: "#ffffff",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Go to agencies
            </Link>
            <Link
              href="/people?tab=people"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #16a34a",
                color: "#065f46",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Go to people
            </Link>
            <Link
              href="/onboarding"
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #16a34a",
                color: "#065f46",
                textDecoration: "none",
                fontWeight: 700,
              }}
            >
              Run onboarding again
            </Link>
          </div>
        </div>
      ) : (
        <OnboardingWizard onSubmit={handleSubmit} />
      )}
    </AppShell>
  );
}
