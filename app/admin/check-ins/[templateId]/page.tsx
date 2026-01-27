import { AppShell } from "@/app/components/AppShell";
import { getOrgViewer } from "@/lib/getOrgViewer";
import { prisma } from "@/lib/prisma";
import QuestionEditorClient from "./QuestionEditorClient";
import { publishTemplateVersion } from "./actions";

type Params = {
  params: Promise<{ templateId?: string }>;
};

const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Biweekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  CUSTOM_DAYS: "Custom days",
};

const EMPTY_VALUE = "\u2014";

export default async function CheckInTemplateDetailPage({ params }: Params) {
  const viewer: any = await getOrgViewer();
  const orgId = viewer?.orgId || null;
  const canManage = Boolean(viewer?.isOwner || viewer?.isAdmin);

  if (!orgId || !canManage) {
    return (
      <AppShell title="Unauthorized">
        <div>Unauthorized.</div>
      </AppShell>
    );
  }

  const resolvedParams = await params;
  const templateId = resolvedParams?.templateId || "";
  if (!templateId) {
    return (
      <AppShell title="Check-In Template">
        <div className="surface" style={{ padding: 16 }}>Not found.</div>
      </AppShell>
    );
  }

  const template = await prisma.checkInTemplate.findFirst({
    where: { id: templateId, orgId },
    include: {
      teamAssignments: { where: { isActive: true }, include: { team: true } },
      versions: { where: { isCurrent: true }, take: 1, orderBy: { version: "desc" } },
    },
  });

  if (!template) {
    return (
      <AppShell title="Check-In Template">
        <div className="surface" style={{ padding: 16 }}>Not found.</div>
      </AppShell>
    );
  }

  const teams = template.teamAssignments
    .map((assignment) => assignment.team?.name)
    .filter((name): name is string => Boolean(name));
  const teamLabel = teams.length ? teams.join(", ") : "Unassigned";
  const currentVersion = template.versions[0] || null;
  const questions = Array.isArray(currentVersion?.questionsJson) ? currentVersion?.questionsJson : [];
  const versionLabel = currentVersion ? String(currentVersion.version) : EMPTY_VALUE;
  const frequencyLabel = FREQUENCY_LABELS[template.frequencyType] || template.frequencyType;

  return (
    <AppShell title="Check-In Template" subtitle={template.name}>
      <div style={{ display: "grid", gap: 16 }}>
        <div className="surface" style={{ padding: 16, display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Name</div>
            <div style={{ fontWeight: 600 }}>{template.name}</div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Frequency</div>
            <div>{frequencyLabel}</div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Assigned teams</div>
            <div>{teamLabel}</div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Current version</div>
            <div>{versionLabel}</div>
          </div>
        </div>

        <div className="surface" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 700 }}>Edit &amp; Publish</div>
          <QuestionEditorClient
            templateId={template.id}
            initialQuestions={questions}
            publishAction={publishTemplateVersion}
          />
        </div>
      </div>
    </AppShell>
  );
}
