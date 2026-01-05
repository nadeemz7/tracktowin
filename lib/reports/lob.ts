export type CanonicalLob = "Auto" | "Fire" | "Life" | "Health" | "IPS";
export type PremiumCategory = "PC" | "FS" | "IPS";

export const CANONICAL_LOB_ORDER: CanonicalLob[] = ["Auto", "Fire", "Life", "Health", "IPS"];

const LOB_VARIANTS: Record<string, CanonicalLob> = {
  auto: "Auto",
  "personal auto": "Auto",
  pa: "Auto",

  fire: "Fire",
  home: "Fire",
  homeowners: "Fire",
  ho: "Fire",

  life: "Life",

  health: "Health",

  ips: "IPS",
  investment: "IPS",
};

export function normalizeLobName(input: string): CanonicalLob | null {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  return LOB_VARIANTS[key] ?? null;
}

export function lobToCategory(lob: CanonicalLob): PremiumCategory {
  if (lob === "Auto" || lob === "Fire") return "PC";
  if (lob === "Life" || lob === "Health") return "FS";
  return "IPS";
}

