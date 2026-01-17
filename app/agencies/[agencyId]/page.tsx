import { AppShell } from "@/app/components/AppShell";
import ConfirmSubmitButton from "@/app/components/ConfirmSubmitButton";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { revalidatePath } from "next/cache";

export default async function AgencyDetailPage({
  params,
}: {
  params: Promise<{ agencyId?: string }>;
}) {
  const resolvedParams = await params;
  const agencyId = resolvedParams?.agencyId;

  if (!agencyId) {
    return (
      <AppShell title="Agency">
        <p>Missing agency id.</p>
        <p>
          <Link href="/agencies">Back to Agencies</Link>
        </p>
      </AppShell>
    );
  }

  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    include: {
      linesOfBusiness: {
        orderBy: { name: "asc" },
        include: { products: { orderBy: { name: "asc" } } },
      },
      premiumBuckets: true,
      valuePolicyDefaults: true,
      householdFieldDefinitions: {
        orderBy: { fieldName: "asc" },
      },
    },
  });

  if (!agency) {
    return (
      <AppShell title="Agency">
        <p>Agency not found.</p>
        <p>
          <Link href="/agencies">Back to Agencies</Link>
        </p>
      </AppShell>
    );
  }

  const teams = await prisma.team.findMany({
    where: { orgId: agency.orgId },
    orderBy: { name: "asc" },
    include: { roles: { orderBy: { name: "asc" } }, people: { orderBy: { fullName: "asc" } } },
  });

  async function updateProfile(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "").trim();
    const profileName = String(formData.get("profileName") || "").trim();
    const ownerName = String(formData.get("ownerName") || "").trim();
    const address = String(formData.get("address") || "").trim();
    const applyAll = formData.get("applyAll") === "on";

    if (!name) return;

    const updates = {
      name,
      profileName: profileName || null,
      ownerName: ownerName || null,
      address: address || null,
    };

    if (applyAll) {
      await prisma.agency.updateMany({ data: updates });
    } else {
      await prisma.agency.update({ where: { id: agencyId }, data: updates });
    }

    revalidatePath(`/agencies/${agencyId}`);
    revalidatePath("/agencies");
  }

  async function addProduct(formData: FormData) {
    "use server";
    const lobId = String(formData.get("lobId") || "");
    const name = String(formData.get("name") || "").trim();
    const productType = String(formData.get("productType") || "");
    if (!lobId || !name || !productType) return;
    await prisma.product.create({
      data: { lineOfBusinessId: lobId, name, productType: productType as "PERSONAL" | "BUSINESS" },
    });
    revalidatePath(`/agencies/${agencyId}`);
  }

  async function deleteProduct(formData: FormData) {
    "use server";
    const productId = String(formData.get("productId") || "");
    if (!productId) return;
    await prisma.product.delete({ where: { id: productId } });
    revalidatePath(`/agencies/${agencyId}`);
  }

  async function addTeam(formData: FormData) {
    "use server";
    const name = String(formData.get("teamName") || "").trim();
    if (!name) return;
    await prisma.team.create({ data: { orgId: agency.orgId, name } });
    revalidatePath(`/agencies/${agencyId}`);
  }

  async function renameTeam(formData: FormData) {
    "use server";
    const teamId = String(formData.get("teamId") || "");
    const name = String(formData.get("name") || "").trim();
    if (!teamId || !name) return;
    await prisma.team.update({ where: { id: teamId }, data: { name } });
    revalidatePath(`/agencies/${agencyId}`);
  }

  async function addRole(formData: FormData) {
    "use server";
    const teamId = String(formData.get("teamId") || "");
    const name = String(formData.get("roleName") || "").trim();
    if (!teamId || !name) return;
    await prisma.role.create({ data: { teamId, name } });
    revalidatePath(`/agencies/${agencyId}`);
  }

  async function deleteRole(formData: FormData) {
    "use server";
    const roleId = String(formData.get("roleId") || "");
    if (!roleId) return;
    await prisma.role.delete({ where: { id: roleId } });
    revalidatePath(`/agencies/${agencyId}`);
  }

  async function deleteTeam(formData: FormData) {
    "use server";
    const teamId = String(formData.get("teamId") || "");
    if (!teamId) return;

    // Detach people first, then remove roles, then the team.
    await prisma.$transaction([
      prisma.person.updateMany({ where: { teamId }, data: { teamId: null, roleId: null } }),
      prisma.role.deleteMany({ where: { teamId } }),
      prisma.team.delete({ where: { id: teamId } }),
    ]);
    revalidatePath(`/agencies/${agencyId}`);
  }

  async function addField(formData: FormData) {
    "use server";
    const fieldName = String(formData.get("fieldName") || "").trim();
    const required = formData.get("required") === "on";
    if (!fieldName) return;
    await prisma.householdFieldDefinition.create({
      data: {
        agencyId,
        fieldName,
        fieldType: "TEXT",
        required,
        active: true,
      },
    });
    revalidatePath(`/agencies/${agencyId}`);
  }

  async function updateField(formData: FormData) {
    "use server";
    const fieldId = String(formData.get("fieldId") || "");
    const required = formData.get("required") === "on";
    const active = formData.get("active") === "on";
    const options = String(formData.get("options") || "").trim();
    const charLimitStr = String(formData.get("charLimit") || "").trim();
    const charLimit = charLimitStr ? Number(charLimitStr) : null;
    if (!fieldId) return;
    await prisma.householdFieldDefinition.update({
      where: { id: fieldId },
      data: {
        required,
        active,
        options: options
          ? options
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          : null,
        charLimit,
      },
    });
    revalidatePath(`/agencies/${agencyId}`);
  }

  const headerSubtitle = [agency.profileName || "Office profile", agency.ownerName ? `Owner: ${agency.ownerName}` : null]
    .filter(Boolean)
    .join(" • ");

  return (
    <AppShell>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 16 }}>
        <form action={updateProfile} id="profile-form" style={{ display: "grid", gap: 16 }}>
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              position: "sticky",
              top: 0,
              zIndex: 50,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Link
                href="/agencies"
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#111827",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Back to Agencies
              </Link>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>Editing: {agency.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{headerSubtitle}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Saves Office Profile only.</div>
              </div>
            </div>
            <button
              id="profile-save-button"
              type="submit"
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                border: "1px solid #283618",
                background: "#283618",
                color: "#f8f9fa",
                fontWeight: 800,
                cursor: "pointer",
                pointerEvents: "auto",
              }}
            >
              Save profile
            </button>
          </div>

          <section
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16 }}>Office Profile</div>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              <label>
                Office name
                <br />
                <input name="name" defaultValue={agency.name} style={{ padding: 10, width: "100%" }} />
              </label>
              <label>
                Profile name
                <br />
                <input name="profileName" defaultValue={agency.profileName || ""} style={{ padding: 10, width: "100%" }} />
              </label>
              <label>
                Owner / Agent
                <br />
                <input name="ownerName" defaultValue={agency.ownerName || ""} style={{ padding: 10, width: "100%" }} />
              </label>
              <label>
                Address
                <br />
                <input name="address" defaultValue={agency.address || ""} style={{ padding: 10, width: "100%" }} />
              </label>
            </div>
            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
                display: "grid",
                gap: 6,
              }}
            >
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                <input type="checkbox" name="applyAll" />
                Apply to all offices
              </label>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                Applies these profile updates to every office in this agency group.
              </div>
            </div>
          </section>
        </form>

        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16 }}>Lines of Business</div>
          <div style={{ display: "grid", gap: 12 }}>
            {agency.linesOfBusiness.map((lob) => (
              <section
                key={lob.id}
                style={{
                  padding: 14,
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  background: "#f8fafc",
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {lob.name}{" "}
                  <span style={{ fontWeight: 400, color: "#555" }}>
                    — {lob.premiumCategory}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  {lob.products.length === 0 ? (
                    <div style={{ color: "#555" }}>No products yet</div>
                  ) : (
                    lob.products.map((p) => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid #e9e9e9", borderRadius: 8, padding: 8, background: "#fff" }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{p.name}</div>
                          <div style={{ color: "#555", fontSize: 13 }}>{p.productType}</div>
                        </div>
                        <form action={deleteProduct}>
                          <input type="hidden" name="productId" value={p.id} />
                          <ConfirmSubmitButton
                            confirmText={`Delete product "${p.name}"? This cannot be undone.`}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1px solid #fecaca",
                              background: "#fff",
                              color: "#b91c1c",
                              fontWeight: 700,
                            }}
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    ))
                  )}
                </div>

                <form action={addProduct} style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr auto" }}>
                  <input type="hidden" name="lobId" value={lob.id} />
                  <input name="name" placeholder="Add product" style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <select name="productType" defaultValue="PERSONAL" style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <option value="PERSONAL">Personal</option>
                    <option value="BUSINESS">Business</option>
                  </select>
                  <button type="submit" style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
                    Add
                  </button>
                </form>
              </section>
            ))}
          </div>
        </section>

        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16 }}>Household Fields</div>
          <div style={{ display: "grid", gap: 10 }}>
            {agency.householdFieldDefinitions.map((f) => (
              <details
                key={f.id}
                style={{ border: "1px solid #e3e6eb", borderRadius: 10, padding: 12, background: "#fff" }}
              >
                <summary style={{ display: "flex", gap: 10, alignItems: "center", cursor: "pointer" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{f.fieldName}</div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>Click to edit dropdown options, character limits, and flags.</div>
                  </div>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" name="active" defaultChecked={f.active} form={`field-${f.id}`} />
                    Active
                  </label>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" name="required" defaultChecked={f.required} form={`field-${f.id}`} />
                    Required
                  </label>
                </summary>
                <form
                  id={`field-${f.id}`}
                  action={updateField}
                  style={{ marginTop: 10, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
                >
                  <input type="hidden" name="fieldId" value={f.id} />
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>Options (comma-separated)</span>
                    <input
                      name="options"
                      defaultValue={Array.isArray(f.options) ? f.options.join(", ") : ""}
                      placeholder="ILP, Referral, Outbound"
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Leave blank for free-text. If filled, becomes a dropdown.</span>
                  </label>
                  <label style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>Character limit (optional)</span>
                    <input
                      name="charLimit"
                      type="number"
                      defaultValue={f.charLimit ?? ""}
                      placeholder="e.g., 50"
                      style={{ padding: 8, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Set a max length for names/links if needed.</span>
                  </label>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <button
                      type="submit"
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid #283618",
                        background: "#283618",
                        color: "#f8f9fa",
                        fontWeight: 700,
                      }}
                    >
                      Save field
                    </button>
                  </div>
                </form>
              </details>
            ))}
          </div>
          <form action={addField} style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr auto auto", maxWidth: 620 }}>
            <input name="fieldName" placeholder="Add household field" style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name="required" />
              Required
            </label>
            <button type="submit" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
              Add Field
            </button>
          </form>
        </section>
        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16 }}>Premium Buckets</div>
          {agency.premiumBuckets.length === 0 ? (
            <p style={{ color: "#555", margin: 0 }}>No premium buckets defined.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
              {agency.premiumBuckets.map((b) => (
                <li key={b.id}>
                  <strong>{b.name}</strong>
                  {b.description ? <> — {b.description}</> : null}
                  <div style={{ color: "#555", fontSize: 13 }}>
                    LoBs: {b.includesLobs.length ? b.includesLobs.join(", ") : "—"} • Products:{" "}
                    {b.includesProducts.length ? b.includesProducts.join(", ") : "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16 }}>Teams & Roles</div>
          <div style={{ display: "grid", gap: 12 }}>
            {teams.map((team) => (
              <div key={team.id} style={{ border: "1px solid #e3e6eb", borderRadius: 10, padding: 12, background: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>Team</span>
                  <form action={deleteTeam} style={{ margin: 0 }}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <ConfirmSubmitButton
                      confirmText={`Delete team "${team.name}"? This cannot be undone.`}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: "1px solid #fecaca",
                        background: "#fff",
                        color: "#b91c1c",
                        fontWeight: 700,
                      }}
                    >
                      Delete Team
                    </ConfirmSubmitButton>
                  </form>
                </div>
                <form action={renameTeam} style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr auto" }}>
                  <input type="hidden" name="teamId" value={team.id} />
                  <input name="name" defaultValue={team.name} style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <button type="submit" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
                    Save
                  </button>
                </form>
                <div style={{ marginTop: 12, fontSize: 12, fontWeight: 700, color: "#6b7280" }}>Roles for this team</div>
                <div style={{ marginTop: 4, display: "grid", gap: 6 }}>
                  {team.roles.map((r) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8, background: "#fff" }}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <form action={deleteRole}>
                        <input type="hidden" name="roleId" value={r.id} />
                        <ConfirmSubmitButton
                          confirmText={`Delete role "${r.name}"? This cannot be undone.`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #fecaca",
                            background: "#fff",
                            color: "#b91c1c",
                            fontWeight: 700,
                          }}
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  ))}
                </div>
                <form action={addRole} style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "2fr auto" }}>
                  <input type="hidden" name="teamId" value={team.id} />
                  <input name="roleName" placeholder="Add role" style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <button type="submit" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
                    Add Role
                  </button>
                </form>
              </div>
            ))}
          </div>
          <form action={addTeam} style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr auto", maxWidth: 520 }}>
            <input name="teamName" placeholder="Add team" style={{ padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <button type="submit" style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #283618", background: "#283618", color: "#f8f9fa", fontWeight: 700 }}>
              Add Team
            </button>
          </form>
        </section>

      </div>
    </AppShell>
  );
}
