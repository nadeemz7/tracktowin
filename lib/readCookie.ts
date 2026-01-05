import { cookies } from "next/headers";

/**
 * Read a cookie value using Next.js cookies() API.
 */
export async function readCookie(name: string): Promise<string | null> {
  const store = await cookies();
  return store.get(name)?.value ?? null;
}
