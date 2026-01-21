"use client";

import type { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";

type PeopleAuthGuardProps = {
  children: ReactNode;
};

export default function PeopleAuthGuard({ children }: PeopleAuthGuardProps) {
  const { loading, authenticated } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-slate-600">Loading...</div>;
  }

  if (!authenticated) {
    return null;
  }

  return <>{children}</>;
}
