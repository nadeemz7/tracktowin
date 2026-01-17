export function canAccessRoiReport(ctx: { isAdmin?: boolean; isOwner?: boolean; isManager?: boolean } | null | undefined) {
  return Boolean(ctx?.isAdmin || ctx?.isOwner || ctx?.isManager);
}

export function canAccessRoiSetup(ctx: { isAdmin?: boolean; isOwner?: boolean } | null | undefined) {
  return Boolean(ctx?.isAdmin || ctx?.isOwner);
}

export function canViewManagerReports(
  viewer: { isTtwAdmin?: boolean; permissions?: string[] } | null | undefined
) {
  return Boolean(
    viewer?.isTtwAdmin ||
      (viewer?.permissions || []).includes("ACCESS_ADMIN_TOOLS") ||
      (viewer?.permissions || []).includes("VIEW_MANAGER_REPORTS")
  );
}

// Permission matrix (ROI):
// - Admin (no impersonation): report=allow, setup=allow
// - Manager: report=allow, setup=deny
// - Normal user: report=deny, setup=deny
// - Admin impersonating normal user: report=deny, setup=deny

export const ALL_PERMISSIONS = [
  "VIEW_SELF",
  "VIEW_ORG",
  "EDIT_SELF_SOLD_PRODUCTS",
  "EDIT_SOLD_PRODUCTS",
  "CAN_ISSUE_POLICIES_SELF",
  "CAN_ISSUE_POLICIES",
  "EDIT_PAYCHECKS",
  "MANAGE_PEOPLE",
  "MANAGE_AGENCIES",
  "DELETE_AGENCIES",
  "ACCESS_ADMIN_TOOLS",
  "VIEW_MANAGER_REPORTS",
] as const;

export const PERMISSION_DEFINITIONS = {
  VIEW_SELF: {
    label: "View own data",
    description: "Can view their own people, production, and activity data.",
  },
  VIEW_ORG: {
    label: "View org data",
    description: "Can view people and org-wide reporting.",
  },
  EDIT_SELF_SOLD_PRODUCTS: {
    label: "Edit own sold products",
    description: "Can create and edit sold products they sold.",
  },
  EDIT_SOLD_PRODUCTS: {
    label: "Edit sold products",
    description: "Can create and edit sold products for the org.",
  },
  CAN_ISSUE_POLICIES_SELF: {
    label: "Issue own policies",
    description: "Can mark their own policies as issued.",
  },
  CAN_ISSUE_POLICIES: {
    label: "Issue policies",
    description: "Can mark policies as issued for the org.",
  },
  EDIT_PAYCHECKS: {
    label: "Edit paychecks",
    description: "Can edit paycheck and commission data.",
  },
  MANAGE_PEOPLE: {
    label: "Manage people",
    description: "Can add users and edit people assignments (team, role, status).",
  },
  MANAGE_AGENCIES: {
    label: "Manage agencies",
    description: "Can create and edit offices/agencies.",
  },
  DELETE_AGENCIES: {
    label: "Delete agencies",
    description: "Can delete offices/agencies.",
  },
  ACCESS_ADMIN_TOOLS: {
    label: "Access admin tools",
    description: "Can access admin-only tools and settings.",
  },
  VIEW_MANAGER_REPORTS: {
    label: "View manager reports",
    description: "Allows viewing reports/pages marked as manager-only.",
  },
} as const;

export const ROLE_PERMISSION_DEFAULTS = {
  ORG_OWNER: [
    "VIEW_SELF",
    "VIEW_ORG",
    "EDIT_SOLD_PRODUCTS",
    "EDIT_PAYCHECKS",
    "MANAGE_PEOPLE",
    "MANAGE_AGENCIES",
    "ACCESS_ADMIN_TOOLS",
    "DELETE_AGENCIES",
    "CAN_ISSUE_POLICIES",
    "VIEW_MANAGER_REPORTS",
  ],
  ORG_ADMIN: [
    "VIEW_SELF",
    "VIEW_ORG",
    "EDIT_SOLD_PRODUCTS",
    "EDIT_PAYCHECKS",
    "MANAGE_PEOPLE",
    "MANAGE_AGENCIES",
    "ACCESS_ADMIN_TOOLS",
    "CAN_ISSUE_POLICIES",
    "VIEW_MANAGER_REPORTS",
  ],
  ORG_EDITOR: ["VIEW_SELF", "VIEW_ORG", "EDIT_SOLD_PRODUCTS"],
  ORG_VIEWER: [
    "VIEW_SELF",
    "VIEW_ORG",
    "EDIT_SELF_SOLD_PRODUCTS",
    "CAN_ISSUE_POLICIES_SELF",
  ],
  ORG_MEMBER: ["VIEW_SELF", "EDIT_SELF_SOLD_PRODUCTS", "CAN_ISSUE_POLICIES_SELF"],
} as const;
