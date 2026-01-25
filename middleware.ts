import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const LOGIN_PATH = "/login";
const ONBOARDING_PATH = "/onboarding";
const LOGOUT_PATH = "/logout";
const DEFAULT_AUTH_REDIRECT = "/people";
const PUBLIC_PATHS = ["/favicon.ico", "/robots.txt", "/sitemap.xml"];
const PUBLIC_PREFIXES = ["/api", "/_next", "/static", "/images", LOGIN_PATH, ONBOARDING_PATH, LOGOUT_PATH];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("token")?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!pathname.startsWith(ONBOARDING_PATH)) {
    try {
      const res = await fetch(new URL("/api/onboarding/status", req.url), {
        headers: { cookie: req.headers.get("cookie") ?? "" },
      });
      if (res.ok) {
        const data = (await res.json()) as { needsOnboarding?: boolean };
        if (data.needsOnboarding) {
          const url = req.nextUrl.clone();
          url.pathname = ONBOARDING_PATH;
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
    } catch {
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
