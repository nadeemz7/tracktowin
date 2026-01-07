"use client";

import { useCallback, useEffect, useState } from "react";

export type OrgLob = { id: string; name: string; premiumCategory: string };

export function useOrgLobs() {
  const [lobs, setLobs] = useState<OrgLob[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/org/lobs");
      if (!res.ok) throw new Error("Failed to load LoBs");
      const json = await res.json();
      const list = (json.lobs || []) as OrgLob[];
      list.sort((a, b) => a.name.localeCompare(b.name));
      setLobs(list);
    } catch (err: any) {
      setError(err?.message || "Failed to load LoBs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { lobs, loading, error, refresh: load };
}
