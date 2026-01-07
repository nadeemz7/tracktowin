export type BenchmarksViewer = { isAdmin?: boolean; isOwner?: boolean; isManager?: boolean } | null | undefined;

export function hasBenchmarksWriteAccess(viewer: BenchmarksViewer) {
  return Boolean(viewer?.isAdmin || viewer?.isOwner || viewer?.isManager);
}

export function requireBenchmarksWriteAccess(viewer: BenchmarksViewer) {
  if (!hasBenchmarksWriteAccess(viewer)) {
    throw new Error("forbidden");
  }
}
