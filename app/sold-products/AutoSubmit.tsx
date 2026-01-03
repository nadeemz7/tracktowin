"use client";

import { useEffect, useRef } from "react";

type Props = {
  formId: string;
  debounceMs?: number;
  persistOpenIds?: string[];
};

const STORAGE_KEY = "soldFiltersOpen";
const SCROLL_KEY = "soldFiltersScroll";

export function AutoSubmit({ formId, debounceMs = 250, persistOpenIds = [] }: Props) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    // Re-open any saved panels after navigation
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved) {
      try {
        const ids = JSON.parse(saved) as string[];
        ids.forEach((id) => {
          const el = document.getElementById(id) as HTMLDetailsElement | null;
          if (el) el.open = true;
        });
      } catch {
        // ignore
      } finally {
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    const handler = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (persistOpenIds.length) {
          const openIds = persistOpenIds.filter((id) => {
            const el = document.getElementById(id) as HTMLDetailsElement | null;
            return el?.open;
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(openIds));
        }
        if (typeof window !== "undefined") {
          sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
        }
        if (form) form.requestSubmit();
      }, debounceMs);
    };

    const inputs = Array.from(form.querySelectorAll("input, select"));
    inputs.forEach((el) => el.addEventListener("change", handler));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      inputs.forEach((el) => el.removeEventListener("change", handler));
    };
  }, [formId, debounceMs, persistOpenIds]);

  useEffect(() => {
    const savedScroll = typeof window !== "undefined" ? sessionStorage.getItem(SCROLL_KEY) : null;
    if (savedScroll) {
      const y = Number(savedScroll);
      if (!Number.isNaN(y)) window.scrollTo({ top: y });
      sessionStorage.removeItem(SCROLL_KEY);
    }
  }, []);

  return null;
}
