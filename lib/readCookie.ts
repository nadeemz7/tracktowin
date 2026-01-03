import { headers } from "next/headers";

/**
 * Safely read a cookie value inside RSC/Turbopack without depending on
 * the unstable cookies() helper (which has thrown in this project).
 */
export function readCookie(name: string): string | null {
  try {
    const hdr = headers();
    const getter = (hdr as unknown as { get?: (key: string) => string | null }).get;
    const cookieHeader = typeof getter === "function" ? getter.call(hdr, "cookie") ?? "" : "";
    const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`));
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    /* ignore */
  }
  return null;
}
