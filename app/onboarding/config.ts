export type PremiumCategory = "PC" | "FS" | "IPS";

export type OfficePayload = {
  name: string;
  lobs: { name: string; premiumCategory: PremiumCategory; active: boolean; products: { name: string; productType: "PERSONAL" | "BUSINESS" }[] }[];
  teams: { name: string; roles: string[] }[];
  people: {
    fullName: string;
    email: string;
    team: string;
    role: string;
    isAdmin: boolean;
    isManager: boolean;
    primaryOfficeName?: string;
  }[];
  householdFields: { fieldName: string; required: boolean; active: boolean; options?: string; charLimit?: number }[];
  premiumBuckets: { name: string; includesLobs: string[]; includesProducts: string[]; description?: string }[];
};

export type OnboardingPayload = {
  ownerName: string;
  profileName: string;
  address?: string;
  sameForAll: boolean;
  offices: OfficePayload[];
};

export const DEFAULT_LOBS = [
  {
    name: "Auto",
    premiumCategory: "PC" as PremiumCategory,
    products: [
      { name: "Auto Raw New", productType: "PERSONAL" as const },
      { name: "Auto Added", productType: "PERSONAL" as const },
      { name: "Business Raw Auto", productType: "BUSINESS" as const },
      { name: "Business Added Auto", productType: "BUSINESS" as const },
    ],
  },
  {
    name: "Fire",
    premiumCategory: "PC" as PremiumCategory,
    products: [
      { name: "Homeowners", productType: "PERSONAL" as const },
      { name: "Renters", productType: "PERSONAL" as const },
      { name: "Condo", productType: "PERSONAL" as const },
      { name: "PAP", productType: "PERSONAL" as const },
      { name: "PLUP", productType: "PERSONAL" as const },
      { name: "Boat", productType: "PERSONAL" as const },
      { name: "BOP", productType: "BUSINESS" as const },
      { name: "Apartment", productType: "BUSINESS" as const },
      { name: "CLUP", productType: "BUSINESS" as const },
      { name: "Workers Comp", productType: "BUSINESS" as const },
    ],
  },
  {
    name: "Health",
    premiumCategory: "FS" as PremiumCategory,
    products: [
      { name: "Short Term Disability", productType: "PERSONAL" as const },
      { name: "Long Term Disability", productType: "PERSONAL" as const },
      { name: "Supplemental Health Income", productType: "PERSONAL" as const },
    ],
  },
  {
    name: "Life",
    premiumCategory: "FS" as PremiumCategory,
    products: [
      { name: "Term", productType: "PERSONAL" as const },
      { name: "Whole Life", productType: "PERSONAL" as const },
      { name: "Universal Life", productType: "PERSONAL" as const },
    ],
  },
  {
    name: "IPS",
    premiumCategory: "IPS" as PremiumCategory,
    products: [
      { name: "Advisory Account", productType: "PERSONAL" as const },
      { name: "Non Advisory Account", productType: "PERSONAL" as const },
    ],
  },
];

export const DEFAULT_TEAMS = [
  { name: "Sales", roles: ["Sales Associate", "Sales Representative", "Senior Sales"] },
  { name: "Customer Service", roles: ["CS Associate", "CS Representative", "CS Specialist"] },
  { name: "Management", roles: ["Owner", "Issuer"] },
];

export const DEFAULT_FIELDS = [
  { fieldName: "First Name", required: true, active: true },
  { fieldName: "Last Name", required: true, active: true },
  { fieldName: "ECRM Link", required: false, active: true },
  { fieldName: "Notes", required: false, active: true },
  { fieldName: "Marketing Source", required: true, active: true },
];

export const DEFAULT_BUCKETS = [
  { name: "P&C Premium", includesLobs: ["Auto", "Fire"], includesProducts: [] },
  { name: "Financial Services Premium", includesLobs: ["Health", "Life"], includesProducts: [] },
  { name: "IPS Premium", includesLobs: ["IPS"], includesProducts: [] },
  {
    name: "Business Premium",
    description: "Combined business premium across Auto + Fire business-classified products.",
    includesLobs: [],
    includesProducts: [
      "Business Raw Auto",
      "Business Added Auto",
      "BOP",
      "Apartment",
      "CLUP",
      "Workers Comp",
    ],
  },
];

export function makeOffice(name: string): OfficePayload {
  return {
    name,
    lobs: DEFAULT_LOBS.map((lob) => ({
      name: lob.name,
      premiumCategory: lob.premiumCategory,
      active: true,
      products: lob.products.map((p) => ({ ...p })),
    })),
    teams: DEFAULT_TEAMS.map((t) => ({ name: t.name, roles: [...t.roles] })),
    people: [],
    householdFields: DEFAULT_FIELDS.map((f) => ({ ...f })),
    premiumBuckets: DEFAULT_BUCKETS.map((b) => ({ ...b })),
  };
}
