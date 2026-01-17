import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DEV_LOGIN_EMAIL = "dev@tracktowin.local";
const DEV_LOGIN_NAME = "Dev Admin";

export default async function LoginPage({ searchParams }: { searchParams?: SearchParams }) {
  const sp = (await searchParams) || {};
  const devErrorParam = Array.isArray(sp.devError) ? sp.devError[0] : sp.devError;
  const devError = typeof devErrorParam === "string" ? devErrorParam : "";
  const devLoginEnabled = process.env.NODE_ENV === "development" || Boolean(process.env.TTW_DEV_PASSWORD);
  const devErrorMessage =
    devError === "invalid"
      ? "Invalid password."
      : devError === "missing"
        ? "TTW_DEV_PASSWORD is not configured."
        : devError === "disabled"
          ? "Dev login is disabled."
          : "";

  async function devAdminLogin(formData: FormData) {
    "use server";

    const devLoginEnabled = process.env.NODE_ENV === "development" || Boolean(process.env.TTW_DEV_PASSWORD);
    if (!devLoginEnabled) redirect("/login?devError=disabled");

    const expectedPassword = process.env.TTW_DEV_PASSWORD || "";
    if (!expectedPassword) redirect("/login?devError=missing");

    const password = String(formData.get("password") || "");
    if (password !== expectedPassword) redirect("/login?devError=invalid");

    let org = await prisma.org.findFirst({ orderBy: { createdAt: "asc" } });
    if (!org) {
      org = await prisma.org.create({ data: { name: "TrackToWin Dev Org" } });
    }

    const existingPerson = await prisma.person.findFirst({
      where: { email: DEV_LOGIN_EMAIL, orgId: org.id },
    });

    const person = existingPerson
      ? await prisma.person.update({
          where: { id: existingPerson.id },
          data: {
            fullName: DEV_LOGIN_NAME,
            email: DEV_LOGIN_EMAIL,
            teamType: "SALES",
            isAdmin: true,
            isManager: true,
            active: true,
          },
        })
      : await prisma.person.create({
          data: {
            fullName: DEV_LOGIN_NAME,
            email: DEV_LOGIN_EMAIL,
            teamType: "SALES",
            isAdmin: true,
            isManager: true,
            active: true,
            orgId: org.id,
          },
        });

    const store = cookies();
    const cookieOptions = {
      path: "/",
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
    };
    store.set("x-impersonate-person-id", person.id, cookieOptions);

    redirect("/people");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 520, display: "grid", gap: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 24, color: "#283618" }}>TrackToWin</div>
        {devLoginEnabled ? (
          <div className="surface" style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 800 }}>Dev Admin Login</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Enter the dev password to access the shared admin account.
            </div>
            {devErrorMessage ? (
              <div style={{ fontSize: 12, color: "#b91c1c" }}>{devErrorMessage}</div>
            ) : null}
            <form action={devAdminLogin} style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#475569" }}>
                Password
                <input
                  type="password"
                  name="password"
                  required
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
                />
              </label>
              <button
                type="submit"
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                Dev Admin Login
              </button>
            </form>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#6b7280" }}>Login is not available in this environment.</div>
        )}
      </div>
    </div>
  );
}
