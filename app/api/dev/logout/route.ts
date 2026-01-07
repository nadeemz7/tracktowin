import { NextResponse } from "next/server";

const COOKIE_OPTIONS = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: false, maxAge: 0 };
const COOKIE_NAMES = ["personId", "userId", "viewerPersonId", "ttw_personId", "impersonatePersonId"];

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true, note: "dev logout cleared" });
  COOKIE_NAMES.forEach((name) => {
    res.cookies.set(name, "", COOKIE_OPTIONS);
  });
  return res;
}
