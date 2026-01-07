export type PremiumTargetModeValue = "LOB" | "BUCKET";

export type PremiumByLob = Array<{ lobId: string; premium: number }>;
export type PremiumByBucket = { PC: number; FS: number; IPS?: number };

export class ValidationError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

export function assertYear(value: any, field: string = "year") {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 2000 || num > 2100) {
    throw new ValidationError(`${field}: must be an integer between 2000 and 2100`, field);
  }
  return num;
}

export function assertNonNegativeInt(value: any, field: string) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
    throw new ValidationError(`${field}: must be a non-negative integer`, field);
  }
  return num;
}

export function assertNonNegativeNumber(value: any, field: string) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new ValidationError(`${field}: must be a non-negative number`, field);
  }
  return num;
}

export function parseOptionalNonNegativeInt(value: any, field: string) {
  if (value === undefined || value === null || value === "") return null;
  return assertNonNegativeInt(value, field);
}

export function parseOptionalNonNegativeNumber(value: any, field: string) {
  if (value === undefined || value === null || value === "") return null;
  return assertNonNegativeNumber(value, field);
}

export function normalizePremiumTargets(
  premiumModeRaw: any,
  premiumByLobRaw: any,
  premiumByBucketRaw: any
): { premiumMode: PremiumTargetModeValue; premiumByLob: PremiumByLob | null; premiumByBucket: PremiumByBucket | null } {
  const mode = typeof premiumModeRaw === "string" ? premiumModeRaw.trim().toUpperCase() : "";
  if (mode !== "LOB" && mode !== "BUCKET") {
    throw new ValidationError("premiumMode must be 'LOB' or 'BUCKET'", "premiumMode");
  }

  if (mode === "LOB") {
    if (!Array.isArray(premiumByLobRaw)) {
      throw new ValidationError("premiumByLob must be an array of { lobId, premium }", "premiumByLob");
    }
    const premiumByLob: PremiumByLob = premiumByLobRaw.map((row, idx) => {
      const lobId = typeof row?.lobId === "string" ? row.lobId.trim() : "";
      if (!lobId) {
        throw new ValidationError(`premiumByLob[${idx}].lobId is required`, "premiumByLob");
      }
      const premium = assertNonNegativeNumber(row?.premium, `premiumByLob[${idx}].premium`);
      return { lobId, premium };
    });
    return { premiumMode: "LOB", premiumByLob, premiumByBucket: null };
  }

  const premiumByBucketObj =
    premiumByBucketRaw && typeof premiumByBucketRaw === "object" ? premiumByBucketRaw : null;
  if (!premiumByBucketObj) {
    throw new ValidationError("premiumByBucket must be an object with PC and FS numbers", "premiumByBucket");
  }
  const pc = assertNonNegativeNumber(premiumByBucketObj.PC, "premiumByBucket.PC");
  const fs = assertNonNegativeNumber(premiumByBucketObj.FS, "premiumByBucket.FS");
  const ips =
    premiumByBucketObj.IPS !== undefined
      ? assertNonNegativeNumber(premiumByBucketObj.IPS, "premiumByBucket.IPS")
      : undefined;
  const premiumByBucket: PremiumByBucket =
    ips === undefined ? { PC: pc, FS: fs } : { PC: pc, FS: fs, IPS: ips };

  return { premiumMode: "BUCKET", premiumByLob: null, premiumByBucket };
}

export function normalizeOptionalPremiumTargets(
  premiumModeRaw: any,
  premiumByLobRaw: any,
  premiumByBucketRaw: any
): { premiumMode: PremiumTargetModeValue | null; premiumByLob: PremiumByLob | null; premiumByBucket: PremiumByBucket | null } {
  if (premiumModeRaw === undefined || premiumModeRaw === null || premiumModeRaw === "") {
    if (premiumByLobRaw !== undefined && premiumByLobRaw !== null) {
      throw new ValidationError("premiumModeOverride required when providing premiumByLobOverride", "premiumModeOverride");
    }
    if (premiumByBucketRaw !== undefined && premiumByBucketRaw !== null) {
      throw new ValidationError("premiumModeOverride required when providing premiumByBucketOverride", "premiumModeOverride");
    }
    return { premiumMode: null, premiumByLob: null, premiumByBucket: null };
  }

  return normalizePremiumTargets(premiumModeRaw, premiumByLobRaw, premiumByBucketRaw);
}
