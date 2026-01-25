"use client";

import type { ReactNode } from "react";

type PeopleAuthGuardProps = {
  children: ReactNode;
};

export default function PeopleAuthGuard({ children }: PeopleAuthGuardProps) {
  return <>{children}</>;
}
