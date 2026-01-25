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
  const viewer: any = await getOrgViewer();
  const viewerUserId = viewer?.userId ?? null;
  const viewerPersonId = viewer?.personId ?? null;
  let orgId = viewer?.orgId ?? null;
  if (!orgId) {
    throw new Error("Unauthorized: orgId not resolved for viewer.");
  }

  // First create all agencies (buckets) so we have ids for cross-office references
  for (const office of payload.offices) {
    const existingAgency = await prisma.agency.findFirst({
      where: { orgId, name: office.name },
    });
    let agency = existingAgency;
    if (!agency) {
      const officeAddress = (office as { address?: string }).address;
      agency = await prisma.agency.create({
        data: {
          orgId,
          name: office.name,
          profileName: payload.profileName || null,
          ownerName,
          address: officeAddress ?? payload.address ?? null,
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
    }
    createdAgencies.push({ name: office.name, id: agency.id, orgId: agency.orgId });

    for (const bucket of office.premiumBuckets) {
      const existingBucket = await prisma.premiumBucket.findFirst({
        where: { agencyId: agency.id, name: bucket.name },
      });
      const bucketData = {
        agencyId: agency.id,
        name: bucket.name,
        description: bucket.description || null,
        includesLobs: bucket.includesLobs,
        includesProducts: bucket.includesProducts,
      };
      const bucketUpdateData = {
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
          data: bucketUpdateData,
        });
      }
    }
  }

  type LobProductType = OnboardingPayload["offices"][number]["lobs"][number]["products"][number]["productType"];
  const lobSources = payload.sameForAll
    ? payload.offices[0]?.lobs ?? []
    : payload.offices.flatMap((office) => office.lobs);
  const lobMap = new Map<
    string,
    { name: string; premiumCategory: PremiumCategory; products: Map<string, LobProductType> }
  >();

  for (const lob of lobSources) {
    if (!lob.active) continue;
    let entry = lobMap.get(lob.name);
    if (!entry) {
      entry = {
        name: lob.name,
        premiumCategory: lob.premiumCategory as PremiumCategory,
        products: new Map<string, LobProductType>(),
      };
      lobMap.set(lob.name, entry);
    } else {
      entry.premiumCategory = lob.premiumCategory as PremiumCategory;
    }

    for (const product of lob.products) {
      entry.products.set(product.name, product.productType);
    }
  }

  for (const lobEntry of lobMap.values()) {
    const lobRecord = await prisma.lineOfBusiness.upsert({
      where: { orgId_name: { orgId, name: lobEntry.name } },
      update: { premiumCategory: lobEntry.premiumCategory },
      create: { orgId, name: lobEntry.name, premiumCategory: lobEntry.premiumCategory },
    });

    for (const [productName, productType] of lobEntry.products) {
      await prisma.product.upsert({
        where: { lineOfBusinessId_name: { lineOfBusinessId: lobRecord.id, name: productName } },
        update: { productType },
        create: { orgId, lineOfBusinessId: lobRecord.id, name: productName, productType },
      });
    }
  }

  const ownerPrimaryAgencyId = createdAgencies[0]?.id ?? null;
  let ownerPersonId: string | null = viewerPersonId;
  const ownerUpdateData = {
    fullName: ownerName,
    isAdmin: true,
    isManager: true,
    ...(ownerPrimaryAgencyId ? { primaryAgencyId: ownerPrimaryAgencyId } : {}),
  };

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
      const primaryAgencyId = defaultPrimaryAgencyId;
      const email = person.email?.trim() || "";
      const existingPerson = email
        ? await prisma.person.findFirst({ where: { orgId, email: { equals: email, mode: "insensitive" } } })
        : await prisma.person.findFirst({ where: { orgId, fullName: person.fullName } });

      const personData = {
        fullName: person.fullName,
        email: email || null,
        teamType,
        active: true,
        teamId: team?.id || null,
        roleId: role?.id || null,
        orgId,
        isAdmin: person.isAdmin,
        isManager: person.isManager,
        primaryAgencyId,
      };

      if (existingPerson) {
        const updatedPerson = await prisma.person.update({
          where: { id: existingPerson.id },
          data: personData,
        });
      } else {
        const createdPerson = await prisma.person.create({
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

  if (viewerPersonId) {
    await prisma.person.update({
      where: { id: viewerPersonId },
      data: ownerUpdateData,
    });
    ownerPersonId = viewerPersonId;
  } else {
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
      const updatedOwner = await prisma.person.update({
        where: { id: existingOwner.id },
        data: ownerData,
      });
      ownerPersonId = updatedOwner.id;
    } else {
      const createdOwner = await prisma.person.create({
        data: ownerData,
      });
      ownerPersonId = createdOwner.id;
    }
  }

  if (!ownerPersonId) {
    const ownerPerson = await prisma.person.findFirst({
      where: { orgId, fullName: { equals: ownerName, mode: "insensitive" } },
    });
    ownerPersonId = ownerPerson?.id ?? null;
  }

  const userId = viewerUserId;
  if (userId && ownerPersonId) {
    await prisma.user.update({
      where: { id: userId },
      data: { personId: ownerPersonId },
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

    const payloadOffices =
      parsed.sameForAll && offices.length
        ? offices.map((office, index) =>
            index === 0
              ? office
              : {
                  ...office,
                  lobs: offices[0].lobs,
                  premiumBuckets: offices[0].premiumBuckets,
                  teams: offices[0].teams,
                  people: offices[0].people,
                  householdFields: offices[0].householdFields,
                }
          )
        : offices;

    const payload = {
      ...parsed,
      offices: payloadOffices,
    };

    await createFromPayload(payload);
    const viewer: any = await getOrgViewer();
    let orgId = viewer?.orgId ?? null;
    if (!orgId) {
      throw new Error("Unauthorized: orgId not resolved for viewer.");
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
