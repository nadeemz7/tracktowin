"use client";

import { useState } from "react";
import { CompApplyScope, CompPayoutType, CompTierBasis, CompTierMode } from "@prisma/client";

type BucketQuickRuleFormClientProps = {
  addRuleBlockAction: (formData: FormData) => Promise<any>;
  selectedBucketId: string;
  selectedBucketName: string;
  selectedLobId: string;
};

export default function BucketQuickRuleFormClient({
  addRuleBlockAction,
  selectedBucketId,
  selectedBucketName,
  selectedLobId,
}: BucketQuickRuleFormClientProps) {
  const [breakpoint, setBreakpoint] = useState("50000");

  return (
    <form action={addRuleBlockAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="applyScope" value={CompApplyScope.BUCKET} />
      <input type="hidden" name="bucketId" value={selectedBucketId} />
      <input type="hidden" name="name" value={`${selectedBucketName} payout`} />
      <input type="hidden" name="payoutType" value={CompPayoutType.PERCENT_OF_PREMIUM} />
      <input type="hidden" name="basePayoutValue" value="2" />
      <input type="hidden" name="tierMode" value={CompTierMode.TIERS} />
      <input type="hidden" name="tierBasis" value={CompTierBasis.BUCKET_VALUE} />
      <input type="hidden" name="redirectSection" value="buckets" />
      <input type="hidden" name="redirectLob" value={selectedLobId} />
      <input type="hidden" name="primaryProductId" value="" />
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(3, minmax(80px, 1fr))" }}>
          <input name="tierMin" type="number" step="0.01" value="0" readOnly style={{ padding: "4px 6px", fontSize: 12 }} />
          <input
            name="tierMax"
            type="number"
            step="0.01"
            value={breakpoint}
            onChange={(event) => setBreakpoint(event.target.value)}
            style={{ padding: "4px 6px", fontSize: 12 }}
          />
          <input name="tierPayout" type="number" step="0.01" defaultValue={2} style={{ padding: "4px 6px", fontSize: 12 }} />
        </div>
        <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(3, minmax(80px, 1fr))" }}>
          <input name="tierMin" type="number" step="0.01" value={breakpoint} readOnly style={{ padding: "4px 6px", fontSize: 12 }} />
          <input name="tierMax" type="number" step="0.01" defaultValue="" placeholder="(no max)" style={{ padding: "4px 6px", fontSize: 12 }} />
          <input name="tierPayout" type="number" step="0.01" defaultValue={3} style={{ padding: "4px 6px", fontSize: 12 }} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: "#475569" }}>Create bucket payout rule (tiered % of bucket)</div>
      <button type="submit" className="btn primary" style={{ padding: "6px 10px", fontSize: 12 }}>
        Create 2%/3% bucket rule
      </button>
    </form>
  );
}
