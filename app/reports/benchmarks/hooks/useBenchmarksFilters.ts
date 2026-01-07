"use client";

import { useEffect, useRef, useState } from "react";
import { toISODate } from "../lib/benchmarksMath";
import { ALL_STATUSES, DEFAULT_STATUSES } from "../lib/benchmarksConstants";

export { ALL_STATUSES, DEFAULT_STATUSES };

const STORAGE_KEY = "ttw:benchmarks:filters:v1";

type BenchmarksFiltersPersisted = {
  startISO: string;
  endISO: string;
  statuses: string[];
  updatedAt: string;
};

type BenchmarksFiltersState = {
  start: Date;
  end: Date;
  statuses: string[];
};

function parseISODate(value?: string | null) {
  if (!value || value.length !== 10) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function sanitizeStatuses(input?: string[] | null) {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  input.forEach((status) => {
    const trimmed = status.trim();
    if (!trimmed) return;
    if (!ALL_STATUSES.includes(trimmed as any)) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    next.push(trimmed);
  });
  return next;
}

function readPersisted() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BenchmarksFiltersPersisted;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function getDefaults(): BenchmarksFiltersState {
  const today = new Date();
  return {
    start: new Date(today.getFullYear(), today.getMonth(), 1),
    end: today,
    statuses: [...DEFAULT_STATUSES],
  };
}

function getInitialState(defaults: BenchmarksFiltersState): BenchmarksFiltersState {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const rawStart = params ? params.get("start") : null;
  const rawEnd = params ? params.get("end") : null;
  const rawStatuses = params ? params.get("statuses") : null;
  const hasUrl = Boolean(rawStart || rawEnd || rawStatuses);

  let start = defaults.start;
  let end = defaults.end;
  let statuses = defaults.statuses;

  if (hasUrl) {
    const urlStart = parseISODate(rawStart);
    const urlEnd = parseISODate(rawEnd);
    const urlStatuses = rawStatuses ? sanitizeStatuses(rawStatuses.split(",")) : [];
    start = urlStart || defaults.start;
    end = urlEnd || defaults.end;
    statuses = urlStatuses.length ? urlStatuses : defaults.statuses;
  } else {
    const persisted = readPersisted();
    const persistedStart = persisted ? parseISODate(persisted.startISO) : null;
    const persistedEnd = persisted ? parseISODate(persisted.endISO) : null;
    const persistedStatuses = persisted ? sanitizeStatuses(persisted.statuses) : [];
    start = persistedStart || defaults.start;
    end = persistedEnd || defaults.end;
    statuses = persistedStatuses.length ? persistedStatuses : defaults.statuses;
  }

  if (end.getTime() < start.getTime()) {
    end = start;
  }

  return { start, end, statuses };
}

function isSameArray(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function useBenchmarksFilters() {
  const defaultsRef = useRef<BenchmarksFiltersState | null>(null);
  if (!defaultsRef.current) {
    defaultsRef.current = getDefaults();
  }

  const initialRef = useRef<BenchmarksFiltersState | null>(null);
  if (!initialRef.current) {
    initialRef.current = getInitialState(defaultsRef.current);
  }

  const [start, setStartState] = useState<Date>(initialRef.current.start);
  const [end, setEndState] = useState<Date>(initialRef.current.end);
  const [statuses, setStatusesState] = useState<string[]>(initialRef.current.statuses);
  const didInitRef = useRef(false);

  useEffect(() => {
    didInitRef.current = true;
  }, []);

  useEffect(() => {
    if (!didInitRef.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("start", toISODate(start));
    params.set("end", toISODate(end));
    params.set("statuses", statuses.join(","));
    window.history.replaceState({}, "", `?${params.toString()}`);
  }, [start, end, statuses]);

  useEffect(() => {
    if (!didInitRef.current || typeof window === "undefined") return;
    const payload: BenchmarksFiltersPersisted = {
      startISO: toISODate(start),
      endISO: toISODate(end),
      statuses,
      updatedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures (e.g., private mode).
    }
  }, [start, end, statuses]);

  const setStart = (date: Date) => {
    setStartState((prev) => (prev.getTime() === date.getTime() ? prev : date));
  };

  const setEnd = (date: Date) => {
    setEndState((prev) => (prev.getTime() === date.getTime() ? prev : date));
  };

  const setStatuses = (nextStatuses: string[]) => {
    const sanitized = sanitizeStatuses(nextStatuses);
    if (!sanitized.length) return;
    setStatusesState((prev) => (isSameArray(prev, sanitized) ? prev : sanitized));
  };

  const setRange = (range: { start: Date; end: Date }) => {
    setStart(range.start);
    setEnd(range.end);
  };

  const resetToDefaults = () => {
    const defaults = defaultsRef.current!;
    setRange({ start: defaults.start, end: defaults.end });
    setStatuses(defaults.statuses);
  };

  return {
    start,
    end,
    statuses,
    setStart,
    setEnd,
    setStatuses,
    setRange,
    resetToDefaults,
    allStatuses: ALL_STATUSES,
  };
}
