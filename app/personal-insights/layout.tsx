import { ReactNode } from "react";
import { AppShell } from "@/app/components/AppShell";

type Props = {
  children: ReactNode;
};

export default function PersonalInsightsLayout({ children }: Props) {
  return (
    <AppShell title="Personal Insights" subtitle="Employment details at a glance.">
      {children}
    </AppShell>
  );
}
