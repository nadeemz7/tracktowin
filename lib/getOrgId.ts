import { getViewerContext } from "@/lib/getViewerContext";

export async function getOrgId(): Promise<string | undefined> {
  const ctx = await getViewerContext();
  return ctx?.orgId;
}
