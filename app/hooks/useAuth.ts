"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        });
        if (!active) return;
        if (res.ok) {
          setAuthenticated(true);
        } else {
          router.push("/login");
        }
      } catch {
        if (active) {
          router.push("/login");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  return { loading, authenticated };
}
