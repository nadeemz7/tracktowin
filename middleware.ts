import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const LOGIN_PATH = "/login";
const DEFAULT_AUTH_REDIRECT = "/people";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith(LOGIN_PATH)) {
    return NextResponse.next();
  }

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
