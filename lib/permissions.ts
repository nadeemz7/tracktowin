export function canAccessRoiReport(ctx: { isAdmin?: boolean; isOwner?: boolean; isManager?: boolean } | null | undefined) {
  return Boolean(ctx?.isAdmin || ctx?.isOwner || ctx?.isManager);
}

export function canAccessRoiSetup(ctx: { isAdmin?: boolean; isOwner?: boolean } | null | undefined) {
  return Boolean(ctx?.isAdmin || ctx?.isOwner);
}

// Permission matrix (ROI):
// - Admin (no impersonation): report=allow, setup=allow
// - Manager: report=allow, setup=deny
// - Normal user: report=deny, setup=deny
// - Admin impersonating normal user: report=deny, setup=deny
