import { AppShell } from "@/app/components/AppShell";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { OnboardingPayload, PremiumCategory } from "./config";
import { ensureDefaultWinTheDayPlans } from "@/lib/wtdDefaults";
import OnboardingWizard from "./OnboardingWizard";

async function createFromPayload(payload: OnboardingPayload) {
  const createdAgencies: { name: string; id: string; orgId: string }[] = [];
  const ownerName = payload.ownerName?.trim() || "";
  if (!ownerName) {
    throw new Error("Owner name is required.");
  }
  const ownerNameNormalized = ownerName.toLowerCase();
  const viewer: any = await getOrgViewer();
  let orgId = viewer?.orgId ?? null;
  if (!orgId) {
    const existingOrg = await prisma.org.findFirst({ orderBy: { createdAt: "asc" } });
    if (existingOrg) {
      orgId = existingOrg.id;
    } else {
      const createdOrg = await prisma.org.create({ data: { name: "TrackToWin Dev Org" } });
      orgId = createdOrg.id;
    }
  }

  // First create all agencies (LoBs/products/buckets) so we have ids for cross-office references
  for (const office of payload.offices) {
    const existingAgency = await prisma.agency.findFirst({
      where: { orgId, name: office.name },
    });
    if (existingAgency) {
      createdAgencies.push({ name: office.name, id: existingAgency.id, orgId: existingAgency.orgId });
      for (const lob of office.lobs.filter((l) => l.active)) {
        let lobRecord = await prisma.lineOfBusiness.findFirst({
          where: { agencyId: existingAgency.id, name: lob.name },
        });
        if (!lobRecord) {
          lobRecord = await prisma.lineOfBusiness.create({
            data: { agencyId: existingAgency.id, name: lob.name, premiumCategory: lob.premiumCategory as PremiumCategory },
          });
        } else {
          lobRecord = await prisma.lineOfBusiness.update({
            where: { id: lobRecord.id },
            data: { premiumCategory: lob.premiumCategory as PremiumCategory },
          });
        }

        for (const product of lob.products) {
          const existingProduct = await prisma.product.findFirst({
            where: { lineOfBusinessId: lobRecord.id, name: product.name },
          });
          if (!existingProduct) {
            await prisma.product.create({
              data: {
                lineOfBusinessId: lobRecord.id,
                name: product.name,
                productType: product.productType,
              },
            });
          } else {
            await prisma.product.update({
              where: { id: existingProduct.id },
              data: { productType: product.productType },
            });
          }
        }
      }

      for (const bucket of office.premiumBuckets) {
        const existingBucket = await prisma.premiumBucket.findFirst({
          where: { agencyId: existingAgency.id, name: bucket.name },
        });
        const bucketData = {
          agencyId: existingAgency.id,
          name: bucket.name,
          description: bucket.description || null,
          includesLobs: bucket.includesLobs,
          includesProducts: bucket.includesProducts,
        };
        if (!existingBucket) {
          await prisma.premiumBucket.create({ data: bucketData });
        } else {
          await prisma.premiumBucket.update({
            where: { id: existingBucket.id },
            data: bucketData,
          });
        }
      }
      continue;
    }
    const agency = await prisma.agency.create({
      data: {
        orgId,
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
    createdAgencies.push({ name: office.name, id: agency.id, orgId: agency.orgId });
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

    const teams: Array<{ id: string; name: string }> = [];
    for (const t of teamCreates) {
      let team = await prisma.team.findFirst({ where: { orgId: agency.orgId, name: t.name } });
      if (!team) {
        team = await prisma.team.create({ data: { orgId: agency.orgId, name: t.name } });
      }
      teams.push(team);
    }

    const rolesByTeam = new Map<string, { id: string; name: string }[]>();
    for (const t of teamCreates) {
      const team = teams.find((x) => x.name === t.name)!;
      const roles: { id: string; name: string }[] = [];
      for (const roleName of t.roles) {
        let role = await prisma.role.findFirst({ where: { teamId: team.id, name: roleName } });
        if (!role) {
          role = await prisma.role.create({ data: { teamId: team.id, name: roleName } });
        }
        roles.push({ id: role.id, name: role.name });
      }
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
      const email = person.email?.trim() || "";
      const existingPerson = email
        ? await prisma.person.findFirst({ where: { orgId, email } })
        : await prisma.person.findFirst({ where: { orgId, fullName: person.fullName } });

      const personData = {
        fullName: person.fullName,
        email: email || null,
        teamType,
        active: true,
        teamId: team?.id || null,
        roleId: role?.id || null,
        orgId,
        isAdmin: isOwnerMatch ? true : person.isAdmin,
        isManager: isOwnerMatch ? true : person.isManager,
        primaryAgencyId,
      };

      if (existingPerson) {
        await prisma.person.update({
          where: { id: existingPerson.id },
          data: personData,
        });
      } else {
        await prisma.person.create({
          data: personData,
        });
      }
    }

    for (const f of office.householdFields.filter((f) => f.active)) {
      const options = f.options
        ? f.options
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : null;
      const charLimit = f.charLimit ?? null;
      const existingField = await prisma.householdFieldDefinition.findFirst({
        where: { agencyId: agency.id, fieldName: f.fieldName },
      });
      const fieldData = {
        agencyId: agency.id,
        fieldName: f.fieldName,
        fieldType: "TEXT",
        required: f.required,
        active: true,
        options,
        charLimit,
      };
      if (existingField) {
        await prisma.householdFieldDefinition.update({
          where: { id: existingField.id },
          data: fieldData,
        });
      } else {
        await prisma.householdFieldDefinition.create({
          data: fieldData,
        });
      }
    }
  }

  if (!ownerCreated) {
    const existingOwner = await prisma.person.findFirst({ where: { orgId, fullName: ownerName } });
    const ownerData = {
      fullName: ownerName,
      email: null,
      teamType: "SALES",
      active: true,
      teamId: null,
      roleId: null,
      orgId,
      isAdmin: true,
      isManager: true,
      primaryAgencyId: ownerPrimaryAgencyId,
    };
    if (existingOwner) {
      await prisma.person.update({
        where: { id: existingOwner.id },
        data: ownerData,
      });
    } else {
      await prisma.person.create({
        data: ownerData,
      });
    }
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
    const viewer: any = await getOrgViewer();
    let orgId = viewer?.orgId ?? null;
    if (!orgId) {
      const existingOrg = await prisma.org.findFirst({ orderBy: { createdAt: "asc" } });
      orgId = existingOrg?.id ?? null;
    }
    // Seed default WTD + activities/teams
    for (const office of payload.offices) {
      const agency = await prisma.agency.findFirst({ where: { name: office.name, orgId } });
      if (agency) {
        await ensureDefaultWinTheDayPlans(agency.id, agency.orgId);
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
