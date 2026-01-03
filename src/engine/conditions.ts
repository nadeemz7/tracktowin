/* eslint-disable @typescript-eslint/no-explicit-any */
// src/engine/conditions.ts
import { Condition } from "./types";

export type EvalContext = {
  txn?: any;
  participant?: any;
  metrics?: any;
};

/**
 * Safely resolve a value by dotted path, e.g.:
 * - "txn.line"
 * - "txn.fields.leadSource"
 * - "participant.role"
 * - "participant.fields.team"
 * - "metrics.nbPolicyCount"
 */
export function getByPath(ctx: EvalContext, path: string): any {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return undefined;

  const root = parts[0];
  let current: any;

  if (root === "txn") current = ctx.txn;
  else if (root === "participant") current = ctx.participant;
  else if (root === "metrics") current = ctx.metrics;
  else return undefined;

  for (let i = 1; i < parts.length; i++) {
    if (current == null) return undefined;
    const key = parts[i];
    current = current[key];
  }
  return current;
}

function asNumber(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asString(v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  try {
    return String(v);
  } catch {
    return null;
  }
}

function isDefined(v: any): boolean {
  return v !== undefined && v !== null;
}

export function evalCondition(cond: Condition, ctx: EvalContext): boolean {
  switch (cond.op) {
    case "and":
      return cond.conditions.every((c) => evalCondition(c, ctx));
    case "or":
      return cond.conditions.some((c) => evalCondition(c, ctx));

    case "exists": {
      const v = getByPath(ctx, cond.field);
      return cond.value ? isDefined(v) : !isDefined(v);
    }

    case "betweenDates": {
      const v = getByPath(ctx, cond.field);
      if (!v) return false;
      const t = new Date(v).getTime();
      const s = new Date(cond.startISO).getTime();
      const e = new Date(cond.endISO).getTime();
      if (!Number.isFinite(t) || !Number.isFinite(s) || !Number.isFinite(e)) return false;
      return t >= s && t <= e;
    }

    case "eq": {
      const v = getByPath(ctx, cond.field);
      return v === cond.value;
    }
    case "neq": {
      const v = getByPath(ctx, cond.field);
      return v !== cond.value;
    }

    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = asNumber(getByPath(ctx, cond.field));
      const right = asNumber(cond.value);
      if (left == null || right == null) return false;
      if (cond.op === "gt") return left > right;
      if (cond.op === "gte") return left >= right;
      if (cond.op === "lt") return left < right;
      return left <= right;
    }

    case "in": {
      const v = getByPath(ctx, cond.field);
      if (!Array.isArray(cond.value)) return false;
      return cond.value.includes(v);
    }

    case "contains": {
      const v = getByPath(ctx, cond.field);
      if (Array.isArray(v)) return v.includes(cond.value);
      const s = asString(v);
      const needle = asString(cond.value);
      if (s == null || needle == null) return false;
      return s.toLowerCase().includes(needle.toLowerCase());
    }

    case "startsWith":
    case "endsWith": {
      const s = asString(getByPath(ctx, cond.field));
      const needle = asString(cond.value);
      if (s == null || needle == null) return false;
      const a = s.toLowerCase();
      const b = needle.toLowerCase();
      return cond.op === "startsWith" ? a.startsWith(b) : a.endsWith(b);
    }

    default: {
      const _exhaustive: never = cond;
      return Boolean(_exhaustive);
    }
  }
}
