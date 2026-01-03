import { CommissionPlan, PolicyTransaction } from "../engine/types";

export const DEFAULT_PLAN: CommissionPlan = {
  id: "plan_default",
  name: "Starter Plan",
  currency: "USD",
  period: { dateField: "writtenDateISO", granularity: "month" },
  rules: [],
};

export const DEFAULT_TXNS: PolicyTransaction[] = [
  {
    id: "txn_1",
    policyId: "POL1001",
    transactionType: "NEW",
    line: "Auto",
    carrier: "Acme",
    writtenDateISO: "2025-01-05",
    effectiveDateISO: "2025-01-10",
    paidDateISO: "2025-01-12",
    premiumDelta: 1200,
    commissionablePremiumDelta: 1200,
    participants: [
      { repId: "rep_1", name: "Producer One", role: "Producer", creditPercent: 100 },
      { repId: "rep_mgr", name: "Manager", role: "Manager", creditPercent: 0 },
    ],
  },
  {
    id: "txn_2",
    policyId: "POL1002",
    transactionType: "RENEWAL",
    line: "Home",
    carrier: "Beta",
    writtenDateISO: "2025-01-18",
    effectiveDateISO: "2025-02-01",
    premiumDelta: 800,
    commissionablePremiumDelta: 800,
    participants: [{ repId: "rep_1", name: "Producer One", role: "Producer", creditPercent: 100 }],
  },
];

export const DEFAULT_TXNS_JSON = JSON.stringify(DEFAULT_TXNS, null, 2);
