Org vs Agency Scoping Audit

## Ground Truth

TrackToWin operates under a single Org with multiple Agencies (offices).

Org ownership:
- Products are owned by the Org.
- Lines of Business are owned by the Org.
- Compensation Plans are owned by the Org.
- Teams, Roles, People, and Permissions are owned by the Org.

Agency scope is limited to:
- Physical office metadata (address/location)
- People assignments to that office
- Premium buckets (which reference org Products / LoBs)
- Activities and performance data
- Households
- Sold Products (which reference org-owned Products)

Explicitly disallowed:
- Agency-owned Products
- Agency-owned Lines of Business
- Agency-owned Compensation Plans

## Search Terms

```bash
rg -n "agency\\.linesOfBusiness|agencyLinesOfBusiness|linesOfBusiness" app
rg -n "where:\\s*\\{\\s*agencyId" app lib
rg -n "agencyId" app/compensation app/paychecks app/reports
rg -n "productIds|lobIds|lineOfBusinessId" app/compensation app/paychecks app/reports
rg -n "CompPlan|compPlan" app
```

## Triage Buckets

HIGH RISK:
- Compensation calculation logic
- Paycheck generation and application logic
- Any query that affects money paid to people

MEDIUM RISK:
- Reporting queries (sales, production, benchmarks)
- Aggregations used for dashboards or exports

LOW RISK:
- UI copy or labels
- Dropdown population and display-only lists
- Non-financial admin screens

## Audit Log

| Status | Risk | Area | File Path | What's Wrong | Fix Approach | Slice # |
| --- | --- | --- | --- | --- | --- | --- |
| DONE | HIGH | Paychecks | app/paycheck/page.tsx | Bucket matching relied on names; fragile when buckets are org-scoped IDs. | Match buckets by productId/lobId with name fallback for legacy buckets. | 2B |
| TODO | HIGH | Buckets | app/compensation/plans/[planId]/page.tsx | Bucket includes store names; should store org Product/LoB IDs. | Update builder to write org IDs; keep legacy name fallback in UI. |  |

## Fix Patterns (Approved)

- Ownership chain: SoldProduct -> Product -> LineOfBusiness -> Org
- Org-scoped fetches:
  - Products fetched by orgId
  - Lines of Business fetched by orgId
  - Compensation Plans fetched by orgId
- Agency is used ONLY to:
  - select sold products / activity data
  - apply premium buckets
  - scope people assignments
- No Product or LoB resolution should ever pass through Agency
- Comp plans must never depend on agencyId for structure

## Do Not Do

- Introducing agency-owned Products
- Introducing agency-owned Lines of Business
- Introducing agency-owned Compensation Plans
- Adding agencyId as a structural dependency for comp plans
- Resolving Products or LoBs through Agency
- “Quick fixes” that duplicate org data per agency
- Schema changes without explicit instruction
